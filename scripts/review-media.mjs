// Release-hosted video keeps large review derivatives out of the Pages Git tree.
// Each catalog record still binds the exact source and proxy bytes.
export function validateExternalMedia(item) {
  if (!item.external_media) return false;
  const media = item.external_media;
  const url = new URL(item.published_path);
  if (media.provider !== "github-release" || item.media_kind !== "video"
      || url.origin !== "https://github.com" || url.search || url.hash || url.username || url.password
      || !/^\/bdekoz\/situationshipin\.space\/releases\/download\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.mp4$/.test(url.pathname)
      || url.pathname.split("/")[5] !== media.release_tag
      || !Number.isSafeInteger(media.asset_id) || media.asset_id <= 0
      || !/^[0-9a-f]{64}$/.test(item.sha256 || "")
      || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || item.bytes >= 2 * 1024 ** 3
      || !Number.isFinite(item.duration_seconds) || item.duration_seconds <= 0
      || !Number.isInteger(item.width) || item.width <= 0
      || !Number.isInteger(item.height) || item.height <= 0
      || !/^review\/media\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.json$/.test(media.receipt_path || "")
      || !(item.review_assets || []).some(asset => asset.path === media.receipt_path)) {
    throw new Error(`Invalid release-hosted video: ${item.artifact_id}`);
  }
  return true;
}

export function mediaUrl(item) {
  return validateExternalMedia(item) ? item.published_path : `/${item.published_path}`;
}

export function validateReleaseReceipt(item, receipt) {
  validateExternalMedia(item);
  if (receipt.schema_version !== "situationship-release-video-1"
      || receipt.url !== item.published_path || receipt.sha256 !== item.sha256
      || receipt.bytes !== item.bytes || receipt.asset_id !== item.external_media.asset_id
      || receipt.release_tag !== item.external_media.release_tag
      || receipt.source_sha256 !== item.source_media?.sha256
      || receipt.github_digest !== `sha256:${item.sha256}`) {
    throw new Error(`Release receipt does not match catalog: ${item.artifact_id}`);
  }
}
