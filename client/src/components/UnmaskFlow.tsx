import { useState } from "react";
import { unmask, downloadBase64 } from "../api";

export default function UnmaskFlow() {
  const [resultDocx, setResultDocx] = useState<File | null>(null);
  const [mappingXlsx, setMappingXlsx] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleUnmask() {
    if (!resultDocx || !mappingXlsx) {
      setError("Upload both the result .docx and mapping.xlsx.");
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const { finalDocxBase64 } = await unmask(resultDocx, mappingXlsx);
      const ext = resultDocx.name.match(/\.[^./]+$/)?.[0] ?? ".docx";
      const base = resultDocx.name.slice(0, resultDocx.name.length - ext.length);
      const outName = `${base}_Unmasked${ext}`;
      downloadBase64(
        finalDocxBase64,
        outName,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      setSummary(`Done. Downloaded ${outName} with real values restored.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Upload the result document + mapping to unmask</h2>
      <p className="hint">
        Use the result file produced by the separate generation-app (or any masked_output you never sent
        anywhere), plus the mapping.xlsx downloaded earlier from the mask step.
      </p>

      <h3>Result .docx (still contains placeholder tokens)</h3>
      <div className="file-picker">
        <label className="file-picker-button" htmlFor="unmask-docx-input">
          Choose file
          <input
            id="unmask-docx-input"
            type="file"
            accept=".docx"
            onChange={(e) => setResultDocx(e.target.files?.[0] ?? null)}
          />
        </label>
        {resultDocx && <span className="file-picker-name">{resultDocx.name}</span>}
      </div>

      <h3>mapping.xlsx</h3>
      <div className="file-picker">
        <label className="file-picker-button" htmlFor="unmask-mapping-input">
          Choose file
          <input
            id="unmask-mapping-input"
            type="file"
            accept=".xlsx"
            onChange={(e) => setMappingXlsx(e.target.files?.[0] ?? null)}
          />
        </label>
        {mappingXlsx && <span className="file-picker-name">{mappingXlsx.name}</span>}
      </div>

      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="btn btn-primary" onClick={handleUnmask} disabled={busy}>
          {busy ? "Working..." : "Unmask & download final document"}
        </button>
      </div>
      {error && <div className="banner banner-error">{error}</div>}
      {summary && <div className="banner banner-success">{summary}</div>}
    </div>
  );
}
