import { requireAdmin } from "@/lib/admin-auth";
import { getPoolStatusSnapshot, refreshPoolStatus } from "@/lib/pool-status";

export const config = {
  api: {
    responseLimit: false,
  },
  maxDuration: 120,
};

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const forceRefresh = String(req.query.refresh || "") === "1";
      const data = forceRefresh
        ? await refreshPoolStatus({ runChecks: false, adminId: admin.customer?.id || admin.session?.customerId || "admin" })
        : await getPoolStatusSnapshot({ visibility: "admin" });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const runChecks = req.body?.runChecks !== false;
      const data = await refreshPoolStatus({ runChecks, adminId: admin.customer?.id || admin.session?.customerId || "admin" });
      return res.status(200).json({ ...data, refreshed: true, runChecks });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "号池状态读取失败" });
  }
}
