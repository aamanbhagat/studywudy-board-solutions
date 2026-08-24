import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildQuickFindPreviewCatalog,
  quickFindPreviewKey,
} from "../scripts/quick-find-preview-data.mjs";
import {
  CORE_PREVIEW_ROUTES,
  MATHEMATICAL_LOGIC_BASE,
  MATHEMATICAL_LOGIC_BOOK_BASE,
  MATHEMATICAL_LOGIC_QUESTIONS_BASE,
  MATHEMATICS_SUBJECT_BASE,
} from "../scripts/vercel-preview-routes.mjs";

const databasePath = resolve(import.meta.dirname, "../../data/d1/studywudy-content.sqlite3");

test("static preview finder includes the Maharashtra class and stream path", () => {
  const catalog = buildQuickFindPreviewCatalog(databasePath);
  assert.equal(catalog.format, "studywudy-static-quick-find-v1");
  assert.ok(catalog.boards.some((board) => board.id === "maharashtra-board"));
  assert.ok(catalog.grades["maharashtra-board"].some((grade) => grade.id === "class-12"));

  const classKey = quickFindPreviewKey("maharashtra-board", "class-12");
  assert.ok(catalog.streams[classKey].some((stream) => stream.id === "science"));

  const scienceKey = quickFindPreviewKey("maharashtra-board", "class-12", "science");
  const mathematics = catalog.subjects[scienceKey].find((subject) => subject.id === "mathematics");
  assert.ok(mathematics);
  assert.equal(mathematics.href, "/maharashtra-board/class-12/mathematics?stream=science");
  assert.match(mathematics.meta, /^\d+ textbooks?$/u);
});

test("finder client rejects HTML API responses before parsing JSON", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(
    resolve(import.meta.dirname, "../comparison/after-assets/quick-find.js"),
    "utf8",
  ));
  assert.match(source, /contentType\.includes\("json"\)/u);
  assert.match(source, /if \(isStaticPreview\(\)\) return previewItems\(index\)/u);
  assert.match(source, /Choices could not load\. Refresh the page and try again\./u);
});

test("static preview includes the complete Mathematics route into Mathematical Logic", () => {
  assert.ok(CORE_PREVIEW_ROUTES.includes(MATHEMATICS_SUBJECT_BASE));
  assert.ok(CORE_PREVIEW_ROUTES.includes(MATHEMATICAL_LOGIC_BOOK_BASE));
  assert.ok(CORE_PREVIEW_ROUTES.includes(MATHEMATICAL_LOGIC_BASE));
  assert.equal(MATHEMATICAL_LOGIC_QUESTIONS_BASE, `${MATHEMATICAL_LOGIC_BASE}/questions`);
});

test("preview generation discovers Mathematical Logic question pages and applies local labels", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(
    resolve(import.meta.dirname, "../scripts/generate-vercel-preview.mjs"),
    "utf8",
  ));
  assert.match(source, /fetchHtml\(MATHEMATICAL_LOGIC_BASE\)/u);
  assert.match(source, /route\.startsWith\(`\$\{MATHEMATICAL_LOGIC_QUESTIONS_BASE\}\/q-`\)/u);
  assert.match(source, /replaceAll\("Brief answer", "Problem"\)/u);
  assert.match(source, /const maxAttempts = 4;/u);
  assert.match(source, /signal: AbortSignal\.timeout\(12_000\)/u);
  assert.match(source, /\(\?:boardly-media\|studywudy-media\)/u);
  assert.match(source, /QUESTION_PAGE_THEME_ALIGNMENT_STYLES/u);
});
