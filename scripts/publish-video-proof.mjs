#!/usr/bin/env node
// Publish a bounded video review proxy to the situationshipin.space portal.
//
// One command replaces the manual pipeline (render proxy, copy into the
// review tree, catalog entry, review page + manifest, receipt, validator).
// Nothing is published without explicit project approval:
//
//   node scripts/publish-video-proof.mjs \
//     --approve PROJECT-APPROVED \
//     --source /home/bkoz/src/izzi/outputs/.../cut-v1.review.mp4 \
//     --source-path outputs/review/feedback/visual/.../cut-v1.review.mp4 \
//     --artifact-id hlt-episode-01-cut-v1 \
//     --title "Here Lies Trouble — Episode 1 — cut v1" \
//     --description "..." \
//     --family here-lies-trouble \
//     --generation-class episode-master \
//     --feedback-round neon-addict-stage-01-v2 \
//     --review-scope EPISODE-01-MASTER
//
// An .mkv source can be converted automatically with --render-proxy
// (requires ffmpeg). Use --dry-run to print the plan without writing.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const MAXIMUM_PROXY_BYTES = 16 * 1024 * 1024;
const APPROVAL_TOKEN = "PROJECT-APPROVED";
const DEFAULT_PROXY_WIDTH = 360;
const DEFAULT_PROXY_HEIGHT = 640;

function usage() {
  return [
    "usage: node scripts/publish-video-proof.mjs [options]",
    "",
    "required:",
    "  --approve PROJECT-APPROVED   explicit project-approval gate",
    "  --source <path>              .mp4 proxy, or .mkv with --render-proxy",
    "  --artifact-id <id>           stable catalog id",
    "  --title <title>              review page title",
    "  --description <text>         what to review",
    "  --family <family>            e.g. here-lies-trouble",
    "  --generation-class <class>   e.g. episode-master",
    "  --feedback-round <round>     e.g. neon-addict-stage-01-v2",
    "  --review-scope <scope>       e.g. EPISODE-01-MASTER",
    "",
    "optional:",
    "  --source-path <izzi path>    canonical source for provenance",
    "  --alt <text>                 image/video alt text (defaults to description)",
    "  --technical-state <state>    technical_state label",
    "  --render-proxy               render a 360x640 proxy from an .mkv via ffmpeg",
    "  --proxy-width / --proxy-height   proxy target for --render-proxy",
    "  --width / --height / --duration  override ffprobe metadata",
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

function probe(path, key) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", key === "duration" ? "v:0" : "v:0",
      "-show_entries", key === "duration" ? "format=duration" : "stream=width,height",
      "-of", "csv=p=0",
      path,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    return null;
  }
  const line = result.stdout.trim();
  if (key === "duration") {
    const value = Number(line);
    return Number.isFinite(value) ? value : null;
  }
  const [width, height] = line.split(",").map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return { width, height };
}

async function renderProxy(source, destination, width, height) {
  console.log(`[INFO] rendering proxy ${width}x${height} with ffmpeg`);
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i", source,
      "-vf",
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,`
        + `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-shortest",
      destination,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    console.error(`[FAIL] ffmpeg proxy render failed:\n${result.stderr}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    stdio: "inherit",
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
  const generationClass = requireString(values, "generation-class");
  const feedbackRound = requireString(values, "feedback-round");
  const reviewScope = requireString(values, "review-scope");
  const sourcePath = requireString(values, "source");
  if (
    !artifactId || !title || !description || !family || !generationClass
    || !feedbackRound || !reviewScope || !sourcePath
  ) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(artifactId)) {
    console.error(`[FAIL] artifact-id must be URL-safe: ${artifactId}`);
    process.exitCode = 1;
    return;
  }

  const source = resolve(sourcePath);
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

  const extension = extname(source).toLowerCase();
  const dryRun = values["dry-run"] === true;
  const render = extension === ".mkv";
  if (render && values["render-proxy"] !== true) {
    console.error(
      "[FAIL] --source is an .mkv; pass --render-proxy to render a bounded proxy"
    );
    process.exitCode = 1;
    return;
  }
  if (!render && extension !== ".mp4") {
    console.error(`[FAIL] --source must be .mp4 (or .mkv with --render-proxy): ${extension}`);
    process.exitCode = 1;
    return;
  }

  let proxyPath = source;
  let width = Number(values.width || 0);
  let height = Number(values.height || 0);
  let duration = Number(values.duration || 0);
  const metadata = render ? null : probe(source, "video");
  if (render) {
    width = Number(values["proxy-width"] || DEFAULT_PROXY_WIDTH);
    height = Number(values["proxy-height"] || DEFAULT_PROXY_HEIGHT);
    if (!dryRun) {
      proxyPath = join(tmpdir(), `${artifactId}.review.mp4`);
      if (!(await renderProxy(source, proxyPath, width, height))) {
        return;
      }
    }
  } else {
    if (!width || !height) {
      if (metadata) {
        width = metadata.width;
        height = metadata.height;
      } else {
        console.error("[FAIL] could not probe dimensions; pass --width/--height");
        process.exitCode = 1;
        return;
      }
    }
  }
  if (!duration) {
    const probedDuration = probe(proxyPath, "duration");
    if (probedDuration) {
      duration = probedDuration;
    } else {
      console.error("[FAIL] could not probe duration; pass --duration");
      process.exitCode = 1;
      return;
    }
  }

  const proxyBytes = dryRun && !render ? sourceBytes.size : dryRun ? null : (await stat(proxyPath)).size;
  if (proxyBytes !== null && proxyBytes > MAXIMUM_PROXY_BYTES) {
    console.error(
      `[FAIL] proxy is ${proxyBytes} bytes; site policy caps published `
        + `proxies at ${MAXIMUM_PROXY_BYTES} bytes (16 MiB)`
    );
    process.exitCode = 1;
    return;
  }
  const proxyHash = dryRun ? "" : sha256(await readFile(proxyPath));
  const publishedPath = `review/media/${family}/${artifactId}.review.mp4`;
  const reviewId = artifactId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const existing = catalog.items.find((item) => item.artifact_id === artifactId);
  const sourceProvenance = values["source-path"] || sourcePath;
  const item = {
    artifact_id: artifactId,
    title,
    description,
    alt: values.alt || description,
    family,
    generation_class: generationClass,
    feedback_round: feedbackRound,
    media_kind: "video",
    review_scope: reviewScope,
    review_mode: "output",
    source_path: sourceProvenance,
    published_path: publishedPath,
    sha256: proxyHash,
    bytes: proxyBytes ?? 0,
    width,
    height,
    duration_seconds: duration,
    technical_state:
      values["technical-state"]
      || (render
        ? "BROWSER-PROXY-RENDERED-FROM-CANONICAL-MKV"
        : "REVIEW-PROXY"),
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "proofs",
    added_at: new Date().toISOString(),
    ...(existing ? { frames: existing.frames } : {}),
  };

  const reviewUrl = `https://situationshipin.space/review/${reviewId}/`;
  const plan = {
    artifact_id: artifactId,
    title,
    family,
    generation_class: generationClass,
    review_scope: reviewScope,
    source: sourceProvenance,
    published_path: publishedPath,
    bytes: proxyBytes,
    dimensions: `${width}x${height}`,
    duration_seconds: duration,
    review_url: reviewUrl,
    action: existing ? "UPDATE" : "ADD",
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

  const proxyDestination = join(repositoryRoot, publishedPath);
  await mkdir(dirnameOf(proxyDestination), { recursive: true });
  await copyFile(proxyPath, proxyDestination);

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
