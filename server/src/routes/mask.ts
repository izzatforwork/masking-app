import { Router } from "express";
import multer from "multer";
import { extractTextFromDocx, buildDocxFromText } from "../lib/docx.js";
import { detectAll } from "../lib/detect.js";
import { readGlossary } from "../lib/glossary.js";
import { applyMask } from "../lib/mask.js";
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
 * Given the extracted text and the user-confirmed list of values to mask
 * (auto + manually highlighted), returns the masked .docx as a direct
 * download. mapping.xlsx (when anything was masked) is fetched separately
 * via /finalize/mapping-xlsx so each file is its own single-click download —
 * Chrome's multi-download protection silently drops all but the first of
 * several auto-triggered downloads fired from one click, so they must not
 * be triggered together.
 */
maskRouter.post("/finalize", async (req, res) => {
  try {
    const { text, confirmedValues } = req.body ?? {};
    if (typeof text !== "string" || !Array.isArray(confirmedValues)) {
      return res
        .status(400)
        .json({ error: "text and confirmedValues[] are required" });
    }

    const { maskedText, mapping } = applyMask(text, confirmedValues);
    const maskedDocxBuffer = await buildDocxFromText(maskedText);
    const maskedItemCount = Object.keys(mapping).length;

    res.setHeader("X-Masked-Item-Count", String(maskedItemCount));
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="masked_output.docx"'
    );
    res
      .type(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
      .send(maskedDocxBuffer);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** Same masking pass as /finalize, but returns mapping.xlsx instead of the docx. */
maskRouter.post("/finalize/mapping-xlsx", async (req, res) => {
  try {
    const { text, confirmedValues } = req.body ?? {};
    if (typeof text !== "string" || !Array.isArray(confirmedValues)) {
      return res
        .status(400)
        .json({ error: "text and confirmedValues[] are required" });
    }

    const { mapping } = applyMask(text, confirmedValues);
    const xlsxBuffer = await buildMappingXlsx(mapping);

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="mapping.xlsx"'
    );
    res
      .type(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .send(xlsxBuffer);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
