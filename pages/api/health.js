import { hasDatabase, query } from "@/lib/db";
import { checkUpstreamHealth } from "@/lib/upstream";

export default async function handler(req, res) {
  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requireDatabase = process.env.FLOWAPI_REQUIRE_DATABASE === "true" || process.env.NODE_ENV === "production";
  let database = "disabled";

  if (hasDatabase()) {
    try {
      await query("SELECT 1");
      database = "ok";
    } catch {
      database = "error";
    }
  } else if (requireDatabase) {
    database = "required_missing";
  }

  const upstream = await checkUpstreamHealth({ timeoutMs: 4000 });

  const ok = database === "ok" || (!requireDatabase && database === "disabled")
    ? upstream.ok
    : false;

  return res.status(ok ? 200 : 500).json({
    ok,
    service: "flowapi",
    database,
    upstream,
    time: new Date().toISOString(),
  });
}
