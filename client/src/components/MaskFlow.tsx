import { useEffect, useMemo, useRef, useState } from "react";
import {
  addGlossaryTerm,
  detectDocx,
  fetchGlossary,
  finalizeMask,
  removeGlossaryTerm,
  downloadBlob,
  type DetectedMatch,
} from "../api";
import { findAllOccurrences, getSelectionOffsets } from "../lib/textMatch";

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
  const [passphrase, setPassphrase] = useState("");
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
    const selectedText = text.slice(offsets.start, offsets.end).trim();
    if (!selectedText) return;
    setManualTerms((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === selectedText.toLowerCase());
      return exists ? prev : [...prev, selectedText];
    });
    window.getSelection()?.removeAllRanges();
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
    if (passphrase.length < 4) {
      setError("Passphrase must be at least 4 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const { zipBlob, maskedItemCount } = await finalizeMask(text, confirmedValues, passphrase);
      downloadBlob(zipBlob, "masking-app-output.zip");
      setSummary(
        `Done. ${maskedItemCount} item(s) masked. Downloaded masking-app-output.zip ` +
          "(masked_output.docx + mapping.enc.json" +
          (maskedItemCount > 0 ? " + mapping.xlsx)." : ").")
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>1. Upload requirement document (.docx)</h2>
      <input type="file" accept=".docx" onChange={handleFileChange} disabled={busy} />

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {text !== null && (
        <>
          <h2>2. Preview — auto-detected terms highlighted; highlight any other text to mask it too</h2>
          <p style={{ fontSize: 13, color: "#555" }}>
            <span style={{ background: "#ffe08a" }}>orange</span> = auto-detected (regex/glossary).{" "}
            <span style={{ background: "#a8e6a3" }}>green</span> = manually highlighted. Select any text
            below with your mouse to add it. Highlighting one occurrence masks every occurrence of that
            same text in the document.
          </p>
          <div
            ref={previewRef}
            onMouseUp={handleMouseUpOnPreview}
            style={{
              whiteSpace: "pre-wrap",
              border: "1px solid #ccc",
              padding: 12,
              maxHeight: 320,
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: 13,
              userSelect: "text",
            }}
          >
            {segments.map((seg, i) => (
              <span
                key={i}
                style={{
                  background:
                    seg.kind === "auto" ? "#ffe08a" : seg.kind === "manual" ? "#a8e6a3" : "transparent",
                }}
              >
                {seg.text}
              </span>
            ))}
          </div>

          <h3>Auto-detected terms ({autoMatches.length})</h3>
          <ul style={{ maxHeight: 150, overflowY: "auto" }}>
            {[...new Map(autoMatches.map((m) => [m.value.toLowerCase(), m])).values()].map((m) => (
              <li key={m.value.toLowerCase()}>
                <label>
                  <input
                    type="checkbox"
                    checked={!excluded.has(m.value.toLowerCase())}
                    onChange={() => toggleExcluded(m.value)}
                  />{" "}
                  {m.value} <em style={{ color: "#888" }}>({m.source})</em>
                </label>
              </li>
            ))}
          </ul>

          <h3>Manually highlighted terms ({manualTerms.length})</h3>
          <ul>
            {manualTerms.map((t) => (
              <li key={t}>
                {t} <button onClick={() => removeManualTerm(t)}>remove</button>
              </li>
            ))}
          </ul>

          <h3>Glossary (persists across documents)</h3>
          <div>
            <input
              value={newGlossaryTerm}
              onChange={(e) => setNewGlossaryTerm(e.target.value)}
              placeholder="e.g. Client codename"
            />
            <button onClick={handleAddGlossaryTerm}>Add to glossary</button>
          </div>
          <ul>
            {glossary.map((t) => (
              <li key={t}>
                {t} <button onClick={() => handleRemoveGlossaryTerm(t)}>remove</button>
              </li>
            ))}
          </ul>

          <h2>3. Encrypt & download</h2>
          <input
            type="password"
            placeholder="Passphrase (min 4 chars)"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <button onClick={handleFinalize} disabled={busy || confirmedValues.length === 0}>
            {busy ? "Working..." : "Generate masked files"}
          </button>
          {confirmedValues.length === 0 && (
            <p style={{ color: "#888" }}>Nothing confirmed for masking yet.</p>
          )}
          {summary && <p style={{ color: "green" }}>{summary}</p>}
        </>
      )}
    </div>
  );
}
