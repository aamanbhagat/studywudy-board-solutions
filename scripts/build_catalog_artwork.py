#!/usr/bin/env python3
"""Build the complete StudyWudy board-logo and textbook-cover asset set.

The script matches the recovered D1 catalog to a browser-crawled public cover
inventory, downloads verified cover thumbnails, and creates an explicitly
labelled StudyWudy reference cover when the source publishes no cover image.
It also writes an auditable manifest and the small JS lookup consumed by the
Worker's server-side HTMLRewriter pass, plus a small browser guard that keeps
React hydration from restoring the legacy placeholder artwork.
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import hashlib
import html
import json
import re
import sqlite3
import subprocess
import tempfile
import textwrap
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3"
DEFAULT_CRAWL = Path("/tmp/studywudy-shaalaa-cover-records.json")
ASSET_ROOT = ROOT / "comparison/after-assets/catalog-artwork"
MANIFEST_PATH = ROOT / "comparison/catalog-artwork-manifest.json"
LOOKUP_PATH = ROOT / "comparison/catalog-artwork-map.js"
BROWSER_GUARD_PATH = ROOT / "comparison/after-assets/catalog-artwork.js"
OFFICIAL_EBAL_CATALOG_PATH = ROOT / "comparison/ebalbharati-official-catalog.json"

BOARD_META = {
    "maharashtra-board": {
        "name": "Maharashtra State Board",
        "mark": "MH",
        "color": "#c63f2b",
        "wash": "#fff1df",
        "logo_url": "https://www.mahahsscboard.in/LogoBord.png",
        "logo_source": "https://www.mahahsscboard.in/en",
    },
    "cbse": {
        "name": "CBSE",
        "mark": "CB",
        "color": "#0757d8",
        "wash": "#e8f0ff",
        "logo_url": "https://saras.cbse.gov.in/assets/images/cbse-logo.png",
        "logo_source": "https://saras.cbse.gov.in/",
    },
    "cisce": {
        "name": "CISCE — ICSE & ISC",
        "mark": "CI",
        "color": "#097347",
        "wash": "#e7f6ed",
        "logo_url": "https://cisce.org/wp-content/uploads/2025/08/logo-cisce-2.webp",
        "logo_source": "https://cisce.org/",
    },
    "tamil-nadu-board": {
        "name": "Tamil Nadu State Board",
        "mark": "TN",
        "color": "#6f3cc3",
        "wash": "#f1eaff",
        "logo_url": "https://www.dge.tn.gov.in/img/tnlogo.png",
        "logo_source": "https://www.dge.tn.gov.in/",
    },
}

PUBLISHER_TOKENS = {
    "balbharati", "scert", "ncert", "selina", "samacheer", "kalvi",
    "frank", "nootan", "goyal", "brothers", "prakashan", "lakhmir",
    "rd", "rs", "sharma", "aggarwal", "singh", "solutions", "cbse",
    "dr", "sp", "ss", "rk", "kk", "gupta", "shome", "bansal",
}

SUBJECT_ALIASES = {
    "mathematics": {"mathematics", "maths", "ganit", "algebra", "geometry"},
    "science": {"science", "vigyan"},
    "social-science": {"social", "history", "geography", "civics"},
    "history-civics": {"history", "civics"},
    "history-political-science": {"history", "political", "rajyashastra"},
    "information-technology": {"information", "technology"},
    "computer-science": {"computer"},
    "computer-applications": {"computer"},
    "book-keeping-accountancy": {"bookkeeping", "accountancy"},
    "organisation-commerce-management": {"organisation", "commerce", "management"},
    "environmental-studies": {"environmental", "environment"},
    "english": {"english"},
    "hindi": {"hindi"},
    "marathi": {"marathi"},
    "tamil": {"tamil"},
}

DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
EBAL_MEDIUMS = {
    "मराठी": "marathi",
    "हिंदी": "hindi",
    "इंग्रजी": "english",
    "उर्दू": "urdu",
    "उर्दु": "urdu",
    "गुजराती": "gujarati",
    "कन्नड": "kannada",
    "सिंधी": "sindhi",
    "तेलगु": "telugu",
    "तेलुगु": "telugu",
    "तमिळ": "tamil",
    "तामिळ": "tamil",
    "बंगाली": "bengali",
}
EBAL_TRANSLATIONS = (
    ("माहिती तंत्रज्ञान - वाणिज्य", " information technology commerce "),
    ("माहिती तंत्रज्ञान - विज्ञान", " information technology science "),
    ("माहिती तंत्रज्ञान - कला", " information technology arts "),
    ("माहिती तंत्रज्ञान", " information technology "),
    ("वाणिज्य संघटन व व्यवस्थापन", " organisation of commerce and management "),
    ("इतिहास व नागरिकशास्त्र", " history and civics "),
    ("इतिहास व राज्यशास्त्र", " history and political science "),
    ("विज्ञान आणि तंत्रज्ञान", " science and technology "),
    ("सायन्स ऍन्ड टेक्नॉलॉजी", " science and technology "),
    ("परिसर अभ्यास", " environmental studies "),
    ("माय इंग्लिश कोर्स बुक", " my english coursebook "),
    ("माय इंग्लिश बुक", " my english book "),
    ("खेळू, करू, शिकू", " play do learn "),
    ("पुस्तपालन व लेखाकर्म", " book keeping and accountancy "),
    ("चिटणिसाची कार्यपध्दती", " secretarial practice "),
    ("चिटणीसाची कार्यपद्धती", " secretarial practice "),
    ("गणित व सं.शास्त्र(वाणिज्य)", " mathematics and statistics commerce "),
    ("गणित कला-विज्ञान", " mathematics and statistics arts and science "),
    ("सामान्य विज्ञान", " general science "),
    ("भौतिकशास्त्र", " physics "),
    ("रसायनशास्त्र", " chemistry "),
    ("जीवशास्त्र", " biology "),
    ("अर्थशास्त्र", " economics "),
    ("मानसशास्त्र", " psychology "),
    ("समाजशास्त्र", " sociology "),
    ("राज्यशास्त्र", " political science "),
    ("तत्वज्ञान", " philosophy "),
    ("भूगोल", " geography "),
    ("इतिहास", " history "),
    ("कुमारभारती", " kumarbharati "),
    ("अक्षरभारती", " aksharbharati "),
    ("आंतरभारती", " antarbharati "),
    ("लोकभारती", " lokbharati "),
    ("लॊकभारती", " lokbharati "),
    ("लोकवाणी", " lokvani "),
    ("सुलभभारती", " sulabhbharati "),
    ("सुगमभारती", " sugambharati "),
    ("युवकभारती", " yuvakbharati "),
    ("संस्कृतम् आमोद", " sanskrit amod "),
    ("संस्कृतम् आनन्द", " sanskrit anand "),
    ("गणित", " mathematics "),
    ("बालभारती", " balbharati "),
    ("मराठी", " marathi "),
    ("हिंदी", " hindi "),
    ("इंग्रजी", " english "),
)
MAHARASHTRA_MATCH_STOPWORDS = {
    "balbharati", "scert", "maharashtra", "state", "board", "hsc",
    "question", "bank", "micheal", "vaz", "nootan", "incredible",
    "icse", "standard", "class", "textbook", "solutions", "integrated",
    "ekatmik",
}


def roman_to_number(match: re.Match[str]) -> str:
    return {"i": "1", "ii": "2", "xii": "12"}.get(match.group(0).lower(), match.group(0))


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = re.sub(r"\b(?:XII|II|I)\b", roman_to_number, value, flags=re.I)
    value = value.lower().replace("&", " and ")
    value = re.sub(r"\[english(?: medium)?\]", " ", value)
    value = re.sub(r"\[(hindi|marathi|tamil)(?: medium)?\]", r" \1 ", value)
    value = re.sub(r"\bsolutions(?:\s+for)?\b", " ", value)
    value = re.sub(
        r"\b(?:english medium|maharashtra state board|tn board|icse|isc|"
        r"class|standard|hsc|ssc)\b",
        " ",
        value,
    )
    value = re.sub(r"\bmaths\b", "mathematics", value)
    value = re.sub(r"\bbook[ -]?keeping\b", "bookkeeping", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def grade_from_text(value: str) -> str | None:
    match = re.search(
        r"\b(?:class|standard)\s*(\d{1,2}|xii|ii|i)(?:st|nd|rd|th)?\b|"
        r"\b(\d{1,2}|xii|ii|i)(?:st|nd|rd|th)?\s*(?:standard)\b",
        value or "",
        re.I,
    )
    if not match:
        return None
    raw = (match.group(1) or match.group(2)).lower()
    number = {"i": "1", "ii": "2", "xii": "12"}.get(raw, raw)
    return f"class-{number}"


def ebal_grade(item_id: str, title: str) -> int | None:
    """Prefer the official item number because one Physics XII row is mislabeled XI."""
    item_id = str(item_id)
    if item_id.startswith("100"):
        return 10
    if item_id.startswith("110"):
        return 11
    if item_id.startswith("120"):
        return 12
    if item_id and item_id[0] in "56789":
        return int(item_id[0])
    translated = title.translate(DEVANAGARI_DIGITS)
    match = re.search(r"(\d{1,2})\s*वी", translated)
    return int(match.group(1)) if match else None


def ebal_canonical_source(record: dict) -> dict:
    raw_title = str(record.get("title", ""))
    translated = raw_title.translate(DEVANAGARI_DIGITS)
    translated = re.sub(r"\d{1,2}\s*वी", " ", translated)
    medium = None
    for label, value in EBAL_MEDIUMS.items():
        if re.search(re.escape(label) + r"\s*$", translated):
            medium = value
            translated = re.sub(re.escape(label) + r"\s*$", " ", translated)
            break
    for source, replacement in EBAL_TRANSLATIONS:
        translated = translated.replace(source, replacement)
    translated = translated.translate(DEVANAGARI_DIGITS)
    translated = re.sub(r"भा\s*[-–]?\s*([12])", r" part \1 ", translated)
    translated = re.sub(r"भाग\s*[-–]?\s*([12])", r" part \1 ", translated)
    core = " ".join(re.sub(r"[^a-zA-Z0-9]+", " ", translated).lower().split())
    language_titles = {
        "balbharati", "yuvakbharati", "kumarbharati", "aksharbharati",
        "antarbharati", "lokbharati", "lokvani", "sulabhbharati", "sugambharati",
    }
    if medium and language_titles.intersection(core.split()) and medium not in core.split():
        core = f"{core} {medium}"
    grade = ebal_grade(record.get("item_id", ""), raw_title)
    canonical = (
        f"SCERT Maharashtra Balbharati {core} "
        f"[{medium or 'official'}] Standard {grade} Maharashtra State Board"
    )
    return {
        "href": record.get("catalog_url", "https://books.ebalbharati.in/ebook.aspx"),
        "text": canonical,
        "cover": record.get("cover_url"),
        "board": "maharashtra-board",
        "official": True,
        "official_item_id": str(record.get("item_id", "")),
        "official_title": raw_title,
        "official_pdf": record.get("pdf_url"),
        "official_grade": grade,
        "official_medium": medium,
        "official_core": core,
    }


def ebal_subject(source: dict) -> str | None:
    core = source.get("official_core", "")
    medium = source.get("official_medium")
    ordered = (
        ("information technology", "information-technology"),
        ("book keeping and accountancy", "accountancy"),
        ("organisation of commerce and management", "commerce"),
        ("secretarial practice", "commerce"),
        ("history and political science", "political-science"),
        ("history and civics", "political-science"),
        ("science and technology", "science"),
        ("general science", "science"),
        ("environmental studies", "environmental-studies"),
        ("mathematics and statistics", "mathematics"),
        ("mathematics", "mathematics"),
        ("biology", "biology"),
        ("physics", "physics"),
        ("chemistry", "chemistry"),
        ("economics", "economics"),
        ("psychology", "psychology"),
        ("sociology", "sociology"),
        ("political science", "political-science"),
        ("geography", "geography"),
        ("history", "history"),
        ("sanskrit", "sanskrit"),
        ("my english", "english"),
        ("play do learn", "english"),
    )
    for marker, subject in ordered:
        if marker in core:
            return subject
    if {
        "balbharati", "yuvakbharati", "kumarbharati", "aksharbharati",
        "antarbharati", "lokbharati", "lokvani", "sulabhbharati", "sugambharati",
    }.intersection(core.split()):
        return medium if medium in {"english", "hindi", "marathi"} else None
    return None


def maharashtra_local_terms(book: dict) -> tuple[set[str], str]:
    grade_number = book["grade"].replace("class-", "")
    value = normalized(book["title"])
    replacements = {
        "ganit": "mathematics",
        "bhugol": "geography",
        "vigyan": "science",
        "vigyaan": "science",
        "vidnyan": "science",
        "tantragyan": "technology",
        "prodyogiki": "technology",
        "itihaas": "history",
        "itihas": "history",
        "rajneeti": "political",
        "rajyashastra": "political",
        "nagarikshastra": "civics",
        "naagarik": "civics",
        "shaastra": "civics",
        "book": "book",
        "keeping": "keeping",
    }
    words = [replacements.get(word, word) for word in value.split()]
    words = [
        word for word in words
        if word not in MAHARASHTRA_MATCH_STOPWORDS and word != grade_number
    ]
    return set(words), " ".join(words)


def maharashtra_requested_medium(book: dict) -> str:
    value = normalized(book["title"])
    if " marathi " in f" {value} ":
        return "marathi"
    if " hindi " in f" {value} ":
        return "hindi"
    return "english"


def maharashtra_part(book: dict) -> str | None:
    value = normalized(book["title"])
    match = re.search(
        r"(?:part|bhag|mathematics|ganit|statistics|technology|tantragyan|prodyogiki|studies)\s+([1-4])\b",
        value,
    )
    if match:
        return match.group(1)
    if "algebra" in value or "bijganit" in value:
        return "1"
    if "geometry" in value or "bhumitiy" in value:
        return "2"
    return None


def maharashtra_source_score(book: dict, source: dict) -> tuple[float, dict]:
    local_tokens, local_sequence = maharashtra_local_terms(book)
    official_tokens = {
        word for word in normalized(source.get("official_core", "")).split()
        if word not in MAHARASHTRA_MATCH_STOPWORDS
    }
    official_sequence = " ".join(sorted(official_tokens))
    overlap = local_tokens & official_tokens
    union = local_tokens | official_tokens
    score = (
        0.58 * len(overlap) / max(1, len(union))
        + 0.27 * len(overlap) / max(1, len(local_tokens))
        + 0.15 * difflib.SequenceMatcher(None, local_sequence, official_sequence).ratio()
    )
    requested_medium = maharashtra_requested_medium(book)
    if source.get("official_medium") == requested_medium:
        score += 0.22
    else:
        score -= 0.38
    requested_part = maharashtra_part(book)
    official_part = None
    if "part 1" in source.get("official_core", ""):
        official_part = "1"
    elif "part 2" in source.get("official_core", ""):
        official_part = "2"
    if requested_part and book["subject"] != "general-studies":
        score += 0.28 if official_part == requested_part else -0.55
    elif official_part == "1":
        score += 0.025
    for stream in ("commerce", "arts", "science"):
        if stream in local_tokens:
            score += 0.26 if stream in official_tokens else -0.42
    return score, {
        "official": True,
        "official_item_id": source.get("official_item_id"),
        "official_title": source.get("official_title"),
        "official_pdf": source.get("official_pdf"),
        "requested_medium": requested_medium,
        "requested_part": requested_part,
        "matched_form": source.get("official_core"),
        "overlap": sorted(overlap),
    }


def apply_maharashtra_official_sources(matches: list[dict], catalog_path: Path) -> None:
    records = json.loads(catalog_path.read_text(encoding="utf-8"))
    sources = [ebal_canonical_source(record) for record in records]
    by_grade_subject: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for source in sources:
        subject = ebal_subject(source)
        if source.get("official_grade") and subject:
            by_grade_subject[(source["official_grade"], subject)].append(source)

    general_studies_parts = {
        "1": "marathi",
        "2": "mathematics",
        "3": "science",
        "4": "political-science",
    }
    for match in matches:
        book = match["book"]
        if book["board"] != "maharashtra-board":
            continue
        grade = int(book["grade"].replace("class-", ""))
        subject = book["subject"]
        lookup_subject = "mathematics" if subject == "mathematics-commerce" else subject
        if subject == "information-technology-commerce":
            lookup_subject = "information-technology"
        if subject == "book-keeping-and-accountancy":
            lookup_subject = "accountancy"
        if subject == "general-studies":
            part = maharashtra_part(book) or "1"
            lookup_subject = general_studies_parts.get(part, "marathi")
            if part == "1" and maharashtra_requested_medium(book) == "hindi":
                lookup_subject = "hindi"
        candidates = by_grade_subject.get((grade, lookup_subject), [])
        if not candidates:
            raise RuntimeError(f"No official eBalbharati cover candidate for {book['id']}")
        scored = sorted(
            ((maharashtra_source_score(book, source), source) for source in candidates),
            key=lambda pair: pair[0][0],
            reverse=True,
        )
        (score, evidence), source = scored[0]
        margin = score - (scored[1][0][0] if len(scored) > 1 else 0.0)
        match.update({
            "source": source,
            "source_match": "official-ebalbharati",
            "asset_kind": "source-cover",
            "score": round(score, 4),
            "margin": round(margin, 4),
            "evidence": evidence,
        })


def source_forms(source: dict) -> list[str]:
    path_name = Path(urllib.parse.urlparse(source.get("href", "")).path).name
    path_name = re.sub(r"_\d+$", "", path_name)
    path_name = re.sub(r"-english-(class|standard)-", r"-\1-", path_name, flags=re.I)
    forms = [normalized(source.get("text", "")), normalized(path_name.replace("-", " "))]
    return list(dict.fromkeys(form for form in forms if form))


def publisher_and_language_guard(local: dict, source: dict) -> tuple[bool, bool]:
    left = f" {normalized(local['title'])} "
    source_raw = f" {source.get('text', '').lower()} {source.get('href', '').lower()} "
    source_norm = f" {normalized(source_raw)} "
    markers = (
        "balbharati", "scert", "ncert", "frank", "nootan", "goyal",
        "lakhmir singh", "rd sharma", "rs aggarwal", "hc verma",
        "samacheer kalvi", "selina",
    )
    publisher_ok = True
    for marker in markers:
        if f" {marker} " not in left:
            continue
        if f" {marker} " in source_norm:
            continue
        if marker == "selina" and " concise " in left:
            continue
        publisher_ok = False
        break
    if (" exemplar " in left) != (" exemplar " in source_norm):
        publisher_ok = False

    language_ok = True
    for language in ("hindi", "marathi", "tamil"):
        if f" {language} " in left and language not in source_raw:
            language_ok = False
    return publisher_ok, language_ok


def similarity(local: dict, source: dict) -> tuple[float, dict]:
    left = normalized(local["title"])
    left_tokens = set(left.split())
    left_core = left_tokens - PUBLISHER_TOKENS
    subject_terms = SUBJECT_ALIASES.get(
        local["subject"], set(local["subject"].replace("-", " ").split())
    )
    publisher_ok, language_ok = publisher_and_language_guard(local, source)
    comparisons = []
    for right in source_forms(source):
        right_tokens = set(right.split())
        union = left_tokens | right_tokens
        overlap = left_tokens & right_tokens
        jaccard = len(overlap) / max(1, len(union))
        coverage = len(overlap) / max(1, len(left_tokens))
        sequence = difflib.SequenceMatcher(None, left, right).ratio()

        right_core = right_tokens - PUBLISHER_TOKENS
        core_union = left_core | right_core
        core_overlap = left_core & right_core
        core_jaccard = len(core_overlap) / max(1, len(core_union))
        core_coverage = len(core_overlap) / max(1, len(left_core))
        subject_hit = bool(subject_terms & right_tokens)
        exact = left == right
        exact_tokens = left_tokens == right_tokens
        exact_core = len(left_core) >= 2 and left_core == right_core

        score = max(
            0.48 * jaccard + 0.27 * coverage + 0.25 * sequence,
            0.58 * core_jaccard + 0.32 * core_coverage + 0.10 * sequence,
        )
        if subject_hit:
            score += 0.055
        if exact:
            score = 1.25
        elif exact_tokens:
            score = max(score, 1.15)
        elif exact_core:
            score = max(score, 1.04)
        if "question bank" in local["title"].lower() and "scert-maharashtra" in source["href"]:
            if subject_hit:
                score = max(score, 0.94)
        local_lower = local["title"].lower()
        source_lower = source.get("text", "").lower()
        if "mathematics and statistics" in local_lower:
            if "commerce" in local_lower and "commerce" not in source_lower:
                score -= 0.24
            if "commerce" not in local_lower and "commerce" in source_lower:
                score -= 0.24
            if "commerce" not in local_lower and "arts and science" in source_lower:
                score += 0.09
        if not publisher_ok or not language_ok:
            score -= 0.4
        comparisons.append((score, {
            "exact": exact,
            "exact_tokens": exact_tokens,
            "exact_core": exact_core,
            "subject_hit": subject_hit,
            "publisher_ok": publisher_ok,
            "language_ok": language_ok,
            "matched_form": right,
            "jaccard": round(jaccard, 4),
            "coverage": round(coverage, 4),
            "core_jaccard": round(core_jaccard, 4),
            "core_coverage": round(core_coverage, 4),
            "sequence": round(sequence, 4),
        }))
    return max(comparisons, key=lambda item: item[0]) if comparisons else (0.0, {})


def load_books(db_path: Path) -> list[dict]:
    connection = sqlite3.connect(db_path)
    try:
        rows = connection.execute(
            """SELECT id, board_slug, grade_slug, subject_slug, slug, title
               FROM catalog_books
               ORDER BY board_slug, grade_slug, subject_slug, title"""
        ).fetchall()
    finally:
        connection.close()
    return [
        dict(zip(("id", "board", "grade", "subject", "slug", "title"), row))
        for row in rows
    ]


def dedupe_sources(records: list[dict]) -> list[dict]:
    by_href: dict[str, dict] = {}
    for record in records:
        if not record.get("href") or not record.get("text"):
            continue
        current = by_href.get(record["href"])
        if (
            current is None
            or (record.get("cover") and not current.get("cover"))
            or (grade_from_text(record.get("text", "")) and not grade_from_text(current.get("text", "")))
        ):
            by_href[record["href"]] = record
    return list(by_href.values())


def match_books(books: list[dict], sources: list[dict]) -> list[dict]:
    by_board_grade: dict[tuple[str, str], list[dict]] = defaultdict(list)
    by_grade: dict[str, list[dict]] = defaultdict(list)
    for source in sources:
        source_grade = grade_from_text(source.get("text", ""))
        if not source_grade:
            continue
        by_board_grade[(source.get("board", ""), source_grade)].append(source)
        by_grade[source_grade].append(source)

    matches = []
    for book in books:
        candidates = by_board_grade[(book["board"], book["grade"])]
        scored = sorted(
            ((similarity(book, source), source) for source in candidates),
            key=lambda pair: pair[0][0],
            reverse=True,
        )
        best = scored[0] if scored else ((0.0, {}), None)
        second_score = scored[1][0][0] if len(scored) > 1 else 0.0
        score, evidence = best[0]
        source = best[1]

        # One recovered row is catalogued under Maharashtra but names an ICSE
        # textbook. Allow only an extremely strong cross-board title match.
        cross = sorted(
            ((similarity(book, item), item) for item in by_grade[book["grade"]]),
            key=lambda pair: pair[0][0],
            reverse=True,
        )
        if cross and cross[0][0][0] >= 1.0 and cross[0][0][0] > score + 0.08:
            (score, evidence), source = cross[0]
            second_score = cross[1][0][0] if len(cross) > 1 else 0.0

        margin = score - second_score
        reliable = bool(source) and (
            evidence["exact"]
            or evidence["exact_tokens"]
            or evidence["exact_core"]
            or (evidence["subject_hit"] and score >= 0.83)
            or (evidence["subject_hit"] and score >= 0.74 and margin >= 0.045)
            or (
                "question bank" in book["title"].lower()
                and score >= 0.92
                and evidence["subject_hit"]
            )
        ) and evidence.get("publisher_ok", False) and evidence.get("language_ok", False)
        has_cover = reliable and bool(source.get("cover"))
        matches.append(
            {
                "book": book,
                "source": source if reliable else None,
                "source_match": "verified" if reliable else "unmatched",
                "asset_kind": "source-cover" if has_cover else "reference-cover",
                "score": round(score, 4),
                "margin": round(margin, 4),
                "evidence": evidence,
            }
        )
    return matches


def fetch_bytes(url: str, attempts: int = 3) -> bytes:
    url = re.sub(r"\.(?:JPG|JPEG|PNG)$", lambda match: match.group(0).lower(), url)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 Chrome/140 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
    )
    error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                data = response.read()
            if len(data) < 400:
                raise ValueError(f"Downloaded asset is unexpectedly small ({len(data)} bytes)")
            return data
        except Exception as caught:  # noqa: BLE001 - retry and report final URL failure
            error = caught
            time.sleep(0.35 * (attempt + 1))
    curl = subprocess.run(
        ["curl", "-fsSL", "--max-time", "30", url],
        check=False,
        capture_output=True,
    )
    if curl.returncode == 0 and len(curl.stdout) >= 400:
        return curl.stdout
    raise RuntimeError(f"Could not download {url}: {error}")


def image_extension(data: bytes, url: str) -> str:
    if data.startswith(b"\x89PNG"):
        return ".png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    if data.startswith(b"\xff\xd8"):
        return ".jpg"
    suffix = Path(urllib.parse.urlparse(url).path).suffix.lower()
    return suffix if suffix in {".png", ".jpg", ".jpeg", ".webp", ".svg"} else ".bin"


def wrap_title(title: str) -> list[str]:
    lines = textwrap.wrap(title, width=24, break_long_words=False, break_on_hyphens=False)
    if len(lines) <= 6:
        return lines
    return lines[:5] + [textwrap.shorten(" ".join(lines[5:]), width=24, placeholder="…")]


def reference_cover_svg(book: dict) -> str:
    meta = BOARD_META[book["board"]]
    lines = wrap_title(book["title"])
    text_nodes = "".join(
        f'<text x="22" y="{100 + index * 25}" font-size="18" font-weight="800" '
        f'fill="#111820">{html.escape(line)}</text>'
        for index, line in enumerate(lines)
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="216" height="300" viewBox="0 0 216 300">
  <rect width="216" height="300" fill="{meta['wash']}"/>
  <rect x="1.5" y="1.5" width="213" height="297" rx="8" fill="none" stroke="#111820" stroke-width="3"/>
  <rect x="0" y="0" width="216" height="13" fill="{meta['color']}"/>
  <rect x="18" y="30" width="46" height="46" rx="7" fill="{meta['color']}" stroke="#111820" stroke-width="2"/>
  <text x="41" y="60" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="900" fill="white">{meta['mark']}</text>
  <text x="74" y="43" font-family="Arial, sans-serif" font-size="8" font-weight="800" letter-spacing="1.2" fill="#434b55">{html.escape(meta['name'].upper())}</text>
  <text x="74" y="60" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#111820">{html.escape(book['grade'].replace('-', ' ').title())}</text>
  {text_nodes}
  <line x1="20" x2="196" y1="257" y2="257" stroke="#111820" stroke-width="1.5"/>
  <text x="22" y="276" font-family="Arial, sans-serif" font-size="8" font-weight="800" letter-spacing="1.05" fill="#434b55">STUDYWUDY CATALOG REFERENCE COVER</text>
</svg>"""


