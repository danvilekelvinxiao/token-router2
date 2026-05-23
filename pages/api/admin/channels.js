import { listChannels, saveChannel, deleteChannel, ensureAdminSchema } from "@/lib/admin-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  await ensureAdminSchema();

  if (req.method === "GET") {
    const channels = await listChannels();
    return res.status(200).json({ channels });
  }

  if (req.method === "POST") {
    const channel = await saveChannel(req.body);
    return res.status(200).json({ ok: true, channel });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing id" });
    await deleteChannel(id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
