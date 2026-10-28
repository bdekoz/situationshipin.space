import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, posix, relative, resolve, sep } from "node:path";

export const MANIFEST = "data/provider-staging.json";
export const PREFIX = "review/provider-inputs/";
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mp3"]);
const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const slug = /^[a-z0-9][a-z0-9-]{0,119}$/;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const within = (root, path) => path === root || path.startsWith(root + sep);
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const date = value => typeof value === "string" && /T.*Z$/.test(value) && Number.isFinite(Date.parse(value));

export function publishedPath(root, path) {
  if (typeof path !== "string" || !path.startsWith(PREFIX) || posix.normalize(path) !== path
      || !path.split("/").every(part => /^[a-zA-Z0-9._-]+$/.test(part) && part !== ".." && part !== ".")) {
    throw new Error("Provider input path must stay under review/provider-inputs");
  }
  return resolve(root, path);
}

export async function noSymlinks(root, path) {
  const parts = relative(root, path).split(sep);
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink is not a staging path: ${current}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export async function readManifest(root) {
  const manifest = JSON.parse(await readFile(resolve(root, MANIFEST), "utf8"));
  if (manifest.schema_version !== "izzi-provider-staging-1" || !Array.isArray(manifest.assets)) {
    throw new Error("Invalid provider staging manifest");
  }
  return manifest;
}

async function saveManifest(root, manifest) {
  const path = resolve(root, MANIFEST);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path + ".tmp", JSON.stringify(manifest, null, 2) + "\n");
  await rename(path + ".tmp", path);
}

