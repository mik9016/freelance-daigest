import { describe, it, expect, vi, beforeEach } from "vitest";

describe("parsePdfToText", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects buffer missing %PDF- magic header with invalid_pdf", async () => {
    vi.doMock("pdf-parse", () => ({
      PDFParse: vi.fn(),
      InvalidPDFException: class extends Error {},
      PasswordException: class extends Error {}
    }));
    const { parsePdfToText, CvParseError } = await import("../src/cv/parse.js");
    await expect(parsePdfToText(Buffer.from("not a pdf"))).rejects.toBeInstanceOf(CvParseError);
    await expect(parsePdfToText(Buffer.from("not a pdf"))).rejects.toMatchObject({ code: "invalid_pdf" });
  });

  it("rejects empty buffer with invalid_pdf", async () => {
    vi.doMock("pdf-parse", () => ({
      PDFParse: vi.fn(),
      InvalidPDFException: class extends Error {},
      PasswordException: class extends Error {}
    }));
    const { parsePdfToText } = await import("../src/cv/parse.js");
    await expect(parsePdfToText(Buffer.alloc(0))).rejects.toMatchObject({ code: "invalid_pdf" });
  });

  it("returns trimmed text on successful parse", async () => {
    const destroy = vi.fn();
    const getText = vi.fn().mockResolvedValue({ text: "  Hello CV  \n" });
    vi.doMock("pdf-parse", () => ({
      PDFParse: vi.fn().mockImplementation(() => ({ getText, destroy })),
      InvalidPDFException: class extends Error {},
      PasswordException: class extends Error {}
    }));
    const { parsePdfToText } = await import("../src/cv/parse.js");
    const text = await parsePdfToText(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("rest")]));
    expect(text).toBe("Hello CV");
    expect(destroy).toHaveBeenCalled();
  });

  it("throws empty_pdf when text is empty", async () => {
    const destroy = vi.fn();
    const getText = vi.fn().mockResolvedValue({ text: "   " });
    vi.doMock("pdf-parse", () => ({
      PDFParse: vi.fn().mockImplementation(() => ({ getText, destroy })),
      InvalidPDFException: class extends Error {},
      PasswordException: class extends Error {}
    }));
    const { parsePdfToText } = await import("../src/cv/parse.js");
    await expect(
      parsePdfToText(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("x")]))
    ).rejects.toMatchObject({ code: "empty_pdf" });
  });

  it("throws invalid_pdf when PDFParse raises InvalidPDFException", async () => {
    const destroy = vi.fn();
    class InvalidPDFException extends Error {}
    const getText = vi.fn().mockRejectedValue(new InvalidPDFException("bad"));
    vi.doMock("pdf-parse", () => ({
      PDFParse: vi.fn().mockImplementation(() => ({ getText, destroy })),
      InvalidPDFException,
      PasswordException: class extends Error {}
    }));
    const { parsePdfToText } = await import("../src/cv/parse.js");
    await expect(
      parsePdfToText(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("x")]))
    ).rejects.toMatchObject({ code: "invalid_pdf" });
  });

  it("throws pdf_password when PDFParse raises PasswordException", async () => {
    const destroy = vi.fn();
    class PasswordException extends Error {}
    const getText = vi.fn().mockRejectedValue(new PasswordException("locked"));
    vi.doMock("pdf-parse", () => ({
      PDFParse: vi.fn().mockImplementation(() => ({ getText, destroy })),
      InvalidPDFException: class extends Error {},
      PasswordException
    }));
    const { parsePdfToText } = await import("../src/cv/parse.js");
    await expect(
      parsePdfToText(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("x")]))
    ).rejects.toMatchObject({ code: "pdf_password" });
  });
});