import { DatabaseSync } from "node:sqlite";
import { bookMatchesStream, streamsFor, subjectsFor } from "../comparison/stream-taxonomy.js";

export function quickFindPreviewKey(board, grade = "", stream = "") {
  return [board, grade, stream].filter(Boolean).join("|");
}

function parseBookTitles(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

export function buildQuickFindPreviewCatalog(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });

  try {
    const boards = database.prepare(`SELECT slug AS id, short_name AS label, region AS meta
      FROM catalog_boards ORDER BY CASE slug
      WHEN 'maharashtra-board' THEN 1 WHEN 'cbse' THEN 2
      WHEN 'cisce' THEN 3 WHEN 'tamil-nadu-board' THEN 4 ELSE 5 END`).all();
    const gradeStatement = database.prepare(`SELECT g.slug AS id, g.label,
      COUNT(DISTINCT s.id) || ' subjects' AS meta
      FROM catalog_grades g
      LEFT JOIN catalog_subjects s ON s.board_slug = g.board_slug AND s.grade_slug = g.slug
      WHERE g.board_slug = ? GROUP BY g.id ORDER BY g.class_number`);
    const subjectStatement = database.prepare(`SELECT s.slug AS id, s.name AS label,
      '/' || s.board_slug || '/' || s.grade_slug || '/' || s.slug AS href,
      COUNT(DISTINCT b.id) || ' textbooks' AS meta,
      json_group_array(DISTINCT b.title) AS book_titles
      FROM catalog_subjects s
      LEFT JOIN catalog_books b ON b.board_slug = s.board_slug
        AND b.grade_slug = s.grade_slug AND b.subject_slug = s.slug
      WHERE s.board_slug = ? AND s.grade_slug = ?
      GROUP BY s.id ORDER BY s.name`);
    const grades = {};
    const streams = {};
    const subjects = {};

    for (const board of boards) {
      const boardGrades = gradeStatement.all(board.id);
      grades[board.id] = boardGrades;

      for (const grade of boardGrades) {
        const subjectRows = subjectStatement.all(board.id, grade.id);
        const baseKey = quickFindPreviewKey(board.id, grade.id);
        subjects[baseKey] = subjectRows.map(({ book_titles: _bookTitles, ...subject }) => subject);

        const subjectById = new Map(subjectRows.map((subject) => [subject.id, subject]));
        const gradeStreams = streamsFor(board.id, grade.id);
        if (!gradeStreams.length) continue;
        streams[baseKey] = gradeStreams.map(({ id, label, meta }) => ({ id, label, meta }));

        for (const stream of gradeStreams) {
          const streamKey = quickFindPreviewKey(board.id, grade.id, stream.id);
          subjects[streamKey] = subjectsFor(board.id, grade.id, stream.id)
            .map((subjectId) => subjectById.get(subjectId))
            .filter(Boolean)
            .map((subject) => {
              const count = parseBookTitles(subject.book_titles).filter((title) => bookMatchesStream({
                board: board.id,
                grade: grade.id,
                subject: subject.id,
                streamId: stream.id,
                title,
              })).length;
              return {
                id: subject.id,
                label: subject.label,
                href: `${subject.href}?stream=${encodeURIComponent(stream.id)}`,
                meta: `${count} ${count === 1 ? "textbook" : "textbooks"}`,
              };
            });
        }
      }
    }

    return {
      format: "studywudy-static-quick-find-v1",
      boards,
      grades,
      streams,
      subjects,
    };
  } finally {
    database.close();
  }
}
