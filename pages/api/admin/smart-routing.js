import { simulateRoute, clearHealthCache, makeRoutingDecision } from "@/lib/smart-router";
import { ensureAdminSchema } from "@/lib/admin-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
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
