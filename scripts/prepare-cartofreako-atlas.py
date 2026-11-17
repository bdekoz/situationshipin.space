#!/usr/bin/env python3
"""Prepare the completed atlas-optional World/Japan sheets for a new review round."""

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

from PIL import Image


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def checked_path(root, relative):
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("Unsafe source path: " + relative)
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError("Source escapes its delivery: " + relative)
    return resolved


def verified_json(path, expected=None):
    if expected and digest(path) != expected:
        raise ValueError("Source hash differs: " + str(path))
    return json.loads(path.read_text())


def topic_identity(group, record):
    match = re.fullmatch(r"(.*?)(?:maps|legends)/(world|japan|india)/svg/[^/]+\.svg", record["svg"])
    if not match or match[2] != record["scope"]:
        raise ValueError("Unexpected sheet layout: " + record["svg"])
    variant = match[1].strip("/")
    stem = record["stem"]
    if variant:
        stem += "--" + re.sub(r"[^a-z0-9-]+", "-", variant.lower()).strip("-")
    if not re.fullmatch(r"[a-z0-9-]+", stem):
        raise ValueError("Invalid subject identity")
    return stem, variant


def validate_sheets(sheets):
    subjects = defaultdict(set)
    for sheet in sheets:
        if sheet["scope"] not in ("world", "japan") or sheet["kind"] not in ("map", "legend"):
            raise ValueError("Unsupported review scope or sheet kind")
        key = (sheet["scope"], sheet["kind"])
        if key in subjects[sheet["stem"]]:
            raise ValueError("Duplicate sheet: " + sheet["stem"])
        subjects[sheet["stem"]].add(key)
    for stem, members in subjects.items():
        for scope in {scope for scope, _ in members}:
            if (scope, "map") not in members or (scope, "legend") not in members:
                raise ValueError("Missing map/legend companion: " + stem + "/" + scope)
        if ("world", "map") not in members:
            raise ValueError("Missing World sheet: " + stem)
    return subjects


