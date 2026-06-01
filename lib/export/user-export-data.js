import { getCustomer, listActivityLogs, listRechargeOrders } from "@/lib/customer-store";
import { formatDateTime, maskApiKey, withinDateRange } from "@/lib/export/server-excel";

const BILLING_HEADERS = [
  "充值时间",
  "充值订单号",
  "订单类型",
  "支付方式",
  "订单内容",
  "支付金额（人民币 ¥）",
  "到账金额（人民币 ¥）",
  "赠送额度（人民币 ¥）",
  "兑换码",
  "支付渠道流水号",
  "状态",
  "创建时间",
  "完成时间",
  "备注",
];

const USAGE_HEADERS = [
  "使用时间",
  "Request ID",
  "API Key 名称",
  "API 密钥",
  "分组",
  "模型",
  "Provider",
  "输入 Token",
  "输出 Token",
  "总 Token",
  "官方输入价格",
  "官方输出价格",
  "FlowAPI 输入价格",
  "FlowAPI 输出价格",
  "套餐输入价格",
  "套餐输出价格",
  "官方预估花费（人民币 ¥）",
  "FlowAPI 实际花费（人民币 ¥）",
  "节省金额（人民币 ¥）",
  "节省比例",
  "扣费来源",
  "响应时间",
  "请求状态",
  "错误码",
  "请求 IP",
  "渠道",
  "Finish Reason",
  "备注",
];

const MODEL_SUMMARY_HEADERS = [
  "模型名称",
  "Provider",
  "模型 ID",
  "请求次数",
  "输入 Token",
  "输出 Token",
  "总 Token",
  "官方预估花费（人民币 ¥）",
  "FlowAPI 实际花费（人民币 ¥）",
  "节省金额（人民币 ¥）",
  "节省比例",
  "平均单次成本（人民币 ¥）",
  "平均响应时间",
  "成功率",
  "失败次数",
  "最近调用时间",
  "Token 排名",
  "成本排名",
  "请求数排名",
];

const MODEL_DAILY_HEADERS = [
  "日期",
  "模型名称",
  "Provider",
  "请求次数",
  "输入 Token",
  "输出 Token",
  "总 Token",
  "官方预估花费（人民币 ¥）",
  "FlowAPI 实际花费（人民币 ¥）",
  "节省金额（人民币 ¥）",
  "节省比例",
];

const MODEL_DETAIL_HEADERS = [
  "使用时间",
  "Request ID",
  "API Key 名称",
  "模型名称",
  "Provider",
  "输入 Token",
  "输出 Token",
  "总 Token",
  "FlowAPI 实际花费（人民币 ¥）",
  "官方预估花费（人民币 ¥）",
  "节省金额（人民币 ¥）",
  "响应时间",
  "状态",
];

function statusLabel(status) {
  const text = String(status || "").toLowerCase();
  if (text === "paid" || text === "approved" || text === "completed" || text === "success") return "已完成";
  if (text === "pending") return "待支付";
  if (text === "cancelled" || text === "canceled") return "已取消";
  if (text === "refunded") return "已退款";
  if (text === "failed") return "失败";
  return status || "待支付";
}

