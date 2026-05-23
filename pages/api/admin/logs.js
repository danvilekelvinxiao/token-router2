import { listCallRecords } from "@/lib/customer-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const filters = {
      customer: req.query?.user || "",
      model: req.query?.model || "",
      channel: req.query?.channel || "",
      status: req.query?.status || "",
      limit: Number(req.query?.limit || 200),
      offset: Number(req.query?.offset || 0),
    };
    const result = await listCallRecords(filters);
    return res.status(200).json(result);
  }

  res.setHeader("Allow", "GET");
  return res.status(405).json({ error: "Method not allowed" });
}