def load_current(root):
    pointer = verified_json(root / ".cartofreako/data/build-current.json")
    base = Path(pointer["output"]).resolve()
    receipt_path = Path(pointer["receipt"]).resolve()
    if not base.is_relative_to(root) or not receipt_path.is_relative_to(base):
        raise ValueError("Build pointer escapes Cartofreako")
    receipt = verified_json(receipt_path, pointer["sha256"])
    if (receipt.get("schema") != "cartofreako-full-build-v1" or receipt.get("status") != "passed"
            or receipt.get("build_id") != pointer["build_id"]
            or receipt.get("dataset_id") != pointer["dataset_id"]):
        raise ValueError("The selected build is not a completed matching delivery")
    delivery_relative = str(Path(pointer["output"]).relative_to(root))
    files = {entry["path"]: entry["sha256"] for entry in receipt["files"]}

    def read_record(relative):
        if relative not in files:
            raise ValueError("Unrecorded build input: " + relative)
        return verified_json(checked_path(base, relative), files[relative])

    evidence = []
    for group, record in receipt["validation"].items():
        path = checked_path(base, record["path"])
        report = verified_json(path, record["sha256"])
        if report.get("status") != "passed" or report.get("data_only"):
            raise ValueError("Incomplete render validation: " + group)
        evidence.append((group + "-validation.json", path))

    configuration = {}
    for name in ("config/atlas-plates.json", "generation-style.json"):
        expected = receipt["implementation"]["files"].get(name)
        if not expected:
            raise ValueError("Build has no style/catalog fingerprint: " + name)
        configuration[name] = verified_json(root / name, expected)
        evidence.append((Path(name).name, root / name))
    catalog = {plate["id"]: plate for plate in configuration["config/atlas-plates.json"]["plates"]}
    groups = [("atlas", "atlas", read_record("atlas/sources/separate-sheets.json"))]
    for group in ("ocean", "climate"):
        prefix = "anthropocene-optional/" + group
        groups.append((group, prefix, read_record(prefix + "/preview-manifest.json")))

    sheets, subjects = [], {}
    for group, prefix, manifest in groups:
        for record in manifest["records"]:
            if record["scope"] not in ("world", "japan"):
                continue
            stem, variant = topic_identity(group, record)
            if group == "atlas":
                plate = catalog[record["stem"]]
                title, note = plate["title"], "Default atlas / " + plate["group"]
                product = None
            else:
                candidates = [p for p in manifest["products"] if p["stem"] == record["stem"]]
                if group == "ocean":
                    candidates = [p for p in candidates if p["mode"] == record["mode"] and p["period"] == record["period"]]
                else:
                    suffix = "/".join(Path(variant).parts[1:])
                    candidates = [p for p in candidates if p["variant"] == suffix]
                if len(candidates) != 1:
                    raise ValueError("Ambiguous optional variant: " + record["svg"])
                product = candidates[0]
                title = product["title"]
                detail = [record.get(k) for k in ("period", "metric", "mode", "monitor_class") if record.get(k)]
                note = "Optional " + group + " / " + " / ".join(detail)
                through = product.get("metadata", {}).get("data_through")
                if through:
                    note += " / source through " + through
            if stem not in subjects:
                subjects[stem] = {"ordinal": len(subjects) + 1, "stem": stem, "title": title,
                                  "note": note, "group": group, "variant": variant, "scopes": []}
            subject = subjects[stem]
            if record["scope"] not in subject["scopes"]:
                subject["scopes"].append(record["scope"])
            svg_relative = prefix + "/" + record["svg"]
            if files.get(svg_relative) != record["svg_sha256"]:
                raise ValueError("SVG identity differs from build receipt: " + svg_relative)
            svg_path = checked_path(base, svg_relative)
            if digest(svg_path) != record["svg_sha256"]:
                raise ValueError("SVG source changed: " + svg_relative)
            if group == "atlas":
                relative = svg_relative.replace("/svg/", "/png/").removesuffix(".svg") + ".png"
                source_format = "png"
            else:
                relative = prefix + "/" + record["pdf"]
                source_format = "pdf"
                if files.get(relative) != record["pdf_sha256"]:
                    raise ValueError("PDF identity differs from build receipt: " + relative)
            if relative not in files:
                raise ValueError("Unverified source raster: " + relative)
            source = checked_path(base, relative)
            if digest(source) != files[relative]:
                raise ValueError("Source bytes changed: " + relative)
            name = stem + ("-legend" if record["kind"] == "legend" else "")
            sheets.append({**subject, "scope": record["scope"], "kind": record["kind"],
                           "source": str(source), "source_path": delivery_relative + "/" + relative,
                           "source_sha256": files[relative], "source_bytes": source.stat().st_size,
                           "source_format": source_format, "source_svg_path": delivery_relative + "/" + svg_relative,
                           "source_svg_sha256": record["svg_sha256"],
                           "file": record["scope"] + "/" + name + ".webp"})
    validate_sheets(sheets)
    evidence.append(("full-build.json", receipt_path))
    return pointer, receipt, list(subjects.values()), sheets, evidence


