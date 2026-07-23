import { useState } from "react";
import { unmask, downloadBase64 } from "../api";

export default function UnmaskFlow() {
  const [resultDocx, setResultDocx] = useState<File | null>(null);
  const [mappingEnc, setMappingEnc] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleUnmask() {
    if (!resultDocx || !mappingEnc) {
      setError("Upload both the result .docx and mapping.enc.json.");
      return;
    }
    if (!passphrase) {
      setError("Passphrase is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const { finalDocxBase64 } = await unmask(resultDocx, mappingEnc, passphrase);
      downloadBase64(
        finalDocxBase64,
        "final_output.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      setSummary("Done. Downloaded final_output.docx with real values restored.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Upload the result document + mapping to unmask</h2>
      <p style={{ fontSize: 13, color: "#555" }}>
        Use the result file produced by the separate generation-app (or any masked_output you never sent
        anywhere), plus the mapping.enc.json downloaded earlier from the mask step.
      </p>
      <div>
        <label>
          Result .docx (still contains placeholder tokens):{" "}
          <input
            type="file"
            accept=".docx"
            onChange={(e) => setResultDocx(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <div>
        <label>
          mapping.enc.json:{" "}
          <input
            type="file"
            accept=".json"
            onChange={(e) => setMappingEnc(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <div>
        <input
          type="password"
          placeholder="Passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </div>
      <button onClick={handleUnmask} disabled={busy}>
        {busy ? "Working..." : "Unmask & download final document"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {summary && <p style={{ color: "green" }}>{summary}</p>}
    </div>
  );
}
