#!/usr/bin/env python3
"""Publish the October 26 fourth draft and complete funded Stage 4 sequence.

Writes this checkout only. Requires Python Markdown, ReportLab and FFmpeg.
The supplied proxy must retain all 2,472 frames and the original AAC packets.
See README.md for the reproducible two-pass video conversion.
"""

import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import markdown

sys.dont_write_bytecode = True
from hlt_screenplay_export import export_screenplay

ROOT = Path(__file__).resolve().parents[1]
HUB = Path("review/here-lies-trouble-stage-4")
MEDIA = Path("review/media/here-lies-trouble-stage-4-20261026")
SOURCE = Path("outputs/transcription-enrichment/here-lies-trouble/here-lies-trouble.20261026.fourth-draft.txt")
RUN = Path("outputs/here-lies-trouble/stage-4-20261026-option-b-v3")
VIDEO = RUN / "review/here-lies-trouble-stage-4-103s.mp4"
VIDEO_HASH = "e6e4a01909e458c5b477d6c0fdd48e50f03876ec7277d0a572bb314d4d89c629"
PACKET_ID = "here-lies-trouble-stage-4-20261026"
VIDEO_ID = "here-lies-trouble-stage-4-video-20261026"
SCRIPT_ID = "here-lies-trouble-fourth-draft-20261026"
DOCS = [
    ("format-fit", "Format fit", "20261026.here_lies_trouble_format_fit.md", "Animated cultural conversation, audience, format and distribution options."),
    ("production-breakdown", "Production breakdown", "20261026.here_lies_trouble_stage_4_production_breakdown.md", "Complete-draft scope, measured runtime, production allocation and budget."),
    ("production-details", "Production details", "20261026.here_lies_trouble_stage_4_production_details.md", "Current delivery, accepted terrain, gaze findings and the Stage 5 plan."),
]


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ]))


def audio_hash(path):
    return subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-c:a", "copy",
        "-f", "hash", "-hash", "sha256", "-"
    ], text=True).strip()


