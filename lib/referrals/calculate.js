export const REFERRAL_LEVELS = [
  {
    key: "basic",
    level: "普通邀请",
    rangeLabel: "0 - 19 人",
    minValidInvites: 0,
    nextTarget: 20,
    commissionRate: 0,
    creditBonusRate: 10,
  },
  {
    key: "advanced",
    level: "进阶邀请",
    rangeLabel: "20 - 49 人",
    minValidInvites: 20,
    nextTarget: 50,
    commissionRate: 10,
    creditBonusRate: 10,
  },
  {
    key: "premium",
    level: "高级邀请",
    rangeLabel: "50 人及以上",
    minValidInvites: 50,
    nextTarget: null,
    commissionRate: 15,
    creditBonusRate: 15,
  },
];

export const DEFAULT_REFERRAL_SETTINGS = {
  enabled: true,
  firstRechargeBonusRate: 10,
  minWithdrawAmountCny: 20,
  continueRechargeReward: true,
  allowCommissionConvert: true,
  settlementDelayDays: 0,
  manualReviewCommission: false,
  levels: REFERRAL_LEVELS,
};

export function getReferralLevel(validInviteCount = 0) {
  const count = Number(validInviteCount) || 0;
  if (count >= 50) return REFERRAL_LEVELS[2];
  if (count >= 20) return REFERRAL_LEVELS[1];
  return REFERRAL_LEVELS[0];
}

export function calculateReferralReward({
  paidAmountCny,
  validInviteCount = 0,
  isFirstRecharge = false,
  settings = DEFAULT_REFERRAL_SETTINGS,
} = {}) {
  const paid = Math.max(0, Number(paidAmountCny) || 0);
  const level = getReferralLevel(validInviteCount);
  const firstBonusRate = Number(settings.firstRechargeBonusRate ?? 10);
  const commissionRate = Number(level.commissionRate || 0);
  const creditBonusRate = Number(level.creditBonusRate || 0);
  const friendBonusCny = isFirstRecharge ? roundMoney(paid * firstBonusRate / 100) : 0;

  return {
    level: level.level,
    levelKey: level.key,
    commissionRate,
    creditBonusRate,
    firstBonusRate,
    commissionAmountCny: roundMoney(paid * commissionRate / 100),
    creditBonusCny: roundMoney(paid * creditBonusRate / 100),
    friendBonusCny,
    rewardType: isFirstRecharge ? "first_recharge_bonus" : "recharge_commission",
  };
}

export function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

export function normalizeReferralCode(value = "") {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}
