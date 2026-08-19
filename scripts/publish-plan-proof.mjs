#!/usr/bin/env node
// Publish a plan-vertical review artifact to the situationshipin.space portal.
//
// The plan class follows the relaxed-first drafting philosophy: a PLAN-DRAFT
// needs only provenance and a bounded document, while PLAN-VERTICAL and
// PLAN-FORMAL enforce progressively more plan content. Nothing is published
// without explicit project approval:
//
//   node scripts/publish-plan-proof.mjs \
//     --approve PROJECT-APPROVED \
//     --source /home/bkoz/src/izzi/docs/development/<vertical>/proposal_vertical_v2.md \
//     --source-path docs/development/<vertical>/proposal_vertical_v2.md \
//     --artifact-id plan-vertical-<slug>-v2 \
//     --title "<Vertical> — proposed vertical v2" \
//     --description "..." \
//     --family <family> \
//     --feedback-round plan-v2 \
//     --stage vertical \
//     --pdf /home/bkoz/src/izzi/docs/development/<vertical>/proposed_vertical_v2.pdf \
//     --checks /home/bkoz/src/izzi/docs/development/<vertical>/plan-vertical-checks.json

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const MAXIMUM_DOCUMENT_BYTES = 16 * 1024 * 1024;
const APPROVAL_TOKEN = "PROJECT-APPROVED";
const PRODUCT_TYPES = {
  "vertical-project": {
    generation_class: "plan-vertical",
    review_scope: "PLAN-VERTICAL-REVIEW"
  },
  short: {
    generation_class: "plan-short",
    review_scope: "PLAN-SHORT-REVIEW"
  }
};
const STAGES = {
  draft: "PLAN-DRAFT",
  vertical: "PLAN-VERTICAL",
  formal: "PLAN-FORMAL"
};
const STAGE_CONTENT = {
  "PLAN-DRAFT": [],
  "PLAN-VERTICAL": ["template", "segments", "estimates", "pilot_options", "gates"],
  "PLAN-FORMAL": ["template", "segments", "estimates", "pilot_options", "gates", "orchestration"]
};
const CONTENT_MARKERS = {
  template: /\b(?:episode\s+template|template)\b/i,
  segments: /\bsegment[s]?\b/i,
  estimates: /\b(?:estimate[s]?|expense|cost)\b/i,
  pilot_options: /\bpilot\b/i,
  gates: /\bgate[s]?\b/i,
  orchestration: /\borchestrat\w+\b/i
};

function usage() {
  return [
    "usage: node scripts/publish-plan-proof.mjs [options]",
    "",
    "required:",
    "  --approve PROJECT-APPROVED   explicit project-approval gate",
    "  --source <path>              plan markdown (canonical source)",
    "  --artifact-id <id>           stable catalog id",
    "  --title <title>              review page title",
    "  --description <text>         what to review",
    "  --family <family>            vertical family slug",
    "  --feedback-round <round>     plan iteration label",
    "  --product-type <type>        vertical-project | short (default vertical-project)",
    "",
    "optional:",
    "  --source-path <izzi path>    canonical source for provenance",
    "  --generation-class <class>   catalog generation class (default plan-vertical)",
    "  --review-scope <scope>       review scope (default PLAN-VERTICAL-REVIEW)",
    "  --stage <stage>              draft | vertical | formal (default draft)",
    "  --pdf <path>                 optional special-topics PDF variant",
    "  --checks <json>              plan-contract checks JSON from the izzi emitter",
    "  --alt <text>                 document alt text (defaults to description)",
    "  --dry-run                    validate and print the plan without writing",
  ].join("\n");
}

function argumentsMap(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      continue;
    }
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      values[key] = true;
    } else {
      values[key] = next;
      index += 1;
    }
  }
  return values;
}

function requireString(values, key) {
  const value = values[key];
  if (typeof value !== "string" || value.length === 0) {
    console.error(`[FAIL] missing required --${key}`);
    process.exitCode = 1;
  }
  return value || "";
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function detectContent(text) {
  const present = {};
  for (const [key, marker] of Object.entries(CONTENT_MARKERS)) {
    present[key] = marker.test(text);
  }
  return present;
}

function missingContent(present, stage) {
  return STAGE_CONTENT[stage].filter((key) => present[key] !== true);
}

function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    stdio: "inherit"
  });
  return result.status === 0;
}

