#!/usr/bin/env node
// Regenerate every review page and manifest with the current renderer.
//
// Two populations are covered: every catalog item (from data/review-items.json)
// and the 27 reference-image member pages of the izzi-generation-20260814
// family (from the izzi reference-set meta). This is the "rebuild all" pass
// that propagates renderer fixes — such as the grid-comment merge for GitHub
// issue drafts — to every published page.
//
// Usage:
//   node scripts/rebuild-review-pages.mjs \
//     --izzi-commit <40-hex> --reference-set <izzi reference-set dir>

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";
import { memberDisplay } from "./generation-member-display.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const MEDIA_DIR = "review/reference-images/guilloche-moire-surface";

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

async function writeReviewSurfaces(item, localRoot) {
  const pageDir = join(repositoryRoot, "review", item.artifact_id);
  await mkdir(pageDir, { recursive: true });
  await writeFile(join(pageDir, "index.html"), renderReviewPage(item, localRoot));
  await writeFile(join(pageDir, "manifest.json"), renderReviewManifest(item));
}

function memberItem(name, meta, display, izziCommit) {
  return {
    artifact_id: `reference-image-${name}`,
    title: display.title,
    description: display.description,
    alt: display.title,
    family: "izzi-generation-20260814",
    generation_class: "reference-image",
    feedback_round: "make-check-20260814",
    media_kind: "image",
    review_scope: "IZZI-GENERATION-20260814",
    review_mode: "output",
    source_path: `izzi ${izziCommit} ${display.source}`,
    published_path: `${MEDIA_DIR}/${name}.webp`,
    sha256: meta.sha256,
    bytes: meta.bytes,
    width: meta.width,
    height: meta.height,
    format: "webp",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    technical_state: "REFERENCE-IMAGE",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "proofs",
    style: "house-style",
  };
}

async function main() {
  const values = argumentsMap(process.argv.slice(2));
  const izziCommit = values["izzi-commit"];
  const referenceSet = values["reference-set"] ? resolve(values["reference-set"]) : null;
  if (!izziCommit || !/^[0-9a-f]{40}$/.test(izziCommit) || !referenceSet) {
    console.error(
      "usage: node scripts/rebuild-review-pages.mjs "
      + "--izzi-commit <40-hex> --reference-set <dir>"
    );
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  let catalogPages = 0;
  for (const item of catalog.items) {
    await writeReviewSurfaces(item, catalog.source_repository_local_root);
    catalogPages += 1;
  }

  const meta = JSON.parse(await readFile(join(referenceSet, "meta.json"), "utf8"));
  let memberPages = 0;
  for (const member of meta) {
    const display = memberDisplay(member.name);
    await writeReviewSurfaces(
      memberItem(member.name, member, display, izziCommit),
      catalog.source_repository_local_root
    );
    memberPages += 1;
  }

  catalog.source_commit = izziCommit;
  catalog.generated_at = new Date().toISOString();
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    status: "REVIEW-PAGES-REBUILT",
    izzi_commit: izziCommit,
    catalog_pages: catalogPages,
    member_pages: memberPages,
  }, null, 2));
}

await main();
