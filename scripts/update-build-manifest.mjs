#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(repositoryRoot, "data/review-items.json");
const manifestPath = resolve(repositoryRoot, "data/build-manifest.json");
const codePaths = [
  "index.html",
  "proofs.html",
  "style.html",
  "plans.html",
  "assets/css/review.css",
  "assets/js/review.js",
  "data/review-items.json",
  "scripts/check-review-site.mjs",
  "scripts/update-build-manifest.mjs",
  "README.md",
  "_config.yml",
  "scripts/build-review-pages.mjs",
  "scripts/publish-video-proof.mjs",
  "scripts/publish-plan-proof.mjs",
  "scripts/publish-palette-index.mjs",
  "scripts/build-generation-index.mjs",
  "scripts/review-page.mjs",
  ".github/workflows/jekyll-gh-pages.yml"
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const catalogBytes = await readFile(catalogPath);
const catalog = JSON.parse(catalogBytes.toString("utf8"));
const prior = JSON.parse(await readFile(manifestPath, "utf8"));
const sourceMedia = new Map();
const aestheticCollectionCounts = {};
let proofCount = 0;
let styleProcessingCount = 0;
let planningCount = 0;
let artifactPayloadBytes = 0;
let framePreviewCount = 0;
let sampledFrameCount = 0;

for (const item of catalog.items) {
  artifactPayloadBytes += item.bytes;
  if (item.plan_pdf) {
    artifactPayloadBytes += item.plan_pdf.bytes;
  }
  if (item.source_media) {
    sourceMedia.set(item.source_media.sha256, item.source_media);
  }
  if (item.review_category === "style-processing") {
    styleProcessingCount += 1;
    aestheticCollectionCounts[item.family] = (aestheticCollectionCounts[item.family] || 0) + 1;
  }
  if (item.review_category === "proofs") {
    proofCount += 1;
  }
  if (item.review_category === "planning") {
    planningCount += 1;
  }
  if (item.frame_manifest_path) {
    framePreviewCount += 1;
    const frameManifest = JSON.parse(
      await readFile(resolve(repositoryRoot, item.frame_manifest_path), "utf8")
    );
    sampledFrameCount += frameManifest.frames.length;
    artifactPayloadBytes += frameManifest.frames.reduce(
      (sum, frame) => sum + frame.bytes,
      0
    );
  }
}

const sourceImages = catalog.items
  .map((item) => item.source_image)
  .filter(Boolean);
const codeFiles = [];
for (const path of codePaths) {
  codeFiles.push({
    path,
    sha256: sha256(await readFile(resolve(repositoryRoot, path)))
  });
}

const manifest = {
  schema_version: "1.0",
  portal_build: catalog.portal_build,
  generated_at: prior.generated_at,
  portal_repository: "bdekoz/situationshipin.space",
  portal_source_commit: prior.portal_source_commit,
  izzi_repository: "bdekoz/izzi",
  izzi_source_commit: catalog.source_commit,
  publication_state: "PUBLIC-PROTOTYPE",
  human_review_state: "UNREVIEWED",
  baseline_state: "NOT-PROMOTED",
  training_conversion_transfer_state: "NOT-SHARED",
  artifact_count: catalog.items.length,
  review_category_counts: {
    proofs: proofCount,
    style_processing: styleProcessingCount,
    planning: planningCount
  },
  artifact_payload_bytes: artifactPayloadBytes,
  frame_preview_count: framePreviewCount,
  sampled_frame_count: sampledFrameCount,
  source_media_bytes_represented: [...sourceMedia.values()].reduce(
    (sum, media) => sum + media.bytes,
    0
  ),
  source_image_count: sourceImages.length,
  source_image_bytes_represented: sourceImages.reduce(
    (sum, image) => sum + image.bytes,
    0
  ),
  aesthetic_collection_counts: Object.fromEntries(
    Object.entries(aestheticCollectionCounts).sort(([left], [right]) => left.localeCompare(right))
  ),
  maximum_artifact_bytes: 16 * 1024 * 1024,
  maximum_payload_bytes: 48 * 1024 * 1024,
  excluded_media: ["mkv", "mp4", "mov", "wav", "mp3"],
  code_files: codeFiles,
  artifact_inventory: "data/review-items.json",
  catalog_sha256: sha256(catalogBytes),
  notes: [
    "The catalog binds every published derivative to an Izzi source path and SHA-256.",
    "Canonical source MKVs remain outside Pages; one bounded H.264/AAC MP4 proxy is published for continuous motion and audio review with independent lineage.",
    "The 234 aesthetic-reference originals remain outside the Pages tree; compact derivatives preserve source-image hashes and explicit worktree state.",
    "No source episode media, source audio, credential, analytics code, or account token is included.",
    "Technical publication does not imply human acceptance, aesthetic-corpus finalization, provider-transfer authority, or baseline promotion."
  ]
};

const priorPayload = `${JSON.stringify(prior, null, 2)}\n`;
let nextPayload = `${JSON.stringify(manifest, null, 2)}\n`;
const changed = nextPayload !== priorPayload;
if (changed) {
  manifest.generated_at = new Date().toISOString();
  nextPayload = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, nextPayload, "utf8");
}
console.log(JSON.stringify({
  changed,
  artifact_count: manifest.artifact_count,
  artifact_payload_bytes: manifest.artifact_payload_bytes,
  source_image_count: manifest.source_image_count,
  aesthetic_collection_counts: manifest.aesthetic_collection_counts,
  catalog_sha256: manifest.catalog_sha256
}));
