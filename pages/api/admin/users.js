import { listCustomers, updateCustomer, disableApiKey, enableApiKey, updateApiKeyLimitForAdmin, softDeleteCustomer } from "@/lib/customer-store";
import { requireAdmin } from "@/lib/admin-auth";

function adminErrorMessage(error) {
  const raw = String(error?.message || error || "");
  if (/expected pattern|Invalid ID/i.test(raw)) return "请求参数格式错误，请刷新页面后重试。";
  if (/Unauthorized/i.test(raw)) return "未登录或登录已过期。";
  if (/Forbidden/i.test(raw)) return "当前账号无权限操作。";
  if (/Validation failed/i.test(raw)) return "请检查表单必填项。";
  if (/database|SQL|relation|column/i.test(raw)) return "数据库操作失败，请稍后重试。";
  return raw || "操作失败，请稍后重试。";
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const customers = await listCustomers();
    return res.status(200).json({ customers });
  }

  if (req.method === "POST") {
    try {
      const { action, data } = req.body || {};
      if (action === "updateCustomer") {
        const result = await updateCustomer(data.id, data.updates);
        return res.status(200).json({ ok: true, customer: result });
      }
      if (action === "blockUser") {
        const result = await updateCustomer(data.id, { status: "blocked" });
        return res.status(200).json({ ok: true, customer: result });
      }
      if (action === "unblockUser") {
        const result = await updateCustomer(data.id, { status: "active" });
        return res.status(200).json({ ok: true, customer: result });
      }
      if (action === "deleteCustomer") {
        const result = await softDeleteCustomer(data?.id || data?.userId, admin.customer?.id || admin.session?.customerId || "admin");
        return res.status(200).json({ ok: true, ...result });
      }
      if (action === "disableKey") {
        await disableApiKey(data.keyId);
        return res.status(200).json({ ok: true });
      }
      if (action === "enableKey") {
        await enableApiKey(data.keyId);
        return res.status(200).json({ ok: true });
      }
      if (action === "updateKeyLimit") {
        const key = await updateApiKeyLimitForAdmin(data.keyId, data.limit || {});
        if (!key) return res.status(404).json({ error: "API Key 不存在" });
        return res.status(200).json({ ok: true, key });
      }
      return res.status(400).json({ error: "未知操作，请刷新页面后重试。" });
    } catch (error) {
      const status = error?.code === "USER_NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ error: adminErrorMessage(error), code: error?.code || "ADMIN_USER_ACTION_FAILED" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
