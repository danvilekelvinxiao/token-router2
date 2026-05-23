import { requireAdmin } from "@/lib/admin-auth";
import { getPassthroughLogs } from "@/lib/new-api/passthrough";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const logs = await getPassthroughLogs(50);
    return res.status(200).json({ success: true, logs });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
