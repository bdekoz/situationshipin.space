import test from "node:test";
import assert from "node:assert/strict";
import { mediaUrl, validateExternalMedia, validateReleaseReceipt } from "./review-media.mjs";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";
import { hasReviewPublicationApproval } from "./review-publication-approval.mjs";

const hash = "a".repeat(64);
const item = {
  artifact_id: "full-film", title: "Full film", media_kind: "video", format: "mp4",
  published_path: "https://github.com/bdekoz/situationshipin.space/releases/download/full-film-1/review.mp4",
  sha256: hash, bytes: 100000000, width: 720, height: 1280, duration_seconds: 3155.375,
  source_media: {sha256: "b".repeat(64), published:false},
  external_media: {provider:"github-release", release_tag:"full-film-1", asset_id:123, receipt_path:"review/media/full-film/release.json"},
  review_assets: [{path:"review/media/full-film/release.json"}],
  caption_track:"review/media/full-film/captions.vtt",
};
const receipt = {
  schema_version:"situationship-release-video-1", url:item.published_path,
  sha256:hash, bytes:item.bytes, asset_id:123, release_tag:"full-film-1",
  source_sha256:item.source_media.sha256, github_digest:`sha256:${hash}`,
};
test("release-hosted video preserves its absolute playback URL and captions", () => {
  assert.equal(mediaUrl(item), item.published_path);
  const html = renderReviewPage(item);
  assert.ok(html.includes(`src="${item.published_path}"`));
  assert.ok(html.includes(`<track kind="subtitles"`));
  assert.equal(JSON.parse(renderReviewManifest(item)).proxy.path,item.published_path);
  assert.equal(mediaUrl({published_path:"review/local.mp4"}),"/review/local.mp4");
});
test("external playback is limited to identified video assets in this repository", () => {
  for (const published_path of ["https://example.com/a.mp4",item.published_path+"?redirect=1",item.published_path.replace("full-film-1","other-tag")]) {
    assert.throws(()=>validateExternalMedia({...item,published_path}));
  }
  assert.throws(()=>validateExternalMedia({...item,bytes:2*1024**3}));
  assert.throws(()=>validateExternalMedia({...item,review_assets:[]}));
});
test("the saved release receipt binds source, remote digest and catalog identity", () => {
  validateReleaseReceipt(item,receipt);
  for (const key of ["sha256","source_sha256","github_digest","url","bytes","asset_id"]) {
    assert.throws(()=>validateReleaseReceipt(item,{...receipt,[key]:null}));
  }
});
test("external publication still requires the existing exact-media approval", () => {
  assert.equal(hasReviewPublicationApproval(item),false);
  const approved = {...item,review_publication:{
    decision:"APPROVED",scope:"EXISTING-ARTIFACT-REVIEW",authority:"Explicit project-owner request",
    instruction:"Publish this complete film for review",approved_on:"2026-11-17",artifact_id:item.artifact_id,
    source_sha256:item.source_media.sha256,proxy_sha256:item.sha256,creative_acceptance:false,further_production_authorized:false,
  }};
  assert.equal(hasReviewPublicationApproval(approved),true);
  assert.equal(hasReviewPublicationApproval({...approved,sha256:"c".repeat(64)}),false);
});