def render_sheet(sheet, output, maximum_edge, renderer):
    full = output / sheet["file"]
    thumbnail = full.with_name(full.stem + ".thumb.webp")
    result_path = full.with_suffix(".render.json")
    identity = {"source_sha256": sheet["source_sha256"], "maximum_edge": maximum_edge,
                "thumbnail_edge": 960, "pillow": Image.__version__, "encoding": "lossless-webp-method-4",
                "renderer": renderer}
    if result_path.exists():
        saved = verified_json(result_path)
        if (saved.get("render_identity") == identity and full.exists() and thumbnail.exists()
                and digest(full) == saved["sha256"] and digest(thumbnail) == saved["thumbnail"]["sha256"]):
            print("Cached " + sheet["scope"] + "/" + full.stem, flush=True)
            return {**sheet, **saved}
    full.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="atlas-sheet-", dir=output / "tmp/pdfs") as work:
        source = Path(sheet["source"])
        if sheet["source_format"] == "pdf":
            prefix = Path(work) / "page"
            subprocess.run(["pdftoppm", "-f", "1", "-singlefile", "-scale-to", str(maximum_edge),
                            "-png", str(source), str(prefix)], check=True, stdout=subprocess.DEVNULL)
            source = prefix.with_suffix(".png")
        with Image.open(source) as image:
            original_size = list(image.size)
            if image.mode == "RGBA":
                background = Image.new("RGBA", image.size, "white")
                background.alpha_composite(image)
                image = background.convert("RGB")
            else:
                image = image.convert("RGB")
            image.thumbnail((maximum_edge, maximum_edge), Image.Resampling.LANCZOS)
            dimensions = list(image.size)
            image.save(full, format="WEBP", lossless=True, method=4)
            image.thumbnail((960, 960), Image.Resampling.LANCZOS)
            thumbnail_dimensions = list(image.size)
            image.save(thumbnail, format="WEBP", lossless=True, method=4)
    result = {"render_identity": identity, "source_dimensions": original_size,
              "sha256": digest(full), "bytes": full.stat().st_size, "dimensions": dimensions,
              "thumbnail": {"file": str(thumbnail.relative_to(output)), "sha256": digest(thumbnail),
                            "bytes": thumbnail.stat().st_size, "dimensions": thumbnail_dimensions}}
    result_path.write_text(json.dumps(result, indent=2) + "\n")
    print("Rendered " + sheet["scope"] + "/" + full.stem + " / " + str(result["bytes"]) + " bytes", flush=True)
    return {**sheet, **result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cartofreako-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--max-edge", type=int, default=3840)
    args = parser.parse_args()
    if not 1 <= args.jobs <= 4 or not 960 <= args.max_edge <= 3840:
        parser.error("Use 1-4 jobs and a longest edge between 960 and 3840 pixels")
    root, output = args.cartofreako_root.resolve(), args.output.resolve()
    pointer, receipt, subjects, sheets, evidence = load_current(root)
    output.mkdir(parents=True, exist_ok=True)
    (output / "tmp/pdfs").mkdir(parents=True, exist_ok=True)
    print("Verified " + str(len(sheets)) + " source sheets; rendering " + str(len(subjects)) + " subjects", flush=True)
    renderer = {"script_sha256": digest(Path(__file__)),
                "poppler": subprocess.check_output(["pdftoppm", "-v"], stderr=subprocess.STDOUT, text=True).splitlines()[0]}
    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        rendered = list(executor.map(lambda sheet: render_sheet(sheet, output, args.max_edge, renderer), sheets))
    for sheet in rendered:
        sheet.pop("source")
        sheet.pop("render_identity")
    sources = []
    for name, source in evidence:
        target = output / "sources" / name
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(source.read_bytes())
        sources.append({"file": str(target.relative_to(output)), "sha256": digest(target), "bytes": target.stat().st_size})
    commit = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    counts = Counter(sheet["kind"] for sheet in rendered)
    packet = {"schema_version": "cartofreako-atlas-review-2", "source_repository": "bdekoz/cartofreako",
              "source_commit": commit, "source_delivery": str(Path(pointer["output"]).relative_to(root)),
              "source_delivery_manifest_sha256": pointer["sha256"],
              "source_build_id": pointer["build_id"], "source_dataset_id": pointer["dataset_id"],
              "source_build_revision": receipt["implementation"]["revision"],
              "source_build_dirty": receipt["implementation"]["dirty"],
              "source_completed_at": receipt["completed_at"], "review_date": "2026-11-17",
              "request_issue": "https://github.com/bdekoz/situationshipin.space/issues/83",
              "publication_instruction": "revise this and all japan and world plates to current atlas-optional styles and plates",
              "subject_count": len(subjects), "map_count": counts["map"], "legend_count": counts["legend"],
              "world_count": sum(s["scope"] == "world" and s["kind"] == "map" for s in rendered),
              "japan_count": sum(s["scope"] == "japan" and s["kind"] == "map" for s in rendered),
              "review_image_encoding": "Up to 3840 pixels; lossless WebP from verified atlas PNGs and Poppler-rendered optional PDFs",
              "renderer": renderer, "subjects": subjects, "plates": rendered, "source_records": sources}
    (output / "plates.json").write_text(json.dumps(packet, indent=2) + "\n")
    total = sum(sheet["bytes"] + sheet["thumbnail"]["bytes"] for sheet in rendered)
    print("Complete: " + str(len(rendered)) + " sheets / " + str(round(total / 1024**2, 2)) + " MiB", flush=True)


if __name__ == "__main__":
    main()
