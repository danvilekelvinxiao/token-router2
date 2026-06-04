import { hasDatabase, query } from "@/lib/db";
import { getCustomer, rechargeCustomer } from "@/lib/customer-store";
import {
  DEFAULT_REFERRAL_SETTINGS,
  REFERRAL_LEVELS,
  calculateReferralReward,
  getReferralLevel,
  normalizeReferralCode,
  roundMoney,
} from "@/lib/referrals/calculate";

const memory = globalThis.__FLOWAPI_REFERRALS__ || {
  withdrawals: [],
  rewards: [],
  commissionTransactions: [],
  settings: DEFAULT_REFERRAL_SETTINGS,
};

globalThis.__FLOWAPI_REFERRALS__ = memory;

const REFERRAL_VALID_RECHARGE_CNY = 30;

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function buildInviteUrl(code) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.flowapi.fun";
  return `${base.replace(/\/$/, "")}/register?invite=${encodeURIComponent(code)}`;
}

function maskUser(customer = {}) {
  const name = customer.name || customer.email?.split("@")[0] || "好友";
  if (!customer.email) return name;
  const [user, domain] = customer.email.split("@");
  return `${user.slice(0, 2)}***@${domain || "flowapi.fun"}`;
}

function rowToRelation(row) {
  return {
    id: row.id,
    referrerUserId: row.referrer_user_id,
    referredUserId: row.referred_user_id,
    referralCode: row.referral_code,
    registeredAt: row.registered_at ? new Date(row.registered_at).toISOString() : "",
    firstRechargeOrderId: row.first_recharge_order_id || "",
    firstRechargeAt: row.first_recharge_at ? new Date(row.first_recharge_at).toISOString() : null,
    firstBonusGranted: Boolean(row.first_bonus_granted),
    status: row.status || "pending",
    ip: row.ip || "",
    userAgent: row.user_agent || "",
    source: row.source || "",
    friendName: row.friend_name || "",
    friendEmail: row.friend_email || "",
    totalRechargeCny: Number(row.total_recharge_cny || 0),
    latestRechargeCny: Number(row.latest_recharge_cny || 0),
    latestRechargeAt: row.latest_recharge_at ? new Date(row.latest_recharge_at).toISOString() : null,
  };
}

function rowToReward(row) {
  return {
    id: row.id,
    referrerUserId: row.referrer_user_id,
    referredUserId: row.referred_user_id,
    orderId: row.order_id || "",
    paidAmountCny: Number(row.paid_amount_cny || 0),
    level: row.level || "普通邀请",
    commissionRate: Number(row.commission_rate || 0),
    commissionAmountCny: Number(row.commission_amount_cny || 0),
    creditBonusRate: Number(row.credit_bonus_rate || 0),
    creditBonusCny: Number(row.credit_bonus_cny || 0),
    friendBonusCny: Number(row.friend_bonus_cny || 0),
    rewardType: row.reward_type || "recharge_commission",
    status: row.status || "settled",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    friendName: row.friend_name || "",
    friendEmail: row.friend_email || "",
  };
}

function rowToWithdrawal(row) {
  return {
    id: row.id,
    userId: row.user_id,
    amountCny: Number(row.amount_cny || 0),
    method: row.withdraw_method || "alipay",
    account: row.account || "",
    realName: row.real_name || "",
    status: row.status || "pending",
    remark: row.remark || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    reviewedBy: row.reviewed_by || "",
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
  };
}

async function getCustomerByInviteCode(code) {
  const clean = normalizeReferralCode(code);
  if (!clean) return null;
  if (!hasDatabase()) {
    return null;
  }
  const result = await query(
    "SELECT * FROM customers WHERE my_invite_code = $1 AND email_verified = true LIMIT 1",
    [clean]
  );
  return result.rows[0] || null;
}

