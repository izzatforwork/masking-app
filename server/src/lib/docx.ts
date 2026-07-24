import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { Document, Packer, Paragraph } from "docx";

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
