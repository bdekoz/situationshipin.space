// Publishing an existing artifact for review is distinct from accepting its
// creative result or authorizing more production. Grants bind exact media.
export function hasReviewPublicationApproval(item) {
  const grant = item.review_publication;
  return Boolean(grant
    && grant.decision === "APPROVED"
    && grant.scope === "EXISTING-ARTIFACT-REVIEW"
    && grant.authority === "Explicit project-owner request"
    && typeof grant.instruction === "string" && grant.instruction.trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(grant.approved_on || "")
    && grant.artifact_id === item.artifact_id
    && /^[0-9a-f]{64}$/.test(grant.source_sha256 || "")
    && grant.source_sha256 === item.source_media?.sha256
    && /^[0-9a-f]{64}$/.test(grant.proxy_sha256 || "")
    && grant.proxy_sha256 === item.sha256
    && grant.creative_acceptance === false
    && grant.further_production_authorized === false);
}
