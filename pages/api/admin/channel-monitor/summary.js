import { requireAdmin } from "@/lib/admin-auth";
import { fetchChannelMonitorSummary } from "@/lib/commercial-health";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });

  const result = await fetchChannelMonitorSummary({ timeoutMs: 6000 });
  return res.status(result.ok ? 200 : 502).json({
    success: result.ok,
    ...result,
  });
}
