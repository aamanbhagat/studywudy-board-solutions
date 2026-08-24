import assert from "node:assert/strict";
import test from "node:test";

import { parseColumnTablePrompt } from "../question-column-table.mjs";

const biologyPrompt = `**Match the column.** | Column - I (Structure before seed formation) | Column - II (Structure after seed formation) |  |  | | A. | Funiculus | I. | Hilum |
| B. | Scar of ovule | II. | Tegmen |
| C. | Zygote | III. | Testa |
| D. | Inner integument | IV. | Stalk of seed |
|  |  | V. | Embryo |`;

test("recovers the four-cell biology match-the-column grid without changing its text", () => {
  const table = parseColumnTablePrompt(biologyPrompt);
  assert.ok(table);
  assert.equal(table.before, "**Match the column.**");
  assert.deepEqual(table.headers, [
    "Column - I (Structure before seed formation)",
    "Column - II (Structure after seed formation)",
  ]);
  assert.deepEqual(table.headerSpans, [2, 2]);
  assert.equal(table.columnCount, 4);
  assert.equal(table.pairedLabels, true);
  assert.deepEqual(table.rows, [
    ["A.", "Funiculus", "I.", "Hilum"],
    ["B.", "Scar of ovule", "II.", "Tegmen"],
    ["C.", "Zygote", "III.", "Testa"],
    ["D.", "Inner integument", "IV.", "Stalk of seed"],
    ["", "", "V.", "Embryo"],
  ]);
});

test("recovers the biology grid when the importer split its heading and rows into paragraph blocks", () => {
  const blocks = [
    "**Match the column.**",
    "| Column - I (Structure before seed formation) | Column - II (Structure after seed formation) |  |  |",
    "| A. | Funiculus | I. | Hilum |\n| B. | Scar of ovule | II. | Tegmen |\n| C. | Zygote | III. | Testa |\n| D. | Inner integument | IV. | Stalk of seed |\n|  |  | V. | Embryo |",
  ];
  const table = parseColumnTablePrompt(blocks.join("\n"));
  assert.ok(table);
  assert.deepEqual(table.headers, [
    "Column - I (Structure before seed formation)",
    "Column - II (Structure after seed formation)",
  ]);
  assert.equal(table.rows.length, 5);
});

test("supports the alternate four-cell import with spacer cells around headings", () => {
  const table = parseColumnTablePrompt(`**Match the organisms:** |  | Column I |  | Column II | | (i) | Leech | (a) | Holozoic nutrition |
| (ii) | Amoeba | (b) | Autotrophic nutrition |`);
  assert.ok(table);
  assert.equal(table.before, "**Match the organisms:**");
  assert.deepEqual(table.headers, ["Column I", "Column II"]);
  assert.deepEqual(table.rows[0], ["(i)", "Leech", "(a)", "Holozoic nutrition"]);
});

test("renders two-cell and three-column textbook grids", () => {
  const two = parseColumnTablePrompt(`Match these. | Column A | Column B | | Heart | Pumping organ |
| RBC | Carrier of oxygen |`);
  assert.ok(two);
  assert.equal(two.columnCount, 2);
  assert.deepEqual(two.headerSpans, [1, 1]);

  const three = parseColumnTablePrompt(`Match all three. | Column I | Column II | Column III | | Producer | Autotroph | First trophic level |
| Primary consumer | Herbivore | Second trophic level |`);
  assert.ok(three);
  assert.equal(three.columnCount, 3);
  assert.deepEqual(three.headerSpans, [1, 1, 1]);
});

test("recovers descriptive A/B headers when the instruction names the columns", () => {
  const table = parseColumnTablePrompt(`Match the hormones given in column I with their functions given in column II: | Hormones | Functions | | (i) Thyroxine | (a) Controls metabolic rate |
| (ii) Adrenaline | (b) Prepares the body for an emergency |`);
  assert.ok(table);
  assert.deepEqual(table.headers, ["Hormones", "Functions"]);
  assert.deepEqual(table.rows[0], ["(i) Thyroxine", "(a) Controls metabolic rate"]);
});

test("accepts quoted or repeated source headings and a single imported body row", () => {
  const quoted = parseColumnTablePrompt(`**Match the pairs.** | Column ‘A’ | Column ‘B’ | | Boyle’s law | Constant temperature |
| Charles’ law | Constant pressure |`);
  assert.ok(quoted);
  assert.deepEqual(quoted.headers, ["Column ‘A’", "Column ‘B’"]);

  const repeated = parseColumnTablePrompt("**Match the following:** | Column A | Column A | | President | Nominates members |");
  assert.ok(repeated);
  assert.deepEqual(repeated.headers, ["Column A", "Column A"]);
  assert.deepEqual(repeated.rows, [["President", "Nominates members"]]);
});

test("preserves escaped mathematical pipes inside cells", () => {
  const table = parseColumnTablePrompt(`Match these. | Column I | Column II | | AB \\|\\| CD | Parallel lines |
| EF | Segment |`);
  assert.ok(table);
  assert.equal(table.columnCount, 2);
  assert.equal(table.rows[0][0], "AB \\|\\| CD");

  const absoluteValue = parseColumnTablePrompt(`Match each item in column I with column II. | C 1 | C 2 | | x | \\left|x\\right| |
| y | \\left|y + 1\\right| |`);
  assert.ok(absoluteValue);
  assert.equal(absoluteValue.rows[0][1], "\\left|x\\right|");
});

test("does not mistake a leading column instruction for an extra table heading", () => {
  const table = parseColumnTablePrompt("**Column II is a list related to Column I. Match the terms.** | Column I | Column II | | Acrosome, Ovulation | Sperm, Oviduct |");
  assert.ok(table);
  assert.deepEqual(table.headers, ["Column I", "Column II"]);
  assert.equal(table.columnCount, 2);
});

test("keeps prose after a one-row column grid outside the table", () => {
  const table = parseColumnTablePrompt("Match column A with column B. | A Attitudes | B Dialogues | | Necessity | Dialogue A | | These words are called modals.");
  assert.ok(table);
  assert.deepEqual(table.headers, ["A Attitudes", "B Dialogues"]);
  assert.deepEqual(table.rows, [["Necessity", "Dialogue A"]]);
  assert.equal(table.after, "These words are called modals.");
});

test("draws headerless paired rows without inventing source headings", () => {
  const table = parseColumnTablePrompt(`**Match the following:** | Human larynx | Vibrations of metal arms | | Loudspeaker | Vibrations in air column |
| Jal-Tarang | Vibrations in vocal cords |
| Tuning fork | Vibrations in strings |`);
  assert.ok(table);
  assert.deepEqual(table.headers, []);
  assert.deepEqual(table.rows[0], ["Human larynx", "Vibrations of metal arms"]);
  assert.deepEqual(table.rows[1], ["Loudspeaker", "Vibrations in air column"]);
});

test("does not convert ordinary prose or underspecified pipe text", () => {
  assert.equal(parseColumnTablePrompt("Choose A | B and explain your answer."), null);
  assert.equal(parseColumnTablePrompt("Column I | Column II | only one row |"), null);
  assert.equal(parseColumnTablePrompt("For parallel lines AB \\|\\| CD, find x."), null);
});