async function main() {
  const values = argumentsMap(process.argv.slice(2));
  if (values.help) {
    console.log(usage());
    return;
  }
  if (values.approve !== APPROVAL_TOKEN) {
    console.error(
      `[FAIL] publication requires --approve ${APPROVAL_TOKEN} ` +
        "from project approval; use --dry-run to preview the plan"
    );
    process.exitCode = 1;
    return;
  }

  const artifactId = requireString(values, "artifact-id");
  const title = requireString(values, "title");
  const description = requireString(values, "description");
  const family = requireString(values, "family");
  const feedbackRound = requireString(values, "feedback-round");
  const sourcePath = requireString(values, "source");
  if (!artifactId || !title || !description || !family || !feedbackRound || !sourcePath) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(artifactId)) {
    console.error(`[FAIL] artifact-id must be URL-safe: ${artifactId}`);
    process.exitCode = 1;
    return;
  }

  const stageValue = String(values.stage || "draft").toLowerCase();
  const stage = STAGES[stageValue];
  if (!stage) {
    console.error(`[FAIL] --stage must be one of: ${Object.keys(STAGES).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const productTypeValue = String(values["product-type"] || "vertical-project").toLowerCase();
  const productType = PRODUCT_TYPES[productTypeValue];
  if (!productType) {
    console.error(`[FAIL] --product-type must be one of: ${Object.keys(PRODUCT_TYPES).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const generationClass = values["generation-class"] || productType.generation_class;
  const reviewScope = values["review-scope"] || productType.review_scope;
  const dryRun = values["dry-run"] === true;

  const source = resolve(sourcePath);
  const sourceExt = extname(source).toLowerCase();
  if (![".md", ".markdown"].includes(sourceExt)) {
    console.error(`[FAIL] --source must be plan markdown: ${sourceExt}`);
    process.exitCode = 1;
    return;
  }
  let sourceBytes;
  try {
    sourceBytes = await stat(source);
  } catch {
    console.error(`[FAIL] source not found: ${source}`);
    process.exitCode = 1;
    return;
  }
  if (!sourceBytes.isFile()) {
    console.error(`[FAIL] source is not a file: ${source}`);
    process.exitCode = 1;
    return;
  }
  const sourceData = await readFile(source);
  if (sourceData.length > MAXIMUM_DOCUMENT_BYTES) {
    console.error(
      `[FAIL] source is ${sourceData.length} bytes; site policy caps published ` +
        `documents at ${MAXIMUM_DOCUMENT_BYTES} bytes (16 MiB)`
    );
    process.exitCode = 1;
    return;
  }

  const present = detectContent(sourceData.toString("utf8"));
  const missing = missingContent(present, stage);
  if (missing.length) {
    console.error(
      `[FAIL] ${stage} plan is missing required content: ${missing.join(", ")}`
    );
    process.exitCode = 1;
    return;
  }

  let pdf = null;
  if (values.pdf) {
    const pdfPath = resolve(values.pdf);
    let pdfStat;
    try {
      pdfStat = await stat(pdfPath);
    } catch {
      console.error(`[FAIL] pdf not found: ${pdfPath}`);
      process.exitCode = 1;
      return;
    }
    if (!pdfStat.isFile() || extname(pdfPath).toLowerCase() !== ".pdf") {
      console.error(`[FAIL] --pdf must be a file with .pdf extension: ${pdfPath}`);
      process.exitCode = 1;
      return;
    }
    const pdfData = await readFile(pdfPath);
    if (pdfData.length > MAXIMUM_DOCUMENT_BYTES) {
      console.error(`[FAIL] pdf is ${pdfData.length} bytes; document budget is ${MAXIMUM_DOCUMENT_BYTES} bytes`);
      process.exitCode = 1;
      return;
    }
    pdf = { data: pdfData, path: pdfPath, sha256: sha256(pdfData), bytes: pdfData.length };
  }

  let suppliedChecks = null;
  if (values.checks) {
    try {
      suppliedChecks = JSON.parse(await readFile(resolve(values.checks), "utf8"));
    } catch (error) {
      console.error(`[FAIL] --checks JSON cannot be read: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  }
  if (stage === "PLAN-FORMAL" && pdf && !(suppliedChecks?.house_style_checks?.special_topics === "PASS")) {
    console.error(
      "[FAIL] PLAN-FORMAL with a PDF variant requires --checks with house_style_checks.special_topics == PASS"
    );
    process.exitCode = 1;
    return;
  }

  const sourceProvenance = values["source-path"] || sourcePath;
  const sourceHash = sha256(sourceData);
  const publishedBase = `review/media/${family}/${artifactId}`;
  const publishedPath = `${publishedBase}.md`;
  const publishedPdfPath = pdf ? `${publishedBase}.pdf` : null;
  const planContract = {
    schema_version: "izzi-plan-vertical-contract-v1",
    stage,
    required_content: present,
    ...(suppliedChecks?.house_style_checks
      ? { house_style_checks: suppliedChecks.house_style_checks }
      : {}),
    validated_at: new Date().toISOString()
  };

  const reviewId = artifactId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const existing = catalog.items.find((item) => item.artifact_id === artifactId);
  const item = {
    artifact_id: artifactId,
    title,
    description,
    alt: values.alt || description,
    family,
    generation_class: generationClass,
    product_type: productTypeValue,
    feedback_round: feedbackRound,
    media_kind: "plan",
    review_scope: reviewScope,
    review_mode: "output",
    source_path: sourceProvenance,
    source_sha256: sourceHash,
    published_path: publishedPath,
    sha256: sourceHash,
    bytes: sourceData.length,
    format: "markdown",
    plan_stage: stage,
    plan_pdf: publishedPdfPath
      ? { path: publishedPdfPath, sha256: pdf.sha256, bytes: pdf.bytes }
      : null,
    plan_contract: planContract,
    technical_state: `${stage}-PUBLISHED`,
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "planning",
    added_at: new Date().toISOString()
  };

  const reviewUrl = `https://situationshipin.space/review/${reviewId}/`;
  const plan = {
    artifact_id: artifactId,
    title,
    family,
    generation_class: generationClass,
    product_type: productTypeValue,
    review_scope: reviewScope,
    plan_stage: stage,
    source: sourceProvenance,
    published_path: publishedPath,
    bytes: item.bytes,
    source_sha256: sourceHash,
    plan_pdf: item.plan_pdf,
    plan_contract: planContract,
    review_url: reviewUrl,
    action: existing ? "UPDATE" : "ADD"
  };
  if (dryRun) {
    console.log("[DRY-RUN] approval accepted; no files were written");
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (!existing) {
    catalog.items.push(item);
  } else {
    Object.assign(existing, item);
  }
  catalog.items.sort((left, right) =>
    String(right.added_at || "").localeCompare(String(left.added_at || ""))
  );
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  await mkdir(dirnameOf(join(repositoryRoot, publishedPath)), { recursive: true });
  await copyFile(source, join(repositoryRoot, publishedPath));
  if (pdf) {
    await copyFile(pdf.path, join(repositoryRoot, publishedPdfPath));
  }

  const reviewDirectory = join(repositoryRoot, "review", reviewId);
  await mkdir(reviewDirectory, { recursive: true });
  await writeFile(join(reviewDirectory, "index.html"), renderReviewPage(item), "utf8");
  await writeFile(join(reviewDirectory, "manifest.json"), renderReviewManifest(item), "utf8");

  console.log("[INFO] refreshing build receipt and running the validator");
  const receiptOk = runNode(join(repositoryRoot, "scripts/update-build-manifest.mjs"));
  const validatorOk = runNode(join(repositoryRoot, "scripts/check-review-site.mjs"));
  if (!receiptOk || !validatorOk) {
    console.error("[FAIL] publish produced an invalid review portal state; fix and retry");
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ status: "PUBLISHED", ...plan }, null, 2));
}

function dirnameOf(path) {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "." : path.slice(0, separator);
}

await main();
