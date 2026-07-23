import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const GLOSSARY_PATH = path.join(DATA_DIR, "glossary.json");

function ensureFile() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(GLOSSARY_PATH)) writeFileSync(GLOSSARY_PATH, "[]", "utf8");
}

export function readGlossary(): string[] {
  ensureFile();
  const raw = readFileSync(GLOSSARY_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGlossary(terms: string[]) {
  ensureFile();
  writeFileSync(GLOSSARY_PATH, JSON.stringify(terms, null, 2), "utf8");
}

export function addGlossaryTerm(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return readGlossary();
  const terms = readGlossary();
  const exists = terms.some((t) => t.toLowerCase() === trimmed.toLowerCase());
  if (!exists) terms.push(trimmed);
  writeGlossary(terms);
  return terms;
}

export function removeGlossaryTerm(term: string): string[] {
  const terms = readGlossary().filter(
    (t) => t.toLowerCase() !== term.toLowerCase()
  );
  writeGlossary(terms);
  return terms;
}
