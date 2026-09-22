import { NextResponse } from "next/server";
import { Readable } from "stream";
import { apiHandler } from "@/lib/rbac";
import { getImageStream } from "@/lib/storage";

/** Public image read — profile/trainer photos are shown throughout the app
 *  to any authenticated member/staff, same visibility as an Announcement
 *  image, so this needs no auth check of its own. */
export const GET = apiHandler(async (_req: Request, ctx: { params: Promise<{ key: string[] }> }) => {
  const { key } = await ctx.params;
  const { stream, contentType } = await getImageStream(key.join("/"));
  return new NextResponse(Readable.toWeb(stream as Readable) as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
