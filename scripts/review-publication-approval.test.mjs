import { test } from "node:test";
import assert from "node:assert/strict";
import { hasReviewPublicationApproval } from "./review-publication-approval.mjs";

const source = "a".repeat(64), proxy = "b".repeat(64);
function fixture() {
  return {
    artifact_id: "existing-video", sha256: proxy, source_media: { sha256: source },
    review_publication: {
      decision: "APPROVED", scope: "EXISTING-ARTIFACT-REVIEW", approved_on: "2026-10-27",
      authority: "Explicit project-owner request", instruction: "Publish this video for review",
      artifact_id: "existing-video", source_sha256: source, proxy_sha256: proxy,
      creative_acceptance: false, further_production_authorized: false
    }
  };
}
test("an explicit grant covers only the exact existing review artifact", () => {
  assert.equal(hasReviewPublicationApproval(fixture()), true);
  for (const change of [
    item => { item.artifact_id = "another-video"; },
    item => { item.sha256 = "c".repeat(64); },
    item => { item.source_media.sha256 = "d".repeat(64); },
    item => { delete item.review_publication; },
    item => { item.review_publication.instruction = ""; },
    item => { item.review_publication.decision = "PENDING"; },
    item => { item.review_publication.scope = "FUTURE-PRODUCTION"; },
    item => { item.review_publication.creative_acceptance = true; },
    item => { item.review_publication.further_production_authorized = true; }
  ]) {
    const item = fixture(); change(item);
    assert.equal(hasReviewPublicationApproval(item), false);
  }
});
