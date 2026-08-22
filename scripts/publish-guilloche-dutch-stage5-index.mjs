#!/usr/bin/env node
// Publish the izzi Dutch multi-motif stage-5 guilloche review as a six-member
// review family on situationshipin.space
// (generation-guilloche-20260821-stage5), per review issue #62: six 2x 3x5
// grid PNGs and no per-cell plates.
//
// Usage:
//   node scripts/publish-guilloche-dutch-stage5-index.mjs \
//     --izzi-commit <40-hex> --artifacts-dir <dir with stage5-plate-*-grid.png>

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const FAMILY = "generation-guilloche-20260821-stage5";
const ARTIFACT_ID = "generation-guilloche-20260821-stage5-index";
const MEDIA_DIR = "review/media/guilloche-dutch-stage5";

const GROUP_TAIL =
  "Each 4800x2880 plate runs three rows by five stroke-width columns " +
  "(0.5, 1, 2, 4, and 8): row 1 is the black and white reference " +
  "(black only for the single-layer motifs), row 2 is seeded parameter " +
  "exploration across Midnight Gold, Oxblood Cyan, Forest Blush, " +
  "Aubergine Mint, and Indigo Sun, and row 3 applies registration glitch, " +
  "asymmetric layer widths, extreme parameters, relative layer rotation, " +
  "and multiply blending. Single grid only; per-cell plates are not " +
  "generated.";