def write_reference_cover(book: dict, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="studywudy-cover-") as temp_dir:
        svg_path = Path(temp_dir) / "cover.svg"
        svg_path.write_text(reference_cover_svg(book), encoding="utf-8")
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "84", str(svg_path), "--out", str(destination)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )


def write_cover_jpeg(data: bytes, destination: Path) -> None:
    if data.startswith(b"\xff\xd8"):
        destination.write_bytes(data)
        return
    suffix = ".png" if data.startswith(b"\x89PNG") else ".webp"
    with tempfile.TemporaryDirectory(prefix="studywudy-source-cover-") as temp_dir:
        source = Path(temp_dir) / f"cover{suffix}"
        source.write_bytes(data)
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "88", str(source), "--out", str(destination)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )


def write_assets(matches: list[dict], dry_run: bool) -> dict:
    if dry_run:
        return {"downloaded": 0, "reference": 0, "failed_downloads": []}
    covers_root = ASSET_ROOT / "books/covers"
    downloaded = 0
    reference = 0
    failed_downloads = []
    previous_books = {}
    if MANIFEST_PATH.exists():
        try:
            previous = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            previous_books = {book["id"]: book for book in previous.get("books", [])}
        except (OSError, ValueError, TypeError):
            previous_books = {}

    for index, match in enumerate(matches, start=1):
        book = match["book"]
        relative = Path("books/covers") / book["board"] / book["grade"] / f"{book['slug']}.jpg"
        destination = ASSET_ROOT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        source = match.get("source")
        previous = previous_books.get(book["id"], {})
        existing_is_jpeg = destination.exists() and destination.read_bytes()[:2] == b"\xff\xd8"
        reusable = (
            existing_is_jpeg
            and previous.get("asset_kind") == match["asset_kind"]
            and (
                match["asset_kind"] == "reference-cover"
                or previous.get("source_image") == (source or {}).get("cover")
            )
        )
        if reusable:
            if match["asset_kind"] == "source-cover":
                downloaded += 1
            else:
                reference += 1
            match["asset_path"] = f"/catalog-artwork/{relative.as_posix()}"
            data = destination.read_bytes()
            match["bytes"] = len(data)
            match["sha256"] = hashlib.sha256(data).hexdigest()
            continue
        if match["asset_kind"] == "source-cover" and source and source.get("cover"):
            try:
                write_cover_jpeg(fetch_bytes(source["cover"]), destination)
                downloaded += 1
            except Exception as error:  # noqa: BLE001 - downgrade one missing source to an explicit fallback
                match["asset_kind"] = "reference-cover"
                match["download_error"] = str(error)
                failed_downloads.append({"book_id": book["id"], "error": str(error)})
                write_reference_cover(book, destination)
                reference += 1
        else:
            write_reference_cover(book, destination)
            reference += 1
        match["asset_path"] = f"/catalog-artwork/{relative.as_posix()}"
        data = destination.read_bytes()
        match["bytes"] = len(data)
        match["sha256"] = hashlib.sha256(data).hexdigest()
        if index % 75 == 0:
            print(f"built {index}/{len(matches)} covers")
    return {"downloaded": downloaded, "reference": reference, "failed_downloads": failed_downloads}


