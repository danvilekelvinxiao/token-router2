import { getCustomer, listActivityLogs, listCustomers, listRechargeOrders } from "@/lib/customer-store";
import { listImageLogs } from "@/lib/image-studio";
import { formatDateTime, maskApiKey } from "@/lib/export/server-excel";

export const USAGE_LOG_HEADERS = [
  "使用时间",
  "类型",
  "API Key 名称",
  "API Key 脱敏值",
  "分组",
  "模型",
  "输入 Token",
  "输出 Token",
  "总 Token",
  "花费金额",
  "官方成本",
  "实际成本",
  "节省金额",
  "余额来源",
  "请求状态",
  "失败原因",
  "请求耗时",
  "订单号 / 日志 ID",
];

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function statusLabel(status) {
  const text = String(status || "").toLowerCase();
  if (["success", "paid", "approved", "completed"].includes(text)) return "成功";
  if (text === "partial_success") return "部分成功";
  if (text === "pending") return "待处理";
  if (text === "refunded") return "已退款";
  if (text === "failed") return "失败";
  const numeric = Number(status);
  if (numeric >= 200 && numeric < 300) return "成功";
  if (numeric > 0) return "失败";
  return text || "成功";
}

function callTypeLabel(type) {
  const text = String(type || "");
  const labels = {
    all: "全部",
    recharge: "充值",
    consume: "消费",
    purchase: "购买记录",
    withdraw: "提款",
    refund: "退款",
    image: "图片",
    failed: "失败",
  };
  return labels[text] || text || "全部";
}

function getKey(apiKeys = [], id = "") {
  return apiKeys.find((item) => item.id === id) || {};
}

function getModel(call = {}) {
  return call.routedModel || call.requestedModel || call.model || call.modelDisplayName || "";
}

function inDateRange(item, filters = {}) {
  const date = new Date(String(item.createdAt || ""));
  if (Number.isNaN(date.getTime())) return true;
  if (filters.startDate && date < new Date(`${filters.startDate}T00:00:00`)) return false;
  if (filters.endDate && date > new Date(`${filters.endDate}T23:59:59.999`)) return false;
  return true;
}

function applyFilters(items = [], filters = {}) {
  const type = String(filters.type || "all");
  const model = String(filters.model || "").trim().toLowerCase();
  const group = String(filters.group || "").trim().toLowerCase();
  const status = String(filters.status || "").trim().toLowerCase();
  const apiKeyId = String(filters.apiKeyId || "");
  const requestId = String(filters.requestId || "").trim().toLowerCase();
  const minAmount = filters.minAmount !== "" && filters.minAmount !== undefined ? Number(filters.minAmount) : null;
  const maxAmount = filters.maxAmount !== "" && filters.maxAmount !== undefined ? Number(filters.maxAmount) : null;

  return items
    .filter((item) => type === "all" || !type || item.type === type || (type === "failed" && item.normalizedStatus === "failed"))
    .filter((item) => !apiKeyId || item.apiKeyId === apiKeyId)
    .filter((item) => !model || String(item.model || "").toLowerCase().includes(model))
    .filter((item) => !group || String(item.group || "").toLowerCase().includes(group))
    .filter((item) => !status || String(item.status || "").toLowerCase().includes(status))
    .filter((item) => !requestId || String(item.id || "").toLowerCase().includes(requestId))
    .filter((item) => minAmount == null || Number(item.moneyCost || 0) >= minAmount)
    .filter((item) => maxAmount == null || Number(item.moneyCost || 0) <= maxAmount)
    .filter((item) => inDateRange(item, filters));
}

function toExcelRow(item) {
  return {
    "使用时间": formatDateTime(item.createdAt),
    "类型": callTypeLabel(item.type),
    "API Key 名称": item.apiKeyLabel || "",
    "API Key 脱敏值": item.apiKeyMasked || "",
    "分组": item.group || "",
    "模型": item.model || "",
    "输入 Token": item.inputTokens || 0,
    "输出 Token": item.outputTokens || 0,
    "总 Token": item.totalTokens || 0,
    "花费金额": item.moneyCost || 0,
    "官方成本": item.officialCost || 0,
    "实际成本": item.actualCost || item.moneyCost || 0,
    "节省金额": item.savedAmount || 0,
    "余额来源": item.balanceSource || "",
    "请求状态": item.status || "",
    "失败原因": item.errorReason || "",
    "请求耗时": item.latencyMs ? `${item.latencyMs}ms` : "",
    "订单号 / 日志 ID": item.id || "",
  };
}

export function buildUsageLogExcelRows(items = []) {
  return items.map(toExcelRow);
}

