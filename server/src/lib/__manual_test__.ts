import { detectAll } from "./detect.js";
import { applyMask, applyUnmask } from "./mask.js";
import { buildMappingXlsx } from "./excel.js";
import { buildDocxFromText, extractTextFromDocx, applyUnmaskToDocxBuffer } from "./docx.js";
import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import mammoth from "mammoth";
import assert from "assert";

async function main() {
  const glossary = ["Acme Corp", "Project Nightingale", "CI"];
  const text = [
    "Client: Acme Corp",
    "Internal codename: Project Nightingale",
    "Server IP: 10.0.5.12, backup at 10.0.5.13",
    "Contact: john.doe@acmecorp.com",
    "Internal host: db01.acmecorp.internal",
    "Acme corp will review this LLD before sign-off.",
    "CI pipeline has no dependencies on legacy infra.",
  ].join("\n");

  // 1. detection
  const matches = detectAll(text, glossary);
  console.log(`detected ${matches.length} matches`);
  assert(matches.some((m) => m.source === "regex-ip" && m.value === "10.0.5.12"));
  assert(matches.some((m) => m.source === "regex-email"));
  assert(matches.some((m) => m.source === "regex-domain"));
  assert(matches.filter((m) => m.source === "glossary" && m.value.toLowerCase() === "acme corp").length === 2, "expected both case-variant occurrences of Acme Corp");

  // 1b. word-boundary check: "CI" must not match inside "dependencies"
  const ciMatches = matches.filter((m) => m.source === "glossary" && m.value === "CI");
  assert(ciMatches.length === 1, `expected exactly 1 standalone "CI" match, got ${ciMatches.length}`);

  // 2. simulate user confirming everything detected + one manual highlight
  const confirmedValues = [...matches.map((m) => m.value), "sign-off"];

  // 3. mask
  const { maskedText, mapping } = applyMask(text, confirmedValues);
  console.log("--- masked text ---\n" + maskedText);
  assert(!/acme corp/i.test(maskedText), "Acme Corp leaked into masked text");
  assert(!maskedText.includes("10.0.5.12"), "IP leaked into masked text");
  assert(!maskedText.includes("john.doe@acmecorp.com"), "email leaked into masked text");
  assert(maskedText.includes("sign-off") === false, "manually highlighted term leaked");
  assert(maskedText.includes("dependencies"), "word-boundary regression: 'dependencies' got mangled by masking 'CI'");

  // 4. all-occurrence propagation check: both casings of "Acme Corp" masked
  const acmeToken = Object.entries(mapping).find(
    ([, v]) => v.toLowerCase() === "acme corp"
  )?.[0];
  assert(acmeToken, "no token assigned for Acme Corp");
  const occurrences = maskedText.split(acmeToken!).length - 1;
  assert(occurrences === 2, `expected 2 occurrences of ${acmeToken}, got ${occurrences}`);

  // 5. docx round-trip
  const docxBuffer = await buildDocxFromText(maskedText);
  const roundTrippedText = await extractTextFromDocx(docxBuffer);
  assert(roundTrippedText.includes(acmeToken!), "docx round-trip lost token");

  // 6. excel export
  const xlsxBuffer = await buildMappingXlsx(mapping);
  assert(xlsxBuffer.length > 0, "xlsx buffer empty");

  // 7. unmask round trip
  const restoredText = applyUnmask(roundTrippedText, mapping);
  assert(restoredText.includes("Acme Corp") || restoredText.includes("Acme corp"), "real value not restored");
  assert(restoredText.includes("10.0.5.12"), "IP not restored");
  assert(!restoredText.includes(acmeToken!), "token still present after unmask");

  // 8. format-preserving unmask: bold formatting survives, and a token split
  // across multiple runs (a real Word quirk) is still found and replaced.
  const formatTestMapping = { "[MASK_1]": "Acme Corp", "[MASK_2]": "10.0.5.12" };
  const formatTestDoc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "Client: [MASK_1] uses ", bold: true }),
              new TextRun("IP "),
              new TextRun("[MASK_2]"),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun("Split token: ["),
              new TextRun("MASK_1"),
              new TextRun("]"),
              new TextRun(" end."),
            ],
          }),
        ],
      },
    ],
  });
  const formatTestBuffer = await Packer.toBuffer(formatTestDoc);
  const formatTestResult = await applyUnmaskToDocxBuffer(formatTestBuffer, formatTestMapping);

  const resultZip = await JSZip.loadAsync(formatTestResult);
  const resultXml = await resultZip.file("word/document.xml")!.async("string");
  assert(resultXml.includes("Acme Corp"), "token not replaced in docx xml");
  assert(resultXml.includes("10.0.5.12"), "second token not replaced in docx xml");
  assert(!resultXml.includes("MASK_1") && !resultXml.includes("MASK_2"), "leftover token fragment in docx xml");
  assert(/<w:b\b/.test(resultXml), "bold formatting was lost during unmask");

  const formatTestText = (await mammoth.extractRawText({ buffer: formatTestResult })).value;
  assert(formatTestText.includes("Split token: Acme Corp end."), "split-run token was not reassembled correctly");

  console.log("\nALL MANUAL TESTS PASSED");
}

main().catch((err) => {
  console.error("MANUAL TEST FAILED:", err);
  process.exit(1);
});
