import { requireAdmin } from "@/lib/admin-auth";
import { listRateLimitTestRuns } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  return res.status(200).json({ ok: true, runs: await listRateLimitTestRuns({ limit: Number(req.query.limit || 50) }) });
}
