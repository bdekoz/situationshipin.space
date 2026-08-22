#!/usr/bin/env node
// Publish the regenerated izzi color palette family as an aggregated review
// index on situationshipin.space (palette-20260822-index), with one
// individual palette page per palette object behind the palette_kind
// selection tag in src/izzi-svg-color-palette.h. The superseded
// palette-20260814 family is marked STALE and stays in the catalog so its
// pages and media remain referenced; the proofs-for-inspection surface hides
// STALE proofs.
//
// Usage:
//   node scripts/publish-palette-20260822-index.mjs \
//     --izzi-commit <40-hex> \
//     --review-dir <izzi outputs/review/feedback/visual/color/round-01> \
//     [--dry-run]

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const runFile = promisify(execFile);

const FAMILY = "palette-20260822";
const ARTIFACT_ID = "palette-20260822-index";
const MEDIA_DIR = "review/media/color";
const SUPERSEDED_FAMILY = "palette-20260814";

const MEMBERS = [
  // One page per palette object behind palette_kind.
  { name: "palette-izzi", primary: "palette-izzi.svg", title: "Color palette — izzi (full)", description: "The full default izzi palette: black-white-gray ramp, WCAG grays, curated accent colors, and named traditional colors (234 swatches).", alt: "Full izzi palette swatch grid." },
  { name: "palette-izzi-hue", primary: "palette-izzi-hue.svg", title: "Color palette — izzi hue", description: "The hue-only izzi palette with black, white, and gray removed (213 swatches).", alt: "Hue-only izzi palette swatch grid." },
  { name: "palette-jp", primary: "palette-jp.svg", title: "Color palette — Japanese (117)", description: "Traditional colors of Japan, unsorted palette (117 swatches).", alt: "117-swatch Japanese palette grid." },
  { name: "palette-colorbrewer2s3s", primary: "palette-colorbrewer2s3s.svg", title: "Color palette — ColorBrewer 2.0 3-class", description: "Six single-hue 3-class sequential ColorBrewer 2.0 ramps (18 swatches).", alt: "ColorBrewer 2.0 3-class palette grids." },
  { name: "palette-colorbrewer2s7s", primary: "palette-colorbrewer2s7s.svg", title: "Color palette — ColorBrewer 2.0 7-class", description: "Six single-hue 7-class sequential ColorBrewer 2.0 ramps (42 swatches).", alt: "ColorBrewer 2.0 7-class palette grids." },
  { name: "palette-colorbrewer2s9s", primary: "palette-colorbrewer2s9s.svg", title: "Color palette — ColorBrewer 2.0 9-class", description: "Six single-hue 9-class sequential ColorBrewer 2.0 ramps (54 swatches).", alt: "ColorBrewer 2.0 9-class palette grids." },
  { name: "palette-ciecam02", primary: "palette-ciecam02.svg", title: "Color palette — CIECAM02 (72)", description: "CIECAM02 category-constrained color set (72 swatches).", alt: "72-swatch CIECAM02 palette grid." },
  { name: "palette-ciecam16", primary: "palette-ciecam16.svg", title: "Color palette — CIECAM16 (60)", description: "CIECAM16 palette (60 swatches).", alt: "60-swatch CIECAM16 palette grid." },
  { name: "palette-ciecam16j70", primary: "palette-ciecam16j70.svg", title: "Color palette — CIECAM16 J=70 (88)", description: "CIECAM16 palette at fixed lightness J=70 (88 swatches).", alt: "88-swatch CIECAM16 J=70 palette grid." },
  { name: "palette-esri-s-bathymetry", primary: "palette-esri-s-bathymetry.svg", title: "Color palette — ESRI shallow bathymetry (7)", description: "ESRI shallow-water bathymetry ramp (7 swatches).", alt: "7-swatch ESRI shallow bathymetry grid." },
  { name: "palette-esri-m-bathymetry", primary: "palette-esri-m-bathymetry.svg", title: "Color palette — ESRI mid bathymetry (11)", description: "ESRI mid-water bathymetry ramp (11 swatches).", alt: "11-swatch ESRI mid bathymetry grid." },
  // Carried-forward parameter-space exercises, refreshed at the same commit.
  { name: "color-band-expand-to-larger", primary: "color-band-expand-to-larger-p.svg", title: "Color band — expand to larger (100)", description: "Three 100-swatch band sweeps (orange/purple/red) in the RGB model, deterministic seeded generation (M0-DETERMINISM-001 closed).", alt: "Three 100-swatch color band sweeps." },
  { name: "color-tint-perceptual-1", primary: "color-tint-perceptual-1.svg", title: "Color tint — perceptual 1 (35)", description: "35-swatch perceptual tint exercise (ciecam16j70-derived interpolation).", alt: "35-swatch perceptual tint grid." },
  { name: "color-tint-perceptual-2", primary: "color-tint-perceptual-2.svg", title: "Color tint — perceptual 2 (84)", description: "84-swatch perceptual tint exercise from the izzi color family.", alt: "84-swatch perceptual tint grid." },
  { name: "color-rgb-hsv-2", primary: "color-rgb-hsv-2.svg", title: "RGB↔HSV grid 2 (42)", description: "42-swatch RGB↔HSV quantization grid from the izzi color family.", alt: "42-swatch RGB to HSV grid." },
  { name: "color-rgb-hsv-3", primary: "color-rgb-hsv-3.svg", title: "RGB↔HSV grid 3 (266)", description: "266-swatch RGB↔HSV quantization grid from the izzi color family.", alt: "266-swatch RGB to HSV grid." },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function argumentsMap(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) values[key] = true;
    else { values[key] = next; index += 1; }
  }
  return values;
}

