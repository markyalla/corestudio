import { NextResponse } from "next/server";
import crypto from "crypto";
import { runAllJobs } from "@/lib/cron-jobs";

/** Scheduled-job entry point. Call every 5 minutes:
 *  curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  const a = Buffer.from(auth ?? "");
  const b = Buffer.from(expected ?? "");
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAllJobs();
  console.log("[cron]", JSON.stringify(result));
  return NextResponse.json(result);
}