def shell(title, content):
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{html.escape(title)} — situationshipin.space</title>
<link rel="stylesheet" href="/assets/css/hlt-stage4.css"></head>
<body><main class="hlt-page"><nav class="hlt-nav" aria-label="Review navigation">
<a href="/">Review catalog</a><a href="/{HUB}/">Here Lies Trouble</a>
<a href="/{HUB}/#screenplay">Screenplay</a><a href="/{HUB}/#documents">Production documents</a></nav>
{content}
<footer class="hlt-footer">Here Lies Trouble · Fourth draft and Stage 4 · October 26, 2026<br>
<a href="/{HUB}/">Review overview</a> · <a href="/{MEDIA}/publication.json">Files and source record</a></footer>
</main></body></html>\n'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approve", required=True, choices=["PROJECT-APPROVED"])
    parser.add_argument("--izzi-root", required=True, type=Path)
    parser.add_argument("--video-proxy", required=True, type=Path)
    args = parser.parse_args()
    izzi = args.izzi_root.resolve()
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=izzi, text=True).strip()
    source_video = izzi / VIDEO
    assert digest(source_video) == VIDEO_HASH, "Stage 4 master differs from the reviewed delivery"
    video = probe(args.video_proxy)
    picture = next(s for s in video["streams"] if s["codec_type"] == "video")
    assert (picture["width"], picture["height"], picture["avg_frame_rate"], int(picture["nb_frames"])) == (720, 1280, "24/1", 2472)
    assert float(video["format"]["duration"]) == 103
    assert args.video_proxy.stat().st_size < 16 * 1024 * 1024
    assert audio_hash(source_video) == audio_hash(args.video_proxy), "Audio packets changed"
    (ROOT / MEDIA).mkdir(parents=True, exist_ok=True)
    (ROOT / HUB).mkdir(parents=True, exist_ok=True)
    provenance = export_screenplay(izzi / SOURCE, ROOT / MEDIA)
    public_video = MEDIA / "here-lies-trouble-stage-4-103s.review.mp4"
    shutil.copyfile(args.video_proxy, ROOT / public_video)
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-ss", "12.76", "-i", str(args.video_proxy),
        "-frames:v", "1", "-q:v", "3", str(ROOT / MEDIA / "poster.jpg")
    ], check=True)
    link_map = {
        (izzi / SOURCE).resolve(): "/" + str(MEDIA / SOURCE.name),
        source_video.resolve(): "/" + str(public_video),
        (izzi / RUN / "review/index.html").resolve(): "/" + str(HUB) + "/",
        (izzi / RUN / "providers/seedance/job-001/stage-4-opening-review.mp4").resolve(): "/" + str(public_video) + "#t=0,6",
    }
    for source_name, target_name in [
        ("review/validation.json", "stage-4-validation.json"),
        ("review/gaze-audit/assessment.json", "gaze-assessment.json"),
        ("review/credit-ledger.json", "credit-ledger.json"),
    ]:
        source = izzi / RUN / source_name
        shutil.copyfile(source, ROOT / MEDIA / target_name)
        link_map[source.resolve()] = "/" + str(MEDIA / target_name)
    for slug, title, filename, description in DOCS:
        source = izzi / "docs/development/sessions" / filename
        shutil.copyfile(source, ROOT / MEDIA / filename)
        link_map[source.resolve()] = "/" + str(HUB / f"{slug}.html")

    # Keep supporting tracked references pinned; explicitly label unpublished
    # working files instead of emitting broken /home/... or outputs/... links.
    tracked = set(subprocess.check_output(["git", "ls-files", "-z"], cwd=izzi).decode().split("\x00"))
    local_references = set()
    document_records = []
    for slug, title, filename, description in DOCS:
        source = izzi / "docs/development/sessions" / filename
        rendered = markdown.markdown(source.read_text(), extensions=["extra", "toc", "sane_lists"])
        def rewrite(match):
            url, label = html.unescape(match.group(1)), match.group(2)
            parts = urlsplit(url)
            if parts.scheme or url.startswith(("#", "//")):
                return match.group(0)
            path = (source.parent / unquote(parts.path)).resolve()
            fragment = "#" + parts.fragment if parts.fragment else ""
            if path in link_map:
                target = link_map[path] + fragment
            else:
                relative = str(path.relative_to(izzi))
                if relative in tracked:
                    target = f"https://github.com/bdekoz/izzi/blob/{revision}/{quote(relative)}{fragment}"
                else:
                    local_references.add(relative)
                    return f'<span class="local-reference">{label} <small>(local archive)</small></span>'
            return f'<a href="{html.escape(target, quote=True)}">{label}</a>'
        rendered = re.sub(r'<a href="([^"]+)">(.*?)</a>', rewrite, rendered, flags=re.S)
        rendered = rendered.replace("<table>", '<div class="hlt-table-scroll"><table>').replace("</table>", "</table></div>")
        artifact_id = f"here-lies-trouble-{slug}-20261026"
        body = f'''<header class="hlt-header"><p class="hlt-eyebrow">Here Lies Trouble · Production document</p>
<p><a class="hlt-button" href="/{MEDIA / filename}" download>Download original Markdown</a>
<a class="hlt-button" href="/review/{artifact_id}/#feedback-title">Review this document</a></p>
<p class="hlt-caption">Full document from the current working state. References marked “local archive” remain in the production working files.</p></header>
<article class="hlt-document">{rendered}</article>'''
        public_path = HUB / f"{slug}.html"
        (ROOT / public_path).write_text(shell(f"Here Lies Trouble — {title}", body))
        document_records.append((artifact_id, title, description, public_path, source, filename))

    screenplay_links = " ".join(
        f'<a class="hlt-button{" primary" if suffix == "pdf" else ""}" href="/{MEDIA / (SOURCE.stem + "." + suffix)}"{" download" if suffix != "pdf" else ""}>{label}</a>'
        for suffix, label in [("txt", "Canonical TXT"), ("pdf", "Screenplay PDF"), ("fountain", "Fountain"), ("fdx", "Final Draft FDX")]
    )
    cards = "".join(f'''<article class="hlt-card"><h3><a href="/{HUB / (slug + '.html')}">{title}</a></h3>
<p>{description}</p><a href="/{MEDIA / filename}" download>Download Markdown</a></article>'''
        for slug, title, filename, description in DOCS)
    content = f'''<header class="hlt-header"><p class="hlt-eyebrow">Fourth draft · Stage 4 review · October 26, 2026</p>
<h1>Here Lies Trouble</h1><p class="hlt-lead">Four animal friends walk Runyon Canyon and discuss theater, representation and political memory. An animated cultural conversation.</p></header>
<section class="hlt-player-layout" aria-labelledby="video-title"><div>
<div class="hlt-player"><video id="stage-4-video" controls playsinline preload="metadata" poster="/{MEDIA}/poster.jpg" aria-label="Complete 103-second Stage 4 sequence with four voices and captions">
<source src="/{public_video}" type="video/mp4"><p><a href="/{public_video}">Download the Stage 4 video</a>.</p></video></div>
<p class="hlt-caption">Complete Stage 4 sequence · 1:43 · Sound and captions<br><a href="/{public_video}" download>Download video ({(ROOT / public_video).stat().st_size / 1048576:.1f} MiB)</a></p></div>
<div><h2 id="video-title">Stage 4 — all eight completed shots</h2>
<p>The complete funded sequence covers turns 1–9 of the fourth draft. All 103 seconds are here, with four voices, captions and the approved wildlife.</p>
<div class="hlt-status"><p><strong>Current state:</strong> terrain accepted; reciprocal gaze is unfinished. Speaking mouths and clearer gaze are planned for Stage 5.</p></div>
<p>The full screenplay contains 191 turns. Its synthesized audio runs <strong>52:35.375</strong>; picture beyond this 1:43 sequence has not been produced.</p>
<p><a class="hlt-button primary" href="/review/{VIDEO_ID}/#feedback-title">Review the video</a></p>
<section id="screenplay" aria-labelledby="screenplay-title"><h2 id="screenplay-title">The complete fourth draft</h2>
<p>Canonical source plus three screenplay formats. All 191 turns and their punctuation are preserved; the PDF adds screenplay pagination.</p>
<div class="hlt-downloads">{screenplay_links}</div>
<p class="hlt-filename">{SOURCE.name}</p><p><a href="/review/{SCRIPT_ID}/#feedback-title">Review the screenplay</a></p></section></div></section>
<section id="documents" aria-labelledby="documents-title"><h2 id="documents-title">Production documents</h2><div class="hlt-docs">{cards}</div></section>
<section class="hlt-review-focus" id="review-focus"><h2>What to review</h2>
<p>Look at the terrain, character continuity, voice clarity, captions, shot joins and wildlife. Flag a timecode when something needs attention. The current gaze audit found no clearly readable reciprocal exchanges across the nine planned cues.</p>
<p><a href="/{MEDIA}/gaze-assessment.json">Gaze assessment</a> · <a href="/{MEDIA}/stage-4-validation.json">Technical validation</a> · <a href="/{MEDIA}/credit-ledger.json">Stage 4 credit ledger</a></p>
<p><a class="hlt-button" href="/review/{PACKET_ID}/#feedback-title">Review the whole package</a></p>
<p class="hlt-caption">Reviews stay in your browser until you download them or open an issue draft.</p></section>'''
    (ROOT / HUB / "index.html").write_text(shell("Here Lies Trouble — fourth draft and Stage 4", content))
    now = datetime.now(timezone.utc).isoformat()
    common = dict(family="here-lies-trouble", review_mode="output", feedback_round="stage-4-20261026", generation_commit=revision,
                  generation_state="CURRENT", human_review_state="UNREVIEWED", baseline_state="NOT-PROMOTED", added_at=now)
    def item(artifact_id, title, description, path, source, **fields):
        return dict(common, artifact_id=artifact_id, title=title, description=description, alt=description,
                    source_path=str(source), published_path=str(path), sha256=digest(ROOT / path), bytes=(ROOT / path).stat().st_size, **fields)
    video_item = item(VIDEO_ID, "Here Lies Trouble — complete Stage 4 sequence (1:43)",
        "All eight completed shots with four voices and exact fourth-draft captions. Terrain accepted; reciprocal gaze remains unfinished. The full 52:35 episode picture is not complete.",
        public_video, VIDEO, media_kind="video", generation_class="stage-4-review", review_scope="STAGE-4-COMPLETE-FUNDED-SEQUENCE", review_category="proofs",
        width=720, height=1280, duration_seconds=103, technical_state="FULL-DURATION-PROXY-ORIGINAL-AAC-PRESERVED",
        source_media=dict(path=str(VIDEO), sha256=VIDEO_HASH, bytes=source_video.stat().st_size, width=1080, height=1920, duration_seconds=103, frame_rate="24/1", published=False))
    video_item["review_publication"] = dict(
        decision="APPROVED", scope="EXISTING-ARTIFACT-REVIEW", approved_on="2026-10-27",
        authority="Explicit project-owner request", instruction="put the complete stage 4 video up for viewing",
        artifact_id=VIDEO_ID, source_sha256=VIDEO_HASH, proxy_sha256=video_item["sha256"],
        creative_acceptance=False, further_production_authorized=False)
    script_path = MEDIA / (SOURCE.stem + ".pdf")
    script_item = item(SCRIPT_ID, "Here Lies Trouble — canonical fourth draft", "Complete October 26 screenplay: 191 speaking turns, with the original TXT and PDF, Fountain and Final Draft FDX downloads.",
        script_path, SOURCE, media_kind="plan", generation_class="screenplay-review", review_scope="CANONICAL-FOURTH-DRAFT", review_category="planning", plan_stage="PLAN-DRAFT", format="pdf",
        source_sha256=digest(ROOT / script_path), source_derivation=dict(path=str(SOURCE), sha256=provenance["canonical_sha256"], relation="Canonical fourth draft; formatting only"),
        plan_links=[dict(label=label, path=str(MEDIA / (SOURCE.stem + "." + suffix))) for suffix, label in [("txt", "Canonical source TXT"), ("fountain", "Fountain screenplay"), ("fdx", "Final Draft FDX")]] + [dict(label="Screenplay provenance", path=str(MEDIA / "screenplay-provenance.json"))],
        technical_state="191-TURNS-PRESERVED-FORMAT-ONLY")
    document_items = []
    for artifact_id, title, description, public_path, source, filename in document_records:
        document_items.append(item(artifact_id, "Here Lies Trouble — " + title.lower(), description, public_path, source.relative_to(izzi),
            media_kind="plan", generation_class="production-document-review", review_scope="STAGE-4-PRODUCTION-DOCUMENT", review_category="planning", plan_stage="PLAN-DRAFT", format="html",
            source_sha256=digest(ROOT / public_path), source_derivation=dict(path=str(source.relative_to(izzi)), sha256=digest(source), relation="Full Markdown rendered for web review; original Markdown included"),
            plan_links=[dict(label="Download original Markdown", path=str(MEDIA / filename))], technical_state="FULL-DOCUMENT-RENDERED"))
    members = [video_item, script_item] + document_items
    hub_item = item(PACKET_ID, "Here Lies Trouble — fourth draft and Stage 4 review", "Current review package: the complete 1:43 Stage 4 sequence, canonical fourth draft in four formats, and three production documents.",
        HUB / "index.html", SOURCE, media_kind="index", generation_class="stage-4-review-packet", review_scope="STAGE-4-CURRENT-STATE", review_category="proofs",
        index_members=[x["artifact_id"] for x in members], technical_state="CURRENT-STATE-REVIEW-PACKAGE")
    all_files = sorted(p for folder in (ROOT / MEDIA, ROOT / HUB) for p in folder.rglob("*") if p.is_file() and p.name != "publication.json")
    publication = dict(schema_version="hlt-stage4-publication-1", published_at=now, izzi_commit=revision,
        canonical_source=dict(path=str(SOURCE), sha256=provenance["canonical_sha256"]),
        video=dict(source_path=str(VIDEO), source_sha256=VIDEO_HASH, duration_seconds=103, frames=2472, proxy_path=str(public_video), proxy_sha256=digest(ROOT / public_video), dimensions=[720,1280], audio_packets_preserved=True),
        complete_episode_audio_seconds=3155.375, complete_episode_picture=False,
        local_archive_references=sorted(local_references),
        files=[dict(path=str(p.relative_to(ROOT)), sha256=digest(p), bytes=p.stat().st_size) for p in all_files])
    write_json(ROOT / MEDIA / "publication.json", publication)
    primary = {x["published_path"] for x in [hub_item] + members}
    hub_item["review_assets"] = [dict(path=str(p.relative_to(ROOT)), sha256=digest(p), bytes=p.stat().st_size)
        for p in all_files + [ROOT / MEDIA / "publication.json"] if str(p.relative_to(ROOT)) not in primary]
    for asset in hub_item["review_assets"]:
        if asset["path"] == str(MEDIA / "poster.jpg"):
            asset.update(width=720, height=1280)
    catalog_path = ROOT / "data/review-items.json"
    catalog = json.loads(catalog_path.read_text())
    new_items = [hub_item] + members
    new_ids = {x["artifact_id"] for x in new_items}
    catalog["items"] = new_items + [x for x in catalog["items"] if x["artifact_id"] not in new_ids]
    catalog["generated_at"] = now
    write_json(catalog_path, catalog)
    subprocess.run(["node", "--input-type=module", "-e", '''
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { renderReviewPage, renderReviewManifest } from './scripts/review-page.mjs';
const catalog=JSON.parse(await readFile('data/review-items.json','utf8'));
for(const item of catalog.items.filter(i=>i.feedback_round==='stage-4-20261026')) {
 const dir='review/'+item.artifact_id; await mkdir(dir,{recursive:true});
 await writeFile(dir+'/index.html',renderReviewPage(item));
 await writeFile(dir+'/manifest.json',renderReviewManifest(item));
}
'''], cwd=ROOT, check=True)
    print(json.dumps(dict(review_url="https://situationshipin.space/" + str(HUB) + "/", catalog_entries=len(new_items), screenplay_turns=191, video_seconds=103, proxy_bytes=(ROOT / public_video).stat().st_size, izzi_commit=revision), indent=2))


if __name__ == "__main__":
    main()
