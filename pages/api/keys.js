import { createApiKey, getDashboard } from "@/lib/customer-store";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const customerId = req.body?.customerId;

  if (!customerId) {
    return res.status(400).json({ error: "Missing customerId" });
  }

  createApiKey(customerId, req.body?.label || "API Key");
  return res.status(200).json(getDashboard(customerId));
}
