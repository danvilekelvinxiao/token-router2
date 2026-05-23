import { getSettings, saveSettings, ensureAdminSchema } from "@/lib/admin-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  await ensureAdminSchema();

  if (req.method === "GET") {
    const settings = await getSettings();
    return res.status(200).json({ settings });
  }

  if (req.method === "POST") {
    const settings = await saveSettings(req.body);
    return res.status(200).json({ ok: true, settings });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
