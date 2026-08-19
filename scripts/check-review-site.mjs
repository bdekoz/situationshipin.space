#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(repositoryRoot, "data/review-items.json");
const maximumFileBytes = 16 * 1024 * 1024;
// Raised 2026-08-14 from 48 MiB to 64 MiB to host full-motion video
// reviews (user preference; draft-1-style playable proxies instead of
// filmstrips).  Revisit when the catalog approaches the new bound.
// Raised 2026-08-14 from 64 MiB to 80 MiB: full-motion video reviews
// plus the 29-voice audio bank exceed the prior bound.
// Raised 2026-08-14 from 80 MiB to 96 MiB: the completed 3-episode
// ai-time-to-die vertical adds three full-motion episode masters.
const maximumPayloadBytes = 96 * 1024 * 1024;
// .mp3 added 2026-08-14 for audio review artifacts (Kokoro female voice bank).
// .txt added 2026-08-18 for the W3 canonical transcript review container.
const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".svg", ".html", ".json", ".mp4", ".mp3", ".webp", ".pdf", ".md", ".txt"]);
const forbiddenExtensions = new Set([".mkv", ".wav", ".mov"]);

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

function repositoryRelative(path) {
  return posix.relative(repositoryRoot, path);
}

function resolveReviewReference(baseDirectory, url) {
  const cleaned = url.replace(/[?#].*$/, "");
  if (cleaned.startsWith("/review/")) {
    return posix.normalize(cleaned.slice(1));
  }
  if (cleaned.startsWith("/") || cleaned.startsWith("//")) {
    return null;
  }
  return posix.normalize(posix.join(baseDirectory, cleaned));
}

async function collectReviewReferences() {
  const referenced = new Set();
  const reviewRoot = resolve(repositoryRoot, "review");
  for (const path of await recursiveFiles(reviewRoot)) {
    if (extname(path).toLowerCase() !== ".html") continue;
    const htmlRelative = repositoryRelative(path);
    const html = await readFile(path, "utf8");
    const pattern = /(?:src|href)=["']([^"']+)["']/g;
    for (const match of html.matchAll(pattern)) {
      const url = match[1];
      if (!url || /^(?:data:|mailto:|tel:|https?:|file:|#)/i.test(url)) continue;
      const target = resolveReviewReference(posix.dirname(htmlRelative), url);
      if (!target || !target.startsWith("review/")) continue;
      const targetFile = target.endsWith("/") ? `${target}index.html` : target;
      const absoluteTarget = resolve(repositoryRoot, targetFile);
      if (!withinRepository(absoluteTarget)) continue;
      referenced.add(targetFile);
      try {
        await stat(absoluteTarget);
      } catch {
        fail(`HTML reference is broken: ${htmlRelative} -> ${targetFile}`);
      }
    }
  }
  return referenced;
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

  if (!["proofs", "style-processing", "planning"].includes(item.review_category)) {
    fail(`${item.artifact_id} has an invalid review category`);
  }

  if (item.review_category === "planning") {
    if (item.media_kind !== "plan") {
      fail(`${item.artifact_id} planning items must use media_kind plan`);
    }
    const planClassProductTypes = {
      "plan-vertical": "vertical-project",
      "plan-short": "short"
    };
    if (planClassProductTypes[item.generation_class]) {
      if (item.product_type !== planClassProductTypes[item.generation_class]) {
        fail(
          `${item.artifact_id} ${item.generation_class} items must carry ` +
          `product_type ${planClassProductTypes[item.generation_class]}`
        );
      }
      if (item.generation_class === "plan-short"
          && item.review_scope !== "PLAN-SHORT-REVIEW") {
        fail(`${item.artifact_id} plan-short items must use review_scope PLAN-SHORT-REVIEW`);
      }
    }
    if (!["PLAN-DRAFT", "PLAN-VERTICAL", "PLAN-FORMAL"].includes(item.plan_stage)) {
      fail(`${item.artifact_id} has an invalid plan stage`);
    }
    if (item.plan_stage !== "PLAN-DRAFT" && !item.plan_contract) {
      fail(`${item.artifact_id} is missing the plan contract`);
    }
    const requiredPlanContent = item.plan_stage === "PLAN-FORMAL"
      ? ["template", "segments", "estimates", "pilot_options", "gates", "orchestration"]
      : item.plan_stage === "PLAN-VERTICAL"
        ? ["template", "segments", "estimates", "pilot_options", "gates"]
        : [];
    for (const key of requiredPlanContent) {
      if (item.plan_contract?.required_content?.[key] !== true) {
        fail(`${item.artifact_id} plan contract is missing required content: ${key}`);
      }
    }
    if (item.plan_pdf) {
      if (!/^[0-9a-f]{64}$/.test(item.plan_pdf.sha256 || "")) {
        fail(`${item.artifact_id} has an incomplete plan PDF lineage`);
      }
      if (item.plan_stage === "PLAN-FORMAL"
          && item.plan_contract?.house_style_checks?.special_topics !== "PASS") {
        fail(`${item.artifact_id} formal plan PDF lacks a PASS special-topics check`);
      }
    }
    if (item.source_sha256 !== item.sha256) {
      fail(`${item.artifact_id} plan source hash differs from the published document`);
    }
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

  if (item.generation_state !== undefined
      && !["CURRENT", "STALE", "SUPERSEDED"].includes(item.generation_state)) {
    fail(`${item.artifact_id} has an invalid generation state`);
  }
  if (item.generation_commit !== undefined
      && !/^[0-9a-f]{40}$/.test(item.generation_commit)) {
    fail(`${item.artifact_id} has an invalid generation commit`);
  }
  if (item.media_kind === "index") {
    if (extname(item.published_path).toLowerCase() !== ".html") {
      fail(`${item.artifact_id} index artifacts must publish an .html page`);
    }
    if (!Array.isArray(item.index_members) || !item.index_members.length) {
      fail(`${item.artifact_id} index is missing its member list`);
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
    if (item.plan_pdf) {
      const pdfPath = resolve(repositoryRoot, item.plan_pdf.path);
      if (!withinRepository(pdfPath)) {
        fail(`${item.artifact_id} plan PDF escapes the repository`);
      } else {
        const pdfStat = await stat(pdfPath);
        const pdfData = await readFile(pdfPath);
        const pdfHash = createHash("sha256").update(pdfData).digest("hex");
        payloadBytes += pdfStat.size;
        if (pdfStat.size !== item.plan_pdf.bytes || pdfHash !== item.plan_pdf.sha256) {
          fail(`${item.artifact_id} plan PDF bytes or hash differs`);
        }
        if (pdfStat.size > maximumFileBytes) {
          fail(`${item.artifact_id} plan PDF exceeds the object budget`);
        }
      }
    }
  } catch (error) {
    fail(`${item.artifact_id} cannot be inspected: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Workflow-v2 gates (visual-styling + audio). Video-production entries must
// not appear in the catalog until both gates carry decision KEEP.
// ---------------------------------------------------------------------------
const workflowGateDir = resolve(repositoryRoot, "data/gates");
const workflowGates = new Map();
for (const gateName of ["visual-styling", "audio"]) {
  const gatePath = resolve(workflowGateDir, `${gateName}.json`);
  try {
    const gate = JSON.parse(await readFile(gatePath, "utf8"));
    const decision = gate?.decision;
    if (gate?.schema_version !== "izzi-workflow-gate-1"
        || !["PENDING", "KEEP", "REVISE"].includes(decision)) {
      workflowGates.set(gateName, { decision: "PENDING", families: [] });
      console.warn(`[WARN] workflow gate ${gateName} is unreadable; treated as PENDING`);
    } else {
      workflowGates.set(gateName, {
        decision,
        families: Array.isArray(gate.families) ? gate.families : []
      });
      pass(`workflow gate ${gateName}: ${decision}`);
    }
  } catch {
    // The audio gate lands in W5; a missing gate file is treated as PENDING
    // rather than a standalone failure.
    workflowGates.set(gateName, { decision: "PENDING", families: [] });
  }
}

const videoProductionItems = catalog.items.filter(
  (item) => item.media_kind === "video" || item.media_kind === "video-filmstrip"
);
const gateFamilies = new Set([
  ...(workflowGates.get("visual-styling")?.families || []),
  ...(workflowGates.get("audio")?.families || [])
]);
const gatedVideoItems = videoProductionItems.filter(
  (item) => gateFamilies.size === 0 || gateFamilies.has(item.family)
);
if (gatedVideoItems.length > 0) {
  for (const item of gatedVideoItems) {
    const visualDecision = workflowGates.get("visual-styling")?.decision || "PENDING";
    const audioDecision = workflowGates.get("audio")?.decision || "PENDING";
    if (visualDecision !== "KEEP") {
      fail(
        `${item.artifact_id} is a video-production entry but the visual-styling gate is `
        + `${visualDecision}`
      );
    }
    if (audioDecision !== "KEEP") {
      fail(
        `${item.artifact_id} is a video-production entry but the audio gate is `
        + `${audioDecision}`
      );
    }
  }
} else {
  pass("workflow gates idle: no in-scope video-production entries are published");
}

for (const path of await recursiveFiles(resolve(repositoryRoot, "review"))) {
  if (forbiddenExtensions.has(extname(path).toLowerCase())) {
    fail(`source media was copied into the public review tree: ${path}`);
  }
}

const htmlReferences = await collectReviewReferences();
const referencedReviewFiles = new Set(htmlReferences);
const addReviewCompanions = (id) => {
  if (!id) return;
  referencedReviewFiles.add(`review/${id}/index.html`);
  referencedReviewFiles.add(`review/${id}/manifest.json`);
};
for (const item of catalog.items) {
  addReviewCompanions(item.artifact_id);
  for (const memberId of item.index_members || []) addReviewCompanions(memberId);
  if (item.published_path) referencedReviewFiles.add(posix.normalize(item.published_path));
  if (item.plan_pdf?.path) referencedReviewFiles.add(posix.normalize(item.plan_pdf.path));
  if (item.frame_manifest_path) referencedReviewFiles.add(posix.normalize(item.frame_manifest_path));
}

const staleReviewFiles = [];
for (const path of await recursiveFiles(resolve(repositoryRoot, "review"))) {
  const rel = repositoryRelative(path);
  if (!referencedReviewFiles.has(rel)) staleReviewFiles.push(rel);
}
if (staleReviewFiles.length) {
  for (const rel of staleReviewFiles) {
    fail(`stale review file is not referenced by the catalog or any HTML page: ${rel}`);
  }
} else {
  pass(`review tree has no stale files (${referencedReviewFiles.size} referenced paths)`);
}

if (payloadBytes > maximumPayloadBytes) {
  fail(`artifact payload exceeds the ${maximumPayloadBytes} byte budget: ${payloadBytes} bytes`);
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
  const proofCount = catalog.items.filter((item) => item.review_category === "proofs").length;
  const styleProcessingCount = catalog.items.filter(
    (item) => item.review_category === "style-processing"
  ).length;
  const planningCount = catalog.items.filter((item) => item.review_category === "planning").length;
  const expectedCategoryCounts = {
    proofs: proofCount,
    style_processing: styleProcessingCount,
    planning: planningCount
  };
  for (const [field, expected] of Object.entries(expectedManifestFields)) {
    if (buildManifest[field] !== expected) {
      fail(`build manifest ${field} differs: expected ${expected}, observed ${buildManifest[field]}`);
    }
  }
  if (JSON.stringify(buildManifest.review_category_counts) !== JSON.stringify(expectedCategoryCounts)) {
    fail(
      "build manifest review-category counts differ: "
      + `expected ${JSON.stringify(expectedCategoryCounts)}, `
      + `observed ${JSON.stringify(buildManifest.review_category_counts)}`
    );
  }
  const expectedAestheticCounts = {};
  for (const item of catalog.items) {
    if (item.review_category === "style-processing") {
      expectedAestheticCounts[item.family] = (expectedAestheticCounts[item.family] || 0) + 1;
    }
  }
  const sortedExpectedAestheticCounts = Object.fromEntries(
    Object.entries(expectedAestheticCounts).sort(([left], [right]) => left.localeCompare(right))
  );
  if (JSON.stringify(buildManifest.aesthetic_collection_counts) !== JSON.stringify(sortedExpectedAestheticCounts)) {
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
const plans = await readFile(resolve(repositoryRoot, "plans.html"), "utf8");
const script = await readFile(resolve(repositoryRoot, "assets/js/review.js"), "utf8");
const requiredIds = [
  "review-catalog", "artifact-grid", "artifact-template", "filter-form",
  "download-feedback", "import-feedback", "issue-dialog", "reset-dialog",
  "previous-page", "next-page", "page-status", "results-title",
  "results-description"
];
for (const id of requiredIds) {
  if (!proofs.includes(`id="${id}"`) || !style.includes(`id="${id}"`) || !plans.includes(`id="${id}"`)) {
    fail(`catalog pages are missing required ID ${id}`);
  }
}

if (proofs.includes("Style processing") || proofs.includes("Plan review")
    || style.includes("Proofs for inspection") || style.includes("Plan review")
    || plans.includes("Style processing") || plans.includes("Proofs for inspection")) {
  fail("catalog sub-pages expose another review category");
} else {
  pass("catalog sub-pages are isolated by category");
}

const remoteDependency = /<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//i;
if (remoteDependency.test(index) || remoteDependency.test(proofs) || remoteDependency.test(style) || remoteDependency.test(plans)) {
  fail("a site page loads a remote script or stylesheet");
} else {
  pass("site code has no remote script or stylesheet dependency");
}

if (!proofs.includes("public GitHub issue") || !style.includes("public GitHub issue")
    || !plans.includes("public GitHub issue")
    || !script.includes("public_submission_acknowledged")) {
  fail("public issue disclosure or acknowledgement evidence is missing");
}

if (!plans.includes('data-review-category="planning"')) {
  fail("plans.html is missing the planning review category");
}

if (!plans.includes('id="new-title"')) {
  fail("plans.html is missing the New plan-creation section");
}

for (const id of ["plan-proposal-form", "submit-plan-proposal",
  "proposal-type-vertical", "proposal-type-short", "proposal-slug",
  "proposal-title", "proposal-description"]) {
  if (!plans.includes(`id="${id}"`)) {
    fail(`plans.html is missing the proposal form ID ${id}`);
  }
}
for (const removed of ['id="plan-command-form"', 'id="copy-plan-command"', "--dry-run"]) {
  if (plans.includes(removed)) {
    fail(`plans.html still exposes the removed command builder: ${removed}`);
  }
}

const locationPage = await readFile(resolve(repositoryRoot, "location.html"), "utf8");
const locationRequiredIds = [
  "route-map", "point-list", "route-note", "location-form", "new-path-button"
];
let locationIdsOk = true;
for (const id of locationRequiredIds) {
  if (!locationPage.includes(`id="${id}"`)) {
    fail(`location.html is missing required ID ${id}`);
    locationIdsOk = false;
  }
}
if (locationIdsOk) {
  pass("location.html authoring surface and route-view contract present");
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
      || plans.includes(term) || script.includes(term) || JSON.stringify(catalog).includes(term)) {
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
