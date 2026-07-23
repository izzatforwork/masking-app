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

/** Returns the masked .docx as a Blob, plus how many items were masked. */
export async function finalizeMask(
  text: string,
  confirmedValues: string[]
): Promise<{ docxBlob: Blob; maskedItemCount: number }> {
  const res = await fetch(`${API_BASE}/api/mask/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, confirmedValues }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "finalize failed");
  const maskedItemCount = Number(res.headers.get("X-Masked-Item-Count") ?? "0");
  const docxBlob = await res.blob();
  return { docxBlob, maskedItemCount };
}

/**
 * Returns mapping.xlsx as a Blob. Fetched as its own request (rather than
 * bundled with the docx) so the browser only ever triggers one download per
 * user click — Chrome's multi-download protection silently drops all but
 * the first of several auto-triggered downloads fired from one click.
 */
export async function fetchMappingXlsx(
  text: string,
  confirmedValues: string[]
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/mask/finalize/mapping-xlsx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, confirmedValues }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "mapping.xlsx fetch failed");
  return res.blob();
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
  mappingXlsx: File
): Promise<{ finalDocxBase64: string }> {
  const formData = new FormData();
  formData.append("resultDocx", resultDocx);
  formData.append("mappingXlsx", mappingXlsx);
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
