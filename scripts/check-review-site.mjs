#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(repositoryRoot, "data/review-items.json");
const maximumFileBytes = 16 * 1024 * 1024;
const maximumPayloadBytes = 48 * 1024 * 1024;
const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".svg", ".html", ".json", ".mp4"]);
const forbiddenExtensions = new Set([".mkv", ".wav", ".mp3", ".mov"]);

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`[FAIL] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function withinRepository(path) {
  return path === repositoryRoot || path.startsWith(`${repositoryRoot}${sep}`);
}

function readPngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

async function recursiveFiles(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...await recursiveFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

let catalog;
let catalogBytes;
try {
  catalogBytes = await readFile(catalogPath);
  catalog = JSON.parse(catalogBytes.toString("utf8"));
  pass("catalog JSON parses");
} catch (error) {
  fail(`catalog cannot be parsed: ${error.message}`);
  process.exitCode = 1;
  process.exit();
}

if (catalog.schema_version !== "1.0" || !Array.isArray(catalog.items)) {
  fail("catalog schema_version must be 1.0 and items must be an array");
}

const ids = new Set();
let payloadBytes = 0;

for (const item of catalog.items) {
  if (!item.artifact_id || ids.has(item.artifact_id)) {
    fail(`artifact ID is missing or duplicated: ${item.artifact_id || "(missing)"}`);
  }
  ids.add(item.artifact_id);

  if (!["proofs", "style-processing"].includes(item.review_category)) {
    fail(`${item.artifact_id} has an invalid review category`);
  }

  if (item.review_mode === "aesthetic") {
    if (item.review_category !== "style-processing"
        || item.generation_class !== "style-processing"
        || item.review_scope !== "AESTHETIC-CORPUS-CANDIDATE") {
      fail(`${item.artifact_id} has an incomplete aesthetic-review contract`);
    }
    if (!item.source_image || item.source_image.published !== false
        || item.source_image.path !== item.source_path
        || !/^[0-9a-f]{64}$/.test(item.source_image.sha256 || "")) {
      fail(`${item.artifact_id} has incomplete source-image lineage`);
    }
  }

  const extension = extname(item.published_path).toLowerCase();
  if (!allowedExtensions.has(extension) || forbiddenExtensions.has(extension)) {
    fail(`${item.artifact_id} uses disallowed media type ${extension || "(none)"}`);
  }
  if (!item.published_path.startsWith("review/")) {
    fail(`${item.artifact_id} is outside the bounded review directory`);
  }

  const artifactPath = resolve(repositoryRoot, item.published_path);
  if (!withinRepository(artifactPath)) {
    fail(`${item.artifact_id} resolves outside the repository`);
    continue;
  }

  try {
    const artifactStat = await stat(artifactPath);
    const bytes = await readFile(artifactPath);
    const hash = createHash("sha256").update(bytes).digest("hex");
    payloadBytes += artifactStat.size;

    if (artifactStat.size !== item.bytes) {
      fail(`${item.artifact_id} byte count differs from catalog`);
    }
    if (artifactStat.size > maximumFileBytes) {
      fail(`${item.artifact_id} exceeds the bounded 16 MiB review object budget`);
    }
    if (hash !== item.sha256) {
      fail(`${item.artifact_id} SHA-256 differs from catalog`);
    }
    if (extension === ".png") {
      const dimensions = readPngDimensions(bytes);
      if (!dimensions || dimensions.width !== item.width || dimensions.height !== item.height) {
        fail(`${item.artifact_id} dimensions differ from catalog`);
      }
    }
    if (extension === ".jpg" || extension === ".jpeg") {
      const dimensions = readJpegDimensions(bytes);
      if (!dimensions || dimensions.width !== item.width || dimensions.height !== item.height) {
        fail(`${item.artifact_id} JPEG dimensions differ from catalog`);
      }
    }

    if (item.frame_manifest_path) {
      const manifestPath = resolve(repositoryRoot, item.frame_manifest_path);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (manifest.schema_version !== "izzi-review-filmstrip-1"
          || manifest.filmstrip.sha256 !== item.sha256
          || manifest.source_media.sha256 !== item.source_media?.sha256
          || manifest.source_media.path !== item.source_path
          || manifest.source_media.published !== false) {
        fail(`${item.artifact_id} frame manifest lineage differs from catalog`);
      }
      if (!Array.isArray(manifest.frames) || manifest.frames.length !== 10) {
        fail(`${item.artifact_id} does not have exactly ten sampled frames`);
      } else {
        let priorTime = -1;
        for (const [index, frame] of manifest.frames.entries()) {
          if (frame.ordinal !== index + 1 || frame.time_seconds <= priorTime) {
            fail(`${item.artifact_id} frame order or sample time is invalid`);
          }
          priorTime = frame.time_seconds;
          const framePath = resolve(dirname(manifestPath), frame.path);
          if (!withinRepository(framePath)) {
            fail(`${item.artifact_id} frame ${frame.ordinal} escapes the repository`);
            continue;
          }
          const frameBytes = await readFile(framePath);
          const frameStat = await stat(framePath);
          const frameHash = createHash("sha256").update(frameBytes).digest("hex");
          const dimensions = readJpegDimensions(frameBytes);
          payloadBytes += frameStat.size;
          if (frameStat.size !== frame.bytes || frameHash !== frame.sha256) {
            fail(`${item.artifact_id} frame ${frame.ordinal} bytes or hash differs`);
          }
          if (!dimensions || dimensions.width !== frame.width || dimensions.height !== frame.height) {
            fail(`${item.artifact_id} frame ${frame.ordinal} dimensions differ`);
          }
          if (frameStat.size > maximumFileBytes) {
            fail(`${item.artifact_id} frame ${frame.ordinal} exceeds the object budget`);
          }
        }
      }
    }
  } catch (error) {
    fail(`${item.artifact_id} cannot be inspected: ${error.message}`);
  }
}

const proofCount = catalog.items.filter((item) => item.review_category === "proofs").length;
const styleItems = catalog.items.filter((item) => item.review_category === "style-processing");
const styleCounts = Object.fromEntries(
  ["noir-vibezz", "tokyo-psychedelic", "neon-addict"]
    .map((family) => [family, styleItems.filter((item) => item.family === family).length])
);
if (proofCount !== 25 || styleItems.length !== 234
    || styleCounts["noir-vibezz"] !== 58
    || styleCounts["tokyo-psychedelic"] !== 30
    || styleCounts["neon-addict"] !== 146) {
  fail(`review-category inventory differs: proofs=${proofCount}, styles=${JSON.stringify(styleCounts)}`);
}

for (const path of await recursiveFiles(resolve(repositoryRoot, "review"))) {
  if (forbiddenExtensions.has(extname(path).toLowerCase())) {
    fail(`source media was copied into the public review tree: ${path}`);
  }
}

if (payloadBytes > maximumPayloadBytes) {
  fail(`artifact payload exceeds 48 MiB: ${payloadBytes} bytes`);
} else {
  pass(`artifact payload is bounded: ${payloadBytes} bytes`);
}

try {
  const buildManifest = JSON.parse(
    await readFile(resolve(repositoryRoot, "data/build-manifest.json"), "utf8")
  );
  const sourceImages = catalog.items.map((item) => item.source_image).filter(Boolean);
  const sourceMedia = new Map(
    catalog.items
      .filter((item) => item.source_media)
      .map((item) => [item.source_media.sha256, item.source_media])
  );
  const catalogHash = createHash("sha256").update(catalogBytes).digest("hex");
  const expectedManifestFields = {
    portal_build: catalog.portal_build,
    izzi_source_commit: catalog.source_commit,
    artifact_count: catalog.items.length,
    artifact_payload_bytes: payloadBytes,
    frame_preview_count: catalog.items.filter((item) => item.frame_manifest_path).length,
    sampled_frame_count: catalog.items.filter((item) => item.frame_manifest_path).length * 10,
    source_media_bytes_represented: [...sourceMedia.values()].reduce((sum, media) => sum + media.bytes, 0),
    source_image_count: sourceImages.length,
    source_image_bytes_represented: sourceImages.reduce((sum, image) => sum + image.bytes, 0),
    catalog_sha256: catalogHash
  };
  for (const [field, expected] of Object.entries(expectedManifestFields)) {
    if (buildManifest[field] !== expected) {
      fail(`build manifest ${field} differs: expected ${expected}, observed ${buildManifest[field]}`);
    }
  }
  if (JSON.stringify(buildManifest.aesthetic_collection_counts) !== JSON.stringify({
    "neon-addict": 146,
    "noir-vibezz": 58,
    "tokyo-psychedelic": 30
  })) {
    fail("build manifest aesthetic collection counts differ");
  }
  for (const codeFile of buildManifest.code_files || []) {
    const codePath = resolve(repositoryRoot, codeFile.path);
    if (!withinRepository(codePath)) {
      fail(`build manifest code path escapes repository: ${codeFile.path}`);
      continue;
    }
    const observedHash = createHash("sha256").update(await readFile(codePath)).digest("hex");
    if (observedHash !== codeFile.sha256) {
      fail(`build manifest code hash differs: ${codeFile.path}`);
    }
  }
  if ((buildManifest.code_files || []).length < 9) {
    fail("build manifest code inventory is incomplete");
  } else {
    pass("build manifest measurements and code hashes match");
  }
} catch (error) {
  fail(`build manifest cannot be verified: ${error.message}`);
}

const index = await readFile(resolve(repositoryRoot, "index.html"), "utf8");
const proofs = await readFile(resolve(repositoryRoot, "proofs.html"), "utf8");
const style = await readFile(resolve(repositoryRoot, "style.html"), "utf8");
const script = await readFile(resolve(repositoryRoot, "assets/js/review.js"), "utf8");
const requiredIds = [
  "review-catalog", "artifact-grid", "artifact-template", "filter-form",
  "download-feedback", "import-feedback", "issue-dialog", "reset-dialog",
  "previous-page", "next-page", "page-status", "category-proofs",
  "category-style-processing", "results-title", "results-description"
];
for (const id of requiredIds) {
  if (!proofs.includes(`id="${id}"`) || !style.includes(`id="${id}"`)) {
    fail(`catalog pages are missing required ID ${id}`);
  }
}

const remoteDependency = /<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//i;
if (remoteDependency.test(index) || remoteDependency.test(proofs) || remoteDependency.test(style)) {
  fail("a site page loads a remote script or stylesheet");
} else {
  pass("site code has no remote script or stylesheet dependency");
}

if (!proofs.includes("public GitHub issue") || !style.includes("public GitHub issue")
    || !script.includes("public_submission_acknowledged")) {
  fail("public issue disclosure or acknowledgement evidence is missing");
}

if (!script.includes("pageSize: 10") || !script.includes("AESTHETIC_DECISIONS")
    || !script.includes("source_image_sha256")
    || !script.includes("style-processing-page-")
    || !script.includes("Suggested Codex handoff")
    || !script.includes("review_identifier")) {
  fail("ten-item pagination or aesthetic-review lineage is missing");
}

const forbiddenTerms = ["SEEDANCE_KEY", "BEGIN OPENSSH PRIVATE KEY", "aws_access_key_id"];
for (const term of forbiddenTerms) {
  if (index.includes(term) || proofs.includes(term) || style.includes(term)
      || script.includes(term) || JSON.stringify(catalog).includes(term)) {
    fail(`public site content contains forbidden credential marker ${term}`);
  }
}

if (failures === 0) {
  pass(`${catalog.items.length} unique catalog items verified`);
  console.log("Review-site validation passed.");
} else {
  console.error(`Review-site validation failed with ${failures} problem(s).`);
  process.exitCode = 1;
}
