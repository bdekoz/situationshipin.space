#!/usr/bin/env node
// Publish the izzi color palette family as an aggregated review index on
// situationshipin.space (palette-20260814-index).
//
// Renders fresh PNG previews from the izzi color-review SVGs, writes one
// review page per member, builds the group index, and registers the catalog
// entry. Modeled on publish-make-check-generation.mjs.
//
// Usage:
//   node scripts/publish-palette-index.mjs \
//     --izzi-commit <40-hex> \
//     --review-dir <izzi outputs/review/feedback/visual/color/round-01> \
//     [--dry-run]

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const runFile = promisify(execFile);

const FAMILY = "palette-20260814";
const ARTIFACT_ID = "palette-20260814-index";
const MEDIA_DIR = "review/media/color";

const MEMBERS = [
  { name: "color-palette-1", primary: "color-palette-1.svg", title: "Color palette 1 — black/white basics", description: "Two-swatch baseline (color::black, color::white) from the izzi color family.", alt: "Two-swatch black and white palette grid." },
  { name: "color-palette-2", primary: "color-palette-2.svg", title: "Color palette 2 — 19-swatch grid", description: "19-swatch palette grid with RGB labels from the izzi color family.", alt: "19-swatch palette grid with RGB labels." },
  { name: "color-palette-3", primary: "color-palette-3.svg", title: "Color palette 3 — green band walk", description: "21-swatch green band walk rendered through color_cursor from the izzi color family.", alt: "21-swatch green palette grid." },
  { name: "color-palette-4", primary: "color-palette-4.svg", title: "Color palette 4 — WCAG gray trio", description: "Three-swatch WCAG gray ramp (lgray/gray/dgray) from the izzi color family.", alt: "Three-swatch WCAG gray palette grid." },
  { name: "color-palette-5", primary: "color-palette-5.svg", title: "Color palette 5 — active spectrum", description: "133-swatch active-spectrum grid from the izzi color family.", alt: "133-swatch active-spectrum palette grid." },
  { name: "color-palette-source-ciecam02", primary: "color-palette-source-ciecam02.svg", title: "Color palette — CIECAM02 (73)", description: "CIECAM02-UCS 73-swatch palette plus hue-sorted variant from the izzi color family.", alt: "73-swatch CIECAM02 palette grid." },
  { name: "color-palette-source-ciecam16j70", primary: "color-palette-source-ciecam16j70.svg", title: "Color palette — CIECAM16 J=70 (89)", description: "CIECAM16-UCS 89-swatch palette at fixed lightness J=70 plus sorted variant.", alt: "89-swatch CIECAM16 palette grid." },
  { name: "color-palette-source-colorbrewer2", primary: "color-palette-source-colorbrewer2-3.svg", title: "Color palette — ColorBrewer 2.0", description: "ColorBrewer 2.0 3-class and 9-class sequential grids from the izzi color family.", alt: "ColorBrewer 2.0 3- and 9-class palette grids." },
  { name: "color-palette-source-izzi", primary: "color-palette-source-izzi-1.svg", title: "Color palette — izzi full (154)", description: "Full 154-swatch izzi palette, unsorted and hue-sorted variants.", alt: "154-swatch izzi palette grid." },
  { name: "color-palette-source-jp", primary: "color-palette-source-jp.svg", title: "Color palette — Japanese (118)", description: "118-swatch Japanese palette, unsorted and sorted variants from the izzi color family.", alt: "118-swatch Japanese palette grid." },
  { name: "color-tint-perceptual-1", primary: "color-tint-perceptual-1.svg", title: "Color tint — perceptual 1 (35)", description: "35-swatch perceptual tint exercise (ciecam16j70-derived interpolation).", alt: "35-swatch perceptual tint grid." },
  { name: "color-tint-perceptual-2", primary: "color-tint-perceptual-2.svg", title: "Color tint — perceptual 2 (84)", description: "84-swatch perceptual tint exercise from the izzi color family.", alt: "84-swatch perceptual tint grid." },
  { name: "color-rgb-hsv-2", primary: "color-rgb-hsv-2.svg", title: "RGB↔HSV grid 2 (42)", description: "42-swatch RGB↔HSV quantization grid from the izzi color family.", alt: "42-swatch RGB to HSV grid." },
  { name: "color-rgb-hsv-3", primary: "color-rgb-hsv-3.svg", title: "RGB↔HSV grid 3 (266)", description: "266-swatch RGB↔HSV quantization grid from the izzi color family.", alt: "266-swatch RGB to HSV grid." },
  { name: "color-band-expand-to-larger", primary: "color-band-expand-to-larger-p.svg", title: "Color band — expand to larger (100)", description: "Three 100-swatch band sweeps (orange/purple/red) in the RGB model, deterministic seeded generation (M0-DETERMINISM-001 closed).", alt: "Three 100-swatch color band sweeps." },
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
    console.error("usage: node scripts/publish-palette-index.mjs --izzi-commit <40-hex> --review-dir <dir> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
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
      review_scope: "PALETTE-20260814",
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

  const title = "Color Palette Family 20260814";
  const description =
    "One aggregated entry for the 2026-08-14 izzi color palette family: 15 deterministic swatch-grid artifacts (basic palettes, source palettes, perceptual tints, RGB\u2194HSV grids, band sweeps). Open the index to reach each individual review page.";
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
    alt: "Index of the 15 deterministic izzi color palette review artifacts from 2026-08-14.",
    family: FAMILY,
    generation_class: "palette-index",
    feedback_round: FAMILY,
    media_kind: "index",
    review_scope: "PALETTE-20260814",
    review_mode: "output",
    source_path: `izzi ${izziCommit} outputs/review/feedback/visual/color/round-01 (palette family aggregate)`,
    published_path: `review/media/${FAMILY}/${ARTIFACT_ID}.index.html`,
    sha256: indexSha,
    bytes: indexBytes.length,
    format: "html",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    index_members: members.map((member) => member.artifact_id),
    technical_state: "PALETTE-INDEX",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "proofs",
    added_at: new Date().toISOString(),
  };

  if (!dryRun) {
    catalog.items = catalog.items.filter((item) => item.artifact_id !== ARTIFACT_ID);
    catalog.items.push(entry);
    catalog.items.sort((left, right) =>
      String(right.added_at || "").localeCompare(String(left.added_at || ""))
    );
    catalog.generated_at = new Date().toISOString();
    catalog.source_commit = izziCommit;
    await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  }

  console.log(JSON.stringify({
    status: dryRun ? "DRY-RUN" : "PUBLISHED",
    artifact_id: ARTIFACT_ID,
    izzi_commit: izziCommit,
    member_count: members.length,
    index_sha256: indexSha,
    index_bytes: indexBytes.length,
    members: members.map((member) => member.artifact_id),
  }, null, 2));
}

await main();