export async function ensureReferralCode(customerId) {
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  if (customer.myInviteCode) {
    if (hasDatabase()) {
      await query(
        `INSERT INTO referral_codes (id, user_id, code, invite_url, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, invite_url = EXCLUDED.invite_url`,
        [makeId("refcode"), customerId, customer.myInviteCode, buildInviteUrl(customer.myInviteCode)]
      );
    }
    return { code: customer.myInviteCode, inviteUrl: buildInviteUrl(customer.myInviteCode) };
  }

  const code = normalizeReferralCode(`FLOW${Math.floor(1000 + Math.random() * 9000)}`);
  if (hasDatabase()) {
    await query("UPDATE customers SET my_invite_code = $2 WHERE id = $1 AND (my_invite_code IS NULL OR my_invite_code = '')", [customerId, code]);
    await query(
      `INSERT INTO referral_codes (id, user_id, code, invite_url, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, invite_url = EXCLUDED.invite_url`,
      [makeId("refcode"), customerId, code, buildInviteUrl(code)]
    );
  }
  return { code, inviteUrl: buildInviteUrl(code) };
}

export async function bindReferral({ referredUserId, inviteCode, ip = "", userAgent = "", source = "" }) {
  const cleanCode = normalizeReferralCode(inviteCode);
  if (!referredUserId || !cleanCode) return { error: "邀请码无效" };

  if (!hasDatabase()) {
    return { ok: true, relation: null };
  }

  const invited = await query("SELECT id, invited_by FROM customers WHERE id = $1 LIMIT 1", [referredUserId]);
  const current = invited.rows[0];
  if (!current) return { error: "用户不存在" };
  if (current.invited_by) return { ok: true, skipped: "already_bound" };

  const referrer = await getCustomerByInviteCode(cleanCode);
  if (!referrer) return { error: "邀请码不存在" };
  if (referrer.id === referredUserId) return { error: "不能邀请自己" };

  const id = makeId("refrel");
  const suspicious = await isSuspiciousInvite(ip, userAgent);
  const status = suspicious ? "suspicious" : "pending";
  await query(
    `INSERT INTO referral_relations
      (id, referrer_user_id, referred_user_id, referral_code, status, ip, user_agent, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (referred_user_id) DO NOTHING`,
    [id, referrer.id, referredUserId, cleanCode, status, ip, userAgent, source]
  );
  await query(
    "UPDATE customers SET invited_by = $2, used_invite_code = $3 WHERE id = $1 AND invited_by IS NULL",
    [referredUserId, referrer.id, cleanCode]
  );
  return { ok: true };
}

async function isSuspiciousInvite(ip, userAgent) {
  if (!hasDatabase() || !ip) return false;
  const result = await query(
    `SELECT COUNT(*)::int AS cnt FROM referral_relations
     WHERE ip = $1 AND registered_at > NOW() - INTERVAL '24 hours'`,
    [ip]
  );
  return Number(result.rows[0]?.cnt || 0) >= 5 || /bot|spider|crawler/i.test(userAgent || "");
}

export async function getReferralMe(customerId) {
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  const codeInfo = await ensureReferralCode(customerId);
  const records = await listReferralRecords(customerId, { limit: 200 });
  const rewards = await listReferralRewards(customerId, { limit: 200 });
  const withdrawals = await listReferralWithdrawals({ userId: customerId, limit: 200 });

  const totalInvites = records.total || records.items.length;
  const validInvites = records.items.filter((item) => Number(item.totalRechargeCny || 0) >= REFERRAL_VALID_RECHARGE_CNY).length;
  const settledRewards = rewards.items.filter((item) => item.status === "settled" || item.status === "已结算");
  const totalCommissionCny = roundMoney(settledRewards.reduce((sum, item) => sum + Number(item.commissionAmountCny || 0), 0));
  const totalCreditBonusCny = roundMoney(settledRewards.reduce((sum, item) => sum + Number(item.creditBonusCny || 0), 0));
  const converted = await getCommissionTransactionTotal(customerId, "commission_convert_to_token");
  const paidWithdrawals = withdrawals.items.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amountCny || 0), 0);
  const frozenWithdrawals = withdrawals.items.filter((item) => ["pending", "approved"].includes(item.status)).reduce((sum, item) => sum + Number(item.amountCny || 0), 0);
  const withdrawableCommissionCny = roundMoney(Math.max(0, totalCommissionCny - converted - paidWithdrawals - frozenWithdrawals));
  const level = getReferralLevel(validInvites);
  const nextLevelNeed = level.nextTarget ? Math.max(0, level.nextTarget - validInvites) : 0;

  return {
    code: codeInfo?.code || customer.myInviteCode || "",
    inviteUrl: codeInfo?.inviteUrl || buildInviteUrl(customer.myInviteCode || ""),
    totalInvites,
    validInvites,
    totalCommissionCny,
    withdrawableCommissionCny,
    withdrawnCommissionCny: roundMoney(paidWithdrawals),
    frozenCommissionCny: roundMoney(frozenWithdrawals),
    totalCreditBonusCny,
    usedCommissionForTokenCny: roundMoney(converted),
    level: level.level,
    levelKey: level.key,
    nextLevelNeed,
    rules: REFERRAL_LEVELS,
    settings: DEFAULT_REFERRAL_SETTINGS,
    invitedUsers: records.items,
    rewards: rewards.items,
    withdrawals: withdrawals.items,
  };
}

