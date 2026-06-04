import { requireAdmin } from "@/lib/admin-auth";
import { createRedeemCode, batchCreateCodes, listRedeemCodes, getRedeemCodeById, disableRedeemCode, deleteRedeemCode, listRedeemRecords, listBatches, seedMockData } from "@/lib/redeem-codes";
import { writeAdminAuditLog } from "@/lib/team-token-pool";

// Only seed mock data in development mode, never in production
const ALLOW_MOCK_REDEEM_CODES = process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_REDEEM_MOCK !== "false";
if (ALLOW_MOCK_REDEEM_CODES) seedMockData();

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { method } = req;
  const { action } = req.query;

  // GET: list codes, records, or batches
  if (method === "GET") {
    if (action === "records") {
      const records = await listRedeemRecords({ source: req.query.source, userId: req.query.userId });
      return res.status(200).json({ records });
    }
    if (action === "batches") {
      const batches = await listBatches();
      return res.status(200).json({ batches });
    }
    if (action === "get" && req.query.id) {
      const entry = await getRedeemCodeById(req.query.id);
      if (!entry) return res.status(404).json({ error: "激活码不存在" });
      return res.status(200).json({ code: entry });
    }
    const codes = await listRedeemCodes({
      status: req.query.status,
      source: req.query.source,
      batchId: req.query.batchId,
      type: req.query.type,
      search: req.query.search,
    });
    return res.status(200).json({ codes });
  }

  // POST: create single or batch
  if (method === "POST") {
    if (action === "batch") {
      try {
        const { name, type, amountCny, tokenAmount, packageId, serviceId, priceCny, source, quantity, note, remark, expiredAt, expiresAt, maxRedemptionsPerCode, enabled } = req.body || {};
        if (!quantity || quantity < 1) return res.status(400).json({ error: "请输入生成数量" });
        const result = await batchCreateCodes({ name, type, amountCny, tokenAmount, packageId, serviceId, priceCny, source, quantity, note, remark, expiredAt, expiresAt, maxRedemptionsPerCode, enabled, createdBy: admin.customer?.id || admin.session?.customerId || "admin" });
        await writeAdminAuditLog(admin.customer?.id || admin.session?.customerId || "admin", "create_activation_code_batch", "activation_codes", result.batch?.id || "", { type, quantity }).catch(() => null);
        return res.status(200).json(result);
      } catch (error) {
        return res.status(400).json({ error: error.message || "激活码批量创建失败，请检查表单。" });
      }
    }

    try {
      const { name, type, amountCny, tokenAmount, packageId, serviceId, priceCny, source, note, remark, expiredAt, expiresAt, maxRedemptionsPerCode, enabled } = req.body || {};
      const entry = await createRedeemCode({ name, type, amountCny, tokenAmount, packageId, serviceId, priceCny, source, note, remark, expiredAt, expiresAt, maxRedemptionsPerCode, enabled, createdBy: admin.customer?.id || admin.session?.customerId || "admin" });
      await writeAdminAuditLog(admin.customer?.id || admin.session?.customerId || "admin", "create_activation_code", "activation_codes", entry.id, { type: entry.type, amountCny: entry.amountCny, tokenAmount: entry.tokenAmount, packageId: entry.packageId }).catch(() => null);
      return res.status(200).json({ code: entry });
    } catch (error) {
      return res.status(400).json({ error: error.message || "激活码创建失败，请检查表单。" });
    }
  }

  // PATCH: disable
  if (method === "PATCH") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "缺少激活码 ID" });
    try {
      const entry = await disableRedeemCode(id);
      await writeAdminAuditLog(admin.customer?.id || admin.session?.customerId || "admin", "disable_activation_code", "activation_codes", id, { code: entry.code }).catch(() => null);
      return res.status(200).json({ code: entry });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  // DELETE
  if (method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "缺少激活码 ID" });
    try {
      const result = await deleteRedeemCode(id);
      await writeAdminAuditLog(admin.customer?.id || admin.session?.customerId || "admin", "delete_activation_code", "activation_codes", id, {}).catch(() => null);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
