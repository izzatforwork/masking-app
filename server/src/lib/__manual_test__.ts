import { detectAll } from "./detect.js";
import { applyMask, applyUnmask } from "./mask.js";
import { buildMappingXlsx } from "./excel.js";
import { buildDocxFromText, extractTextFromDocx } from "./docx.js";
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

  console.log("\nALL MANUAL TESTS PASSED");
}

main().catch((err) => {
  console.error("MANUAL TEST FAILED:", err);
  process.exit(1);
});