function callStatusLabel(call) {
  const status = Number(call.status || 0);
  if (status >= 200 && status < 300) return "成功";
  if (status === 0) return "数据同步中";
  if (status === 408 || status === 504) return "超时";
  return "失败";
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function getCallModel(call) {
  return call.routedModel || call.requestedModel || call.model || "";
}

function getApiKey(apiKeys, id) {
  return apiKeys.find((item) => item.id === id) || {};
}

export async function buildBillingExport(customerId, filters) {
  const orders = (await listRechargeOrders({ customerId, limit: 5000 }))
    .filter((order) => withinDateRange(order.createdAt || order.paidAt || order.approvedAt, filters));
  const { logs } = await listActivityLogs({ customerId, limit: 5000 });
  const redeemLogs = logs.filter((log) => log.action === "redeem_code" && withinDateRange(log.createdAt, filters));

  const orderRows = orders.map((order) => ({
    "充值时间": formatDateTime(order.paidAt || order.approvedAt || order.createdAt),
    "充值订单号": order.outTradeNo || order.id,
    "订单类型": "余额充值",
    "支付方式": order.paymentMethod || "未设置",
    "订单内容": "FlowAPI 余额充值",
    "支付金额（人民币 ¥）": toNumber(order.amount),
    "到账金额（人民币 ¥）": statusLabel(order.status) === "已完成" ? toNumber(order.amount) : 0,
    "赠送额度（人民币 ¥）": 0,
    "兑换码": "",
    "支付渠道流水号": order.providerTradeNo || order.paymentRef || "",
    "状态": statusLabel(order.status),
    "创建时间": formatDateTime(order.createdAt),
    "完成时间": formatDateTime(order.approvedAt || order.paidAt),
    "备注": "",
  }));

  const redeemRows = redeemLogs.map((log) => ({
    "充值时间": formatDateTime(log.createdAt),
    "充值订单号": log.id,
    "订单类型": "激活码兑换",
    "支付方式": "激活码",
    "订单内容": log.detail || "激活码兑换",
    "支付金额（人民币 ¥）": 0,
    "到账金额（人民币 ¥）": toNumber(log.amount),
    "赠送额度（人民币 ¥）": toNumber(log.amount),
    "兑换码": "",
    "支付渠道流水号": "",
    "状态": "已完成",
    "创建时间": formatDateTime(log.createdAt),
    "完成时间": formatDateTime(log.createdAt),
    "备注": log.detail || "",
  }));

  return { headers: BILLING_HEADERS, rows: [...orderRows, ...redeemRows] };
}

export async function buildUsageExport(customerId, filters, query = {}) {
  const customer = await getCustomer(customerId);
  const apiKeys = customer?.apiKeys || [];
  const rows = (customer?.calls || [])
    .filter((call) => withinDateRange(call.createdAt, filters))
    .filter((call) => !query.apiKeyId || call.apiKeyId === query.apiKeyId)
    .filter((call) => !query.model || getCallModel(call).includes(query.model))
    .filter((call) => !query.status || callStatusLabel(call) === query.status)
    .map((call) => {
      const apiKey = getApiKey(apiKeys, call.apiKeyId);
      const inputTokens = toNumber(call.promptTokens || call.inputTokens);
      const outputTokens = toNumber(call.completionTokens || call.outputTokens);
      const totalTokens = toNumber(call.tokens || inputTokens + outputTokens);
      const actualCost = toNumber(call.cost || call.actualCostCny);
      const officialCost = toNumber(call.originalCostCny || 0);
      const saved = Math.max(0, officialCost - actualCost);
      return {
        "使用时间": formatDateTime(call.createdAt),
        "Request ID": call.id,
        "API Key 名称": apiKey.label || "",
        "API 密钥": maskApiKey(apiKey.token),
        "分组": apiKey.modelGroup || "默认分组",
        "模型": getCallModel(call),
        "Provider": call.provider || "",
        "输入 Token": inputTokens,
        "输出 Token": outputTokens,
        "总 Token": totalTokens,
        "官方输入价格": call.originalInputPricePerM || "",
        "官方输出价格": call.originalOutputPricePerM || "",
        "FlowAPI 输入价格": call.finalInputPricePerM || "",
        "FlowAPI 输出价格": call.finalOutputPricePerM || "",
        "套餐输入价格": call.packageInputPricePerM || "",
        "套餐输出价格": call.packageOutputPricePerM || "",
        "官方预估花费（人民币 ¥）": officialCost || "",
        "FlowAPI 实际花费（人民币 ¥）": actualCost,
        "节省金额（人民币 ¥）": saved || "",
        "节省比例": officialCost > 0 ? `${((saved / officialCost) * 100).toFixed(2)}%` : "",
        "扣费来源": call.deductionSource || "FlowAPI 余额",
        "响应时间": call.latencyMs ? `${call.latencyMs}ms` : "",
        "请求状态": callStatusLabel(call),
        "错误码": call.errorCode || "",
        "请求 IP": call.requestIp || "",
        "渠道": call.channelName || call.endpoint || "",
        "Finish Reason": call.finishReason || "",
        "备注": "",
      };
    });

  return { headers: USAGE_HEADERS, rows };
}

export async function buildModelAnalysisExport(customerId, filters, query = {}) {
  const usage = await buildUsageExport(customerId, filters, query);
  const detailRows = usage.rows.map((row) => ({
    "使用时间": row["使用时间"],
    "Request ID": row["Request ID"],
    "API Key 名称": row["API Key 名称"],
    "模型名称": row["模型"],
    "Provider": row["Provider"],
    "输入 Token": row["输入 Token"],
    "输出 Token": row["输出 Token"],
    "总 Token": row["总 Token"],
    "FlowAPI 实际花费（人民币 ¥）": row["FlowAPI 实际花费（人民币 ¥）"],
    "官方预估花费（人民币 ¥）": row["官方预估花费（人民币 ¥）"],
    "节省金额（人民币 ¥）": row["节省金额（人民币 ¥）"],
    "响应时间": row["响应时间"],
    "状态": row["请求状态"],
  }));

  const modelMap = new Map();
  const dailyMap = new Map();
  for (const row of usage.rows) {
    const model = row["模型"] || "未知模型";
    const provider = row["Provider"] || "";
    const key = `${provider}::${model}`;
    const current = modelMap.get(key) || {
      "模型名称": model,
      "Provider": provider,
      "模型 ID": model,
      "请求次数": 0,
      "输入 Token": 0,
      "输出 Token": 0,
      "总 Token": 0,
      "官方预估花费（人民币 ¥）": 0,
      "FlowAPI 实际花费（人民币 ¥）": 0,
      "节省金额（人民币 ¥）": 0,
      "失败次数": 0,
      "最近调用时间": "",
    };
    current["请求次数"] += 1;
    current["输入 Token"] += toNumber(row["输入 Token"]);
    current["输出 Token"] += toNumber(row["输出 Token"]);
    current["总 Token"] += toNumber(row["总 Token"]);
    current["官方预估花费（人民币 ¥）"] += toNumber(row["官方预估花费（人民币 ¥）"]);
    current["FlowAPI 实际花费（人民币 ¥）"] += toNumber(row["FlowAPI 实际花费（人民币 ¥）"]);
    current["节省金额（人民币 ¥）"] += toNumber(row["节省金额（人民币 ¥）"]);
    current["失败次数"] += row["请求状态"] === "失败" ? 1 : 0;
    current["最近调用时间"] = current["最近调用时间"] || row["使用时间"];
    modelMap.set(key, current);

    const dayKey = `${row["使用时间"].slice(0, 10)}::${key}`;
    const daily = dailyMap.get(dayKey) || {
      "日期": row["使用时间"].slice(0, 10),
      "模型名称": model,
      "Provider": provider,
      "请求次数": 0,
      "输入 Token": 0,
      "输出 Token": 0,
      "总 Token": 0,
      "官方预估花费（人民币 ¥）": 0,
      "FlowAPI 实际花费（人民币 ¥）": 0,
      "节省金额（人民币 ¥）": 0,
    };
    daily["请求次数"] += 1;
    daily["输入 Token"] += toNumber(row["输入 Token"]);
    daily["输出 Token"] += toNumber(row["输出 Token"]);
    daily["总 Token"] += toNumber(row["总 Token"]);
    daily["官方预估花费（人民币 ¥）"] += toNumber(row["官方预估花费（人民币 ¥）"]);
    daily["FlowAPI 实际花费（人民币 ¥）"] += toNumber(row["FlowAPI 实际花费（人民币 ¥）"]);
    daily["节省金额（人民币 ¥）"] += toNumber(row["节省金额（人民币 ¥）"]);
    dailyMap.set(dayKey, daily);
  }

  const summaryRows = Array.from(modelMap.values());
  const tokenRanks = [...summaryRows].sort((a, b) => b["总 Token"] - a["总 Token"]);
  const costRanks = [...summaryRows].sort((a, b) => b["FlowAPI 实际花费（人民币 ¥）"] - a["FlowAPI 实际花费（人民币 ¥）"]);
  const requestRanks = [...summaryRows].sort((a, b) => b["请求次数"] - a["请求次数"]);
  summaryRows.forEach((row) => {
    row["平均单次成本（人民币 ¥）"] = row["请求次数"] ? row["FlowAPI 实际花费（人民币 ¥）"] / row["请求次数"] : 0;
    row["平均响应时间"] = "";
    row["成功率"] = row["请求次数"] ? `${(((row["请求次数"] - row["失败次数"]) / row["请求次数"]) * 100).toFixed(2)}%` : "";
    row["节省比例"] = row["官方预估花费（人民币 ¥）"] > 0 ? `${((row["节省金额（人民币 ¥）"] / row["官方预估花费（人民币 ¥）"]) * 100).toFixed(2)}%` : "";
    row["Token 排名"] = tokenRanks.indexOf(row) + 1;
    row["成本排名"] = costRanks.indexOf(row) + 1;
    row["请求数排名"] = requestRanks.indexOf(row) + 1;
  });

  const dailyRows = Array.from(dailyMap.values()).map((row) => ({
    ...row,
    "节省比例": row["官方预估花费（人民币 ¥）"] > 0 ? `${((row["节省金额（人民币 ¥）"] / row["官方预估花费（人民币 ¥）"]) * 100).toFixed(2)}%` : "",
  }));

  return {
    summary: { headers: MODEL_SUMMARY_HEADERS, rows: summaryRows },
    daily: { headers: MODEL_DAILY_HEADERS, rows: dailyRows },
    detail: { headers: MODEL_DETAIL_HEADERS, rows: detailRows },
  };
}
