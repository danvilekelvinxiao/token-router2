import { createApiKey, deleteApiKey, getDashboard, updateApiKey } from "@/lib/customer-store";
import { assertCustomerOwner } from "@/lib/session";

export default async function handler(req, res) {
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requestedCustomerId = req.body?.customerId;
  const session = assertCustomerOwner(req, res, requestedCustomerId);
  if (!session) return;
  const customerId = session.customerId;

  if (!customerId) return res.status(401).json({ error: "请先登录后再操作" });

  if (req.method === "POST") {
    await createApiKey(customerId, req.body?.label || "API 密匙", req.body?.expiresAt || null);
    return res.status(200).json(await getDashboard(customerId));
  }

  const keyId = req.body?.keyId;
  if (!keyId) {
    return res.status(400).json({ error: "缺少 API 密匙 ID" });
  }

  if (req.method === "PATCH") {
    const customer = await updateApiKey(customerId, keyId, {
      label: req.body?.label,
      expiresAt: req.body?.expiresAt,
      disabled: req.body?.disabled,
    });
    if (!customer) return res.status(404).json({ error: "API 密匙不存在" });
    return res.status(200).json(customer);
  }

  const customer = await deleteApiKey(customerId, keyId);
  if (!customer) return res.status(404).json({ error: "API 密匙不存在" });
  return res.status(200).json(customer);
}
