import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

function normalizeKey(relKey: string) { return relKey.replace(/^\/+/, ""); }
function appendHashSuffix(relKey: string) { const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8); const lastDot = relKey.lastIndexOf("."); return lastDot === -1 ? `${relKey}_${hash}` : `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`; }
function hasR2() { return Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME); }
function r2Client() { return new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } }); }

async function builtInStoragePut(key: string, data: Buffer | Uint8Array | string, contentType: string) {
  const forgeUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) throw new Error("Storage config missing. Add Cloudflare R2 credentials before enabling uploads.");
  const presignUrl = new URL("v1/storage/presign/put", `${forgeUrl}/`);
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!presignResp.ok) throw new Error(`Storage presign failed (${presignResp.status})`);
  const { url } = await presignResp.json() as { url: string };
  const body = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as any], { type: contentType });
  const uploadResp = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body });
  if (!uploadResp.ok) throw new Error(`Storage upload failed (${uploadResp.status})`);
  return { key, url: `/manus-storage/${key}` };
}

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream") {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (hasR2()) {
    await r2Client().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: data, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
    const base = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    return { key, url: base ? `${base}/${key}` : key };
  }
  return builtInStoragePut(key, data, contentType);
}

export async function storageGet(relKey: string) {
  const key = normalizeKey(relKey);
  const base = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return { key, url: hasR2() && base ? `${base}/${key}` : `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string) {
  const key = normalizeKey(relKey);
  if (hasR2()) return getSignedUrl(r2Client(), new (await import("@aws-sdk/client-s3")).GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }), { expiresIn: 3600 });
  const forgeUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) throw new Error("Storage config missing");
  const url = new URL("v1/storage/presign/get", `${forgeUrl}/`);
  url.searchParams.set("path", key);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!response.ok) throw new Error(`Storage signed URL failed (${response.status})`);
  return (await response.json() as { url: string }).url;
}
