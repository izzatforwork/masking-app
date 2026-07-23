import { Router } from "express";
import multer from "multer";
import JSZip from "jszip";
import { extractTextFromDocx, buildDocxFromText } from "../lib/docx.js";
import { detectAll } from "../lib/detect.js";
import { readGlossary } from "../lib/glossary.js";
import { applyMask } from "../lib/mask.js";
import { encryptMapping } from "../lib/crypto.js";
import { buildMappingXlsx } from "../lib/excel.js";

const upload = multer({ storage: multer.memoryStorage() });
export const maskRouter = Router();

/** Upload a .docx, get back extracted text + auto-detected matches. */
maskRouter.post("/detect", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const text = await extractTextFromDocx(req.file.buffer);
    const glossary = readGlossary();
    const matches = detectAll(text, glossary);
    res.json({ text, matches });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * Given the extracted text, the user-confirmed list of values to mask (auto
 * + manually highlighted), and a passphrase, produces a single zip containing:
 * - masked_output.docx
 * - mapping.enc.json (encrypted)
 * - mapping.xlsx — only when at least one item was masked
 *
 * Bundled into one zip (rather than 3 separate downloads) because Chrome's
 * multi-download protection silently drops all but the first of several
 * auto-triggered downloads fired from a single click — verified live during
 * build: only masked_output.docx landed, the other two were dropped.
 */
maskRouter.post("/finalize", async (req, res) => {
  try {
    const { text, confirmedValues, passphrase } = req.body ?? {};
    if (typeof text !== "string" || !Array.isArray(confirmedValues)) {
      return res
        .status(400)
        .json({ error: "text and confirmedValues[] are required" });
    }
    if (typeof passphrase !== "string" || passphrase.length < 4) {
      return res
        .status(400)
        .json({ error: "passphrase is required (min 4 chars)" });
    }

    const { maskedText, mapping } = applyMask(text, confirmedValues);
    const maskedDocxBuffer = await buildDocxFromText(maskedText);
    const encryptedMapping = encryptMapping(mapping, passphrase);
    const maskedItemCount = Object.keys(mapping).length;

    const zip = new JSZip();
    zip.file("masked_output.docx", maskedDocxBuffer);
    zip.file("mapping.enc.json", JSON.stringify(encryptedMapping, null, 2));
    if (maskedItemCount > 0) {
      zip.file("mapping.xlsx", await buildMappingXlsx(mapping));
    }
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.setHeader("X-Masked-Item-Count", String(maskedItemCount));
    res.setHeader("Content-Disposition", 'attachment; filename="masking-app-output.zip"');
    res.type("application/zip").send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
