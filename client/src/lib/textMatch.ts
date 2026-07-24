export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds every case-insensitive occurrence of `term` in `text`. Mirrors server/src/lib/detect.ts. */
export function findAllOccurrences(
  text: string,
  term: string
): { start: number; end: number }[] {
  if (!term.trim()) return [];
  const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
  const out: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/**
 * Cleans a raw drag-selected string so it lines up with `findAllOccurrences`'s
 * \b word-boundary matching. Mouse drags easily overshoot into an adjacent
 * comma/space, and a lone trailing/leading non-word character breaks the \b
 * anchor — causing the selection to match zero times, including the exact
 * instance the user just selected. Also collapses internal whitespace runs
 * (e.g. a stray double space) so the same term matches consistently elsewhere.
 */
export function cleanSelectedText(raw: string): string {
  return raw
    .trim()
    .replace(/^[^\w]+|[^\w]+$/g, "")
    .replace(/\s+/g, " ");
}

/** Returns the {start, end} text offset of the current window selection within `container`. */
export function getSelectionOffsets(
  container: HTMLElement
): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const preSelectionRange = range.cloneRange();
  preSelectionRange.selectNodeContents(container);
  preSelectionRange.setEnd(range.startContainer, range.startOffset);
  const start = preSelectionRange.toString().length;
  const end = start + range.toString().length;
  return { start, end };
}
