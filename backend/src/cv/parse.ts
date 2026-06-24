import { PDFParse, InvalidPDFException, PasswordException } from "pdf-parse";

export type CvParseErrorCode = "invalid_pdf" | "pdf_password" | "empty_pdf" | "parse_failed";

export class CvParseError extends Error {
  constructor(public code: CvParseErrorCode, message: string) {
    super(message);
    this.name = "CvParseError";
  }
}

export async function parsePdfToText(buf: Buffer): Promise<string> {
  if (!buf || buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new CvParseError("invalid_pdf", "File is not a valid PDF (missing %PDF- header)");
  }
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    const text = (result.text ?? "").trim();
    if (!text) throw new CvParseError("empty_pdf", "PDF contains no extractable text");
    return text;
  } catch (err) {
    if (err instanceof CvParseError) throw err;
    if (err instanceof InvalidPDFException) throw new CvParseError("invalid_pdf", "Invalid PDF");
    if (err instanceof PasswordException) throw new CvParseError("pdf_password", "PDF is password-protected");
    throw new CvParseError("parse_failed", `PDF parse failed: ${(err as Error).message}`);
  } finally {
    try { await parser.destroy(); } catch { /* swallow cleanup errors */ }
  }
}