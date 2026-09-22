import { randomUUID } from "crypto";
import { Client as MinioClient } from "minio";
import { ApiError } from "./errors";

let client: MinioClient | null = null;
let bucketReady: Promise<void> | null = null;

function getClient(): MinioClient {
  if (!client) {
    client = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT ?? "minio",
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: false, // internal traffic only — MinIO is never exposed directly
      accessKey: process.env.MINIO_ROOT_USER ?? "corestudio",
      secretKey: process.env.MINIO_ROOT_PASSWORD ?? "",
    });
  }
  return client;
}

function bucketName(): string {
  return process.env.MINIO_BUCKET ?? "corestudio-media";
}

/** Creates the bucket on first use. Kept private (no public-read policy) —
 *  all reads go through GET /api/media/[...key], which streams from here. */
async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const c = getClient();
      const bucket = bucketName();
      if (!(await c.bucketExists(bucket))) {
        await c.makeBucket(bucket);
      }
    })();
  }
  return bucketReady;
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/;

/** Decodes a `data:image/...;base64,...` URL (as produced by the admin
 *  ImagePicker's canvas resize, or an equivalent client-side resize on
 *  mobile) and uploads it to object storage. Returns the relative path to
 *  fetch it back from (GET /api/media/<key>) — store this in photoUrl. */
export async function uploadDataUrlImage(dataUrl: string, keyPrefix: string): Promise<string> {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) throw new ApiError(400, "Expected a base64 image data URL (jpeg/png/webp/gif)");
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 8 * 1024 * 1024) throw new ApiError(400, "Image is too large (max 8MB)");

  const ext = contentType.split("/")[1];
  const key = `${keyPrefix}/${randomUUID()}.${ext}`;

  await ensureBucket();
  await getClient().putObject(bucketName(), key, buffer, buffer.length, { "Content-Type": contentType });
  return `/api/media/${key}`;
}

/** Streams an object back out for GET /api/media/[...key]. Throws ApiError(404) if missing. */
export async function getImageStream(key: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
  await ensureBucket();
  const c = getClient();
  const bucket = bucketName();
  try {
    const stat = await c.statObject(bucket, key);
    const stream = await c.getObject(bucket, key);
    return { stream, contentType: stat.metaData["content-type"] ?? "application/octet-stream" };
  } catch {
    throw new ApiError(404, "Image not found");
  }
}
