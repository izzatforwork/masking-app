import { useEffect, useMemo, useRef, useState } from "react";
import {
  addGlossaryTerm,
  detectDocx,
  fetchGlossary,
  fetchMappingXlsx,
  finalizeMask,
  removeGlossaryTerm,
  downloadBlob,
  type DetectedMatch,
} from "../api";
import { cleanSelectedText, findAllOccurrences, getSelectionOffsets } from "../lib/textMatch";

type Segment = { text: string; kind: "none" | "auto" | "manual" };

function buildSegments(
  text: string,
  autoRanges: { start: number; end: number }[],
  manualRanges: { start: number; end: number }[]
): Segment[] {
  type Tagged = { start: number; end: number; kind: "auto" | "manual" };
  const all: Tagged[] = [
    ...autoRanges.map((r) => ({ ...r, kind: "auto" as const })),
    ...manualRanges.map((r) => ({ ...r, kind: "manual" as const })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: Tagged[] = [];
  for (const r of all) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      last.end = Math.max(last.end, r.end);
      if (r.kind === "manual") last.kind = "manual";
    } else {
      merged.push({ ...r });
    }
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (cursor < r.start) segments.push({ text: text.slice(cursor, r.start), kind: "none" });
    segments.push({ text: text.slice(r.start, r.end), kind: r.kind });
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), kind: "none" });
  return segments;
}

