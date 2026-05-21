import { listRoutingRules, saveRoutingRule, deleteRoutingRule, ensureAdminSchema } from "@/lib/admin-store";

function checkAdmin(req) {
  const expected = process.env.ADMIN_SECRET || "";
  const provided = req.headers["x-admin-secret"] || req.query?.secret || req.body?.secret;
  return expected && provided === expected;
}

export default async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  await ensureAdminSchema();

  if (req.method === "GET") {
    const rules = await listRoutingRules();
    return res.status(200).json({ rules });
  }

  if (req.method === "POST") {
    const rule = await saveRoutingRule(req.body);
    return res.status(200).json({ ok: true, rule });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing id" });
    await deleteRoutingRule(id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
