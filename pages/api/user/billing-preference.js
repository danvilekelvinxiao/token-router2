import { getBillingPreference, normalizePriorityMode, setBillingPreference } from "@/lib/billing/deduction-priority";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  const session = requireCustomerSession(req, res);
  if (!session) return;

  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      source: "real",
      preference: getBillingPreference(session.customerId),
    });
  }

  if (req.method === "POST") {
    const rawMode = req.body?.priorityMode;
    if (!["package_first", "balance_first"].includes(rawMode)) {
      return res.status(400).json({ success: false, error: "priorityMode 不合法" });
    }
    const priorityMode = normalizePriorityMode(rawMode);
    const preference = setBillingPreference(session.customerId, priorityMode);
    return res.status(200).json({
      success: true,
      message: "消耗优先级已更新",
      preference,
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
