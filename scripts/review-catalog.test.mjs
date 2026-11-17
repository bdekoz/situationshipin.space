import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const script = readFileSync(new URL("../assets/js/review.js", import.meta.url), "utf8");
const catalog = JSON.parse(readFileSync(new URL("../data/review-items.json", import.meta.url), "utf8"));

function browserLogic() {
  const context = vm.createContext({
    document: { addEventListener() {}, body: { dataset: {} } }
  });
  vm.runInContext(script, context);
  return context;
}

test("the complete published catalog passes the browser's validator", () => {
  browserLogic().validateCatalog(catalog);
});

test("audio-only entries need no invented image dimensions", () => {
  const audio = catalog.items.find(item => item.media_kind === "audio");
  assert.ok(audio, "exercise a real published audio entry");
  const item = { ...audio };
  delete item.width;
  delete item.height;
  browserLogic().validateCatalog({ ...catalog, items: [item] });
});

test("visual entries still require dimensions and every item requires identity", () => {
  const image = catalog.items.find(item => item.width && item.height && !["plan", "index", "audio"].includes(item.media_kind));
  const item = { ...image };
  delete item.width;
  assert.throws(() => browserLogic().validateCatalog({ ...catalog, items: [item] }), /width/);
  const audio = { ...catalog.items.find(item => item.media_kind === "audio") };
  delete audio.sha256;
  assert.throws(() => browserLogic().validateCatalog({ ...catalog, items: [audio] }), /sha256/);
});

test("duplicate identities remain a catalog error", () => {
  assert.throws(() => browserLogic().validateCatalog({ ...catalog, items: [catalog.items[0], catalog.items[0]] }), /Duplicate artifact ID/);
});

test("audio and direct video previews never load media files into image elements", () => {
  const context = browserLogic();
  vm.runInContext("elements.latestReview = {};", context);
  for (const item of catalog.items.filter(item => /\.(mp3|mp4)$/i.test(item.published_path))) {
    const affordance = context.mediaAffordance(item);
    assert.ok(affordance, item.artifact_id);
    context.renderLatestReview([item]);
    const html = vm.runInContext("elements.latestReview.innerHTML", context);
    assert.doesNotMatch(html, /<img\b/, item.artifact_id);
    assert.match(html, /\/review\//);
  }
  assert.equal(context.mediaAffordance({ media_kind: "video", published_path: "review/filmstrip.png" }), null);
});

test("earlier plans remain available through the archive control", () => {
  const context = browserLogic();
  context.fixture = catalog;
  vm.runInContext("state.catalog = fixture; state.category = 'planning'; elements.showArchived = {checked: false};", context);
  assert.ok(context.categoryItems().every(item => item.generation_state !== "STALE"));
  vm.runInContext("elements.showArchived.checked = true", context);
  assert.equal(context.categoryItems().length, catalog.items.filter(item => item.review_category === "planning").length);
});

test("an exact artifact ID from a review link finds the published audio", () => {
  const context = browserLogic();
  const audio = catalog.items.find(item => item.media_kind === "audio");
  context.fixture = catalog;
  context.query = audio.artifact_id;
  vm.runInContext(`
    state.catalog = fixture; state.category = 'proofs';
    elements.searchFilter = {value: query};
    elements.familyFilter = elements.classFilter = elements.decisionFilter = {value: 'all'};
  `, context);
  assert.deepEqual(Array.from(context.filteredItems(), item => item.artifact_id), [audio.artifact_id]);
});
