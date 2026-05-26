import { createPublicApiKey, getDashboard } from "@/lib/customer-store";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const customerId = req.body?.customerId;

  if (!customerId) {
    return res.status(400).json({ error: "Missing customerId" });
  }

  const newApiKey = createPublicApiKey(customerId, req.body?.label || "API Key");
  if (!newApiKey) {
    return res.status(404).json({ error: "请先创建账号后再生成 API Key" });
  }

  return res.status(200).json({
    customer: getDashboard(customerId),
    newApiKey,
  });
}
