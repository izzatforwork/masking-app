import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { Document, Packer, Paragraph } from "docx";
import JSZip from "jszip";

const wordExtractor = new WordExtractor();

/** Legacy OLE2-binary .doc isn't a zip like .docx is — mammoth can't read it, so it's routed to word-extractor instead. */
function isLegacyDoc(filename?: string): boolean {
  return /\.doc$/i.test(filename ?? "");
}

export async function extractTextFromDocx(buffer: Buffer, filename?: string): Promise<string> {
  if (isLegacyDoc(filename)) {
    const doc = await wordExtractor.extract(buffer);
    return doc.getBody();
  }
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function buildDocxFromText(text: string): Promise<Buffer> {
  const paragraphs = text.split("\n").map((line) => new Paragraph(line));
  const doc = new Document({
    sections: [{ children: paragraphs }],
  });
  return Packer.toBuffer(doc);
}

/** Decodes the small set of XML entities that appear in Word's `word/document.xml` text runs. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

/** Escapes plain text back into XML text-node-safe content (attribute-only entities like &quot; aren't needed here). */
function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type TokenEntry = { key: string; value: string };
type TokenMatch = { start: number; end: number; value: string };

/** Leftmost, greedy, non-overlapping scan for exact token substrings — never a generic bracket regex. */
function findTokenMatches(text: string, tokens: TokenEntry[]): TokenMatch[] {
  const matches: TokenMatch[] = [];
  let i = 0;
  outer: while (i < text.length) {
    for (const token of tokens) {
      if (text.startsWith(token.key, i)) {
        matches.push({ start: i, end: i + token.key.length, value: token.value });
        i += token.key.length;
        continue outer;
      }
    }
    i++;
  }
  return matches;
}

/**
 * Replaces mask tokens inside a single `<w:p>...</w:p>` paragraph's `<w:t>` runs,
 * merging text across runs first so a token split mid-way by Word (a real quirk)
 * is still found, then writing the replacement back into the run(s) it touched.
 */
function replaceTokensInParagraphXml(paragraphXml: string, tokens: TokenEntry[]): string {
  const runRegex = /<w:t([^>]*)>([\s\S]*?)<\/w:t>/g;
  const runs: Array<{ contentStart: number; contentEnd: number; decodedText: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = runRegex.exec(paragraphXml)) !== null) {
    const openTag = `<w:t${m[1]}>`;
    const contentStart = m.index + openTag.length;
    const rawContent = m[2];
    runs.push({
      contentStart,
      contentEnd: contentStart + rawContent.length,
      decodedText: decodeXmlEntities(rawContent),
    });
  }
  if (runs.length === 0) return paragraphXml;

  const fullDecoded = runs.map((r) => r.decodedText).join("");
  const matches = findTokenMatches(fullDecoded, tokens);
  if (matches.length === 0) return paragraphXml;

  const cum: number[] = [];
  let acc = 0;
  for (const r of runs) {
    cum.push(acc);
    acc += r.decodedText.length;
  }

  function runIndexAt(globalPos: number): number {
    for (let idx = 0; idx < runs.length; idx++) {
      const start = cum[idx];
      const end = start + runs[idx].decodedText.length;
      if (globalPos >= start && globalPos < end) return idx;
    }
    return runs.length - 1;
  }

  const opsByRun = new Map<number, Array<{ localStart: number; localEnd: number; insert: string }>>();
  function addOp(idx: number, localStart: number, localEnd: number, insert: string) {
    const list = opsByRun.get(idx) ?? [];
    list.push({ localStart, localEnd, insert });
    opsByRun.set(idx, list);
  }

  for (const match of matches) {
    const firstRunIdx = runIndexAt(match.start);
    const lastRunIdx = runIndexAt(match.end - 1);

    if (firstRunIdx === lastRunIdx) {
      addOp(firstRunIdx, match.start - cum[firstRunIdx], match.end - cum[firstRunIdx], match.value);
    } else {
      addOp(firstRunIdx, match.start - cum[firstRunIdx], runs[firstRunIdx].decodedText.length, match.value);
      for (let idx = firstRunIdx + 1; idx < lastRunIdx; idx++) {
        addOp(idx, 0, runs[idx].decodedText.length, "");
      }
      addOp(lastRunIdx, 0, match.end - cum[lastRunIdx], "");
    }
  }

  const runEdits: Array<{ contentStart: number; contentEnd: number; newRawContent: string }> = [];
  for (const [idx, ops] of opsByRun) {
    const run = runs[idx];
    let text = run.decodedText;
    const sorted = [...ops].sort((a, b) => b.localStart - a.localStart);
    for (const op of sorted) {
      text = text.slice(0, op.localStart) + op.insert + text.slice(op.localEnd);
    }
    runEdits.push({ contentStart: run.contentStart, contentEnd: run.contentEnd, newRawContent: escapeXmlText(text) });
  }

  runEdits.sort((a, b) => b.contentStart - a.contentStart);
  let result = paragraphXml;
  for (const edit of runEdits) {
    result = result.slice(0, edit.contentStart) + edit.newRawContent + result.slice(edit.contentEnd);
  }
  return result;
}

/**
 * Replaces `[MASK_N]` tokens with their real values directly inside the uploaded
 * `.docx`'s XML, preserving all original formatting (styles, runs, tables) —
 * unlike `extractTextFromDocx`/`buildDocxFromText`, this never flattens the
 * document to plain text.
 */
export async function applyUnmaskToDocxBuffer(
  buffer: Buffer,
  mapping: Record<string, string>
): Promise<Buffer> {
  const tokens: TokenEntry[] = Object.entries(mapping)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.key.length - a.key.length);
  if (tokens.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  const docXmlPath = "word/document.xml";
  const docXmlFile = zip.file(docXmlPath);
  if (!docXmlFile) return buffer;
  const documentXml = await docXmlFile.async("string");

  const paraRegex = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  const paragraphs: Array<{ start: number; end: number; xml: string }> = [];
  let pm: RegExpExecArray | null;
  while ((pm = paraRegex.exec(documentXml)) !== null) {
    paragraphs.push({ start: pm.index, end: pm.index + pm[0].length, xml: pm[0] });
  }

  const edits: Array<{ start: number; end: number; xml: string }> = [];
  for (const p of paragraphs) {
    const newXml = replaceTokensInParagraphXml(p.xml, tokens);
    if (newXml !== p.xml) edits.push({ start: p.start, end: p.end, xml: newXml });
  }

  edits.sort((a, b) => b.start - a.start);
  let newDocumentXml = documentXml;
  for (const edit of edits) {
    newDocumentXml = newDocumentXml.slice(0, edit.start) + edit.xml + newDocumentXml.slice(edit.end);
  }

  zip.file(docXmlPath, newDocumentXml);
  return zip.generateAsync({ type: "nodebuffer" });
}
