#!/usr/bin/env python3
"""Format the canonical fourth draft without rewriting its dialogue.

Requires ReportLab. The original TXT is copied byte for byte; FDX and
Fountain change layout whitespace only. PDF continuations are layout marks.
"""

import argparse
import hashlib
import json
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

SOURCE_HASH = "889c2fdd91008e7acd998a7ed1ab94c4a0a20e71c5cba06ec37070e47001f4f6"
FONT = Path("/usr/share/fonts/liberation-mono-fonts/LiberationMono-Regular.ttf")


def parse_screenplay(raw):
    title = scene = None
    turns = []
    current = None
    for line in raw.decode("utf-8-sig").splitlines():
        line = line.strip()
        if not line:
            continue
        if re.fullmatch(r"SPEAKER [1-4]", line):
            current = {"speaker": line, "lines": []}
            turns.append(current)
        elif current is not None:
            current["lines"].append(line)
        elif line.startswith("Title: ") and title is None:
            title = line[7:]
        elif line.startswith("EXT. ") and scene is None:
            scene = line
        else:
            raise ValueError(f"Unrecognized screenplay structure: {line!r}")
    assert title and scene and len(turns) == 191
    for turn in turns:
        turn["text"] = " ".join(" ".join(turn.pop("lines")).split())
        assert turn["text"]
    return title, scene, turns


def render_pdf(path, title, scene, turns, font_path):
    pdfmetrics.registerFont(TTFont("ScreenplayMono", str(font_path)))
    font = pdfmetrics.getFont("ScreenplayMono")
    characters = set(title + scene + "".join(t["text"] for t in turns))
    assert all(ord(c) in font.face.charWidths for c in characters), "Font lacks a source character"
    pdf = Canvas(str(path), pagesize=(612, 792), invariant=1, pageCompression=1)
    pdf.setTitle(f"{title} — Fourth draft — October 26, 2026")
    pdf.setSubject("Complete canonical fourth draft; formatting only")
    pdf.setFont("ScreenplayMono", 12)
    pdf.drawCentredString(306, 460, title)
    pdf.drawCentredString(306, 424, "Fourth draft")
    pdf.drawCentredString(306, 400, "October 26, 2026")
    pdf.showPage()
    page = 0
    y = 720

    def new_page():
        nonlocal page, y
        if page:
            pdf.showPage()
        page += 1
        pdf.setFont("ScreenplayMono", 9)
        pdf.drawString(108, 756, title)
        pdf.drawRightString(540, 756, f"{page}.")
        pdf.drawString(108, 36, "FOURTH DRAFT — 26 OCTOBER 2026")
        pdf.setFont("ScreenplayMono", 12)
        y = 720

    def line(text, x):
        nonlocal y
        pdf.drawString(x, y, text)
        y -= 12

    def wrapped(text, width):
        lines = []
        current = ""
        for word in text.split():
            candidate = f"{current} {word}" if current else word
            if pdfmetrics.stringWidth(candidate, "ScreenplayMono", 12) > width and current:
                lines.append(current)
                current = word
            else:
                current = candidate
        if current:
            lines.append(current)
        assert all(pdfmetrics.stringWidth(t, "ScreenplayMono", 12) <= width for t in lines)
        return lines

    new_page()
    for text in wrapped(scene, 432):
        line(text, 108)
    y -= 12
    for turn in turns:
        if y < 108:
            new_page()
        line(turn["speaker"], 266.4)
        pending = wrapped(turn["text"], 252)
        while pending:
            available = int((y - 72) // 12) + 1
            split = len(pending) > available
            take = available - 1 if split else len(pending)
            assert take >= 1
            for text in pending[:take]:
                line(text, 180)
            pending = pending[take:]
            if pending:
                line("(MORE)", 266.4)
                new_page()
                line(turn["speaker"] + " (CONT'D)", 266.4)
        y -= 12
    pdf.save()
    return page + 1


def export_screenplay(source, destination, font_path=FONT):
    raw = source.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == SOURCE_HASH, "Canonical fourth draft changed"
    title, scene, turns = parse_screenplay(raw)
    destination.mkdir(parents=True, exist_ok=True)
    stem = source.stem
    shutil.copyfile(source, destination / source.name)
    fountain = f"Title: {title}\n\n{scene}\n" + "".join(
        f"\n{t['speaker']}\n{t['text']}\n" for t in turns
    )
    (destination / f"{stem}.fountain").write_text(fountain)
    assert parse_screenplay(fountain.encode())[2] == turns
    root = ET.Element("FinalDraft", DocumentType="Script", Template="No", Version="1")
    ET.SubElement(root, "Title").text = title
    content = ET.SubElement(root, "Content")
    def paragraph(kind, text):
        node = ET.SubElement(content, "Paragraph", Type=kind)
        ET.SubElement(node, "Text").text = text
    paragraph("Scene Heading", scene)
    for turn in turns:
        paragraph("Character", turn["speaker"])
        paragraph("Dialogue", turn["text"])
    ET.indent(root, space="  ")
    fdx = destination / f"{stem}.fdx"
    fdx.write_bytes(ET.tostring(root, encoding="utf-8", xml_declaration=True) + b"\n")
    parsed = ET.parse(fdx).findall("./Content/Paragraph")
    assert [p.findtext("Text") for p in parsed if p.get("Type") == "Dialogue"] == [t["text"] for t in turns]
    assert [p.findtext("Text") for p in parsed if p.get("Type") == "Character"] == [t["speaker"] for t in turns]
    pages = render_pdf(destination / f"{stem}.pdf", title, scene, turns, font_path)
    provenance = {
        "schema_version": "hlt-fourth-draft-screenplay-1",
        "canonical_filename": source.name,
        "canonical_sha256": SOURCE_HASH,
        "source_bytes_preserved": True,
        "title": title, "scene_heading": scene, "turns": len(turns),
        "speakers": sorted(set(t["speaker"] for t in turns)),
        "pdf_pages_including_title": pages,
        "formatting": "FDX and Fountain preserve all dialogue and punctuation, collapsing layout whitespace only. PDF adds a title page, pagination and MORE/CONT'D continuation markers; no dialogue edits.",
        "fdx_format": "Final Draft XML script subset; XML and all dialogue round-tripped. Final Draft desktop application not used for validation.",
        "exports": {
            suffix: {"sha256": hashlib.sha256((destination / f"{stem}.{suffix}").read_bytes()).hexdigest(), "bytes": (destination / f"{stem}.{suffix}").stat().st_size}
            for suffix in ("txt", "pdf", "fountain", "fdx")
        },
    }
    (destination / "screenplay-provenance.json").write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n")
    return provenance


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--font", type=Path, default=FONT)
    args = parser.parse_args()
    print(json.dumps(export_screenplay(args.source, args.destination, args.font), indent=2))