async function getCommissionTransactionTotal(userId, type) {
  if (hasDatabase()) {
    const result = await query(
      "SELECT COALESCE(SUM(amount_cny), 0) AS total FROM commission_transactions WHERE user_id = $1 AND type = $2",
      [userId, type]
    );
    return Number(result.rows[0]?.total || 0);
  }
  return (memory.commissionTransactions || [])
    .filter((item) => item.userId === userId && item.type === type)
    .reduce((sum, item) => sum + Number(item.amountCny || 0), 0);
}

export async function listReferralRecords(customerId, { limit = 20 } = {}) {
  if (!hasDatabase()) {
    return {
      items: [],
      total: 0,
    };
  }
  const result = await query(
    `SELECT rr.*,
            c.email AS friend_email,
            c.name AS friend_name,
            COALESCE(SUM(CASE WHEN ro.status IN ('approved', 'paid', 'manual_confirmed') THEN ro.amount ELSE 0 END), 0) AS total_recharge_cny,
            COALESCE(MAX(CASE WHEN ro.status IN ('approved', 'paid', 'manual_confirmed') THEN ro.amount ELSE NULL END), 0) AS latest_recharge_cny,
            MAX(CASE WHEN ro.status IN ('approved', 'paid', 'manual_confirmed') THEN COALESCE(ro.approved_at, ro.paid_at, ro.created_at) ELSE NULL END) AS latest_recharge_at
     FROM referral_relations rr
     JOIN customers c ON c.id = rr.referred_user_id
     LEFT JOIN recharge_orders ro ON ro.customer_id = rr.referred_user_id
     WHERE rr.referrer_user_id = $1
     GROUP BY rr.id, c.email, c.name
     ORDER BY rr.registered_at DESC
     LIMIT $2`,
    [customerId, Number(limit) || 20]
  );
  const count = await query("SELECT COUNT(*)::int AS cnt FROM referral_relations WHERE referrer_user_id = $1", [customerId]);
  const rewards = await listReferralRewards(customerId, { limit: 500 });
  const items = result.rows.map(rowToRelation).map((item) => {
    const relatedRewards = rewards.items.filter((reward) => reward.referredUserId === item.referredUserId);
    return {
      id: item.id,
      name: item.friendName || maskUser({ email: item.friendEmail }),
      registeredAt: item.registeredAt,
      firstRecharge: Number(item.totalRechargeCny || 0) >= REFERRAL_VALID_RECHARGE_CNY,
      totalRechargeCny: item.totalRechargeCny,
      latestRechargeCny: item.latestRechargeCny,
      commissionCny: roundMoney(relatedRewards.reduce((sum, reward) => sum + Number(reward.commissionAmountCny || 0), 0)),
      creditBonusCny: roundMoney(relatedRewards.reduce((sum, reward) => sum + Number(reward.creditBonusCny || 0), 0)),
      status: item.status === "suspicious"
        ? "异常待审"
        : Number(item.totalRechargeCny || 0) >= REFERRAL_VALID_RECHARGE_CNY
          ? (relatedRewards.length ? "奖励已发放" : "有效邀请")
          : Number(item.totalRechargeCny || 0) > 0
            ? "待充值达标"
            : "已注册",
    };
  });
  return { items, total: Number(count.rows[0]?.cnt || items.length) };
}

