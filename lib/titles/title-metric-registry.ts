export type TitleMetricCategory =
  | "asset"
  | "token"
  | "model"
  | "image"
  | "payment"
  | "invite"
  | "team"
  | "membership"
  | "data"
  | "stability"
  | "developer";

export type TitleMetricDefinition = {
  metricKey: string;
  metricName: string;
  metricType: "currency" | "token" | "count" | "day";
  dataSource: string;
  rankDirection: "desc" | "asc";
  minEligibility: number;
  titlePrefix: string;
  category: TitleMetricCategory;
  enabled: boolean;
};

export const TITLE_CATEGORIES: Array<{ key: TitleMetricCategory; label: string }> = [
  { key: "asset", label: "资产称号" },
  { key: "token", label: "Token 称号" },
  { key: "model", label: "模型称号" },
  { key: "image", label: "图片称号" },
  { key: "payment", label: "支付称号" },
  { key: "invite", label: "邀请称号" },
  { key: "team", label: "团队称号" },
  { key: "membership", label: "会员称号" },
  { key: "data", label: "数据称号" },
  { key: "stability", label: "稳定性称号" },
  { key: "developer", label: "开发者称号" },
];

export const STATIC_TITLE_METRICS: TitleMetricDefinition[] = [
  { metricKey: "total_spend_cny", metricName: "累计花费", metricType: "currency", dataSource: "customers.total_spend + wallet_transactions", rankDirection: "desc", minEligibility: 1, titlePrefix: "花费", category: "asset", enabled: true },
  { metricKey: "total_tokens", metricName: "累计 Token 消耗", metricType: "token", dataSource: "calls + image_generation_logs", rankDirection: "desc", minEligibility: 1, titlePrefix: "Token 消耗", category: "token", enabled: true },
  { metricKey: "total_requests", metricName: "API 请求次数", metricType: "count", dataSource: "calls", rankDirection: "desc", minEligibility: 1, titlePrefix: "调用次数", category: "developer", enabled: true },
  { metricKey: "image_generation_count", metricName: "图像生成次数", metricType: "count", dataSource: "image_generation_logs", rankDirection: "desc", minEligibility: 1, titlePrefix: "图像生成", category: "image", enabled: true },
  { metricKey: "image_generation_tokens", metricName: "图像 Token 消耗", metricType: "token", dataSource: "image_generation_logs", rankDirection: "desc", minEligibility: 1, titlePrefix: "图像 Token", category: "image", enabled: true },
  { metricKey: "image_generation_spend_cny", metricName: "图像生成花费", metricType: "currency", dataSource: "image_generation_logs", rankDirection: "desc", minEligibility: 1, titlePrefix: "图像创作花费", category: "image", enabled: true },
  { metricKey: "prompt_polish_count", metricName: "润色使用次数", metricType: "count", dataSource: "image_generation_logs.metadata", rankDirection: "desc", minEligibility: 1, titlePrefix: "提示词润色", category: "image", enabled: true },
  { metricKey: "refine_from_image_count", metricName: "基于图片生成次数", metricType: "count", dataSource: "image_generation_logs.mode", rankDirection: "desc", minEligibility: 1, titlePrefix: "图生图优化", category: "image", enabled: true },
  { metricKey: "regenerate_count", metricName: "重新生成次数", metricType: "count", dataSource: "image_generation_logs.metadata", rankDirection: "desc", minEligibility: 1, titlePrefix: "风格探索", category: "image", enabled: true },
  { metricKey: "recharge_amount_cny", metricName: "充值金额", metricType: "currency", dataSource: "recharge_orders", rankDirection: "desc", minEligibility: 1, titlePrefix: "充值", category: "payment", enabled: true },
  { metricKey: "recharge_count", metricName: "充值次数", metricType: "count", dataSource: "recharge_orders", rankDirection: "desc", minEligibility: 1, titlePrefix: "充值次数", category: "payment", enabled: true },
  { metricKey: "invite_count", metricName: "邀请人数", metricType: "count", dataSource: "referral_relations + customers.invited_by", rankDirection: "desc", minEligibility: 1, titlePrefix: "邀请", category: "invite", enabled: true },
  { metricKey: "commission_amount_cny", metricName: "返佣金额", metricType: "currency", dataSource: "referral_rewards + commission_transactions", rankDirection: "desc", minEligibility: 1, titlePrefix: "返佣", category: "invite", enabled: true },
  { metricKey: "active_streak_days", metricName: "连续活跃天数", metricType: "day", dataSource: "calls.created_at + activity_logs", rankDirection: "desc", minEligibility: 2, titlePrefix: "连续活跃", category: "stability", enabled: true },
  { metricKey: "api_key_count", metricName: "API Key 数量", metricType: "count", dataSource: "api_keys", rankDirection: "desc", minEligibility: 1, titlePrefix: "密钥配置", category: "developer", enabled: true },
  { metricKey: "api_key_limit_config_count", metricName: "API Key 限制配置数", metricType: "count", dataSource: "api_keys.limit_enabled", rankDirection: "desc", minEligibility: 1, titlePrefix: "限制管理", category: "developer", enabled: true },
  { metricKey: "export_count", metricName: "导出次数", metricType: "count", dataSource: "activity_logs", rankDirection: "desc", minEligibility: 1, titlePrefix: "数据导出", category: "data", enabled: true },
  { metricKey: "saved_amount_cny", metricName: "累计节省", metricType: "currency", dataSource: "model pricing savings", rankDirection: "desc", minEligibility: 1, titlePrefix: "节省", category: "asset", enabled: true },
];

export function createModelTitleMetrics(modelId: string, modelName: string): TitleMetricDefinition[] {
  const cleanId = String(modelId || modelName || "unknown").trim();
  const name = String(modelName || modelId || "模型").trim();
  return [
    { metricKey: `model_tokens:${cleanId}`, metricName: `${name} Token 消耗`, metricType: "token", dataSource: "calls.model", rankDirection: "desc", minEligibility: 1, titlePrefix: name, category: "model", enabled: true },
    { metricKey: `model_spend:${cleanId}`, metricName: `${name} 花费`, metricType: "currency", dataSource: "calls.model", rankDirection: "desc", minEligibility: 1, titlePrefix: `${name} 花费`, category: "model", enabled: true },
  ];
}

export function getRegisteredTitleMetrics(dynamicMetrics: TitleMetricDefinition[] = []) {
  const byKey = new Map<string, TitleMetricDefinition>();
  for (const metric of [...STATIC_TITLE_METRICS, ...dynamicMetrics]) {
    if (metric.enabled) byKey.set(metric.metricKey, metric);
  }
  return Array.from(byKey.values());
}

export function formatTitleMetricValue(value: number, metricType: TitleMetricDefinition["metricType"]) {
  const number = Number(value || 0);
  if (metricType === "currency") return `$${number.toFixed(number >= 1 ? 2 : 6)}`;
  if (metricType === "token") return `${Math.round(number).toLocaleString()} Token`;
  if (metricType === "day") return `${Math.round(number).toLocaleString()} 天`;
  return `${Math.round(number).toLocaleString()} 次`;
}
