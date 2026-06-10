import { hasDatabase, query } from "@/lib/db";
import { checkUpstreamHealth, toPublicUpstreamHealth } from "@/lib/upstream";

export default async function handler(req, res) {
  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let database = "disabled";

  if (hasDatabase()) {
    try {
      await query("SELECT 1");
      database = "ok";
    } catch {
      database = "error";
    }
  }

  const upstream = await checkUpstreamHealth({ timeoutMs: 4000 });

  const ok = database !== "error" && upstream.ok;

  return res.status(ok ? 200 : 500).json({
    ok,
    service: "flowapi",
    database,
    upstream: upstream.ok ? "ok" : "error",
    deploy: {
      shortCommit: process.env.FLOWAPI_DEPLOY_COMMIT?.slice(0, 12) || "",
    },
    modelService: toPublicUpstreamHealth(upstream).modelService,
    time: new Date().toISOString(),
  });
}
