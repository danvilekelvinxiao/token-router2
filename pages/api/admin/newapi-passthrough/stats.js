import { requireAdmin } from "@/lib/admin-auth";
import { getPassthroughStats } from "@/lib/new-api/passthrough";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const stats = await getPassthroughStats();
    return res.status(200).json({ success: true, stats });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
