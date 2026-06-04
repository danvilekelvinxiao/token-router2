import { requireAdmin } from "@/lib/admin-auth";
import { runLogIntegrityTest } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({ ok: true, run: await runLogIntegrityTest(admin.id) });
}
