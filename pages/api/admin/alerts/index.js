import { requireAdmin } from "@/lib/admin-auth";
import { listAlertEvents, sendOpenAlertEmails } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method === "POST") {
    return res.status(200).json({ ok: true, result: await sendOpenAlertEmails(admin.id) });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({ ok: true, alerts: await listAlertEvents({ status: String(req.query.status || "open"), limit: Number(req.query.limit || 100) }) });
}
