#!/usr/bin/env python3
"""Verify catalog-artwork file coverage and rendered local routes."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3"
DEFAULT_MANIFEST = ROOT / "comparison/catalog-artwork-manifest.json"
ASSET_ROOT = ROOT / "comparison/after-assets"


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"{response.status} {url}")
        return response.read().decode("utf-8", errors="replace")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--base-url")
    parser.add_argument("--book-pages", action="store_true")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    connection = sqlite3.connect(args.db)
    try:
        rows = connection.execute(
            "SELECT id, board_slug, grade_slug, subject_slug, slug, title FROM catalog_books"
        ).fetchall()
    finally:
        connection.close()
    catalog = {
        row[0]: {
            "id": row[0], "board": row[1], "grade": row[2],
            "subject": row[3], "slug": row[4], "title": row[5],
        }
        for row in rows
    }
    manifest_books = {book["id"]: book for book in manifest["books"]}
    errors = []
    official_maharashtra_covers = 0

    missing_rows = sorted(set(catalog) - set(manifest_books))
    extra_rows = sorted(set(manifest_books) - set(catalog))
    if missing_rows:
        errors.append(f"manifest missing {len(missing_rows)} catalog books")
    if extra_rows:
        errors.append(f"manifest contains {len(extra_rows)} unknown books")

    for book_id, book in manifest_books.items():
        if book.get("board") == "maharashtra-board":
            evidence = book.get("match_evidence") or {}
            if (
                book.get("asset_kind") != "source-cover"
                or book.get("source_match") != "official-ebalbharati"
                or not str(book.get("source_image", "")).startswith(
                    "https://books.ebalbharati.in/BookCovers/"
                )
                or evidence.get("official") is not True
                or not evidence.get("official_item_id")
            ):
                errors.append(f"non-official Maharashtra cover: {book_id}")
            else:
                official_maharashtra_covers += 1
        asset_path = book.get("asset_path")
        if not asset_path:
            errors.append(f"no asset_path: {book_id}")
            continue
        file_path = ASSET_ROOT / asset_path.removeprefix("/")
        if not file_path.is_file():
            errors.append(f"missing file: {book_id} -> {file_path}")
            continue
        data = file_path.read_bytes()
        if len(data) < 400 or not data.startswith(b"\xff\xd8"):
            errors.append(f"invalid JPEG: {book_id} ({len(data)} bytes)")
        if hashlib.sha256(data).hexdigest() != book.get("sha256"):
            errors.append(f"checksum mismatch: {book_id}")

    expected_logos = set(manifest["boards"])
    for board, logo in manifest["boards"].items():
        path = ASSET_ROOT / logo["asset_path"].removeprefix("/")
        if not path.is_file():
            errors.append(f"missing board logo: {board}")

    rendered_subjects = 0
    rendered_books = 0
    if args.base_url:
        base = args.base_url.rstrip("/")
        grouped = defaultdict(list)
        for book in catalog.values():
            grouped[(book["board"], book["grade"], book["subject"])].append(book)

        subject_jobs = []
        for (board, grade, subject), books in grouped.items():
            url = f"{base}/{board}/{grade}/{subject}"
            expected = {manifest_books[book["id"]]["asset_path"] for book in books}
            subject_jobs.append((url, expected))

        def check_subject(job: tuple[str, set[str]]) -> tuple[str, str | None]:
            url, expected = job
            html = fetch_text(url)
            present = set(re.findall(r'/catalog-artwork/books/covers/[^"\s<]+\.jpg', html))
            if present != expected:
                return url, f"expected {len(expected)} covers, rendered {len(present)}"
            return url, None

        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(check_subject, job) for job in subject_jobs]
            for future in as_completed(futures):
                try:
                    url, error = future.result()
                    rendered_subjects += 1
                    if error:
                        errors.append(f"{url}: {error}")
                except Exception as caught:  # noqa: BLE001 - collect the complete route audit
                    errors.append(f"subject route failed: {caught}")

        if args.book_pages:
            book_jobs = []
            for book in catalog.values():
                url = f"{base}/{book['board']}/{book['grade']}/{book['subject']}/{book['slug']}"
                book_jobs.append((url, manifest_books[book["id"]]["asset_path"]))

            def check_book(job: tuple[str, str]) -> tuple[str, str | None]:
                url, expected = job
                html = fetch_text(url)
                if expected not in html:
                    return url, f"missing expected cover {expected}"
                return url, None

            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futures = [pool.submit(check_book, job) for job in book_jobs]
                for future in as_completed(futures):
                    try:
                        url, error = future.result()
                        rendered_books += 1
                        if error:
                            errors.append(f"{url}: {error}")
                    except Exception as caught:  # noqa: BLE001 - collect the complete route audit
                        errors.append(f"book route failed: {caught}")

        shared_pages = {
            f"{base}/": expected_logos,
            f"{base}/boards": expected_logos,
        }
        for board in expected_logos:
            shared_pages[f"{base}/{board}"] = {board}
        for url, boards in shared_pages.items():
            html = fetch_text(url)
            for board in boards:
                if manifest["boards"][board]["asset_path"] not in html:
                    errors.append(f"{url}: missing {board} logo")

    summary = {
        "boards": len(manifest["boards"]),
        "books": len(manifest_books),
        "source_covers": sum(book["asset_kind"] == "source-cover" for book in manifest_books.values()),
        "reference_covers": sum(book["asset_kind"] == "reference-cover" for book in manifest_books.values()),
        "official_maharashtra_covers": official_maharashtra_covers,
        "classes": len({(book["board"], book["grade"]) for book in catalog.values()}),
        "subjects": len({(book["board"], book["grade"], book["subject"]) for book in catalog.values()}),
        "rendered_subject_routes": rendered_subjects,
        "rendered_book_routes": rendered_books,
        "errors": len(errors),
    }
    print(json.dumps(summary, indent=2))
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors[:100]))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
