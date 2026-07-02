const WALLET_SOURCE_LABELS = {
  recharge_purchase: "用户充值兑换",
  admin_recharge: "后台管理员充值",
  admin_grant: "后台管理员赠送",
  register_gift: "注册赠送",
  daily_login_gift: "每日登录赠送",
  membership_daily_gift: "会员每日赠送",
  package_daily_gift: "套餐每日赠送",
  package_purchase_grant: "套餐购买赠送",
  commission_cny: "佣金收入",
  commission_convert_api: "佣金兑换余额",
  api_usage: "模型调用消费",
  refund_credit: "退款退回额度",
  system_compensation: "系统补偿",
  activity_reward: "活动奖励",
  expired_clear: "余额过期清零",
  manual_adjustment: "手动调整",
  temporary_credit_refund: "退款退回额度",
  referral_credit: "邀请奖励",
};

const DEFAULT_OPERATOR_TYPE = {
  recharge_purchase: "user",
  admin_recharge: "admin",
  admin_grant: "admin",
  register_gift: "system",
  daily_login_gift: "system",
  membership_daily_gift: "membership",
  package_daily_gift: "package",
  package_purchase_grant: "package",
  commission_cny: "commission",
  commission_convert_api: "commission",
  api_usage: "user",
  refund_credit: "system",
  system_compensation: "system",
  activity_reward: "system",
  expired_clear: "system",
  manual_adjustment: "admin",
  temporary_credit_refund: "system",
  referral_credit: "commission",
};

const EXPIRABLE_SOURCE_TYPES = new Set([
  "daily_login_gift",
  "membership_daily_gift",
  "package_daily_gift",
]);

export function sourceTypeToLabel(sourceType = "") {
  const key = String(sourceType || "").trim();
  return WALLET_SOURCE_LABELS[key] || key || "未命名来源";
}

export function sourceTypeToOperatorType(sourceType = "") {
  const key = String(sourceType || "").trim();
  return DEFAULT_OPERATOR_TYPE[key] || "system";
}

export function isExpirableWalletSource(sourceType = "") {
  return EXPIRABLE_SOURCE_TYPES.has(String(sourceType || "").trim());
}

export function resolveWalletSource(input = {}) {
  const sourceType = String(input.sourceType || input.type || "").trim() || "manual_adjustment";
  const sourceLabel = String(input.sourceLabel || "").trim() || sourceTypeToLabel(sourceType);
  const sourceDetail = String(input.sourceDetail || "").trim() || sourceLabel;
  const operatorType = String(input.operatorType || "").trim() || sourceTypeToOperatorType(sourceType);
  return {
    sourceType,
    sourceLabel,
    sourceDetail,
    operatorType,
    operatorId: String(input.operatorId || "").trim(),
    operatorName: String(input.operatorName || "").trim(),
    relatedOrderId: String(input.relatedOrderId || "").trim(),
    relatedRequestId: String(input.relatedRequestId || "").trim(),
    relatedPackageId: String(input.relatedPackageId || "").trim(),
    relatedMembershipId: String(input.relatedMembershipId || "").trim(),
    expiresAt: input.expiresAt || null,
    isExpirable: Boolean(input.isExpirable ?? isExpirableWalletSource(sourceType)),
  };
}

export function formatWalletSourceLine(input = {}) {
  const source = resolveWalletSource(input);
  const amountText = input.amountText || "";
  if (source.sourceType === "recharge_purchase" && input.amountRmbText && amountText) {
    return `${source.sourceLabel}：${input.amountRmbText} → ${amountText}`;
  }
  if (source.sourceDetail && amountText) {
    return `${source.sourceLabel}：${amountText}`;
  }
  return source.sourceLabel;
}
