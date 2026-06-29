import { getDashboard, listRechargeOrders, listWalletLedgerEntries } from "@/lib/customer-store";
import { requireCustomerSession } from "@/lib/session";
import { getBillingPreference, resolveDeductionOrder } from "@/lib/billing/deduction-priority";
import { claimDailyBonus, getMemberWallets, getUserMembership } from "@/lib/membership/store";
import { listUserPackages } from "@/lib/packages/store";
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
    quotaText: lineValue("用量") || lineValue("额度"),
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
  const isPackage = order.paymentRef?.includes("套餐");
  return {
    id: order.id,
    type: isPackage ? "package" : "recharge",
    title: isPackage ? "套餐到账" : "充值到账",
    amountCny: Number(order.creditedAmountApi ?? order.amountApi ?? order.amount ?? 0),
    amountApi: Number(order.creditedAmountApi ?? order.amountApi ?? order.amount ?? 0),
    paymentAmountRmb: Number(order.paymentAmountRmb ?? order.amount ?? 0),
    creditedAmountApi: Number(order.creditedAmountApi ?? order.amountApi ?? order.amount ?? 0),
    rechargeRate: Number(order.rechargeRate || 5),
    rechargeRateText: order.rechargeRateText || "¥1 = $ API 5",
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

const MODEL_CONSUMPTION_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#14b8a6",
  "#f59e0b",
  "#ec4899",
  "#64748b",
];

function hashModelName(value = "") {
  return Array.from(String(value || "")).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function shanghaiDateKey(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildShanghaiDateRange(days = 7) {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - ((days - 1) - index));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: key.slice(5).replace("-", "/"),
    };
  });
}

function getCallModelName(call) {
  return call?.routedModel || call?.requestedModel || call?.model || "未知模型";
}

function getModelColor(modelName, index = 0) {
  const name = String(modelName || "").toLowerCase();
  if (name.includes("gpt") || name.includes("openai")) return "#3b82f6";
  if (name.includes("deepseek")) return "#2563eb";
  if (name.includes("claude") || name.includes("anthropic")) return "#8b5cf6";
  if (name.includes("gemini") || name.includes("google")) return "#f59e0b";
  if (name.includes("qwen") || name.includes("通义")) return "#f97316";
  if (name.includes("seedream") || name.includes("doubao") || name.includes("字节")) return "#14b8a6";
  return MODEL_CONSUMPTION_COLORS[(hashModelName(name) + index) % MODEL_CONSUMPTION_COLORS.length];
}

function createModelBucket(modelName, call, index) {
  return {
    modelId: modelName,
    displayName: modelName,
    provider: call?.provider || "FlowAPI",
    logo: null,
    color: getModelColor(modelName, index),
    costCny: 0,
    tokens: 0,
    requests: 0,
  };
}

