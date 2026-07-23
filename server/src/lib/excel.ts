import ExcelJS from "exceljs";

/** Builds a plaintext mapping.xlsx: one row per masked item, token + actual value. */
export async function buildMappingXlsx(
  mapping: Record<string, string>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Mapping");
  sheet.columns = [
    { header: "Masked Token", key: "token", width: 20 },
    { header: "Actual Value", key: "value", width: 40 },
  ];
  for (const [token, value] of Object.entries(mapping)) {
    sheet.addRow({ token, value });
  }
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
