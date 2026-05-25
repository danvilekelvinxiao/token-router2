import { requireAdmin } from "@/lib/admin-auth";
import { createRedeemCode, batchCreateCodes, listRedeemCodes, getRedeemCodeById, disableRedeemCode, deleteRedeemCode, listRedeemRecords, listBatches, seedMockData } from "@/lib/redeem-codes";

// Only seed mock data in development mode, never in production
const ALLOW_MOCK_REDEEM_CODES = process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_REDEEM_MOCK !== "false";
if (ALLOW_MOCK_REDEEM_CODES) seedMockData();

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  const { method } = req;
  const { action } = req.query;

  // GET: list codes, records, or batches
  if (method === "GET") {
    if (action === "records") {
      const records = listRedeemRecords({ source: req.query.source, userId: req.query.userId });
      return res.status(200).json({ records });
    }
    if (action === "batches") {
      const batches = listBatches();
      return res.status(200).json({ batches });
    }
    if (action === "get" && req.query.id) {
      const entry = getRedeemCodeById(req.query.id);
      if (!entry) return res.status(404).json({ error: "激活码不存在" });
      return res.status(200).json({ code: entry });
    }
    const codes = listRedeemCodes({
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
      const { name, type, amountCny, tokenAmount, priceCny, source, quantity, note, expiredAt } = req.body || {};
      if (!quantity || quantity < 1) return res.status(400).json({ error: "请输入生成数量" });
      const result = batchCreateCodes({ name, type, amountCny, tokenAmount, priceCny, source, quantity, note, expiredAt });
      return res.status(200).json(result);
    }

    const { name, type, amountCny, tokenAmount, priceCny, source, note, expiredAt } = req.body || {};
    if (!amountCny && !tokenAmount) return res.status(400).json({ error: "请输入兑换金额或 Token 额度" });
    const entry = createRedeemCode({ name, type, amountCny, tokenAmount, priceCny, source, note, expiredAt });
    return res.status(200).json({ code: entry });
  }

  // PATCH: disable
  if (method === "PATCH") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "缺少激活码 ID" });
    try {
      const entry = disableRedeemCode(id);
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
      const result = deleteRedeemCode(id);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
