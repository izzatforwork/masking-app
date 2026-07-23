export type DetectedMatch = {
  value: string;
  start: number;
  end: number;
  source: "regex-ip" | "regex-email" | "regex-domain" | "glossary";
};

const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const DOMAIN_RE =
  /\b(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|io|co|dev|app|internal|local|corp)\b/gi;

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAllRegexMatches(
  text: string,
  regex: RegExp,
  source: DetectedMatch["source"]
): DetectedMatch[] {
  const matches: DetectedMatch[] = [];
  let m: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((m = regex.exec(text)) !== null) {
    matches.push({
      value: m[0],
      start: m.index,
      end: m.index + m[0].length,
      source,
    });
    if (m[0].length === 0) regex.lastIndex++;
  }
  return matches;
}

/** Finds every case-insensitive occurrence of `term` in `text`. */
export function findAllOccurrences(
  text: string,
  term: string
): { start: number; end: number }[] {
  if (!term) return [];
  const re = new RegExp(escapeRegExp(term), "gi");
  const out: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

function overlaps(a: DetectedMatch, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}

/**
 * Runs regex detection (IP/email/domain) plus glossary term matching.
 * Emails are matched before bare-domain so a domain inside an email address
 * isn't double-flagged.
 */
export function detectAll(text: string, glossary: string[]): DetectedMatch[] {
  const emailMatches = findAllRegexMatches(text, EMAIL_RE, "regex-email");
  const ipMatches = findAllRegexMatches(text, IP_RE, "regex-ip");
  const domainMatchesRaw = findAllRegexMatches(text, DOMAIN_RE, "regex-domain");
  const domainMatches = domainMatchesRaw.filter(
    (d) => !emailMatches.some((e) => overlaps(e, d))
  );

  const glossaryMatches: DetectedMatch[] = [];
  for (const term of glossary) {
    for (const occ of findAllOccurrences(text, term)) {
      glossaryMatches.push({
        value: text.slice(occ.start, occ.end),
        start: occ.start,
        end: occ.end,
        source: "glossary",
      });
    }
  }

  const all = [...emailMatches, ...ipMatches, ...domainMatches, ...glossaryMatches];
  all.sort((a, b) => a.start - b.start);
  return all;
}