def write_board_logos(dry_run: bool) -> dict:
    logos = {}
    if dry_run:
        return logos
    logos_root = ASSET_ROOT / "boards/logos"
    logos_root.mkdir(parents=True, exist_ok=True)
    for board, meta in BOARD_META.items():
        data = fetch_bytes(meta["logo_url"])
        extension = image_extension(data, meta["logo_url"])
        destination = logos_root / f"{board}{extension}"
        destination.write_bytes(data)
        logos[board] = {
            "name": meta["name"],
            "asset_path": f"/catalog-artwork/boards/logos/{destination.name}",
            "source_url": meta["logo_url"],
            "source_page": meta["logo_source"],
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
    return logos


def public_match(match: dict) -> dict:
    book = match["book"]
    source = match.get("source") or {}
    return {
        "id": book["id"],
        "board": book["board"],
        "grade": book["grade"],
        "subject": book["subject"],
        "slug": book["slug"],
        "title": book["title"],
        "asset_path": match.get("asset_path"),
        "asset_kind": match["asset_kind"],
        "source_match": match["source_match"],
        "source_title": source.get("text"),
        "source_page": source.get("href"),
        "source_image": source.get("cover"),
        "match_score": match["score"],
        "match_margin": match["margin"],
        "match_evidence": match["evidence"],
        "bytes": match.get("bytes"),
        "sha256": match.get("sha256"),
        "download_error": match.get("download_error"),
    }


def write_manifests(matches: list[dict], logos: dict, asset_stats: dict, dry_run: bool) -> None:
    if dry_run:
        return
    books = [public_match(match) for match in matches]
    by_board = {}
    for board in BOARD_META:
        subset = [book for book in books if book["board"] == board]
        by_board[board] = {
            "books": len(subset),
            "source_covers": sum(book["asset_kind"] == "source-cover" for book in subset),
            "reference_covers": sum(book["asset_kind"] == "reference-cover" for book in subset),
            "classes": sorted({book["grade"] for book in subset}),
            "subjects": sorted({book["subject"] for book in subset}),
        }
    manifest = {
        "version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "totals": {
            "boards": len(logos),
            "books": len(books),
            "source_covers": sum(book["asset_kind"] == "source-cover" for book in books),
            "reference_covers": sum(book["asset_kind"] == "reference-cover" for book in books),
            "classes": len({(book["board"], book["grade"]) for book in books}),
            "subjects": len({(book["board"], book["grade"], book["subject"]) for book in books}),
            "failed_downloads": len(asset_stats["failed_downloads"]),
        },
        "boards": logos,
        "coverage": by_board,
        "books": books,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lookup = {
        book["id"]: {
            "src": (
                f"{book['asset_path']}?v=20260817-official"
                if book["board"] == "maharashtra-board"
                else book["asset_path"]
            ),
            "alt": f"{book['title']} textbook cover",
            "kind": book["asset_kind"],
        }
        for book in books
    }
    board_lookup = {
        board: {"src": value["asset_path"], "alt": f"{value['name']} official logo"}
        for board, value in logos.items()
    }
    LOOKUP_PATH.write_text(
        "// Generated by scripts/build_catalog_artwork.py.\n"
        f"export const BOOK_ARTWORK = Object.freeze({json.dumps(lookup, ensure_ascii=False, separators=(',', ':'))});\n"
        f"export const BOARD_ARTWORK = Object.freeze({json.dumps(board_lookup, ensure_ascii=False, separators=(',', ':'))});\n",
        encoding="utf-8",
    )
    browser_guard = """// Generated by scripts/build_catalog_artwork.py.
(() => {
  "use strict";
  if (window.__STUDYWUDY_ARTWORK_RUNTIME_ACTIVE__) return;
  window.__STUDYWUDY_ARTWORK_RUNTIME_ACTIVE__ = true;
  const BOARDS = Object.freeze(__BOARD_LOOKUP__);
  const ARTWORK_SELECTOR = ".book-card[data-book-slug], .book-hero, .board-artwork, .catalog-stat-artwork, .catalog-subject-book-covers, [class*='SubjectGrid-module'][class*='__card']";
  const ARTWORK_CONTAINER_SELECTOR = ".catalog-artwork-picture, .board-artwork, .catalog-stat-artwork, .catalog-subject-book-covers, .section-mini-heading, .subject-hero";
  const parts = () => location.pathname.split("/").filter(Boolean);
  const coverPath = (board, grade, slug) => {
    const path = `/catalog-artwork/books/covers/${board}/${grade}/${slug}.webp`;
    return board === "maharashtra-board" ? `${path}?v=20260817-official` : path;
  };
  const coverAlt = (value) => `${String(value || "Textbook")
    .replace(/\\btextbook solutions\\b|\\bsolutions\\b/gi, "")
    .trim()} textbook cover`;

  function setPicture(picture, src, alt, eager) {
    if (!picture || !src) return;
    let image = picture.querySelector("img");
    picture.querySelectorAll("source").forEach((source) => {
      if (source.getAttribute("srcset") !== src) source.setAttribute("srcset", src);
      source.removeAttribute("sizes");
      source.setAttribute("type", "image/webp");
    });
    if (!image) {
      image = document.createElement("img");
      picture.append(image);
    }
    image.alt = alt || image.alt || "Textbook cover";
    image.className = "catalog-real-book-cover";
    image.decoding = "async";
    image.fetchPriority = eager ? "high" : "low";
    image.height = 300;
    image.loading = eager ? "eager" : "lazy";
    if (image.getAttribute("src") !== src) image.src = src;
    image.removeAttribute("srcset");
    image.width = 216;
  }

  function setLogo(image, artwork, size, eager = false) {
    if (!image || !artwork) return;
    const src = artwork.src.replace(/\.(?:png|webp)$/i, "-384.webp");
    image.alt = artwork.alt;
    image.className = "board-official-logo";
    image.decoding = "async";
    image.fetchPriority = eager ? "high" : "low";
    image.loading = eager ? "eager" : "lazy";
    if (image.getAttribute("src") !== src) image.src = src;
    image.removeAttribute("srcset");
    image.width = size;
    image.height = size;
  }

  function setSubjectCoverSet(card, covers) {
    if (!card || !Array.isArray(covers) || !covers.length) return;
    const sources = covers.map((cover) => String(cover.src || "")).filter(Boolean);
    if (!sources.length) return;
    const signature = sources.join("|");
    let coverSet = card.querySelector(":scope > .catalog-subject-book-covers");
    if (coverSet?.dataset.coverSignature === signature) return;
    if (!coverSet) {
      coverSet = document.createElement("span");
      card.prepend(coverSet);
    }
    const layout = sources.length === 1 ? "single" : sources.length <= 4 ? "fan" : "grid";
    coverSet.className = `catalog-subject-book-covers catalog-subject-book-covers-${layout}`;
    coverSet.dataset.coverCount = String(sources.length);
    coverSet.dataset.coverSignature = signature;
    coverSet.setAttribute("aria-hidden", "true");
    coverSet.style.setProperty("--cover-cols", String(layout === "grid" ? Math.ceil(sources.length / 2) : sources.length));
    coverSet.replaceChildren(...sources.map((src) => {
      const image = document.createElement("img");
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      image.decoding = "async";
      image.height = 96;
      image.loading = "lazy";
      image.src = src;
      image.width = 68;
      return image;
    }));
  }

  function applyArtwork() {
    const route = parts();
    const [board, grade, subject, book] = route;
    const pageConfig = window.__STUDYWUDY_ARTWORK_PAGE__ || {};
    const allowed = pageConfig.pathname === location.pathname && Array.isArray(pageConfig.allowedSlugs)
      ? new Set(pageConfig.allowedSlugs)
      : null;

    if (route.length === 2 && pageConfig.pathname === location.pathname && pageConfig.subjectCovers) {
      for (const [subjectSlug, covers] of Object.entries(pageConfig.subjectCovers)) {
        const href = `/${board}/${grade}/${subjectSlug}`;
        setSubjectCoverSet(document.querySelector(`a[class*="SubjectGrid-module"][class*="__card"][href="${CSS.escape(href)}"]`), covers);
      }
    }

    document.querySelectorAll(".book-card[data-book-slug]").forEach((card, index) => {
      const slug = card.getAttribute("data-book-slug");
      if (allowed && !allowed.has(slug)) {
        card.remove();
        return;
      }
      setPicture(
        card.querySelector(".catalog-artwork-picture"),
        coverPath(board, grade, slug),
        coverAlt(card.querySelector("h2, h3")?.textContent),
        index === 0,
      );
    });

    if (route.length === 4) {
      setPicture(
        document.querySelector(".book-hero .catalog-artwork-picture"),
        coverPath(board, grade, book),
        coverAlt(document.querySelector(".book-hero h1")?.textContent),
        true,
      );
    }

    for (const [slug, artwork] of Object.entries(BOARDS)) {
      setLogo(document.querySelector(`.board-card-${slug} .board-artwork img`), artwork, 192);
    }
    if (route.length === 1 && BOARDS[board]) {
      setLogo(document.querySelector(".catalog-stat-artwork img"), BOARDS[board], 180, true);
    }
    if (location.pathname.replace(/\\/+$/, "") === "/boards") {
      document.querySelectorAll(".board-explorer-compact").forEach((element) => element.remove());
    }
    if (allowed) {
      const count = allowed.size;
      const label = String(pageConfig.streamLabel || "Selected");
      const summary = document.querySelector(".catalog-section .section-mini-heading > p");
      const summaryText = `${count} ${count === 1 ? "textbook" : "textbooks"} for ${label}`;
      if (summary && summary.textContent !== summaryText) summary.textContent = summaryText;
      const heading = document.querySelector(".subject-hero h1");
      if (heading && !heading.parentElement?.querySelector(".stream-context")) {
        const context = document.createElement("span");
        context.className = "stream-context";
        context.textContent = `${label} stream`;
        heading.after(context);
      }
    }
  }

  let scheduled = false;
  function scheduleArtwork() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyArtwork();
    });
  }

  function mutationAffectsArtwork(records) {
    return records.some((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest(ARTWORK_CONTAINER_SELECTOR)) return true;
      return [...record.addedNodes].some((node) => node instanceof Element
        && (node.matches(ARTWORK_SELECTOR) || node.querySelector(ARTWORK_SELECTOR)));
    });
  }

  function startArtworkRuntime() {
    const observer = new MutationObserver((records) => {
      if (mutationAffectsArtwork(records)) scheduleArtwork();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    addEventListener("popstate", scheduleArtwork);
    addEventListener("pageshow", scheduleArtwork);
    applyArtwork();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startArtworkRuntime, { once: true });
  } else {
    startArtworkRuntime();
  }
})();
"""
    browser_guard = browser_guard.replace(
        "__BOARD_LOOKUP__",
        json.dumps(board_lookup, ensure_ascii=False, separators=(",", ":")),
    )
    BROWSER_GUARD_PATH.write_text(browser_guard, encoding="utf-8")


def rewrite_static_board_cards(logos: dict) -> None:
    stylesheet = '<link rel="stylesheet" href="/catalog-artwork.css" data-studywudy-catalog-artwork="true"/>'
    targets = [
        ROOT / "comparison/after-assets/index.html",
        ROOT / "comparison/after-assets/pages/boards/index.html",
    ]
    for target in targets:
        if not target.exists():
            continue
        page = target.read_text(encoding="utf-8")
        for board, logo in logos.items():
            page = page.replace(
                f"/images/boards/{board}-v1-card-192.webp",
                logo["asset_path"],
            )
        if "data-studywudy-catalog-artwork" not in page:
            page = page.replace("</head>", f"{stylesheet}</head>", 1)
        target.write_text(page, encoding="utf-8")


def print_plan(matches: list[dict]) -> None:
    kind_counts = Counter(match["asset_kind"] for match in matches)
    board_counts = defaultdict(Counter)
    for match in matches:
        board_counts[match["book"]["board"]][match["asset_kind"]] += 1
    print(f"catalog books: {len(matches)}")
    print(f"planned source covers: {kind_counts['source-cover']}")
    print(f"planned reference covers: {kind_counts['reference-cover']}")
    for board, counts in board_counts.items():
        print(f"  {board}: source={counts['source-cover']} reference={counts['reference-cover']}")
    print("\nLowest-confidence verified mappings:")
    verified = sorted(
        (match for match in matches if match["source_match"] == "verified"),
        key=lambda match: match["score"],
    )
    for match in verified[:35]:
        source = match["source"] or {}
        print(
            f"{match['score']:.3f} Δ{match['margin']:.3f} | "
            f"{match['book']['id']} | {match['book']['title']} => {source.get('text')}"
        )
    print("\nUnmatched/reference samples:")
    for match in [item for item in matches if item["source_match"] == "unmatched"][:45]:
        print(f"  {match['book']['id']} | {match['book']['title']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--crawl", type=Path, default=DEFAULT_CRAWL)
    parser.add_argument("--ebal-catalog", type=Path, default=OFFICIAL_EBAL_CATALOG_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    books = load_books(args.db)
    sources = dedupe_sources(json.loads(args.crawl.read_text(encoding="utf-8")))
    matches = match_books(books, sources)
    apply_maharashtra_official_sources(matches, args.ebal_catalog)
    print_plan(matches)
    if args.dry_run:
        return

    logos = write_board_logos(False)
    asset_stats = write_assets(matches, False)
    write_manifests(matches, logos, asset_stats, False)
    rewrite_static_board_cards(logos)
    print(
        f"\ncompleted: {len(logos)} logos, {asset_stats['downloaded']} downloaded covers, "
        f"{asset_stats['reference']} reference covers"
    )
    print(f"manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
