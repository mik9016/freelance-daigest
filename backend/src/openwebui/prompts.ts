import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let template: string | null = null;

function loadTemplate(): string {
  if (template) return template;
  try {
    template = readFileSync(join(__dirname, "prompts/system.md"), "utf-8");
  } catch {
    template = `You are an assistant that writes concise, professional German-language application messages for freelance contract roles, tailored to the user's CV.\n\nUser's CV:\n---\n{CV_FILE_CONTENTS}\n---\n`;
  }
  return template;
}

export function renderSystemPrompt(cv: string): string {
  return loadTemplate().replace("{CV_FILE_CONTENTS}", cv);
}

export function setTemplateForTest(t: string): void {
  template = t;
}