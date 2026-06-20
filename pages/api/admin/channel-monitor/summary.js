import { requireAdmin } from "@/lib/admin-auth";
import { fetchChannelMonitorSummary } from "@/lib/commercial-health";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });

  const result = await fetchChannelMonitorSummary({ timeoutMs: 6000 });
  const status = result.ok ? 200 : (result.statusCode === 401 || result.statusCode === 403 ? result.statusCode : 502);
  return res.status(status).json({
    success: result.ok,
    ...result,
  });
}
