import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { applyUnmaskToDocxBuffer } from "../lib/docx.js";

const upload = multer({ storage: multer.memoryStorage() });
export const unmaskRouter = Router();

async function readMappingXlsx(
  buffer: Buffer
): Promise<Record<string, string>> {
  const workbook = new ExcelJS.Workbook();
  // exceljs ships its own Buffer type from an older @types/node than this
  // project uses; the runtime value is a plain Buffer either way.
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
  );
  const sheet = workbook.getWorksheet("Mapping");
  if (!sheet) throw new Error("mapping.xlsx is missing the 'Mapping' sheet.");

  const mapping: Record<string, string> = {};
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const token = row.getCell(1).text;
    const value = row.getCell(2).text;
    if (token) mapping[token] = value;
  });
  return mapping;
}

/**
 * Upload the masked result .docx + mapping.xlsx (the same file downloaded
 * during masking). Replaces tokens with real values and returns the final
 * .docx.
 */
unmaskRouter.post(
  "/",
  upload.fields([
    { name: "resultDocx", maxCount: 1 },
    { name: "mappingXlsx", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as
        | { resultDocx?: Express.Multer.File[]; mappingXlsx?: Express.Multer.File[] }
        | undefined;
      const resultDocxFile = files?.resultDocx?.[0];
      const mappingXlsxFile = files?.mappingXlsx?.[0];

      if (!resultDocxFile || !mappingXlsxFile) {
        return res
          .status(400)
          .json({ error: "resultDocx and mappingXlsx files are required" });
      }

      const mapping = await readMappingXlsx(mappingXlsxFile.buffer);
      const finalDocxBuffer = await applyUnmaskToDocxBuffer(resultDocxFile.buffer, mapping);

      res.json({ finalDocxBase64: finalDocxBuffer.toString("base64") });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);