function pngDimensions(bytes) {
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function renderIndexHtml({ title, description, members, commit, indexDir }) {
  const escape = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rows = members
    .map((member) => {
      const id = member.artifact_id;
      const thumbSrc = relative(indexDir, member.mediaPath).split(sep).join("/");
      return [
        `<li class="pass">`,
        `<a class="thumb" href="../../${id}/"><img src="${thumbSrc}" alt="" loading="lazy" decoding="async"></a>`,
        `<div class="pass-body">`,
        `<h3><a href="../../${id}/">${escape(member.title)}</a></h3>`,
        `<p>${escape(member.description)}</p>`,
        `<p class="meta">${escape(id)}</p>`,
        `</div>`,
        `</li>`,
      ].join("\n");
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="description" content="${escape(description)}">
    <title>${escape(title)} — situationshipin.space</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#fcfbf7;color:#14171a;line-height:1.45}
      main{max-width:72rem;margin:auto;padding:2rem 1rem 5rem}
      h1{font-size:1.6rem;margin:0 0 .4rem}
      .sub{color:#4d565d;margin:0 0 1.5rem}
      ul.passes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem}
      li.pass{display:grid;grid-template-columns:6rem minmax(0,1fr);gap:.8rem;align-items:start;background:#f5f6f4;border:1px solid #9da8af;padding:.8rem}
      .thumb img{display:block;width:6rem;height:auto;border:1px solid #9da8af}
      li.pass h3{margin:0 0 .25rem;font-size:1rem}
      li.pass p{margin:0 0 .25rem;color:#4d565d;font-size:.85rem}
      .meta{font-family:ui-monospace,monospace;font-size:.72rem;overflow-wrap:anywhere}
      a{color:#173a55}
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">← Review catalog</a></p>
      <h1>${escape(title)}</h1>
      <p class="sub">${escape(description)}</p>
      <p class="sub">Izzi generation commit: <code>${escape(commit)}</code> · ${members.length} passes</p>
      <ul class="passes">
${rows}
      </ul>
    </main>
  </body>
</html>
`;
}

async function main() {
  const values = argumentsMap(process.argv.slice(2));
  const izziCommit = values["izzi-commit"];
  const reviewDir = values["review-dir"] ? resolve(values["review-dir"]) : null;
  const dryRun = Boolean(values["dry-run"]);
  if (!izziCommit || !/^[0-9a-f]{40}$/.test(izziCommit) || !reviewDir) {
    console.error("usage: node scripts/publish-palette-20260822-index.mjs --izzi-commit <40-hex> --review-dir <dir> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const memberIds = new Set(MEMBERS.map((spec) => spec.name));

  // Mark the superseded 20260814 family STALE. No human review decision
  // exists for it, so its human_review_state is left untouched.
  let staleCount = 0;
  for (const item of catalog.items) {
    if (item.family === SUPERSEDED_FAMILY) {
      item.generation_state = "STALE";
      staleCount += 1;
    }
  }

  const members = [];
  for (const spec of MEMBERS) {
    const sourceName = spec.name.startsWith("color-")
      ? spec.name.slice("color-".length)
      : spec.name;
    const svgPath = join(reviewDir, sourceName, spec.primary);
    const mediaPath = `${MEDIA_DIR}/${spec.name}.png`;
    const mediaAbs = join(repositoryRoot, mediaPath);
    if (dryRun) {
      members.push({ artifact_id: spec.name, title: spec.title, description: spec.description, mediaPath, svgPath });
      continue;
    }
    await mkdir(dirname(mediaAbs), { recursive: true });
    await runFile("inkscape", [
      "--export-type=png",
      `--export-filename=${mediaAbs}`,
      "--export-width=1080",
      svgPath,
    ]);
    const pngBytes = await readFile(mediaAbs);
    const { width, height } = pngDimensions(pngBytes);
    const sha = sha256(pngBytes);
    const item = {
      artifact_id: spec.name,
      title: spec.title,
      description: spec.description,
      alt: spec.alt,
      family: FAMILY,
      generation_class: "palette",
      feedback_round: FAMILY,
      media_kind: "image",
      review_scope: "PALETTE-20260822",
      review_mode: "output",
      source_path: `izzi ${izziCommit} outputs/review/feedback/visual/color/round-01/${sourceName}/${spec.primary}`,
      published_path: mediaPath,
      sha256: sha,
      bytes: pngBytes.length,
      width,
      height,
      format: "png",
      technical_state: "VERIFIED",
      human_review_state: "UNREVIEWED",
      baseline_state: "NOT-PROMOTED",
      review_category: "proofs",
      style: "house-style",
      added_at: new Date().toISOString(),
    };
    members.push({ artifact_id: item.artifact_id, title: item.title, description: item.description, mediaPath, item });
    const pageDir = join(repositoryRoot, "review", item.artifact_id);
    await mkdir(pageDir, { recursive: true });
    await writeFile(join(pageDir, "index.html"), renderReviewPage(item));
    await writeFile(join(pageDir, "manifest.json"), renderReviewManifest(item));
  }

  const title = "Color Palette Family 20260822";
  const description =
    "Regenerated 2026-08-22 izzi color palette family: one individual page per palette object behind the palette_kind selection tag in src/izzi-svg-color-palette.h (izzi, izzi hue, Japanese, ColorBrewer 3/7/9-class, CIECAM02, CIECAM16, CIECAM16 J=70, ESRI shallow/mid bathymetry) plus the band, tint, and RGB↔HSV parameter-space exercises. Prior round: palette-20260814-index (STALE).";
  const indexHtml = renderIndexHtml({
    title, description, members, commit: izziCommit,
    indexDir: join("review", "media", FAMILY),
  });
  const indexPath = join(repositoryRoot, "review/media", FAMILY, `${ARTIFACT_ID}.index.html`);
  if (!dryRun) {
    await mkdir(dirname(indexPath), { recursive: true });
    await writeFile(indexPath, indexHtml);
  }
  const indexBytes = Buffer.from(indexHtml, "utf8");
  const indexSha = sha256(indexBytes);

  const entry = {
    artifact_id: ARTIFACT_ID,
    title,
    description,
    alt: "Index of the 16 regenerated izzi color palette review artifacts from 2026-08-22.",
    family: FAMILY,
    generation_class: "palette-index",
    feedback_round: FAMILY,
    media_kind: "index",
    review_scope: "PALETTE-20260822",
    review_mode: "output",
    source_path: `izzi ${izziCommit} outputs/review/feedback/visual/color/round-01 (palette family aggregate)`,
    published_path: `review/media/${FAMILY}/${ARTIFACT_ID}.index.html`,
    sha256: indexSha,
    bytes: indexBytes.length,
    format: "html",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    index_members: members.map((member) => member.artifact_id),
    technical_state: "PALETTE-20260822-INDEX",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "proofs",
    added_at: new Date().toISOString(),
  };

  if (!dryRun) {
    const entryPageDir = join(repositoryRoot, "review", ARTIFACT_ID);
    await mkdir(entryPageDir, { recursive: true });
    await writeFile(join(entryPageDir, "index.html"), renderReviewPage(entry));
    await writeFile(join(entryPageDir, "manifest.json"), renderReviewManifest(entry));

    // Drop the previous entries for the carried-forward members (they move
    // from the STALE family into this family) and any prior copy of the
    // index entry, then add the fresh entries.
    catalog.items = catalog.items.filter((item) =>
      item.artifact_id !== ARTIFACT_ID && !memberIds.has(item.artifact_id));
    catalog.items.push(entry);
    for (const member of members) {
      if (member.item) catalog.items.push(member.item);
    }
    catalog.items.sort((left, right) =>
      String(right.added_at || "").localeCompare(String(left.added_at || "")));
    catalog.generated_at = new Date().toISOString();
    catalog.source_commit = izziCommit;
    await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  }

  console.log(JSON.stringify({
    status: dryRun ? "DRY-RUN" : "PUBLISHED",
    artifact_id: ARTIFACT_ID,
    izzi_commit: izziCommit,
    member_count: members.length,
    stale_family_marked: SUPERSEDED_FAMILY,
    stale_items_marked: staleCount,
    index_sha256: indexSha,
    index_bytes: indexBytes.length,
    members: members.map((member) => member.artifact_id),
  }, null, 2));
}

await main();
