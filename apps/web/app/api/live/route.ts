import { connection } from "next/server";
import { scrapeApi } from "@/lib/metrics/scrape";

export async function GET(request: Request) {
  await connection();
  try {
    const payload = await scrapeApi(process.env.THROTTLEFORGE_API_ORIGIN, request.url);
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live scrape failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