export default function MaskFlow() {
  const [text, setText] = useState<string | null>(null);
  const [autoMatches, setAutoMatches] = useState<DetectedMatch[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [manualTerms, setManualTerms] = useState<string[]>([]);
  const [glossary, setGlossary] = useState<string[]>([]);
  const [newGlossaryTerm, setNewGlossaryTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGlossary().then(setGlossary).catch(() => {});
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const { text, matches } = await detectDocx(file);
      setText(text);
      setAutoMatches(matches);
      setExcluded(new Set());
      setManualTerms([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleExcluded(value: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      const key = value.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleMouseUpOnPreview() {
    if (!text || !previewRef.current) return;
    const offsets = getSelectionOffsets(previewRef.current);
    if (!offsets || offsets.start === offsets.end) return;
    const selectedText = cleanSelectedText(text.slice(offsets.start, offsets.end));
    window.getSelection()?.removeAllRanges();
    if (!selectedText) return;

    if (findAllOccurrences(text, selectedText).length === 0) {
      setError(
        `Couldn't highlight "${selectedText}" — the selection may start/end mid-word. Try selecting again, starting and ending cleanly on whole words.`
      );
      return;
    }

    setError(null);
    setManualTerms((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === selectedText.toLowerCase());
      return exists ? prev : [...prev, selectedText];
    });
  }

  function removeManualTerm(term: string) {
    setManualTerms((prev) => prev.filter((t) => t !== term));
  }

  async function handleAddGlossaryTerm() {
    const term = newGlossaryTerm.trim();
    if (!term) return;
    const updated = await addGlossaryTerm(term);
    setGlossary(updated);
    setNewGlossaryTerm("");
    // also treat it as an immediate manual highlight so it's caught in THIS document too
    setManualTerms((prev) => (prev.includes(term) ? prev : [...prev, term]));
  }

  async function handleRemoveGlossaryTerm(term: string) {
    setGlossary(await removeGlossaryTerm(term));
  }

  const autoRanges = useMemo(
    () =>
      autoMatches
        .filter((m) => !excluded.has(m.value.toLowerCase()))
        .map((m) => ({ start: m.start, end: m.end })),
    [autoMatches, excluded]
  );

  const manualRanges = useMemo(() => {
    if (!text) return [];
    return manualTerms.flatMap((term) => findAllOccurrences(text, term));
  }, [text, manualTerms]);

  const segments = useMemo(
    () => (text ? buildSegments(text, autoRanges, manualRanges) : []),
    [text, autoRanges, manualRanges]
  );

  const confirmedValues = useMemo(() => {
    const autoValues = autoMatches
      .filter((m) => !excluded.has(m.value.toLowerCase()))
      .map((m) => m.value);
    return [...autoValues, ...manualTerms];
  }, [autoMatches, excluded, manualTerms]);

  async function handleFinalize() {
    if (!text) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const { docxBlob, maskedItemCount } = await finalizeMask(text, confirmedValues);
      downloadBlob(docxBlob, "masked_output.docx");
      setSummary(`Done. ${maskedItemCount} item(s) masked. Downloaded masked_output.docx.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadMapping() {
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const xlsxBlob = await fetchMappingXlsx(text, confirmedValues);
      downloadBlob(xlsxBlob, "mapping.xlsx");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h2><span className="step-label">1</span>Upload requirement document (.doc or .docx)</h2>
        <div className="file-picker" style={{ marginTop: 12 }}>
          <label className="file-picker-button" htmlFor="mask-file-input">
            Choose file
            <input
              id="mask-file-input"
              type="file"
              accept=".doc,.docx"
              onChange={handleFileChange}
              disabled={busy}
            />
          </label>
          {text !== null && <span className="file-picker-name">document loaded</span>}
        </div>
        {error && <div className="banner banner-error">{error}</div>}
      </div>

      {text !== null && (
        <>
          <div className="card">
            <h2>
              <span className="step-label">2</span>Preview — highlight any text to mask it
            </h2>
            <p className="hint">
              Select any text below with your mouse to mark it for masking. Highlighting one
              occurrence masks every occurrence of that same text in the document.
            </p>
            <div className="legend">
              <span className="swatch" style={{ ["--swatch-color" as string]: "var(--auto-bg-strong)" }}>
                auto-detected
              </span>
              <span className="swatch" style={{ ["--swatch-color" as string]: "var(--manual-bg-strong)" }}>
                manually highlighted
              </span>
            </div>
            <div className="preview" ref={previewRef} onMouseUp={handleMouseUpOnPreview}>
              {segments.map((seg, i) => (
                <span
                  key={i}
                  className={
                    seg.kind === "auto" ? "mark-auto" : seg.kind === "manual" ? "mark-manual" : undefined
                  }
                >
                  {seg.text}
                </span>
              ))}
            </div>

            <h3>Auto-detected terms ({autoMatches.length})</h3>
            <ul className="term-list checklist">
              {[...new Map(autoMatches.map((m) => [m.value.toLowerCase(), m])).values()].map((m) => (
                <li key={m.value.toLowerCase()}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!excluded.has(m.value.toLowerCase())}
                      onChange={() => toggleExcluded(m.value)}
                    />
                    {m.value} <span className="source-tag">({m.source})</span>
                  </label>
                </li>
              ))}
            </ul>

            <h3>Manually highlighted terms ({manualTerms.length})</h3>
            {manualTerms.length > 0 ? (
              <ul className="term-list">
                {manualTerms.map((t) => (
                  <li key={t} className="chip">
                    {t}
                    <button onClick={() => removeManualTerm(t)} aria-label={`remove ${t}`}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-note">Nothing highlighted manually yet.</p>
            )}

            <h3>Glossary (persists across documents)</h3>
            <div className="glossary-row">
              <input
                className="text-input"
                value={newGlossaryTerm}
                onChange={(e) => setNewGlossaryTerm(e.target.value)}
                placeholder="e.g. Client codename"
              />
              <button className="btn btn-secondary" onClick={handleAddGlossaryTerm}>
                Add
              </button>
            </div>
            {glossary.length > 0 ? (
              <ul className="term-list">
                {glossary.map((t) => (
                  <li key={t} className="chip">
                    {t}
                    <button onClick={() => handleRemoveGlossaryTerm(t)} aria-label={`remove ${t}`}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-note">Glossary is empty.</p>
            )}
          </div>

          <div className="card">
            <h2><span className="step-label">3</span>Download</h2>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary"
                onClick={handleFinalize}
                disabled={busy || confirmedValues.length === 0}
              >
                {busy ? "Working..." : "Download masked_output.docx"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleDownloadMapping}
                disabled={busy || confirmedValues.length === 0}
              >
                Download mapping.xlsx
              </button>
            </div>
            {confirmedValues.length === 0 && (
              <p className="empty-note" style={{ marginTop: 10 }}>
                Nothing confirmed for masking yet.
              </p>
            )}
            {confirmedValues.length > 0 && (
              <p className="hint">
                Keep mapping.xlsx local — you'll need it later to unmask the generated result.
              </p>
            )}
            {summary && <div className="banner banner-success">{summary}</div>}
          </div>
        </>
      )}
    </div>
  );
}
