import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { MANIFEST, inspectStaging, publishedPath, stageAsset, beginSubmission, attachTask, finishAsset, expirePrepared } from "./provider-staging.mjs";
import { changeStaging } from "./stage-provider-input.mjs";

const now = new Date("2026-10-27T12:00:00.000Z");
async function fixture(t) {
  const base = await mkdtemp(resolve(tmpdir(), "provider-staging-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const site = resolve(base, "site"), archiveRoot = resolve(base, "archive"), source = resolve(base, "frame.png");
  await mkdir(resolve(site, "data"), { recursive: true });
  await writeFile(resolve(site, MANIFEST), JSON.stringify({ schema_version: "izzi-provider-staging-1", assets: [] }) + "\n");
  await writeFile(resolve(site, "data/build-manifest.json"), "{}\n");
  await writeFile(source, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c5z8AAAAASUVORK5CYII=", "base64"));
  return { site, source, archiveRoot, options: { source, archiveRoot, id: "frame-1", owner: "test-project", purpose: "Continuity frame for job 1", jobId: "job-1", now } };
}

test("stage archives exact bytes and binds owner/job/hash; terminal completion removes only public copy", async t => {
  const { site, options, source, archiveRoot } = await fixture(t);
  const asset = await stageAsset(site, options);
  assert.deepEqual(await readFile(resolve(archiveRoot, asset.archive.key)), await readFile(source));
  assert.deepEqual((await inspectStaging(site, { now })).failures, []);
  assert.equal((await inspectStaging(site, { now })).bytes, asset.bytes);
  assert.equal((await stageAsset(site, options)).id, asset.id); // retry is idempotent
  await attachTask(site, { id: asset.id, taskId: "provider-task-1", now });
  await assert.rejects(attachTask(site, { id: asset.id, taskId: "different-task", now }), /another provider task/);
  await finishAsset(site, { id: asset.id, status: "completed", archiveRoot, now });
  await assert.rejects(readFile(resolve(site, asset.path)), { code: "ENOENT" });
  assert.deepEqual(await readFile(resolve(archiveRoot, asset.archive.key)), await readFile(source));
  assert.deepEqual((await inspectStaging(site, { now })).failures, []);
  assert.equal((await inspectStaging(site, { now })).bytes, 0);
  await assert.rejects(stageAsset(site, options), /retired staging record/);
});

test("modified media or metadata fails validation", async t => {
  const { site, options } = await fixture(t);
  const asset = await stageAsset(site, options);
  await writeFile(resolve(site, asset.path), "tampered");
  assert.match((await inspectStaging(site, { now })).failures.join(), /differs from its receipt/);
  await writeFile(resolve(site, asset.path), await readFile(options.source));
  const original = JSON.parse(await readFile(resolve(site, MANIFEST), "utf8"));
  for (const mutate of [a => a.owner = "", a => a.job.id = "", a => a.archive.sha256 = "0".repeat(64), a => a.expires_at = "invalid", a => a.job.status = "completed"]) {
    const changed = structuredClone(original);
    mutate(changed.assets[0]);
    await writeFile(resolve(site, MANIFEST), JSON.stringify(changed));
    assert.ok((await inspectStaging(site, { now })).failures.length);
  }
});

test("rejects source WAV, excessive lifetime/size, path escape and public archives", async t => {
  const { site, source, options } = await fixture(t);
  await assert.rejects(stageAsset(site, { ...options, ttlHours: 169 }), /168 hours/);
  const wav = source.replace(".png", ".wav");
  await writeFile(wav, "RIFF");
  await assert.rejects(stageAsset(site, { ...options, source: wav }), /WAV stays local/);
  await writeFile(source, Buffer.alloc(16 * 1024 * 1024 + 1));
  await assert.rejects(stageAsset(site, options), /16 MiB/);
  await writeFile(source, "frame");
  await assert.rejects(stageAsset(site, { ...options, archiveRoot: resolve(site, "archive") }), /outside the published site/);
  assert.throws(() => publishedPath(site, "review/provider-inputs/../other.png"), /stay under/);
});

test("cleanup refuses a missing/corrupt archive and leaves the public bytes intact", async t => {
  const { site, options, archiveRoot } = await fixture(t);
  const asset = await stageAsset(site, options);
  const before = await readFile(resolve(site, asset.path));
  await writeFile(resolve(archiveRoot, asset.archive.key), "corrupt");
  await assert.rejects(finishAsset(site, { id: asset.id, status: "completed", archiveRoot, now }), /retained/);
  assert.deepEqual(await readFile(resolve(site, asset.path)), before);
  await rm(resolve(archiveRoot, asset.archive.key));
  await assert.rejects(finishAsset(site, { id: asset.id, status: "completed", archiveRoot, now }), { code: "ENOENT" });
  assert.deepEqual(await readFile(resolve(site, asset.path)), before);
});

test("expiry removes unused inputs but preserves submitted jobs for explicit resolution", async t => {
  const { site, options, archiveRoot } = await fixture(t);
  const unused = await stageAsset(site, { ...options, ttlHours: 1 });
  const submitted = await stageAsset(site, { ...options, id: "frame-2", jobId: "job-2", ttlHours: 1 });
  await attachTask(site, { id: submitted.id, taskId: "remote-2", now });
  await assert.rejects(finishAsset(site, { id: unused.id, status: "expired-before-submission", archiveRoot, now }), /Only unused, expired/);
  const later = new Date(now.getTime() + 3600001);
  assert.equal((await inspectStaging(site, { now: later })).failures.length, 2);
  assert.deepEqual((await expirePrepared(site, { archiveRoot, now: later })).map(a => a.id), [unused.id]);
  assert.equal((await inspectStaging(site, { now: later })).failures.length, 1);
  assert.ok(await readFile(resolve(site, submitted.path)));
  await finishAsset(site, { id: submitted.id, status: "failed", archiveRoot, now: later });
  assert.deepEqual((await inspectStaging(site, { now: later })).failures, []);
});

test("site check failure rolls back staging, manifest and build manifest but preserves archive", async t => {
  const { site, options, archiveRoot } = await fixture(t);
  const original = await readFile(resolve(site, MANIFEST));
  await assert.rejects(changeStaging(site, "stage", options, async () => {
    await writeFile(resolve(site, "data/build-manifest.json"), "changed");
    throw new Error("artifact payload exceeds site budget");
  }), /site budget/);
  assert.deepEqual(await readFile(resolve(site, MANIFEST)), original);
  assert.equal(await readFile(resolve(site, "data/build-manifest.json"), "utf8"), "{}\n");
  assert.deepEqual(await readdir(resolve(site, "review/provider-inputs/test-project")), []);
  assert.equal((await readdir(resolve(archiveRoot, "objects"))).length, 1);
  const receipt = await changeStaging(site, "stage", options, async () => {});
  assert.ok(receipt.changed_paths.includes(receipt.assets[0].path));
  await assert.rejects(changeStaging(site, "finish", { id: options.id, status: "completed", archiveRoot, now }, async () => { throw new Error("check failed"); }), /check failed/);
  assert.ok(await readFile(resolve(site, receipt.assets[0].path)));
  assert.deepEqual((await inspectStaging(site, { now })).failures, []);
});

test("unknown submission outcome is protected from automatic expiry and keeps its retry key", async t => {
  const { site, options, archiveRoot } = await fixture(t);
  const asset = await stageAsset(site, { ...options, ttlHours: 1 });
  await beginSubmission(site, { id: asset.id, idempotencyKey: "stable-key", now });
  await beginSubmission(site, { id: asset.id, idempotencyKey: "stable-key", now });
  await assert.rejects(beginSubmission(site, { id: asset.id, idempotencyKey: "changed-key", now }), /cannot change/);
  assert.deepEqual((await inspectStaging(site, { now })).failures, []);
  const later = new Date(now.getTime() + 3600001);
  assert.deepEqual(await expirePrepared(site, { archiveRoot, now: later }), []);
  assert.ok(await readFile(resolve(site, asset.path)));
  await finishAsset(site, { id: asset.id, status: "completed", taskId: "recovered-task-id", archiveRoot, now: later });
  assert.deepEqual((await inspectStaging(site, { now: later })).failures, []);
});

test("staging and rollback never follow a symlink into another directory", async t => {
  const { site, options, archiveRoot } = await fixture(t);
  await mkdir(resolve(site, "review/provider-inputs"), { recursive: true });
  await mkdir(archiveRoot);
  await symlink(archiveRoot, resolve(site, "review/provider-inputs/test-project"));
  await assert.rejects(changeStaging(site, "stage", options, async () => {}), /Symlink/);
  assert.deepEqual(await readdir(archiveRoot), []);
});
