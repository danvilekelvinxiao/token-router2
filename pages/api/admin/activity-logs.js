import { listActivityLogs } from "@/lib/customer-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const result = await listActivityLogs({
    customerId: req.query?.customerId || "",
    category: req.query?.category || "",
    action: req.query?.action || "",
    limit: Math.min(Number(req.query?.limit) || 200, 500),
    offset: Number(req.query?.offset) || 0,
  });

  return res.status(200).json(result);
}
