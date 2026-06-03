import { getDashboard, listRechargeOrders } from "@/lib/customer-store";
import { requireCustomerSession } from "@/lib/session";
import { getBillingPreference, resolveDeductionOrder } from "@/lib/billing/deduction-priority";
import { claimDailyBonus, getMemberWallets, getUserMembership } from "@/lib/membership/store";
import { buildWalletProgress, parseQuotaTokens } from "@/lib/wallet/build-wallet-progress";

function parsePackageRef(ref = "") {
  const text = String(ref || "");
  if (!text.includes("套餐")) return null;
  const lineValue = (label) => {
    const line = text.split("\n").find((item) => item.startsWith(`${label}：`));
    return line ? line.replace(`${label}：`, "").trim() : "";
  };
  const validDaysRaw = lineValue("有效期").match(/\d+/)?.[0];
  return {
    purchaseType: lineValue("购买类型"),
    packageId: lineValue("套餐ID"),
    planName: lineValue("套餐名称") || "FlowAPI 套餐",
    quotaText: lineValue("额度"),
    validDays: validDaysRaw ? Number(validDaysRaw) : null,
  };
}

function addDays(iso, days) {
  const date = new Date(iso || Date.now());
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
}

function isApproved(order) {
  return order?.status === "approved";
}

function isWithin(value, start, end) {
  const ts = new Date(value || 0).getTime();
  const startTs = start ? new Date(start).getTime() : 0;
  const endTs = end ? new Date(end).getTime() : Infinity;
  return ts >= startTs && ts <= endTs;
}

function mapBalanceLog(order) {
  return {
    id: order.id,
    type: order.paymentRef?.includes("套餐") ? "package" : "recharge",
    title: order.paymentRef?.includes("套餐") ? "套餐到账" : "余额充值",
    amountCny: Number(order.amount || 0),
    status: order.status,
    createdAt: order.createdAt,
    approvedAt: order.approvedAt,
  };
}

