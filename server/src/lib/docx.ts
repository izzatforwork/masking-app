import mammoth from "mammoth";
import { Document, Packer, Paragraph } from "docx";

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function buildDocxFromText(text: string): Promise<Buffer> {
  const paragraphs = text.split("\n").map((line) => new Paragraph(line));
  const doc = new Document({
    sections: [{ children: paragraphs }],
  });
  return Packer.toBuffer(doc);
}