export async function listReferralRewards(customerId, { limit = 50 } = {}) {
  if (!hasDatabase()) {
    return { items: memory.rewards.filter((item) => item.referrerUserId === customerId).slice(0, limit), total: 0 };
  }
  const result = await query(
    `SELECT rw.*, c.email AS friend_email, c.name AS friend_name
     FROM referral_rewards rw
     LEFT JOIN customers c ON c.id = rw.referred_user_id
     WHERE rw.referrer_user_id = $1
     ORDER BY rw.created_at DESC
     LIMIT $2`,
    [customerId, Number(limit) || 50]
  );
  return {
    items: result.rows.map(rowToReward).map((item) => ({
      ...item,
      friend: item.friendName || maskUser({ email: item.friendEmail }),
    })),
    total: result.rows.length,
  };
}

export async function listReferralWithdrawals({ userId = "", limit = 100 } = {}) {
  if (!hasDatabase()) {
    const items = memory.withdrawals.filter((item) => !userId || item.userId === userId).slice(0, limit);
    return { items, total: items.length };
  }
  const params = [];
  const where = userId ? "WHERE user_id = $1" : "";
  if (userId) params.push(userId);
  params.push(Number(limit) || 100);
  const result = await query(
    `SELECT * FROM referral_withdrawals ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return { items: result.rows.map(rowToWithdrawal), total: result.rows.length };
}

export async function convertCommissionToBalance({ customerId, amountCny }) {
  const amount = roundMoney(amountCny);
  if (!customerId || amount <= 0) return { error: "请输入有效金额" };
  const summary = await getReferralMe(customerId);
  if (!summary) return { error: "用户不存在" };
  if (amount > summary.withdrawableCommissionCny) return { error: "可提现佣金不足" };

  const before = summary.withdrawableCommissionCny;
  const after = roundMoney(before - amount);
  memory.commissionTransactions.push({
    id: makeId("comtx"),
    userId: customerId,
    type: "commission_convert_to_token",
    amountCny: amount,
    beforeAmountCny: before,
    afterAmountCny: after,
    note: "佣金购买 Token",
    createdAt: new Date().toISOString(),
  });

  if (hasDatabase()) {
    await query(
      `INSERT INTO commission_transactions (id, user_id, type, amount_cny, before_amount_cny, after_amount_cny, note)
       VALUES ($1, $2, 'commission_convert_to_token', $3, $4, $5, '佣金购买 Token')`,
      [makeId("comtx"), customerId, amount, before, after]
    );
  }

  const customer = await rechargeCustomer(customerId, amount);
  return {
    success: true,
    convertedAmountCny: amount,
    newCommissionBalanceCny: after,
    newBalanceCny: Number(customer?.balance || 0),
    customer,
  };
}

export async function createReferralWithdrawal({ customerId, amountCny, method, account, realName, remark = "" }) {
  const amount = roundMoney(amountCny);
  const min = DEFAULT_REFERRAL_SETTINGS.minWithdrawAmountCny;
  if (!customerId) return { error: "请先登录后再提现" };
  if (amount < min) return { error: `最低提现金额为 ¥${min}` };
  if (!["alipay", "wechat"].includes(method)) return { error: "请选择提现方式" };
  if (!String(account || "").trim() || !String(realName || "").trim()) return { error: "请填写收款账号和姓名" };

  const summary = await getReferralMe(customerId);
  if (!summary) return { error: "用户不存在" };
  if (amount > summary.withdrawableCommissionCny) return { error: "可提现佣金不足" };

  const withdrawal = {
    id: makeId("wd"),
    userId: customerId,
    amountCny: amount,
    method,
    account: String(account).trim(),
    realName: String(realName).trim(),
    status: "pending",
    remark: String(remark || "").slice(0, 300),
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: "",
    paidAt: null,
  };

  memory.withdrawals.unshift(withdrawal);

  if (hasDatabase()) {
    await query(
      `INSERT INTO referral_withdrawals
        (id, user_id, amount_cny, withdraw_method, account, real_name, status, remark)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
      [withdrawal.id, customerId, amount, method, withdrawal.account, withdrawal.realName, withdrawal.remark]
    );
  }

  return { success: true, withdrawal };
}

