#!/usr/bin/env node
// Publish the third revision of the izzi Dutch lighthouse radiate guilloche
// review plate as a single-member review family on situationshipin.space
// (generation-guilloche-20260821-dutch-v3), per review issue #61.
//
// Usage:
//   node scripts/publish-guilloche-dutch-v3-index.mjs \
//     --izzi-commit <40-hex> --artifacts-dir <dir with dutch-plate-grid-3x5.png>

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const FAMILY = "generation-guilloche-20260821-dutch-v3";
const ARTIFACT_ID = "generation-guilloche-20260821-dutch-v3-index";
const MEDIA_DIR = "review/media/guilloche-dutch";
const SOURCE_SVG = "dutch-plate-grid-3x5.svg";

const MEMBER = {
  name: "dutch-plate-grid-3x5-v3",
  title: "3x5 review plate grid v3",
  description: "The full 4800x2880 Dutch lighthouse radiate review plate at 2x scale, third revision: row 1 black/white reference, row 2 independent per-layer ray counts and radii, row 3 registration glitch, asymmetric widths, wave overlay, triangle form, and hexagon multi-polygon multi-pattern with per-color opacity 0.2-1.0. Stroke widths 0.5, 1, 2, 4, and 8. Single grid only; per-cell plates are not generated.",
  alt: "Grid of fifteen Dutch guilloche radiate cells at 2x scale: three rows by five stroke-width columns.",
};

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

function renderIndexHtml({ title, description, member, commit, indexDir }) {
  const escape = (value) => String(value ?? "").replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const thumbSrc = relative(indexDir, member.mediaPath).split(sep).join("/");
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
      <p class="sub">Izzi generation commit: <code>${escape(commit)}</code> · 1 pass</p>
      <ul class="passes">
        <li class="pass">
          <a class="thumb" href="../../${member.artifact_id}/"><img src="${thumbSrc}" alt="" loading="lazy" decoding="async"></a>
          <div class="pass-body">
            <h3><a href="../../${member.artifact_id}/">${escape(member.title)}</a></h3>
            <p>${escape(member.description)}</p>
            <p class="meta">${escape(member.artifact_id)}</p>
          </div>
        </li>
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
    console.error("usage: node scripts/publish-guilloche-dutch-v3-index.mjs --izzi-commit <40-hex> --artifacts-dir <dir>");
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

  // Mark the superseded 20260821 dutch v2 family STALE with the REVISE
  // decision from review issue #61. It stays in the catalog so its pages and
  // media remain referenced, but the proofs-for-inspection surface hides
  // STALE proofs.
  for (const item of catalog.items) {
    if (item.family === "generation-guilloche-20260821-dutch-v2") {
      item.generation_state = "STALE";
      item.human_review_state = "REVISE";
    }
  }

  await rm(join(repositoryRoot, "review", MEMBER.name), { recursive: true, force: true });
  await rm(join(repositoryRoot, MEDIA_DIR, `${MEMBER.name}.png`), { force: true });

  const pngPath = `${MEDIA_DIR}/${MEMBER.name}.png`;
  await mkdir(join(repositoryRoot, MEDIA_DIR), { recursive: true });
  await copyFile(join(artifactsDir, "dutch-plate-grid-3x5.png"), join(repositoryRoot, pngPath));
  const pngBytes = await readFile(join(repositoryRoot, pngPath));
  const { width, height } = pngDimensions(pngBytes);
  const memberItem = {
    artifact_id: MEMBER.name,
    title: MEMBER.title,
    description: MEMBER.description,
    alt: MEMBER.alt,
    family: FAMILY,
    generation_class: "guilloche",
    feedback_round: FAMILY,
    media_kind: "image",
    review_scope: "GENERATION-GUILLOCHE-20260821-DUTCH-V3",
    review_mode: "output",
    source_path: `izzi ${izziCommit} outputs/ad-hoc/guilloche.dutch/svg/${SOURCE_SVG}`,
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
  const member = {
    artifact_id: memberItem.artifact_id,
    title: memberItem.title,
    description: memberItem.description,
    mediaPath: pngPath,
  };
  const memberPageDir = join(repositoryRoot, "review", memberItem.artifact_id);
  await mkdir(memberPageDir, { recursive: true });
  await writeFile(
    join(memberPageDir, "index.html"),
    renderReviewPage(memberItem, catalog.source_repository_local_root),
  );
  await writeFile(join(memberPageDir, "manifest.json"), renderReviewManifest(memberItem));

  const title = "Guilloche Dutch Lighthouse Radiate 20260821 v3";
  const description = "Stage-4 Dutch guilloche review, revision 3 (issue #61): the sol-5.6 reference-guided two-layer lighthouse radiate as one 2x 3x5 plate - row 1 black/white reference, row 2 independent per-layer rays/radii, row 3 wave overlay, triangle form, hexagon multi-polygon, and per-color opacity 0.2-1.0 - across stroke widths 0.5, 1, 2, 4, and 8. Per-cell plates are not generated. Prior round: generation-guilloche-20260821-dutch-v2-index (STALE).";
  const indexHtml = renderIndexHtml({
    title, description, member, commit: izziCommit,
    indexDir: join("review", "media", FAMILY),
  });
  const indexPath = join(repositoryRoot, "review/media", FAMILY, `${ARTIFACT_ID}.index.html`);
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, indexHtml);
  const indexBytes = Buffer.from(indexHtml, "utf8");

  const entry = {
    artifact_id: ARTIFACT_ID,
    title, description,
    alt: "Index of the single third-revision izzi Dutch lighthouse radiate review plate from 2026-08-21 (issue #61).",
    family: FAMILY,
    generation_class: "guilloche-index",
    feedback_round: FAMILY,
    media_kind: "index",
    review_scope: "GENERATION-GUILLOCHE-20260821-DUTCH-V3",
    review_mode: "output",
    source_path: `izzi ${izziCommit} outputs/ad-hoc/guilloche.dutch/svg/${SOURCE_SVG} (third-revision 3x5 plate)`,
    published_path: `review/media/${FAMILY}/${ARTIFACT_ID}.index.html`,
    sha256: sha256(indexBytes),
    bytes: indexBytes.length,
    format: "html",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    index_members: [memberItem.artifact_id],
    technical_state: "GUILLOCHE-DUTCH-V3-INDEX",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "proofs",
    added_at: new Date().toISOString(),
  };

  const entryPageDir = join(repositoryRoot, "review", ARTIFACT_ID);
  await mkdir(entryPageDir, { recursive: true });
  await writeFile(join(entryPageDir, "index.html"), renderReviewPage(entry));
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
    member_count: 1, index_sha256: sha256(indexBytes),
  }, null, 2));
}

await main();
