import { Router } from "express";
import multer from "multer";
import { extractTextFromDocx, buildDocxFromText } from "../lib/docx.js";
import { applyUnmask } from "../lib/mask.js";
import { decryptMapping, type EncryptedPayload } from "../lib/crypto.js";

const upload = multer({ storage: multer.memoryStorage() });
export const unmaskRouter = Router();

/**
 * Upload the masked result .docx + mapping.enc.json + passphrase.
 * Decrypts the mapping, replaces tokens with real values, returns the
 * final .docx. Wrong passphrase / corrupted mapping is rejected, never
 * silently produces garbage output.
 */
unmaskRouter.post(
  "/",
  upload.fields([
    { name: "resultDocx", maxCount: 1 },
    { name: "mappingEnc", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as
        | { resultDocx?: Express.Multer.File[]; mappingEnc?: Express.Multer.File[] }
        | undefined;
      const resultDocxFile = files?.resultDocx?.[0];
      const mappingEncFile = files?.mappingEnc?.[0];
      const { passphrase } = req.body ?? {};

      if (!resultDocxFile || !mappingEncFile) {
        return res
          .status(400)
          .json({ error: "resultDocx and mappingEnc files are required" });
      }
      if (typeof passphrase !== "string" || !passphrase) {
        return res.status(400).json({ error: "passphrase is required" });
      }

      const payload: EncryptedPayload = JSON.parse(
        mappingEncFile.buffer.toString("utf8")
      );
      const mapping = decryptMapping(payload, passphrase);

      const resultText = await extractTextFromDocx(resultDocxFile.buffer);
      const finalText = applyUnmask(resultText, mapping);
      const finalDocxBuffer = await buildDocxFromText(finalText);

      res.json({ finalDocxBase64: finalDocxBuffer.toString("base64") });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);