export async function inspectStaging(root, { now = new Date() } = {}) {
  const manifestBytes = await readFile(resolve(root, MANIFEST));
  const manifest = await readManifest(root);
  const failures = [], paths = new Set(), ids = new Set(), activePaths = [];
  let bytes = 0;
  for (const asset of manifest.assets) {
    try {
      if (!slug.test(asset.id || "") || ids.has(asset.id)) throw new Error("Invalid or duplicate asset ID");
      ids.add(asset.id);
      const path = publishedPath(root, asset.path);
      if (paths.has(asset.path)) throw new Error("Duplicate staging path");
      paths.add(asset.path);
      await noSymlinks(root, path);
      if (!nonempty(asset.owner) || !nonempty(asset.purpose) || !nonempty(asset.job?.id)) {
        throw new Error("Owner, purpose and associated job are required");
      }
      if (!/^[0-9a-f]{64}$/.test(asset.sha256 || "") || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1
          || asset.archive?.sha256 !== asset.sha256 || asset.archive?.bytes !== asset.bytes
          || !nonempty(asset.archive?.key) || isAbsolute(asset.archive.key)
          || posix.normalize(asset.archive.key) !== asset.archive.key
          || !asset.archive.key.split("/").every(part => /^[a-zA-Z0-9._-]+$/.test(part) && part !== "." && part !== "..")) {
        throw new Error("Missing or inconsistent archive receipt");
      }
      if (!date(asset.created_at) || !date(asset.expires_at)) throw new Error("Creation and expiry dates are required");
      if (asset.state === "retired") {
        if (!date(asset.retired_at) || !nonempty(asset.retirement_reason)
            || !(TERMINAL.has(asset.job.status) || asset.job.status === "expired-before-submission")) {
          throw new Error("Retirement must record a terminal job and reason");
        }
        try { await lstat(path); throw new Error("Retired asset is still present in the public tree"); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        continue;
      }
      if (asset.state !== "active" || !["prepared", "submitting", "submitted"].includes(asset.job.status)) {
        throw new Error("Active staging requires a prepared, submitting or submitted job");
      }
      if (asset.job.status === "submitting" && !nonempty(asset.job.idempotency_key)) throw new Error("Submission intent lacks its idempotency key");
      if (asset.job.status === "submitted" && !nonempty(asset.job.provider_task_id)) throw new Error("Submitted job lacks its provider task ID");
      const created = Date.parse(asset.created_at), expires = Date.parse(asset.expires_at);
      if (expires <= now.getTime() || expires <= created || expires - created > MAX_LIFETIME_MS || created > now.getTime()) {
        throw new Error("Provider input expired or exceeds the seven-day staging lifetime");
      }
      if (!EXTENSIONS.has(extname(path).toLowerCase()) || asset.bytes > MAX_FILE_BYTES) {
        throw new Error("Disallowed staging format or file exceeds 16 MiB");
      }
      const stat = await lstat(path);
      if (!stat.isFile() || stat.size !== asset.bytes || hash(await readFile(path)) !== asset.sha256) {
        throw new Error("Provider input size or SHA-256 differs from its receipt");
      }
      bytes += asset.bytes;
      activePaths.push(asset.path);
    } catch (error) {
      failures.push(`${asset.id || "unknown"}: ${error.message}`);
    }
  }
  return { failures, activePaths, bytes, manifestSha256: hash(manifestBytes) };
}

async function archivePath(root, archiveRoot, key) {
  if (!archiveRoot) throw new Error("A local archive directory is required");
  await mkdir(archiveRoot, { recursive: true });
  const base = await realpath(archiveRoot), site = await realpath(root);
  const path = resolve(base, key);
  if (within(site, base) || !within(base, path) || path === base) throw new Error("Archive must be outside the published site");
  await noSymlinks(base, path);
  return path;
}

async function verifyArchive(root, archiveRoot, asset) {
  const path = await archivePath(root, archiveRoot, asset.archive.key);
  const bytes = await readFile(path);
  if (bytes.length !== asset.bytes || hash(bytes) !== asset.sha256) throw new Error("Archive copy is missing or changed; public input retained");
}

export async function stageAsset(root, { source, id, owner, purpose, jobId, archiveRoot, ttlHours = 24, now = new Date() }) {
  if (!slug.test(id || "") || !slug.test(owner || "") || !nonempty(purpose) || !nonempty(jobId)) {
    throw new Error("A safe asset ID, owner, purpose and job ID are required");
  }
  if (!(ttlHours > 0 && ttlHours <= 168)) throw new Error("Staging lifetime must be between zero and 168 hours");
  const extension = extname(source).toLowerCase();
  const stat = await lstat(source);
  if (!EXTENSIONS.has(extension) || !stat.isFile() || stat.size < 1 || stat.size > MAX_FILE_BYTES) {
    throw new Error("Staging accepts PNG, JPEG, WebP, MP4 or MP3 files up to 16 MiB; WAV stays local");
  }
  const bytes = await readFile(source), sha256 = hash(bytes);
  const manifest = await readManifest(root);
  const existing = manifest.assets.find(asset => asset.id === id);
  if (existing) {
    if (existing.state === "active" && existing.sha256 === sha256 && existing.owner === owner
        && existing.job.id === jobId && Date.parse(existing.expires_at) > now.getTime()) return existing;
    throw new Error("Asset ID already belongs to another or retired staging record; use a new ID");
  }
  const path = `${PREFIX}${owner}/${id}${extension}`;
  const target = publishedPath(root, path);
  await noSymlinks(root, target);
  try { await lstat(target); throw new Error("Refusing to overwrite an unregistered provider input"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const key = `objects/${sha256}${extension}`;
  const archived = await archivePath(root, archiveRoot, key);
  await mkdir(dirname(archived), { recursive: true });
  try { await writeFile(archived, bytes, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const asset = { id, owner, purpose, path, bytes: bytes.length, sha256,
    created_at: now.toISOString(), expires_at: new Date(now.getTime() + ttlHours * 3600000).toISOString(),
    state: "active", job: { id: jobId, status: "prepared" }, archive: { key, bytes: bytes.length, sha256 } };
  await verifyArchive(root, archiveRoot, asset);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  manifest.assets.push(asset);
  await saveManifest(root, manifest);
  return asset;
}

export async function beginSubmission(root, { id, idempotencyKey, now = new Date() }) {
  const manifest = await readManifest(root), asset = manifest.assets.find(a => a.id === id);
  if (!asset || asset.state !== "active" || !nonempty(idempotencyKey)
      || !["prepared", "submitting"].includes(asset.job.status) || Date.parse(asset.expires_at) <= now.getTime()) {
    throw new Error("A live unused asset and stable idempotency key are required before submission");
  }
  if (asset.job.idempotency_key && asset.job.idempotency_key !== idempotencyKey) throw new Error("Submission key cannot change on retry");
  asset.job.status = "submitting";
  asset.job.idempotency_key = idempotencyKey;
  await saveManifest(root, manifest);
  return asset;
}

export async function attachTask(root, { id, taskId, now = new Date() }) {
  const manifest = await readManifest(root), asset = manifest.assets.find(a => a.id === id);
  if (!asset || asset.state !== "active" || !nonempty(taskId) || Date.parse(asset.expires_at) <= now.getTime()) {
    throw new Error("A live staged asset and provider task ID are required");
  }
  if (asset.job.provider_task_id && asset.job.provider_task_id !== taskId) throw new Error("Asset is already assigned to another provider task");
  asset.job.status = "submitted";
  asset.job.provider_task_id = taskId;
  await saveManifest(root, manifest);
  return asset;
}

export async function finishAsset(root, { id, status, archiveRoot, taskId, reason, now = new Date() }) {
  if (!TERMINAL.has(status) && status !== "expired-before-submission") throw new Error("A terminal job status is required");
  const manifest = await readManifest(root), asset = manifest.assets.find(a => a.id === id);
  if (!asset) throw new Error("Unknown provider input");
  if (asset.state === "retired") return asset;
  if (taskId && asset.job.provider_task_id && taskId !== asset.job.provider_task_id) throw new Error("Provider task ID differs from staged job");
  if (status === "expired-before-submission"
      && (asset.job.status !== "prepared" || Date.parse(asset.expires_at) > now.getTime())) {
    throw new Error("Only unused, expired inputs can be expired automatically");
  }
  await verifyArchive(root, archiveRoot, asset);
  const target = publishedPath(root, asset.path);
  await noSymlinks(root, target);
  try {
    const bytes = await readFile(target);
    if (hash(bytes) !== asset.sha256) throw new Error("Public input changed; refusing to remove it");
    await unlink(target);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  asset.job.status = status;
  if (taskId) asset.job.provider_task_id = taskId;
  asset.state = "retired";
  asset.retired_at = now.toISOString();
  asset.retirement_reason = reason || `Provider job ${status}`;
  await saveManifest(root, manifest);
  return asset;
}

export async function expirePrepared(root, { archiveRoot, now = new Date() }) {
  const manifest = await readManifest(root), retired = [];
  for (const asset of manifest.assets) {
    if (asset.state === "active" && asset.job.status === "prepared" && Date.parse(asset.expires_at) <= now.getTime()) {
      retired.push(await finishAsset(root, { id: asset.id, status: "expired-before-submission", archiveRoot, now }));
    }
  }
  return retired;
}
