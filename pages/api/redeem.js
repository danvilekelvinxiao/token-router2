import { redeemCode } from "@/lib/redeem-codes";
import { getCustomer, rechargeCustomer, logActivity, grantTemporaryCredit } from "@/lib/customer-store";
import { assertCustomerOwner } from "@/lib/session";
import { seedMockData } from "@/lib/redeem-codes";
import { upsertUserMembership } from "@/lib/membership/store";
import { grantUserPackage } from "@/lib/packages/store";
import { getNewApiAdminHeaders } from "@/lib/new-api/admin-auth.mjs";

const NEW_API_ADMIN_USER_ID = process.env.NEW_API_ADMIN_USER_ID || "1";

// Only seed mock data in development mode, never in production
const ALLOW_MOCK_REDEEM_CODES = process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_REDEEM_MOCK !== "false";
if (ALLOW_MOCK_REDEEM_CODES) seedMockData();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, customerId } = req.body || {};
  const session = assertCustomerOwner(req, res, customerId);
  if (!session) return;
  if (!code || !code.trim()) {
    return res.status(400).json({ error: "请输入激活码" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const customer = await getCustomer(session.customerId);
  if (!customer) return res.status(404).json({ error: "用户信息不存在" });

  // Redeem validation
  const result = await redeemCode(code.trim(), customer, ip);

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  // Update user balance in customer store
  if (result.amountCny > 0) {
    await rechargeCustomer(session.customerId, result.amountCny);
  }
  if (result.tokenAmount > 0) {
    await grantTemporaryCredit(session.customerId, {
      amount: Number((Number(result.tokenAmount || 0) / 10000).toFixed(6)),
      reason: `redeem_token_code:${result.record?.codeId || code.trim()}`,
      detail: `激活码兑换 ${Number(result.tokenAmount || 0).toLocaleString()} $ API 余额`,
    });
  }
  if (result.packageId) {
    const now = new Date();
    const expiresAt = new Date(now);
    const days = result.packageId === "weekly_plan" ? 7 : 30;
    expiresAt.setDate(expiresAt.getDate() + days);
    await grantUserPackage({
      userId: session.customerId,
      packageId: result.packageId,
      packageName: result.packageId === "weekly_plan" ? "周卡激活码套餐" : result.packageId === "monthly_plan" ? "月卡激活码套餐" : result.packageId,
      purchaseType: "activation_code",
      validDays: days,
      source: "redeem_code",
      metadata: { codeId: result.record?.codeId || "", code: code.trim() },
    });
    upsertUserMembership(session.customerId, {
      status: "active",
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  // Log activity
  const redeemDetail = result.packageId
    ? `激活码兑换成功: ${code.trim()}，套餐/服务 ${result.packageId}`
    : result.tokenAmount > 0
      ? `激活码兑换成功: ${code.trim()}，到账 $${Number(result.tokenAmount).toLocaleString()} API`
      : `激活码兑换成功: ${code.trim()}，到账 ¥${Number(result.amountCny).toFixed(2)}`;

  await logActivity({
    customerId: session.customerId,
    action: "redeem_code",
    category: "payment",
    detail: redeemDetail,
    amount: result.amountCny,
    ip,
    userAgent: req.headers["user-agent"] || "",
  });

  // Sync to New API quota
  try {
    const updatedCustomer = await getCustomer(session.customerId);
    const apiKeys = updatedCustomer?.apiKeys || [];
    const primaryKey = apiKeys[0];
    if (primaryKey?.newApiId) {
      const adminHeaders = await getNewApiAdminHeaders();
      if (adminHeaders) {
        await fetch(`${(process.env.NEW_API_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "")}/api/token/${primaryKey.newApiId}/quota`, {
          method: "POST",
          headers: {
            ...adminHeaders,
            "New-Api-User": adminHeaders["New-Api-User"] || NEW_API_ADMIN_USER_ID,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quota: Math.round((Number(updatedCustomer.balance || 0)) * 10000) }),
        }).catch(() => {});
      }
    }
  } catch {
    // Non-critical: sync can be retried
  }

  const updatedCustomer = await getCustomer(session.customerId);

  return res.status(200).json({
    success: true,
    message: result.packageId
      ? `兑换成功，已为你的账户开通 ${result.packageId}。`
      : result.tokenAmount > 0
        ? `兑换成功，已为你的账户增加 ${Number(result.tokenAmount).toLocaleString()} Token 额度。`
        : `兑换成功，已为你的账户增加 ¥${result.amountCny.toFixed(2)} 余额。`,
    amountCny: result.amountCny,
    tokenAmount: result.tokenAmount || 0,
    packageId: result.packageId || "",
    newBalanceCny: result.newBalanceCny,
    customer: updatedCustomer,
  });
}
