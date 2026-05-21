import { simulateRoute, clearHealthCache, makeRoutingDecision } from "@/lib/smart-router";
import { ensureAdminSchema } from "@/lib/admin-store";

function checkAdmin(req) {
  const expected = process.env.ADMIN_SECRET || "";
  const provided = req.headers["x-admin-secret"] || req.query?.secret || req.body?.secret;
  return expected && provided === expected;
}

export default async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  await ensureAdminSchema();

  if (req.method === "GET") {
    const { prompt, model, strategy, preferLowCost } = req.query || {};
    const result = await simulateRoute(
      prompt || "",
      model || null
    );
    return res.status(200).json(result);
  }

  if (req.method === "POST") {
    const { action, data } = req.body || {};

    if (action === "simulate") {
      const result = await simulateRoute(
        data?.prompt || "",
        data?.model || null
      );
      return res.status(200).json(result);
    }

    if (action === "decision") {
      const result = await makeRoutingDecision({
        prompt: data?.prompt || "",
        modelId: data?.model || null,
        strategy: data?.strategy,
        preferLowCost: data?.preferLowCost || false,
      });
      return res.status(200).json(result);
    }

    if (action === "clearHealthCache") {
      clearHealthCache();
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