function buildSevenDaySpendTrend(calls = []) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const dayCalls = calls.filter((call) => {
      const callDate = call.createdAt ? new Date(call.createdAt) : null;
      return callDate && !Number.isNaN(callDate.getTime()) && callDate.toISOString().slice(0, 10) === key;
    });
    return {
      date: key,
      label: date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
      amountCny: Number(dayCalls.reduce((sum, call) => sum + Number(call.cost || 0), 0).toFixed(6)),
      tokens: dayCalls.reduce((sum, call) => sum + Number(call.tokens || 0), 0),
      requests: dayCalls.length,
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const customer = await getDashboard(session.customerId);
  if (!customer) return res.status(404).json({ error: "用户不存在" });

  const orders = await listRechargeOrders({ customerId: session.customerId, limit: 50 });
  const approvedOrders = (orders || []).filter(isApproved);
  const packageOrders = approvedOrders
    .map((order) => ({ order, packageInfo: parsePackageRef(order.paymentRef) }))
    .filter((item) => item.packageInfo)
    .sort((a, b) => new Date(b.order.approvedAt || b.order.createdAt) - new Date(a.order.approvedAt || a.order.createdAt));

  const latestPackage = packageOrders[0] || null;
  const now = new Date();
  const calls = Array.isArray(customer.calls) ? customer.calls : [];
  const currentBalance = Number(customer.balance || 0);

  let plan = null;
  let totalQuotaCny = 0;
  let usedQuotaCny = 0;
  let progressPercent = 0;
  let startedAt = null;
  let expiresAt = null;

  if (latestPackage) {
    startedAt = latestPackage.order.approvedAt || latestPackage.order.createdAt;
    expiresAt = latestPackage.packageInfo.validDays ? addDays(startedAt, latestPackage.packageInfo.validDays) : null;
    totalQuotaCny = Number(latestPackage.order.amount || 0);
    usedQuotaCny = calls
      .filter((call) => isWithin(call.createdAt, startedAt, expiresAt))
      .reduce((sum, call) => sum + Number(call.cost || 0), 0);
    progressPercent = totalQuotaCny > 0 ? (usedQuotaCny / totalQuotaCny) * 100 : 0;
    const remainingDays = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000)) : null;
    plan = {
      planName: latestPackage.packageInfo.planName,
      planAmountCny: totalQuotaCny,
      status: expiresAt && new Date(expiresAt).getTime() < now.getTime() ? "expired" : "active",
      startedAt,
      expiresAt,
      remainingDays,
      quotaText: latestPackage.packageInfo.quotaText,
    };
  } else {
    const lastApproved = approvedOrders[0] || null;
    startedAt = lastApproved?.approvedAt || lastApproved?.createdAt || null;
    if (startedAt) {
      usedQuotaCny = calls
        .filter((call) => isWithin(call.createdAt, startedAt, null))
        .reduce((sum, call) => sum + Number(call.cost || 0), 0);
      totalQuotaCny = Number((currentBalance + usedQuotaCny).toFixed(6));
      progressPercent = totalQuotaCny > 0 ? (usedQuotaCny / totalQuotaCny) * 100 : 0;
    }
  }

  const remainingQuotaCny = Math.max(0, Number((totalQuotaCny > 0 ? totalQuotaCny - usedQuotaCny : currentBalance).toFixed(6)));
  const totalTokens = plan?.quotaText ? parseQuotaTokens(plan.quotaText) : null;
  const usedTokens = calls
    .filter((call) => (startedAt ? isWithin(call.createdAt, startedAt, expiresAt) : true))
    .reduce((sum, call) => sum + Number(call.tokens || 0), 0);
  let membership = getUserMembership(session.customerId);
  if (membership.status === "active" && !membership.todayClaimed) {
    await claimDailyBonus(session.customerId);
    membership = getUserMembership(session.customerId);
  }
  const billingPreference = getBillingPreference(session.customerId);
  const baseWallets = [
    ...getMemberWallets(session.customerId),
    ...(plan ? [{
      type: "package_quota",
      name: plan.planName || "套餐额度",
      balanceTokens: totalTokens,
      balanceCnyEquivalent: remainingQuotaCny,
      expiresAt: plan.expiresAt,
      priority: 3,
      locked: false,
      status: plan.status || "active",
    }] : []),
    ...(currentBalance > 0 ? [{
      type: "balance_credit",
      name: "充值余额",
      balanceTokens: null,
      balanceCnyEquivalent: currentBalance,
      expiresAt: null,
      priority: 4,
      locked: false,
      status: "active",
    }] : []),
  ];
  const order = resolveDeductionOrder(session.customerId, baseWallets);
  const wallets = baseWallets
    .map((wallet) => ({ ...wallet, priority: order.indexOf(wallet.type) >= 0 ? order.indexOf(wallet.type) + 1 : wallet.priority }))
    .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99));

  if (!wallets.length && !plan && currentBalance <= 0 && totalQuotaCny <= 0 && usedTokens <= 0) {
    const emptyPayload = {
      balanceCny: 0,
      totalQuotaCny: 0,
      usedQuotaCny: 0,
      remainingQuotaCny: 0,
      progressPercent: 0,
    };
    return res.status(200).json({
      success: true,
      source: "empty",
      updatedAt: new Date().toISOString(),
      wallet: emptyPayload,
      token: {
        totalTokens: null,
        usedTokens: 0,
        remainingTokens: null,
      },
      plan: null,
      recentRecharges: [],
      recentConsumptions: [],
      balanceLogs: [],
      spendTrend7d: [],
      wallets,
      billingPreference,
      membership,
      walletProgress: buildWalletProgress({
        wallet: emptyPayload,
        token: { totalTokens: null, usedTokens: 0, remainingTokens: null },
        plan: null,
        calls: [],
        membership,
      }),
      message: "暂无钱包数据",
    });
  }

  const walletPayload = {
    balanceCny: currentBalance,
    totalQuotaCny: Number(totalQuotaCny.toFixed(6)),
    usedQuotaCny: Number(usedQuotaCny.toFixed(6)),
    remainingQuotaCny,
    progressPercent: Number(Math.max(0, Math.min(100, progressPercent)).toFixed(2)),
  };
  const tokenPayload = {
    totalTokens,
    usedTokens,
    remainingTokens: totalTokens ? Math.max(0, totalTokens - usedTokens) : null,
  };
  const walletProgress = buildWalletProgress({
    wallet: walletPayload,
    token: tokenPayload,
    plan,
    calls,
    membership,
  });

  return res.status(200).json({
    success: true,
    source: "real",
    updatedAt: new Date().toISOString(),
    wallet: walletPayload,
    token: tokenPayload,
    plan,
    wallets,
    billingPreference,
    membership,
    walletProgress,
    recentRecharges: (orders || []).slice(0, 5).map(mapBalanceLog),
    recentConsumptions: calls.slice(0, 5).map((call) => ({
      id: call.id,
      model: call.requestedModel || call.routedModel || "unknown",
      amountCny: Number(call.cost || 0),
      tokens: Number(call.tokens || 0),
      status: Number(call.status || 0),
      createdAt: call.createdAt,
    })),
    spendTrend7d: buildSevenDaySpendTrend(calls),
    balanceLogs: [
      ...(orders || []).slice(0, 5).map(mapBalanceLog),
      ...calls.slice(0, 5).map((call) => ({
        id: call.id,
        type: "consume",
        title: call.requestedModel || call.routedModel || "模型调用",
        amountCny: -Number(call.cost || 0),
        status: Number(call.status || 0) >= 200 && Number(call.status || 0) < 400 ? "success" : "failed",
        createdAt: call.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt || b.approvedAt) - new Date(a.createdAt || a.approvedAt)).slice(0, 8),
  });
}
