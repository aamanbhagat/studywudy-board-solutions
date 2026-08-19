#!/usr/bin/env python3
"""Fetch the official eBalbharati textbook-cover catalog.

The eBalbharati library is an ASP.NET Web Forms application. This crawler uses
its normal filter and pagination postbacks, keeps a small delay between pages,
and records the official cover and PDF URLs needed by the artwork builder.
"""

from __future__ import annotations

import argparse
import html
import http.cookiejar
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path


CATALOG_URL = "https://books.ebalbharati.in/ebook.aspx"
OFFICIAL_ORIGIN = "https://books.ebalbharati.in/"
DEFAULT_CLASSES = tuple(range(5, 13))


def hidden_fields(page: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for tag in re.findall(r"<input\b[^>]*>", page, flags=re.IGNORECASE):
        name = re.search(r"\bname=[\"']([^\"']+)", tag, flags=re.IGNORECASE)
        if not name:
            continue
        value = re.search(r"\bvalue=[\"']([^\"']*)", tag, flags=re.IGNORECASE)
        fields[html.unescape(name.group(1))] = html.unescape(value.group(1) if value else "")
    return fields


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def parse_books(page: str, year: int) -> list[dict]:
    books: list[dict] = []
    cards = re.split(
        r"(?=<div\s+id=['\"]div2['\"]\s+class=['\"]bookDetails1['\"])",
        page,
        flags=re.IGNORECASE,
    )
    for card in cards:
        cover = re.search(r"\bsrc=['\"]?BookCovers/([^'\"\s>]+)", card, flags=re.IGNORECASE)
        title = re.search(
            r"class=['\"]?divbooknm['\"]?\s+title=['\"]([^'\"]*)",
            card,
            flags=re.IGNORECASE,
        )
        if not cover or not title:
            continue
        filename = cover.group(1)
        item_id = Path(filename).stem
        books.append({
            "item_id": item_id,
            "title": clean_text(title.group(1)),
            "year": year,
            "cover_url": urllib.parse.urljoin(OFFICIAL_ORIGIN, f"BookCovers/{filename}"),
            "pdf_url": f"https://ebooks.ebalbharati.in/pdfs/{item_id}.pdf",
            "catalog_url": CATALOG_URL,
        })
    return books


def page_count(page: str) -> int:
    match = re.search(r'id=["\']lblNoOfPages["\'][^>]*>([^<]+)', page, flags=re.IGNORECASE)
    return int(clean_text(match.group(1))) if match else 1


def postback(opener, page: str, target: str, argument: str, selected: str, year: int) -> str:
    data = hidden_fields(page)
    data.update({
        "__EVENTTARGET": target,
        "__EVENTARGUMENT": argument,
        "txtSelected": selected,
        "txtyear": str(year),
    })
    request = urllib.request.Request(
        CATALOG_URL,
        data=urllib.parse.urlencode(data).encode(),
        headers={"User-Agent": "StudyWudy catalog artwork audit/1.0"},
    )
    with opener.open(request, timeout=60) as response:
        return response.read().decode("utf-8", "replace")


def fetch_catalog_for_type(year: int, classes: tuple[int, ...], book_type: int, delay: float) -> list[dict]:
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
    )
    request = urllib.request.Request(
        CATALOG_URL,
        headers={"User-Agent": "StudyWudy catalog artwork audit/1.0"},
    )
    with opener.open(request, timeout=60) as response:
        page = response.read().decode("utf-8", "replace")

    current_year = re.search(r'id=["\']txtyear["\'][^>]*value=["\']([^"\']+)', page)
    if not current_year or current_year.group(1) != str(year):
        page = postback(opener, page, "lnkradioclick", "", "", year)
        time.sleep(delay)

    selected = " ".join([str(book_type), *(str(200 + number) for number in classes)])
    page = postback(opener, page, "upBtn", f"{selected}#1", selected, year)
    pages = page_count(page)
    records = parse_books(page, year)
    print(f"page 1/{pages}: {len(records)} official covers")

    for number in range(2, pages + 1):
        time.sleep(delay)
        page = postback(opener, page, "upMain", f"{selected}#{number}", selected, year)
        batch = parse_books(page, year)
        records.extend(batch)
        print(f"page {number}/{pages}: {len(batch)} official covers")

    unique = {record["item_id"]: record for record in records}
    return list(unique.values())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--classes", default="5,6,7,8,9,10,11,12")
    parser.add_argument("--types", default="101,107,412", help="Text Books, Other Books, Ekatmik Books")
    parser.add_argument("--delay", type=float, default=0.2)
    parser.add_argument("--output", type=Path, default=Path("comparison/ebalbharati-official-catalog.json"))
    args = parser.parse_args()
    classes = tuple(int(value) for value in args.classes.split(",") if value.strip())
    book_types = tuple(int(value) for value in args.types.split(",") if value.strip())
    records = []
    for book_type in book_types:
        print(f"fetching official catalog type {book_type}")
        records.extend(fetch_catalog_for_type(args.year, classes, book_type, args.delay))
    records = list({record["item_id"]: record for record in records}.values())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(records)} official records to {args.output}")


if __name__ == "__main__":
    main()
