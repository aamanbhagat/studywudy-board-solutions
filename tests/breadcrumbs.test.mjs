import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  academicBreadcrumbItems,
  breadcrumbStructuredData,
  renderBreadcrumbNavigation,
} from "../breadcrumbs.mjs";

const questionRecord = Object.freeze({
  board_slug: "maharashtra-board",
  board_name: "Maharashtra State Board of Secondary and Higher Secondary Education",
  board_short_name: "Maharashtra State Board",
  grade_slug: "class-12",
  class_number: 12,
  subject_slug: "physics",
  subject_name: "Physics",
  book_slug: "balbharati-physics-standard-12",
  book_title: "Balbharati Physics Standard 12",
  chapter_slug: "electrostatics",
  chapter_number: 8,
  chapter_title: "Electrostatics",
  question_id: "q-msb-balbharati-physics-standard-12-8-002",
  display_label: "2",
});

test("question breadcrumbs match the requested canonical hierarchy", () => {
  const items = academicBreadcrumbItems(questionRecord);
  assert.deepEqual(items, [
    { name: "Home", href: "/" },
    { name: "Maharashtra Board", href: "/maharashtra-board" },
    { name: "Class 12", href: "/maharashtra-board/class-12" },
    { name: "Physics", href: "/maharashtra-board/class-12/physics" },
    { name: "Balbharati Physics", href: "/maharashtra-board/class-12/physics/balbharati-physics-standard-12" },
    { name: "Chapter 8 Electrostatics", href: "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics" },
    { name: "Question 2", href: "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics/questions/q-msb-balbharati-physics-standard-12-8-002" },
  ]);
});

test("every visible breadcrumb level is an anchor and the current anchor is explicit", () => {
  const items = academicBreadcrumbItems(questionRecord);
  const navigation = renderBreadcrumbNavigation(items);
  assert.equal((navigation.match(/<a\b/gu) || []).length, items.length);
  assert.equal((navigation.match(/\bhref=/gu) || []).length, items.length);
  assert.equal((navigation.match(/aria-current="page"/gu) || []).length, 1);
  assert.match(navigation, /<a href="[^"<>]+" aria-current="page">Question 2<\/a>/u);
  assert.doesNotMatch(navigation, /<span[^>]*aria-current/u);
});

test("BreadcrumbList positions, labels and destinations exactly match the anchors", () => {
  const items = academicBreadcrumbItems(questionRecord);
  const schema = breadcrumbStructuredData(items);
  assert.equal(schema["@type"], "BreadcrumbList");
  assert.deepEqual(schema.itemListElement.map(({ position, name, item }) => ({ position, name, item })),
    items.map((crumb, index) => ({
      position: index + 1,
      name: crumb.name,
      item: new URL(crumb.href, "https://studywudy-board-solutions.amanbhagat17089.workers.dev/").toString(),
    })));
  assert.ok(schema.itemListElement.every((item) => item.item));
});

test("board, class, subject, textbook and chapter pages terminate at their own URL", () => {
  const fields = ["question_id", "chapter_slug", "book_slug", "subject_slug", "grade_slug"];
  const expectedDepths = [7, 6, 5, 4, 3, 2];
  let record = { ...questionRecord };
  for (let index = 0; index < expectedDepths.length; index += 1) {
    const items = academicBreadcrumbItems(record);
    assert.equal(items.length, expectedDepths[index]);
    assert.equal(items.at(-1).href, index === 0
      ? `/${questionRecord.board_slug}/${questionRecord.grade_slug}/${questionRecord.subject_slug}/${questionRecord.book_slug}/${questionRecord.chapter_slug}/questions/${questionRecord.question_id}`
      : `/${[questionRecord.board_slug, questionRecord.grade_slug, questionRecord.subject_slug, questionRecord.book_slug, questionRecord.chapter_slug]
        .slice(0, expectedDepths[index] - 1).join("/")}`);
    if (fields[index]) delete record[fields[index]];
    if (fields[index] === "grade_slug") delete record.class_number;
  }
});

test("the Worker replaces both the visible trail and the existing BreadcrumbList", async () => {
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /main > script\[type="application\/ld\+json"\]:first-child/u);
  assert.match(source, /element\.setInnerContent\(structuredData\)/u);
  assert.match(source, /nav\[aria-label="Breadcrumb"\]/u);
  assert.match(source, /element\.replace\(navigation, \{ html: true \}\)/u);
  assert.match(source, /X-StudyWudy-Breadcrumbs/u);
});
