import { PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function normalizeKey(relKey: string) { return relKey.replace(/^\/+/, ""); }
function appendHashSuffix(relKey: string) { const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8); const lastDot = relKey.lastIndexOf("."); return lastDot === -1 ? `${relKey}_${hash}` : `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`; }
function hasR2() { return Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME); }
function r2Client() { return new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } }); }

function assertStorageConfig() {
  if (!hasR2()) {
    throw new Error("Storage config missing. Add Cloudflare R2 credentials (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME) before enabling uploads.");
  }
}

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream") {
  assertStorageConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  await r2Client().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: data, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
  const base = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return { key, url: base ? `${base}/${key}` : key };
}

export async function storageGet(relKey: string) {
  const key = normalizeKey(relKey);
  const base = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return { key, url: hasR2() && base ? `${base}/${key}` : `/${key}` };
}

export async function storageGetSignedUrl(relKey: string) {
  assertStorageConfig();
  const key = normalizeKey(relKey);
  return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }), { expiresIn: 3600 });
}
