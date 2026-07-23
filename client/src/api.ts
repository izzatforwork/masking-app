const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type DetectedMatch = {
  value: string;
  start: number;
  end: number;
  source: "regex-ip" | "regex-email" | "regex-domain" | "glossary";
};

export async function fetchGlossary(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/glossary`);
  const data = await res.json();
  return data.terms;
}

export async function addGlossaryTerm(term: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/glossary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ term }),
  });
  const data = await res.json();
  return data.terms;
}

export async function removeGlossaryTerm(term: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/glossary/${encodeURIComponent(term)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  return data.terms;
}

export async function detectDocx(
  file: File
): Promise<{ text: string; matches: DetectedMatch[] }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/mask/detect`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "detect failed");
  return res.json();
}

/**
 * Returns a single zip (masked_output.docx + mapping.enc.json + mapping.xlsx)
 * as a Blob — bundled server-side into one file so the browser only ever
 * needs to trigger one download, avoiding Chrome's multi-download blocking.
 */
export async function finalizeMask(
  text: string,
  confirmedValues: string[],
  passphrase: string
): Promise<{ zipBlob: Blob; maskedItemCount: number }> {
  const res = await fetch(`${API_BASE}/api/mask/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, confirmedValues, passphrase }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "finalize failed");
  const maskedItemCount = Number(res.headers.get("X-Masked-Item-Count") ?? "0");
  const zipBlob = await res.blob();
  return { zipBlob, maskedItemCount };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function unmask(
  resultDocx: File,
  mappingEnc: File,
  passphrase: string
): Promise<{ finalDocxBase64: string }> {
  const formData = new FormData();
  formData.append("resultDocx", resultDocx);
  formData.append("mappingEnc", mappingEnc);
  formData.append("passphrase", passphrase);
  const res = await fetch(`${API_BASE}/api/unmask`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "unmask failed");
  return res.json();
}

export function downloadBase64(base64: string, filename: string, mime: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