export async function handlePaidReferralOrder({ orderId, userId, paidAmountCny }) {
  const amount = roundMoney(paidAmountCny);
  if (!orderId || !userId || amount <= 0) return { error: "订单参数无效" };

  if (!hasDatabase()) return { success: true, skipped: "no_database" };

  const relationResult = await query(
    `SELECT * FROM referral_relations WHERE referred_user_id = $1 LIMIT 1`,
    [userId]
  );
  let relation = relationResult.rows[0];
  if (!relation) {
    const customer = await query("SELECT invited_by, used_invite_code FROM customers WHERE id = $1 LIMIT 1", [userId]);
    const invitedBy = customer.rows[0]?.invited_by;
    if (!invitedBy) return { success: true, skipped: "no_referrer" };
    const id = makeId("refrel");
    await query(
      `INSERT INTO referral_relations (id, referrer_user_id, referred_user_id, referral_code, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (referred_user_id) DO NOTHING`,
      [id, invitedBy, userId, customer.rows[0]?.used_invite_code || ""]
    );
    const created = await query("SELECT * FROM referral_relations WHERE referred_user_id = $1 LIMIT 1", [userId]);
    relation = created.rows[0];
  }

  if (!relation || relation.status === "invalid") return { success: true, skipped: "invalid_relation" };
  const duplicate = await query("SELECT id FROM referral_rewards WHERE order_id = $1 LIMIT 1", [orderId]);
  if (duplicate.rows[0]) return { success: true, skipped: "already_rewarded" };

  const rechargeTotalResult = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM recharge_orders
     WHERE customer_id = $1
       AND status IN ('approved', 'paid', 'manual_confirmed')`,
    [userId]
  );
  const cumulativeRechargeCny = Math.max(amount, Number(rechargeTotalResult.rows[0]?.total || 0));
  if (cumulativeRechargeCny < REFERRAL_VALID_RECHARGE_CNY) {
    await query(
      `UPDATE referral_relations
       SET status = CASE WHEN status = 'pending' THEN 'registered' ELSE status END
       WHERE id = $1`,
      [relation.id]
    );
    return {
      success: true,
      skipped: "below_valid_recharge_threshold",
      thresholdCny: REFERRAL_VALID_RECHARGE_CNY,
      cumulativeRechargeCny,
    };
  }

  const validCountResult = await query(
    `SELECT COUNT(*)::int AS cnt
     FROM referral_relations
     WHERE referrer_user_id = $1
       AND first_recharge_at IS NOT NULL
       AND status <> 'invalid'`,
    [relation.referrer_user_id]
  );
  const validInviteCount = Number(validCountResult.rows[0]?.cnt || 0);
  const isFirstRecharge = !relation.first_bonus_granted;
  const reward = calculateReferralReward({ paidAmountCny: amount, validInviteCount, isFirstRecharge });
  const rewardId = makeId("rwd");

  await query(
    `INSERT INTO referral_rewards
      (id, referrer_user_id, referred_user_id, order_id, paid_amount_cny, level, commission_rate,
       commission_amount_cny, credit_bonus_rate, credit_bonus_cny, friend_bonus_cny, reward_type, status, settled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'settled', NOW())`,
    [
      rewardId,
      relation.referrer_user_id,
      userId,
      orderId,
      amount,
      reward.level,
      reward.commissionRate,
      reward.commissionAmountCny,
      reward.creditBonusRate,
      reward.creditBonusCny,
      reward.friendBonusCny,
      reward.rewardType,
    ]
  );

  if (reward.creditBonusCny > 0) {
    await rechargeCustomer(relation.referrer_user_id, reward.creditBonusCny);
  }
  if (reward.friendBonusCny > 0) {
    await rechargeCustomer(userId, reward.friendBonusCny);
  }
  await query(
    `UPDATE referral_relations
     SET first_recharge_order_id = COALESCE(first_recharge_order_id, $2),
         first_recharge_at = COALESCE(first_recharge_at, NOW()),
         first_bonus_granted = true,
         status = CASE WHEN status = 'pending' THEN 'active' ELSE status END
     WHERE id = $1`,
    [relation.id, orderId]
  );

  return {
    success: true,
    commissionAmountCny: reward.commissionAmountCny,
    creditBonusCny: reward.creditBonusCny,
    friendBonusCny: reward.friendBonusCny,
  };
}

export async function getReferralAdminOverview() {
  if (!hasDatabase()) {
    return {
      totalInvites: 0,
      validInvites: 0,
      totalCommissionCny: 0,
      pendingWithdrawCny: 0,
      paidWithdrawCny: 0,
      totalCreditBonusCny: 0,
      convertedToTokenCny: 0,
      topReferrers: [],
    };
  }
  const [relationStats, rewardStats, withdrawalStats] = await Promise.all([
    query("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE first_recharge_at IS NOT NULL)::int valid FROM referral_relations"),
    query("SELECT COALESCE(SUM(commission_amount_cny),0) commission, COALESCE(SUM(credit_bonus_cny + friend_bonus_cny),0) credits FROM referral_rewards WHERE status = 'settled'"),
    query("SELECT COALESCE(SUM(amount_cny) FILTER (WHERE status IN ('pending','approved')),0) pending, COALESCE(SUM(amount_cny) FILTER (WHERE status = 'paid'),0) paid FROM referral_withdrawals"),
  ]);
  return {
    totalInvites: Number(relationStats.rows[0]?.total || 0),
    validInvites: Number(relationStats.rows[0]?.valid || 0),
    totalCommissionCny: Number(rewardStats.rows[0]?.commission || 0),
    pendingWithdrawCny: Number(withdrawalStats.rows[0]?.pending || 0),
    paidWithdrawCny: Number(withdrawalStats.rows[0]?.paid || 0),
    totalCreditBonusCny: Number(rewardStats.rows[0]?.credits || 0),
    convertedToTokenCny: 0,
    topReferrers: [],
  };
}

export async function getReferralAdminRelations() {
  if (!hasDatabase()) return { items: [] };
  const result = await query(
    `SELECT rr.*, ref.email AS referrer_email, ref.name AS referrer_name, c.email AS friend_email, c.name AS friend_name
     FROM referral_relations rr
     JOIN customers ref ON ref.id = rr.referrer_user_id
     JOIN customers c ON c.id = rr.referred_user_id
     ORDER BY rr.registered_at DESC
     LIMIT 300`
  );
  return { items: result.rows.map((row) => ({ ...rowToRelation(row), referrer: row.referrer_name || row.referrer_email, friend: row.friend_name || row.friend_email })) };
}

export async function getReferralAdminRewards() {
  if (!hasDatabase()) return { items: memory.rewards };
  const result = await query(
    `SELECT rw.*, ref.email AS referrer_email, ref.name AS referrer_name, c.email AS friend_email, c.name AS friend_name
     FROM referral_rewards rw
     JOIN customers ref ON ref.id = rw.referrer_user_id
     LEFT JOIN customers c ON c.id = rw.referred_user_id
     ORDER BY rw.created_at DESC
     LIMIT 500`
  );
  return { items: result.rows.map(rowToReward).map((item, index) => ({ ...item, referrer: result.rows[index].referrer_name || result.rows[index].referrer_email, friend: result.rows[index].friend_name || result.rows[index].friend_email })) };
}

export async function reviewReferralWithdrawal({ id, action, adminId = "admin", note = "" }) {
  if (!id) return { error: "缺少提现申请" };
  const statusMap = { approve: "approved", reject: "rejected", paid: "paid" };
  const next = statusMap[action];
  if (!next) return { error: "审核动作无效" };
  if (!hasDatabase()) {
    const item = memory.withdrawals.find((entry) => entry.id === id);
    if (!item) return { error: "提现申请不存在" };
    item.status = next;
    item.reviewedBy = adminId;
    item.reviewedAt = new Date().toISOString();
    if (next === "paid") item.paidAt = new Date().toISOString();
    if (note) item.remark = note;
    return { success: true, withdrawal: item };
  }
  const result = await query(
    `UPDATE referral_withdrawals
     SET status = $2,
         reviewed_by = $3,
         reviewed_at = NOW(),
         paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END,
         remark = COALESCE(NULLIF($4, ''), remark)
     WHERE id = $1
     RETURNING *`,
    [id, next, adminId, note]
  );
  if (!result.rows[0]) return { error: "提现申请不存在" };
  return { success: true, withdrawal: rowToWithdrawal(result.rows[0]) };
}