function buildModelConsumptionChart(calls = [], days = 7) {
  const range = buildShanghaiDateRange(days);
  const keys = new Set(range.map((item) => item.key));
  const byDay = new Map(range.map((item) => [item.key, new Map()]));
  const totals = new Map();

  calls.forEach((call) => {
    const dayKey = shanghaiDateKey(call.createdAt);
    if (!keys.has(dayKey)) return;
    const modelName = getCallModelName(call);
    const totalIndex = totals.size;
    const dayMap = byDay.get(dayKey);
    if (!dayMap) return;
    if (!totals.has(modelName)) totals.set(modelName, createModelBucket(modelName, call, totalIndex));
    if (!dayMap.has(modelName)) dayMap.set(modelName, createModelBucket(modelName, call, totalIndex));

    const add = (bucket) => {
      bucket.costCny += Number(call.cost || 0);
      bucket.tokens += Number(call.tokens || 0);
      bucket.requests += 1;
      if (!bucket.provider && call.provider) bucket.provider = call.provider;
    };
    add(totals.get(modelName));
    add(dayMap.get(modelName));
  });

  const rankedModels = Array.from(totals.values())
    .sort((a, b) => (b.costCny - a.costCny) || (b.tokens - a.tokens) || (b.requests - a.requests));
  const topKeys = new Set(rankedModels.slice(0, 5).map((item) => item.modelId));

  const series = range.map((day) => {
    const dayModels = Array.from((byDay.get(day.key) || new Map()).values());
    const visible = [];
    const rest = createModelBucket("others", { provider: "FlowAPI" }, 5);
    rest.displayName = "其他模型";
    rest.color = "#64748b";

    dayModels
      .sort((a, b) => (b.costCny - a.costCny) || (b.tokens - a.tokens) || (b.requests - a.requests))
      .forEach((model) => {
        if (topKeys.has(model.modelId)) {
          visible.push({
            ...model,
            costCny: Number(model.costCny.toFixed(6)),
          });
          return;
        }
        rest.costCny += model.costCny;
        rest.tokens += model.tokens;
        rest.requests += model.requests;
      });

    if (rest.costCny > 0 || rest.tokens > 0 || rest.requests > 0) {
      visible.push({
        ...rest,
        costCny: Number(rest.costCny.toFixed(6)),
      });
    }

    const total = visible.reduce((acc, model) => ({
      costCny: acc.costCny + Number(model.costCny || 0),
      tokens: acc.tokens + Number(model.tokens || 0),
      requests: acc.requests + Number(model.requests || 0),
    }), { costCny: 0, tokens: 0, requests: 0 });

    return {
      time: day.key,
      label: day.label,
      models: visible,
      total: {
        costCny: Number(total.costCny.toFixed(6)),
        tokens: total.tokens,
        requests: total.requests,
      },
    };
  });

  const summary = rankedModels.reduce((acc, model) => ({
    totalCostCny: acc.totalCostCny + Number(model.costCny || 0),
    totalTokens: acc.totalTokens + Number(model.tokens || 0),
    totalRequests: acc.totalRequests + Number(model.requests || 0),
  }), { totalCostCny: 0, totalTokens: 0, totalRequests: 0 });

  const from = range[0]?.key ? `${range[0].key}T00:00:00+08:00` : null;
  const to = range[range.length - 1]?.key ? `${range[range.length - 1].key}T23:59:59+08:00` : null;

  return {
    range: { from, to, timezone: "Asia/Shanghai" },
    summary: {
      totalCostCny: Number(summary.totalCostCny.toFixed(6)),
      totalTokens: summary.totalTokens,
      totalRequests: summary.totalRequests,
    },
    series,
  };
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
  const userPackages = await listUserPackages(session.customerId).catch(() => []);
  const approvedOrders = (orders || []).filter(isApproved);
  const packageOrders = approvedOrders
    .map((order) => ({ order, packageInfo: parsePackageRef(order.paymentRef) }))
    .filter((item) => item.packageInfo)
    .sort((a, b) => new Date(b.order.approvedAt || b.order.createdAt) - new Date(a.order.approvedAt || a.order.createdAt));

  const latestUserPackage = userPackages[0] || null;
  const latestPackage = latestUserPackage || packageOrders[0] || null;
  const now = new Date();
  const calls = Array.isArray(customer.calls) ? customer.calls : [];
  const currentBalance = Number(customer.balance || 0);
  const walletLedger = await listWalletLedgerEntries({ customerId: session.customerId, limit: 80 }).catch(() => []);
  const todayKey = shanghaiDateKey(new Date());
  const monthKey = todayKey.slice(0, 7);
  const isSameShanghaiDay = (value) => shanghaiDateKey(value) === todayKey;
  const isSameShanghaiMonth = (value) => shanghaiDateKey(value).slice(0, 7) === monthKey;
  const sumCalls = (items) => Number(items.reduce((sum, call) => sum + Number(call.cost || 0), 0).toFixed(6));
  const todayConsumptionApi = sumCalls(calls.filter((call) => isSameShanghaiDay(call.createdAt)));
  const monthConsumptionApi = sumCalls(calls.filter((call) => isSameShanghaiMonth(call.createdAt)));
  const totalRechargedRmb = Number(approvedOrders.reduce((sum, order) => sum + Number(order.paymentAmountRmb ?? order.amount ?? 0), 0).toFixed(2));
  const totalGrantedApi = Number(approvedOrders.reduce((sum, order) => sum + Number(order.creditedAmountApi ?? order.amountApi ?? order.amount ?? 0), 0).toFixed(6));
  const totalConsumedApi = sumCalls(calls);
  const requestCount = calls.length;

  let plan = null;
  let totalQuotaCny = 0;
  let usedQuotaCny = 0;
  let progressPercent = 0;
  let startedAt = null;
  let expiresAt = null;

  if (latestUserPackage) {
    startedAt = latestUserPackage.startedAt;
    expiresAt = latestUserPackage.expiresAt || null;
    totalQuotaCny = Number((Number(latestUserPackage.quotaTokens || 0) / 10000).toFixed(6));
    usedQuotaCny = calls
      .filter((call) => isWithin(call.createdAt, startedAt, expiresAt))
      .reduce((sum, call) => sum + Number(call.cost || 0), 0);
    progressPercent = totalQuotaCny > 0 ? (usedQuotaCny / totalQuotaCny) * 100 : 0;
    const remainingDays = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000)) : null;
    plan = {
      planName: latestUserPackage.packageName,
      planAmountCny: totalQuotaCny,
      status: expiresAt && new Date(expiresAt).getTime() < now.getTime() ? "expired" : "active",
      startedAt,
      expiresAt,
      remainingDays,
      quotaText: latestUserPackage.quotaText,
      quotaTokens: Number(latestUserPackage.quotaTokens || 0),
      remainingTokens: Number(latestUserPackage.remainingTokens || 0),
    };
  } else if (latestPackage) {
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
  const totalTokens = plan?.quotaTokens || (plan?.quotaText ? parseQuotaTokens(plan.quotaText) : null);
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
      name: plan.planName || "套餐用量",
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
      walletLedger: [],
      walletStats: {
        todayConsumptionApi: 0,
        monthConsumptionApi: 0,
        totalRechargedRmb: 0,
        totalGrantedApi: 0,
        totalConsumedApi: 0,
        requestCount: 0,
        rechargeRate: 5,
        rechargeRateText: "¥1 = $ API 5",
      },
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
      modelConsumptionChart: buildModelConsumptionChart([]),
      message: "暂无钱包数据",
    });
  }

  const walletPayload = {
    balanceCny: currentBalance,
    balanceApi: currentBalance,
    apiBalance: currentBalance,
    totalQuotaCny: Number(totalQuotaCny.toFixed(6)),
    totalQuotaApi: Number(totalQuotaCny.toFixed(6)),
    usedQuotaCny: Number(usedQuotaCny.toFixed(6)),
    usedQuotaApi: Number(usedQuotaCny.toFixed(6)),
    remainingQuotaCny,
    remainingQuotaApi: remainingQuotaCny,
    progressPercent: Number(Math.max(0, Math.min(100, progressPercent)).toFixed(2)),
    currency: "$ API",
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
      id: call.requestId || call.id,
      requestId: call.requestId || "",
      callId: call.callId || call.id,
      model: call.requestedModel || call.routedModel || "unknown",
      amountCny: Number(call.cost || 0),
      tokens: Number(call.tokens || 0),
      status: Number(call.status || 0),
      createdAt: call.createdAt,
    })),
    spendTrend7d: buildSevenDaySpendTrend(calls),
    modelConsumptionChart: buildModelConsumptionChart(calls),
    walletStats: {
      todayConsumptionApi,
      monthConsumptionApi,
      totalRechargedRmb,
      totalGrantedApi,
      totalConsumedApi,
      requestCount,
      rechargeRate: 5,
      rechargeRateText: "¥1 = $ API 5",
    },
    walletLedger,
    balanceLogs: [
      ...(walletLedger || []).slice(0, 8).map((entry) => ({
        id: entry.id,
        type: entry.type,
        title: entry.remark || entry.type,
        amountCny: Number(entry.amountApi || 0),
        amountApi: Number(entry.amountApi || 0),
        balanceBeforeApi: Number(entry.balanceBeforeApi || 0),
        balanceAfterApi: Number(entry.balanceAfterApi || 0),
        requestId: entry.requestId || "",
        status: "success",
        createdAt: entry.createdAt,
      })),
      ...(orders || []).slice(0, 5).map(mapBalanceLog),
      ...calls.slice(0, 5).map((call) => ({
        id: call.requestId || call.id,
        requestId: call.requestId || "",
        callId: call.callId || call.id,
        type: "consume",
        title: call.requestedModel || call.routedModel || "模型调用",
        amountCny: -Number(call.cost || 0),
        status: (call.billingStatus || call.deliveryStatus || "") === "success_completed" || (Number(call.status || 0) >= 200 && Number(call.status || 0) < 400 && !call.errorCode) ? "success" : "failed",
        createdAt: call.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt || b.approvedAt) - new Date(a.createdAt || a.approvedAt)).slice(0, 8),
  });
}
