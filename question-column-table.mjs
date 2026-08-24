const COLUMN_HEADING = /^column\s*(?:[-\u2013\u2014:]\s*)?['"\u2018\u2019\u201c\u201d]?\s*(\(?\s*(?:[ivxlcdm]+|[a-z]|\d+)\s*\)?)\s*['"\u2018\u2019\u201c\u201d]?(?:\s|$|\()/iu;

function stripInlineMarkup(value) {
  return String(value || "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[*_`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function columnHeadingId(value) {
  const match = stripInlineMarkup(value).match(COLUMN_HEADING);
  if (!match) return "";
  return match[1].replace(/[()\s]/gu, "").toLocaleLowerCase("en-IN");
}

function splitUnescapedPipes(value) {
  const cells = [];
  let cell = "";
  let slashCount = 0;
  for (const character of String(value || "")) {
    if (character === "\\") {
      slashCount += 1;
      cell += character;
      continue;
    }
    const texSizedDelimiter = character === "|" && /\\(?:left|right)$/u.test(cell);
    if (character === "|" && slashCount % 2 === 0 && !texSizedDelimiter) {
      cells.push(cell.trim());
      cell = "";
      slashCount = 0;
      continue;
    }
    slashCount = 0;
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function hasLeadingPipe(value) {
  return /^\s*\|/u.test(String(value || ""));
}

function hasTrailingPipe(value) {
  const source = String(value || "");
  const match = source.match(/(\\*)\|\s*$/u);
  return Boolean(match && match[1].length % 2 === 0);
}

function trimBoundaryCells(cells, { leading = true, trailing = true } = {}) {
  const output = [...cells];
  if (leading && output[0] === "") output.shift();
  if (trailing && output.at(-1) === "") output.pop();
  return output;
}

function pipeRow(value) {
  return trimBoundaryCells(splitUnescapedPipes(value), {
    leading: hasLeadingPipe(value),
    trailing: hasTrailingPipe(value),
  });
}

function firstBodyRow(cells) {
  const output = [...cells];
  while (output[0] === "") output.shift();
  while (output.at(-1) === "") output.pop();
  return output;
}

function finalizeColumnTable({ before, after = "", headers, rows, minimumRows = 2 }) {
  if (rows.length < minimumRows) return null;
  const columnCount = Math.max(...rows.map((row) => row.length));
  if ((headers.length > 0 && headers.length < 2) || headers.length > columnCount || columnCount > 8) return null;
  if (rows.some((row) => row.length > columnCount)) return null;

  const headerSpans = columnCount % headers.length === 0
    ? headers.map(() => columnCount / headers.length)
    : headers.map((_, index) => index === headers.length - 1
      ? columnCount - headers.length + 1
      : 1);
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ""),
  ]);
  return Object.freeze({
    before,
    after,
    headers: Object.freeze(headers),
    headerSpans: Object.freeze(headerSpans),
    rows: Object.freeze(normalizedRows.map((row) => Object.freeze(row))),
    columnCount,
    pairedLabels: columnCount === 4 && (headers.length === 0 || headers.length === 2),
  });
}

/**
 * Recover a semantic column-matching table from the flattened pipe-delimited
 * form used by the imported textbook corpus. The parser intentionally requires
 * at least two explicit, distinct `Column ...` headings and two body rows so
 * ordinary prose, mathematical parallel symbols and isolated pipes stay text.
 */
export function parseColumnTablePrompt(value) {
  if (typeof value !== "string" || !value.includes("|")) return null;

  const source = value
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/\r\n?/gu, "\n");
  const lines = source.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitUnescapedPipes(lines[lineIndex]);
    const headingScanStart = hasLeadingPipe(lines[lineIndex]) ? 0 : 1;
    const headingCells = cells
      .map((content, index) => ({ content, id: columnHeadingId(content), index }))
      .filter((cell) => cell.index >= headingScanStart && cell.id);
    if (headingCells.length < 2) continue;

    const firstHeadingIndex = headingCells[0].index;
    const lastHeadingIndex = headingCells.at(-1).index;
    const beforeOnHeaderLine = cells.slice(0, firstHeadingIndex).filter(Boolean).join(" | ").trim();
    const before = [...lines.slice(0, lineIndex), beforeOnHeaderLine]
      .filter((line) => line.trim())
      .join("\n")
      .trim();
    const rows = [];
    const inlineRow = firstBodyRow(cells.slice(lastHeadingIndex + 1));
    if (inlineRow.length >= 2 && inlineRow.some(Boolean)) rows.push(inlineRow);

    let suffixStart = lines.length;
    for (let bodyLineIndex = lineIndex + 1; bodyLineIndex < lines.length; bodyLineIndex += 1) {
      const line = lines[bodyLineIndex];
      if (!line.trim()) continue;
      if (!line.includes("|")) {
        suffixStart = bodyLineIndex;
        break;
      }
      const row = pipeRow(line);
      if (row.length < 2) {
        suffixStart = bodyLineIndex;
        break;
      }
      rows.push(row);
    }

    const headers = headingCells.map((cell) => cell.content);
    const after = suffixStart < lines.length ? lines.slice(suffixStart).join("\n").trim() : "";
    const model = finalizeColumnTable({ before, after, headers, rows, minimumRows: 1 });
    if (model) return model;
  }

  // Some source books name Column I/II in the instruction but use descriptive
  // header cells such as “Hormones / Functions” or the compact labels “A / B”.
  // For those, infer the width from the following pipe rows and require the
  // corpus' empty-cell header separator. This remains limited to explicit
  // matching-column instructions, keeping the fallback safely narrow.
  const matchingColumnInstruction = /\b(?:match(?:ed|ing)?|join(?:ed|ing)?)\b[\s\S]{0,800}\b(?:columns?|tables?)\b|\b(?:columns?|tables?)\b[\s\S]{0,800}\b(?:match(?:ed|ing)?|join(?:ed|ing)?)\b/iu;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!lines[lineIndex].includes("|")) continue;
    const beforeCells = splitUnescapedPipes(lines[lineIndex]);
    const beforeOnHeaderLine = hasLeadingPipe(lines[lineIndex]) ? "" : String(beforeCells[0] || "").trim();
    const before = [...lines.slice(0, lineIndex), beforeOnHeaderLine]
      .filter((line) => line.trim())
      .join("\n")
      .trim();
    if (!matchingColumnInstruction.test(stripInlineMarkup(before))) continue;

    const rawLaterRows = [];
    let suffixStart = lines.length;
    for (let bodyLineIndex = lineIndex + 1; bodyLineIndex < lines.length; bodyLineIndex += 1) {
      const line = lines[bodyLineIndex];
      if (!line.trim()) continue;
      if (!line.includes("|")) {
        suffixStart = bodyLineIndex;
        break;
      }
      const row = pipeRow(line);
      if (row.length < 2) {
        suffixStart = bodyLineIndex;
        break;
      }
      rawLaterRows.push({ index: bodyLineIndex, row });
    }
    let tableCells = hasLeadingPipe(lines[lineIndex]) ? [...beforeCells] : beforeCells.slice(1);
    if (hasLeadingPipe(lines[lineIndex]) && tableCells[0] === "") tableCells.shift();
    if (hasTrailingPipe(lines[lineIndex]) && tableCells.at(-1) === "") tableCells.pop();
    const separatorIndex = tableCells.findIndex((cell, index) => index >= 2 && cell === "");
    if (separatorIndex < 2) continue;
    const headerCells = tableCells.slice(0, separatorIndex);
    if (headerCells.length > 8 || headerCells.every((cell) => !cell)) continue;

    const widthCounts = new Map();
    for (const { row } of rawLaterRows) {
      if (row.length < 2 || row.length > 8) continue;
      widthCounts.set(row.length, (widthCounts.get(row.length) || 0) + 1);
    }
    const inferredWidths = [...widthCounts]
      .sort((left, right) => right[1] - left[1]
        || Number(right[0] === headerCells.length) - Number(left[0] === headerCells.length)
        || left[0] - right[0]);
    const columnCount = inferredWidths[0]?.[0] || headerCells.length;
    if (columnCount < headerCells.length || columnCount > 8) continue;

    const inlineBody = tableCells.slice(separatorIndex + 1);
    const rows = [];
    if (inlineBody.length >= columnCount) rows.push(inlineBody.slice(0, columnCount));
    const afterParts = [];
    const inlineRemainder = inlineBody.slice(columnCount);
    while (inlineRemainder[0] === "") inlineRemainder.shift();
    if (inlineRemainder.length) afterParts.push(inlineRemainder.join(" | "));

    for (const { index, row } of rawLaterRows) {
      if (row.length < columnCount) {
        suffixStart = Math.min(suffixStart, index);
        break;
      }
      rows.push(row.slice(0, columnCount));
      if (row.length > columnCount) {
        const remainder = row.slice(columnCount);
        while (remainder[0] === "") remainder.shift();
        if (remainder.length) afterParts.push(remainder.join(" | "));
        suffixStart = Math.min(suffixStart, index + 1);
        break;
      }
    }
    if (suffixStart < lines.length) afterParts.push(lines.slice(suffixStart).join("\n"));
    const after = afterParts.filter((part) => part.trim()).join("\n").trim();
    const model = finalizeColumnTable({
      before,
      after,
      headers: headerCells,
      rows,
      minimumRows: 1,
    });
    if (model) return model;
  }

  // A few older books provide paired match rows without a dedicated header
  // row. Draw their existing cells as a headerless table instead of inventing
  // labels that are not present in the textbook source.
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!lines[lineIndex].includes("|")) continue;
    const lineCells = splitUnescapedPipes(lines[lineIndex]);
    const beforeOnTableLine = hasLeadingPipe(lines[lineIndex]) ? "" : String(lineCells[0] || "").trim();
    const before = [...lines.slice(0, lineIndex), beforeOnTableLine]
      .filter((line) => line.trim())
      .join("\n")
      .trim();
    if (!/\bmatch(?:ed|ing)?\b/iu.test(stripInlineMarkup(before))) continue;

    const laterRows = [];
    let suffixStart = lines.length;
    for (let bodyLineIndex = lineIndex + 1; bodyLineIndex < lines.length; bodyLineIndex += 1) {
      const line = lines[bodyLineIndex];
      if (!line.trim()) continue;
      if (!line.includes("|")) {
        suffixStart = bodyLineIndex;
        break;
      }
      const row = pipeRow(line);
      if (row.length < 2 || row.length > 8) {
        suffixStart = bodyLineIndex;
        break;
      }
      laterRows.push(row);
    }

    let tableCells = hasLeadingPipe(lines[lineIndex]) ? [...lineCells] : lineCells.slice(1);
    if (hasLeadingPipe(lines[lineIndex]) && tableCells[0] === "") tableCells.shift();
    if (hasTrailingPipe(lines[lineIndex]) && tableCells.at(-1) === "") tableCells.pop();
    let columnCount = 0;
    if (laterRows.length) {
      const counts = new Map();
      for (const row of laterRows) counts.set(row.length, (counts.get(row.length) || 0) + 1);
      columnCount = [...counts].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0][0];
    } else {
      const labelPositions = tableCells
        .map((cell, index) => ({ cell: stripInlineMarkup(cell), index }))
        .filter(({ cell }) => /^\(?[a-z]\)?\.?$/iu.test(cell))
        .map(({ index }) => index);
      const step = labelPositions.length >= 3 ? labelPositions[1] - labelPositions[0] : 0;
      if (step >= 3 && labelPositions.slice(1).every((position, index) => position - labelPositions[index] === step)) {
        columnCount = step - 1;
      }
    }
    if (columnCount < 2 || columnCount > 8) continue;

    const rows = [];
    while (tableCells.length >= columnCount) {
      rows.push(tableCells.splice(0, columnCount));
      while (tableCells[0] === "") tableCells.shift();
    }
    rows.push(...laterRows.filter((row) => row.length === columnCount));
    const after = suffixStart < lines.length ? lines.slice(suffixStart).join("\n").trim() : "";
    const model = finalizeColumnTable({ before, after, headers: [], rows });
    if (model) return model;
  }

  return null;
}
