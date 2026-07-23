import { escapeRegExp } from "./detect.js";

export type MaskResult = {
  maskedText: string;
  /** token -> real value */
  mapping: Record<string, string>;
};

/**
 * Masks every case-insensitive occurrence of each confirmed value in `text`.
 * All-or-none per term: once a value is confirmed, every occurrence of it in
 * the document is masked, never a subset — a partial mask would defeat the
 * trust boundary this app exists for.
 */
export function applyMask(text: string, confirmedValues: string[]): MaskResult {
  const seen = new Map<string, string>();
  for (const v of confirmedValues) {
    const trimmed = v.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  const uniqueTerms = [...seen.values()];
  if (uniqueTerms.length === 0) return { maskedText: text, mapping: {} };

  const withIndex = uniqueTerms.map((v) => ({
    v,
    idx: text.toLowerCase().indexOf(v.toLowerCase()),
  }));
  withIndex.sort((a, b) => {
    const ai = a.idx === -1 ? Infinity : a.idx;
    const bi = b.idx === -1 ? Infinity : b.idx;
    return ai - bi;
  });

  const tokenOf = new Map<string, string>();
  const mapping: Record<string, string> = {};
  withIndex.forEach((item, i) => {
    const token = `[MASK_${i + 1}]`;
    tokenOf.set(item.v.toLowerCase(), token);
    mapping[token] = item.v;
  });

  const escaped = uniqueTerms
    .map(escapeRegExp)
    .sort((a, b) => b.length - a.length);
  const combined = new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi");
  const maskedText = text.replace(combined, (match) => {
    return tokenOf.get(match.toLowerCase()) ?? match;
  });

  return { maskedText, mapping };
}

/** Replaces every token in `text` with its real value from `mapping`. */
export function applyUnmask(
  text: string,
  mapping: Record<string, string>
): string {
  let result = text;
  for (const [token, value] of Object.entries(mapping)) {
    result = result.split(token).join(value);
  }
  return result;
}