export async function buildUsageLogs({ customerId, filters = {}, limit = 200 } = {}) {
  const customer = await getCustomer(customerId);
  if (!customer) return { items: [], apiKeys: [] };
  const apiKeys = customer.apiKeys || [];

  const apiRows = (customer.calls || []).map((call) => {
    const apiKey = getKey(apiKeys, call.apiKeyId);
    const inputTokens = toNumber(call.promptTokens || call.inputTokens);
    const outputTokens = toNumber(call.completionTokens || call.outputTokens);
    const totalTokens = toNumber(call.tokens || inputTokens + outputTokens);
    const moneyCost = toNumber(call.cost || call.actualCostCny);
    const officialCost = toNumber(call.originalCostCny);
    return {
      id: call.id,
      type: statusLabel(call.status) === "失败" ? "failed" : "consume",
      apiKeyId: call.apiKeyId || "",
      apiKeyLabel: apiKey.label || "",
      apiKeyMasked: maskApiKey(apiKey.token || ""),
      group: apiKey.modelGroup || call.group || "默认分组",
      model: getModel(call),
      inputTokens,
      outputTokens,
      totalTokens,
      moneyCost,
      officialCost,
      actualCost: moneyCost,
      savedAmount: Math.max(0, officialCost - moneyCost),
      balanceSource: call.deductionSource || "FlowAPI 余额",
      status: statusLabel(call.status),
      normalizedStatus: statusLabel(call.status) === "失败" ? "failed" : "success",
      errorReason: call.errorMessage || call.errorCode || "",
      latencyMs: call.latencyMs || "",
      createdAt: call.createdAt,
    };
  });

  const imageResult = await listImageLogs({
    viewerId: customerId,
    limit: 500,
    status: filters.type === "failed" ? "failed" : "",
    requestId: filters.requestId || "",
  }).catch(() => ({ items: [] }));
  const imageRows = (imageResult.items || []).map((item) => ({
    id: item.requestId || item.id,
    type: item.status === "failed" ? "failed" : "image",
    apiKeyId: item.apiKeyId || "",
    apiKeyLabel: getKey(apiKeys, item.apiKeyId)?.label || "",
    apiKeyMasked: maskApiKey(getKey(apiKeys, item.apiKeyId)?.token || ""),
    group: "图片生成",
    model: item.modelDisplayName || item.upstreamModel || "",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: toNumber(item.tokenCost),
    moneyCost: toNumber(item.moneyCost),
    officialCost: toNumber(item.upstreamCostCny),
    actualCost: toNumber(item.sellPriceCny || item.moneyCost),
    savedAmount: 0,
    balanceSource: "FlowAPI 余额",
    status: statusLabel(item.status),
    normalizedStatus: item.status === "failed" ? "failed" : "success",
    errorReason: item.errorMessage || item.errorCode || "",
    latencyMs: item.latencyMs || "",
    createdAt: item.createdAt,
  }));

  const orders = await listRechargeOrders({ customerId, limit: 500 }).catch(() => []);
  const rechargeRows = orders.map((order) => ({
    id: order.outTradeNo || order.id,
    type: order.status === "refunded" ? "refund" : order.status === "failed" ? "failed" : "recharge",
    apiKeyId: "",
    apiKeyLabel: "",
    apiKeyMasked: "",
    group: order.paymentMethod || "",
    model: "FlowAPI 余额",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    moneyCost: toNumber(order.amount),
    officialCost: 0,
    actualCost: toNumber(order.amount),
    savedAmount: 0,
    balanceSource: order.paymentMethod || "充值",
    status: statusLabel(order.status),
    normalizedStatus: statusLabel(order.status) === "失败" ? "failed" : "success",
    errorReason: order.status === "failed" ? "支付失败" : "",
    latencyMs: "",
    createdAt: order.approvedAt || order.paidAt || order.createdAt,
  }));

  const { logs } = await listActivityLogs({ customerId, limit: 500 }).catch(() => ({ logs: [] }));
  const activityRows = (logs || [])
    .filter((log) => ["redeem_code", "purchase_package", "membership_bonus", "daily_bonus", "commission_convert", "commission_withdraw"].includes(log.action))
    .map((log) => ({
      id: log.id,
      type: log.action.includes("withdraw") ? "withdraw" : "purchase",
      apiKeyId: "",
      apiKeyLabel: "",
      apiKeyMasked: "",
      group: log.category || "",
      model: log.detail || "购买记录",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      moneyCost: toNumber(log.amount),
      officialCost: 0,
      actualCost: toNumber(log.amount),
      savedAmount: 0,
      balanceSource: log.action || "",
      status: "成功",
      normalizedStatus: "success",
      errorReason: "",
      latencyMs: "",
      createdAt: log.createdAt,
    }));

  const merged = [...apiRows, ...imageRows, ...rechargeRows, ...activityRows]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const filtered = applyFilters(merged, filters).slice(0, Math.max(1, Math.min(5000, Number(limit || 200))));

  return {
    items: filtered,
    apiKeys: apiKeys.map((key) => ({
      id: key.id,
      label: key.label || "API Key",
      masked: maskApiKey(key.token || ""),
      modelGroup: key.modelGroup || "",
    })),
    total: filtered.length,
  };
}

export async function buildAdminUsageLogs({ filters = {}, limit = 5000 } = {}) {
  const customers = await listCustomers();
  const chunks = await Promise.all(
    customers.map(async (customer) => {
      const data = await buildUsageLogs({ customerId: customer.id, filters, limit });
      return (data.items || []).map((item) => ({
        ...item,
        customerId: customer.id,
        customerName: customer.name || customer.email || customer.id,
      }));
    }),
  );
  const merged = chunks
    .flat()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, Math.max(1, Math.min(10000, Number(limit || 5000))));

  const apiKeys = customers.flatMap((customer) => (customer.apiKeys || []).map((key) => ({
    id: key.id,
    label: `${customer.name || customer.email || customer.id} · ${key.label || "API Key"}`,
    masked: maskApiKey(key.token || ""),
    modelGroup: key.modelGroup || "",
  })));

  return { items: merged, apiKeys, total: merged.length, scope: "admin" };
}