const MEMBERS = [
  {
    slug: "gx1",
    title: "GX1 stack vignette stage-5 3x5 review plate",
    description: "The GX1 muted-red stacked vignette with a central " +
      "elongated oval, interlaced waists, two rosette terminals, and a " +
      "broad wave lattice. " + GROUP_TAIL,
    alt: "Grid of fifteen Dutch stage-5 GX1 stack vignette cells at 2x " +
      "scale: three rows by five stroke-width columns.",
  },
  {
    slug: "gx2",
    title: "GX2 stack vignette stage-5 3x5 review plate",
    description: "The GX2 narrower continuous red panel with two circular " +
      "terminals, transitional woven sections, and a dominant vertical " +
      "oval. " + GROUP_TAIL,
    alt: "Grid of fifteen Dutch stage-5 GX2 stack vignette cells at 2x " +
      "scale: three rows by five stroke-width columns.",
  },
  {
    slug: "gx3",
    title: "GX3 quad medallion stage-5 3x5 review plate",
    description: "The GX3 four-layer concentric medallion with radial rays, " +
      "scalloped rings, four vertical satellites, and paired lateral " +
      "ripple polygons. " + GROUP_TAIL,
    alt: "Grid of fifteen Dutch stage-5 GX3 quad medallion cells at 2x " +
      "scale: three rows by five stroke-width columns.",
  },
  {
    slug: "gx4g1",
    title: "GX4 group 1 hexagon field stage-5 3x5 review plate",
    description: "The GX4 group 1 gray-over-brown field of staggered " +
      "six-sided medallions. " + GROUP_TAIL,
    alt: "Grid of fifteen Dutch stage-5 GX4 group 1 hexagon field cells " +
      "at 2x scale: three rows by five stroke-width columns.",
  },
  {
    slug: "gx4g2",
    title: "GX4 group 2 mandala stage-5 3x5 review plate",
    description: "The GX4 group 2 sixfold gray, dark-red, and white " +
      "mandala with radial bars, recessed sectors, concentric separators, " +
      "and a perimeter vignette. " + GROUP_TAIL,
    alt: "Grid of fifteen Dutch stage-5 GX4 group 2 mandala cells at 2x " +
      "scale: three rows by five stroke-width columns.",
  },
  {
    slug: "gx5",
    title: "GX5 yellow triptych stage-5 3x5 review plate",
    description: "The GX5 gray-and-brown bounded triptych combining an " +
      "upper halftone field, a graded circle, and an overlapping " +
      "sunflower. " + GROUP_TAIL,
    alt: "Grid of fifteen Dutch stage-5 GX5 yellow triptych cells at 2x " +
      "scale: three rows by five stroke-width columns.",
  },
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
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function renderIndexHtml({ title, description, members, commit, indexDir }) {
  const escape = (value) => String(value ?? "").replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rows = members.map((member) => {
    const thumbSrc = relative(indexDir, member.mediaPath).split(sep).join("/");
    return [
      `<li class="pass">`,
      `<a class="thumb" href="../../${member.artifact_id}/"><img src="${thumbSrc}" alt="" loading="lazy" decoding="async"></a>`,
      `<div class="pass-body">`,
      `<h3><a href="../../${member.artifact_id}/">${escape(member.title)}</a></h3>`,
      `<p>${escape(member.description)}</p>`,
      `<p class="meta">${escape(member.artifact_id)}</p>`,
      `</div>`,
      `</li>`,
    ].join("\n");
  }).join("\n");
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
  const artifactsDir = values["artifacts-dir"] ? resolve(values["artifacts-dir"]) : null;
  if (!izziCommit || !/^[0-9a-f]{40}$/.test(izziCommit) || !artifactsDir) {
    console.error("usage: node scripts/publish-guilloche-dutch-stage5-index.mjs --izzi-commit <40-hex> --artifacts-dir <dir>");
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const members = [];
  for (const spec of MEMBERS) {
    const name = `stage5-plate-${spec.slug}-grid`;
    const pngPath = `${MEDIA_DIR}/${name}.png`;
    await mkdir(join(repositoryRoot, MEDIA_DIR), { recursive: true });
    await copyFile(join(artifactsDir, `${name}.png`), join(repositoryRoot, pngPath));
    const pngBytes = await readFile(join(repositoryRoot, pngPath));
    const { width, height } = pngDimensions(pngBytes);
    const item = {
      artifact_id: name,
      title: spec.title,
      description: spec.description,
      alt: spec.alt,
      family: FAMILY,
      generation_class: "guilloche",
      feedback_round: FAMILY,
      media_kind: "image",
      review_scope: "GENERATION-GUILLOCHE-20260821-STAGE5",
      review_mode: "output",
      source_path: `izzi ${izziCommit} outputs/ad-hoc/guilloche.dutch-stage5/svg/${name}.svg`,
      published_path: pngPath,
      sha256: sha256(pngBytes),
      bytes: pngBytes.length,
      width, height,
      format: "png",
      technical_state: "VERIFIED",
      human_review_state: "UNREVIEWED",
      baseline_state: "NOT-PROMOTED",
      review_category: "proofs",
      style: "house-style",
      added_at: new Date().toISOString(),
    };
    members.push({ artifact_id: item.artifact_id, title: item.title, description: item.description, mediaPath: pngPath, item });
    const pageDir = join(repositoryRoot, "review", item.artifact_id);
    await mkdir(pageDir, { recursive: true });
    await writeFile(join(pageDir, "index.html"),
      renderReviewPage(item, catalog.source_repository_local_root));
    await writeFile(join(pageDir, "manifest.json"), renderReviewManifest(item));
  }

  const title = "Guilloche Dutch Multi-Motif Stage 5 20260821";
  const description =
    "Stage-5 Dutch multi-motif guilloche review: the six izzi builders " +
    "GX1, GX2, GX3, GX4 group 1, GX4 group 2, and GX5 as six 2x 3x5 " +
    "plates - row 1 black/white reference, row 2 seeded accessible-palette " +
    "exploration, row 3 registration glitch, asymmetric widths, extreme " +
    "parameters, relative rotation, and multiply blending - across stroke " +
    "widths 0.5, 1, 2, 4, and 8. Six grid members; per-cell plates are " +
    "not generated. Prior rounds: generation-guilloche-20260816-index and " +
    "generation-guilloche-20260821-dutch-v3-index.";
  const indexHtml = renderIndexHtml({
    title, description, members, commit: izziCommit,
    indexDir: join("review", "media", FAMILY),
  });
  const indexPath = join(repositoryRoot, "review/media", FAMILY,
    `${ARTIFACT_ID}.index.html`);
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, indexHtml);
  const indexBytes = Buffer.from(indexHtml, "utf8");

  const entry = {
    artifact_id: ARTIFACT_ID,
    title, description,
    alt: "Index of the six 2x izzi Dutch multi-motif stage-5 review plates from 2026-08-21.",
    family: FAMILY,
    generation_class: "guilloche-index",
    feedback_round: FAMILY,
    media_kind: "index",
    review_scope: "GENERATION-GUILLOCHE-20260821-STAGE5",
    review_mode: "output",
    source_path: `izzi ${izziCommit} outputs/ad-hoc/guilloche.dutch-stage5 (stage-5 2x grid aggregate)`,
    published_path: `review/media/${FAMILY}/${ARTIFACT_ID}.index.html`,
    sha256: sha256(indexBytes),
    bytes: indexBytes.length,
    format: "html",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    index_members: members.map((member) => member.artifact_id),
    technical_state: "GUILLOCHE-DUTCH-STAGE5-INDEX",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "proofs",
    style: "house-style",
    added_at: new Date().toISOString(),
  };

  const entryPageDir = join(repositoryRoot, "review", ARTIFACT_ID);
  await mkdir(entryPageDir, { recursive: true });
  await writeFile(join(entryPageDir, "index.html"),
    renderReviewPage(entry, catalog.source_repository_local_root));
  await writeFile(join(entryPageDir, "manifest.json"), renderReviewManifest(entry));

  catalog.items = catalog.items.filter((item) => item.artifact_id !== ARTIFACT_ID);
  catalog.items.push(entry);
  catalog.items.sort((left, right) =>
    String(right.added_at || "").localeCompare(String(left.added_at || "")));
  catalog.generated_at = new Date().toISOString();
  catalog.source_commit = izziCommit;
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    status: "PUBLISHED", artifact_id: ARTIFACT_ID, izzi_commit: izziCommit,
    member_count: members.length, index_sha256: sha256(indexBytes),
  }, null, 2));
}

await main();
