import { calculateCustomerSavings } from "@/lib/analytics/savings";
import { getContent } from "@/lib/content-cms";
import { getDashboard, listCustomers } from "@/lib/customer-store";
import { hasDatabase, query } from "@/lib/db";
import {
  STATIC_TITLE_METRICS,
  createModelTitleMetrics,
  formatTitleMetricValue,
  getRegisteredTitleMetrics,
  type TitleMetricCategory,
  type TitleMetricDefinition,
} from "./title-metric-registry";

type TitleMetricSnapshot = {
  userId: string;
  metrics: Record<string, number>;
  modelLabels: Record<string, { model: string; provider: string }>;
};

const titleGlobal = globalThis as typeof globalThis & { __FLOWAPI_TITLE_STORE__?: any };
const memoryTitleStore = titleGlobal.__FLOWAPI_TITLE_STORE__ || {
  rules: [],
  userTitles: [],
  snapshots: [],
  states: [],
};

titleGlobal.__FLOWAPI_TITLE_STORE__ = memoryTitleStore;

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_:/.-]+/g, "")
    .trim();
}

function ordinal(rank: number) {
  return ["", "第一", "第二", "第三", "第四", "第五", "第六", "第七", "第八", "第九", "第十"][rank] || `第 ${rank}`;
}

function titleLevel(rank: number, percentileTop: number | null) {
  if (rank === 1) return "legendary";
  if (rank <= 3) return "diamond";
  if (rank <= 10) return "platinum";
  if (percentileTop === 1) return "red";
  if (percentileTop === 5) return "gold";
  return "normal";
}

function titlePriority(rank: number, percentileTop: number | null, rulePriority = 50) {
  if (rank === 1) return 1000 + rulePriority;
  if (rank <= 3) return 900 - rank * 10 + rulePriority;
  if (rank <= 10) return 800 - rank * 5 + rulePriority;
  if (percentileTop === 1) return 650 + rulePriority;
  if (percentileTop === 5) return 520 + rulePriority;
  if (percentileTop === 10) return 420 + rulePriority;
  return rulePriority;
}

function getCallModel(call: any, modelConfigs: any[] = []) {
  const candidates = [call?.requestedModel, call?.routedModel, call?.model, call?.requested_model, call?.routed_model]
    .map(normalizeKey)
    .filter(Boolean);
  const config = modelConfigs.find((item) => {
    const values = [item?.id, item?.displayName, item?.modelId, item?.publicModelId, item?.actualModelId].map(normalizeKey).filter(Boolean);
    return values.some((value) => candidates.some((candidate) => value === candidate || value.includes(candidate) || candidate.includes(value)));
  });
  return {
    id: normalizeKey(config?.id || call?.requestedModel || call?.requested_model || call?.routedModel || call?.routed_model || "unknown"),
    model: config?.displayName || call?.routedModel || call?.routed_model || call?.requestedModel || call?.requested_model || "Unknown Model",
    provider: config?.provider || call?.provider || "FlowAPI",
  };
}

function calculateActiveStreakDays(calls: any[] = []) {
  const days = Array.from(new Set(calls.map((call) => String(call.createdAt || call.created_at || "").slice(0, 10)).filter(Boolean))).sort().reverse();
  if (!days.length) return 0;
  let streak = 0;
  let cursor = new Date(`${days[0]}T00:00:00.000Z`);
  for (const day of days) {
    const expected = cursor.toISOString().slice(0, 10);
    if (day !== expected) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return streak;
}

async function getDbMetricRows() {
  if (!hasDatabase()) return null;
  const safeRows = async (sql: string) => {
    try {
      const result = await query(sql);
      return result?.rows || [];
    } catch {
      return [];
    }
  };
  const [images, recharges, invites, commissions, keys, exports] = await Promise.all([
    safeRows(`SELECT user_id, mode, token_cost, money_cost, metadata FROM image_generation_logs WHERE status IN ('success','partial_success')`),
    safeRows(`SELECT customer_id, amount FROM recharge_orders WHERE status IN ('approved','paid','manual_confirmed')`),
    safeRows(`SELECT referrer_user_id AS user_id, COUNT(*)::int AS count FROM referral_relations WHERE status <> 'invalid' GROUP BY referrer_user_id`),
    safeRows(`SELECT referrer_user_id AS user_id, COALESCE(SUM(commission_amount_cny),0) AS amount FROM referral_rewards WHERE status = 'settled' GROUP BY referrer_user_id`),
    safeRows(`SELECT customer_id, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE limit_enabled = true)::int AS limited_count FROM api_keys WHERE deleted_at IS NULL GROUP BY customer_id`),
    safeRows(`SELECT customer_id, COUNT(*)::int AS count FROM activity_logs WHERE action ILIKE '%export%' OR action ILIKE '%导出%' GROUP BY customer_id`),
  ]);
  return {
    images,
    recharges,
    invites,
    commissions,
    keys,
    exports,
  };
}

function addMetric(metrics: Record<string, number>, key: string, value: number) {
  metrics[key] = toNumber(metrics[key]) + toNumber(value);
}

async function buildSnapshots(): Promise<{ snapshots: TitleMetricSnapshot[]; metrics: TitleMetricDefinition[] }> {
  const modelConfigs = getContent("models");
  const customers = await listCustomers();
  const dashboards = await Promise.all((customers || []).map((customer: any) => getDashboard(customer.id)));
  const dbRows = await getDbMetricRows();
  const modelLabelMap = new Map<string, { model: string; provider: string }>();

  const snapshots = dashboards.filter(Boolean).map((customer: any) => {
    const calls = Array.isArray(customer.calls) ? customer.calls : [];
    const metrics: Record<string, number> = {};
    const modelLabels: Record<string, { model: string; provider: string }> = {};
    const savings = calculateCustomerSavings({ calls, modelConfigs, period: "all" });

    addMetric(metrics, "total_spend_cny", toNumber(customer.totalSpend, calls.reduce((sum: number, call: any) => sum + toNumber(call.cost), 0)));
    addMetric(metrics, "total_tokens", calls.reduce((sum: number, call: any) => sum + toNumber(call.tokens, toNumber(call.promptTokens) + toNumber(call.completionTokens)), 0));
    addMetric(metrics, "total_requests", calls.length);
    addMetric(metrics, "invite_count", toNumber(customer.inviteCount));
    addMetric(metrics, "active_streak_days", calculateActiveStreakDays(calls));
    addMetric(metrics, "api_key_count", Array.isArray(customer.apiKeys) ? customer.apiKeys.length : toNumber(customer.keyCount));
    addMetric(metrics, "api_key_limit_config_count", (customer.apiKeys || []).filter((key: any) => key.limitEnabled || key.limit_enabled).length);
    addMetric(metrics, "saved_amount_cny", toNumber(savings.summary?.savedAmountCny));

    for (const call of calls) {
      const info = getCallModel(call, modelConfigs);
      if (!info.id || info.id === "unknown") continue;
      modelLabels[info.id] = { model: info.model, provider: info.provider };
      modelLabelMap.set(info.id, { model: info.model, provider: info.provider });
      addMetric(metrics, `model_tokens:${info.id}`, toNumber(call.tokens, toNumber(call.promptTokens) + toNumber(call.completionTokens)));
      addMetric(metrics, `model_spend:${info.id}`, toNumber(call.cost));
    }

    if (dbRows) {
      for (const row of dbRows.images.filter((item: any) => item.user_id === customer.id)) {
        addMetric(metrics, "image_generation_count", 1);
        addMetric(metrics, "image_generation_tokens", toNumber(row.token_cost));
        addMetric(metrics, "image_generation_spend_cny", toNumber(row.money_cost));
        if (row.mode === "image_to_image") addMetric(metrics, "refine_from_image_count", 1);
        let metadata = row.metadata || {};
        if (typeof metadata === "string") {
          try { metadata = JSON.parse(metadata || "{}"); } catch { metadata = {}; }
        }
        if (metadata.actionType === "prompt_polish") addMetric(metrics, "prompt_polish_count", 1);
        if (metadata.actionType === "regenerate" || metadata.sourceGenerationId) addMetric(metrics, "regenerate_count", 1);
      }
      for (const row of dbRows.recharges.filter((item: any) => item.customer_id === customer.id)) {
        addMetric(metrics, "recharge_amount_cny", toNumber(row.amount));
        addMetric(metrics, "recharge_count", 1);
      }
      const invite = dbRows.invites.find((item: any) => item.user_id === customer.id);
      if (invite) addMetric(metrics, "invite_count", toNumber(invite.count));
      const commission = dbRows.commissions.find((item: any) => item.user_id === customer.id);
      if (commission) addMetric(metrics, "commission_amount_cny", toNumber(commission.amount));
      const keys = dbRows.keys.find((item: any) => item.customer_id === customer.id);
      if (keys) {
        metrics.api_key_count = Math.max(toNumber(metrics.api_key_count), toNumber(keys.count));
        metrics.api_key_limit_config_count = Math.max(toNumber(metrics.api_key_limit_config_count), toNumber(keys.limited_count));
      }
      const exports = dbRows.exports.find((item: any) => item.customer_id === customer.id);
      if (exports) addMetric(metrics, "export_count", toNumber(exports.count));
    }

    return { userId: customer.id, metrics, modelLabels };
  });

  const dynamicMetrics = Array.from(modelLabelMap.entries()).flatMap(([id, info]) => createModelTitleMetrics(id, info.model));
  return { snapshots, metrics: getRegisteredTitleMetrics(dynamicMetrics) };
}

async function ensureDefaultTitleRules(metrics: TitleMetricDefinition[]) {
  if (!hasDatabase()) {
    for (const metric of metrics) {
      if (!memoryTitleStore.rules.find((rule: any) => rule.ruleKey === metric.metricKey)) {
        memoryTitleStore.rules.push(metricToRule(metric));
      }
    }
    return memoryTitleStore.rules;
  }

  for (const metric of metrics) {
    const rule = metricToRule(metric);
    await query(
      `INSERT INTO title_rules
        (rule_key, name_template, description_template, metric_key, metric_name, metric_type,
         rank_enabled, percentile_enabled, top_rank_limit, percentile_thresholds, level, icon, color,
         animation_enabled, highlight_enabled, category, enabled, sort_priority)
       VALUES ($1,$2,$3,$4,$5,$6,true,true,10,$7::jsonb,$8,$9,$10,$11,$12,$13,true,$14)
       ON CONFLICT (rule_key) DO UPDATE
       SET metric_name = EXCLUDED.metric_name,
           metric_type = EXCLUDED.metric_type,
           category = EXCLUDED.category,
           updated_at = NOW()`,
      [
        rule.ruleKey,
        rule.nameTemplate,
        rule.descriptionTemplate,
        rule.metricKey,
        rule.metricName,
        rule.metricType,
        JSON.stringify(rule.percentileThresholds),
        rule.level,
        rule.icon,
        rule.color,
        rule.animationEnabled,
        rule.highlightEnabled,
        rule.category,
        rule.sortPriority,
      ]
    );
  }
  const result = await query("SELECT * FROM title_rules WHERE enabled = true ORDER BY sort_priority DESC, created_at ASC");
  return (result?.rows || []).map(rowToRule);
}

function metricToRule(metric: TitleMetricDefinition) {
  const priority = metric.metricKey.startsWith("model_") ? 70 : metric.category === "asset" ? 95 : metric.category === "token" ? 90 : metric.category === "image" ? 85 : 60;
  return {
    ruleKey: metric.metricKey,
    nameTemplate: `${metric.titlePrefix}{rankLabel}`,
    descriptionTemplate: `你是 FlowAPI ${metric.metricName}排名{rankDescription}的用户。`,
    metricKey: metric.metricKey,
    metricName: metric.metricName,
    metricType: metric.metricType,
    rankEnabled: true,
    percentileEnabled: true,
    topRankLimit: 10,
    percentileThresholds: [1, 5, 10],
    level: "platinum",
    icon: "",
    color: "",
    animationEnabled: true,
    highlightEnabled: true,
    category: metric.category,
    enabled: true,
    sortPriority: priority,
  };
}

function rowToRule(row: any) {
  return {
    ruleKey: row.rule_key,
    nameTemplate: row.name_template,
    descriptionTemplate: row.description_template,
    metricKey: row.metric_key,
    metricName: row.metric_name,
    metricType: row.metric_type,
    rankEnabled: row.rank_enabled,
    percentileEnabled: row.percentile_enabled,
    topRankLimit: toNumber(row.top_rank_limit, 10),
    percentileThresholds: Array.isArray(row.percentile_thresholds) ? row.percentile_thresholds : [1, 5, 10],
    level: row.level || "platinum",
    icon: row.icon || "",
    color: row.color || "",
    animationEnabled: row.animation_enabled,
    highlightEnabled: row.highlight_enabled,
    category: row.category || "asset",
    enabled: row.enabled,
    sortPriority: toNumber(row.sort_priority, 50),
  };
}

function buildTitle(rule: any, metric: TitleMetricDefinition | undefined, userMetric: { rank: number; total: number; value: number; percentileTop: number | null }) {
  const rankLabel = userMetric.rank <= rule.topRankLimit ? ordinal(userMetric.rank) : `前 ${userMetric.percentileTop}%`;
  const rankDescription = userMetric.rank <= rule.topRankLimit ? `第 ${userMetric.rank}` : `前 ${userMetric.percentileTop}%`;
  const level = titleLevel(userMetric.rank, userMetric.percentileTop);
  const id = `${rule.metricKey.replace(/[^a-zA-Z0-9]+/g, "_")}_${userMetric.rank <= rule.topRankLimit ? `rank_${userMetric.rank}` : `top_${userMetric.percentileTop}`}`;
  const title = String(rule.nameTemplate || `${rule.metricName}{rankLabel}`).replace("{rank}", String(userMetric.rank)).replace("{rankLabel}", rankLabel).replace("{percentile}", String(userMetric.percentileTop || ""));
  const description = String(rule.descriptionTemplate || `你是 FlowAPI ${rule.metricName}排名{rankDescription}的用户。`).replace("{rank}", String(userMetric.rank)).replace("{rankLabel}", rankLabel).replace("{rankDescription}", rankDescription).replace("{percentile}", String(userMetric.percentileTop || ""));
  const metricUnit = rule.metricType === "currency" ? "$" : rule.metricType === "token" ? "Token" : rule.metricType === "day" ? "天" : "次";
  return {
    id,
    name: title,
    title,
    type: userMetric.rank <= rule.topRankLimit ? "rank" : "percentile",
    level,
    description,
    rank: userMetric.rank <= rule.topRankLimit ? userMetric.rank : userMetric.rank,
    percentile: userMetric.rank <= rule.topRankLimit ? null : userMetric.percentileTop,
    percentileTop: userMetric.rank <= rule.topRankLimit ? null : userMetric.percentileTop,
    metric: rule.metricKey,
    metricValue: userMetric.value,
    metricUnit,
    metricFormatted: formatTitleMetricValue(userMetric.value, rule.metricType),
    animated: Boolean(rule.animationEnabled && userMetric.rank <= 10),
    highlight: Boolean(rule.highlightEnabled && (userMetric.rank === 1 || userMetric.percentileTop === 1)),
    category: rule.category as TitleMetricCategory,
    dimension: rule.metricName,
    period: "累计",
    displayPriority: titlePriority(userMetric.rank, userMetric.percentileTop, toNumber(rule.sortPriority)),
    updatedAt: nowIso(),
    model: metric?.metricKey?.startsWith("model_") ? rule.metricName.replace(/ Token 消耗| 花费/g, "") : null,
    provider: null,
  };
}

function selectDisplayTitles(titles: any[]) {
  const result: any[] = [];
  const usedCategory = new Set<string>();
  const usedMetricFamily = new Set<string>();
  for (const title of [...titles].sort((a, b) => b.displayPriority - a.displayPriority)) {
    if (result.length >= 6) break;
    const family = title.metric.replace(/:(.+)$/g, ":model").replace(/^model_(tokens|spend)/, "model");
    if (usedMetricFamily.has(family)) continue;
    if (result.length >= 3 && usedCategory.has(title.category)) continue;
    result.push(title);
    usedCategory.add(title.category);
    usedMetricFamily.add(family);
  }
  return result.slice(0, Math.max(3, Math.min(6, result.length)));
}

async function persistTitles(userId: string, titles: any[], snapshots: TitleMetricSnapshot[]) {
  const updatedAt = nowIso();
  if (!hasDatabase()) {
    memoryTitleStore.userTitles = memoryTitleStore.userTitles.filter((item: any) => item.userId !== userId);
    memoryTitleStore.userTitles.push(...titles.map((title) => ({ ...title, userId })));
    memoryTitleStore.snapshots = snapshots;
    memoryTitleStore.states = memoryTitleStore.states.filter((state: any) => state.userId !== userId);
    memoryTitleStore.states.push({ userId, stale: false, updatedAt });
    return;
  }
  await query("DELETE FROM user_titles WHERE user_id = $1", [userId]);
  for (const title of titles) {
    await query(
      `INSERT INTO user_titles
       (id, user_id, title_key, name, type, level, description, rank, percentile, metric_key,
        metric_value, metric_unit, category, animated, highlight, display_priority, metadata, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,NOW())`,
      [
        `${userId}_${title.id}`,
        userId,
        title.id,
        title.title,
        title.type,
        title.level,
        title.description,
        title.rank,
        title.percentileTop,
        title.metric,
        title.metricValue,
        title.metricUnit,
        title.category,
        title.animated,
        title.highlight,
        title.displayPriority,
        JSON.stringify({ dimension: title.dimension, period: title.period, metricFormatted: title.metricFormatted, model: title.model }),
      ]
    );
  }
  const snapshot = snapshots.find((item) => item.userId === userId);
  if (snapshot) {
    await query(
      `INSERT INTO title_metric_snapshots (user_id, metrics, created_at)
       VALUES ($1,$2::jsonb,NOW())`,
      [userId, JSON.stringify(snapshot.metrics)]
    );
  }
  await query(
    `INSERT INTO user_title_state (user_id, stale, stale_reason, recalculated_at, updated_at)
     VALUES ($1,false,'',NOW(),NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET stale = false, stale_reason = '', recalculated_at = NOW(), updated_at = NOW()`,
    [userId]
  );
}

export async function recalculateUserTitles(userId: string) {
  const { snapshots, metrics } = await buildSnapshots();
  const current = snapshots.find((item) => item.userId === userId);
  if (!current) return null;

  const rules = await ensureDefaultTitleRules(metrics);
  const titles: any[] = [];
  for (const rule of rules) {
    const metric = metrics.find((item) => item.metricKey === rule.metricKey);
    if (!metric || rule.enabled === false) continue;
    const ranked = snapshots
      .map((item) => ({ userId: item.userId, value: toNumber(item.metrics[rule.metricKey]) }))
      .filter((item) => item.value >= toNumber(metric.minEligibility, 1))
      .sort((a, b) => b.value - a.value);
    const index = ranked.findIndex((item) => item.userId === userId);
    if (index < 0) continue;
    const rank = index + 1;
    const total = ranked.length;
    const percentile = total >= 20 ? Math.ceil((rank / total) * 100) : null;
    const threshold = Array.isArray(rule.percentileThresholds)
      ? rule.percentileThresholds.find((item: number) => percentile !== null && percentile <= Number(item))
      : null;
    const qualifiesRank = rule.rankEnabled && rank <= toNumber(rule.topRankLimit, 10);
    const qualifiesPercentile = !qualifiesRank && rule.percentileEnabled && threshold;
    if (!qualifiesRank && !qualifiesPercentile) continue;
    titles.push(buildTitle(rule, metric, {
      rank,
      total,
      value: ranked[index].value,
      percentileTop: qualifiesRank ? null : Number(threshold),
    }));
  }

  const allTitles = titles
    .sort((a, b) => b.displayPriority - a.displayPriority)
    .filter((title, index, list) => list.findIndex((item) => item.id === title.id) === index);
  await persistTitles(userId, allTitles, snapshots);
  const updatedAt = nowIso();
  return {
    success: true,
    source: "real",
    updatedAt,
    titles: selectDisplayTitles(allTitles),
    displayBadges: selectDisplayTitles(allTitles),
    allTitles,
    allBadges: allTitles,
    emptyMessage: allTitles.length ? null : "完成更多真实调用后，系统会自动生成你的 FlowAPI 称号。",
    summary: {
      totalBadges: allTitles.length,
      legendaryCount: allTitles.filter((title) => title.level === "legendary").length,
      topPercentCount: allTitles.filter((title) => Number(title.percentileTop || 0) <= 1 && Number(title.percentileTop || 0) > 0).length,
      registeredMetrics: metrics.length,
      registeredStaticMetrics: STATIC_TITLE_METRICS.length,
    },
  };
}

export async function getUserTitles(userId: string) {
  if (!hasDatabase()) return recalculateUserTitles(userId);
  const state = await query("SELECT * FROM user_title_state WHERE user_id = $1 LIMIT 1", [userId]);
  const stale = state?.rows?.[0]?.stale !== false;
  const updatedAt = state?.rows?.[0]?.recalculated_at ? new Date(state.rows[0].recalculated_at).toISOString() : "";
  const olderThanDay = updatedAt ? Date.now() - new Date(updatedAt).getTime() > 86400000 : true;
  if (stale || olderThanDay) return recalculateUserTitles(userId);

  const result = await query("SELECT * FROM user_titles WHERE user_id = $1 ORDER BY display_priority DESC, updated_at DESC", [userId]);
  const allTitles = (result?.rows || []).map((row: any) => {
    let metadata = row.metadata || {};
    if (typeof metadata === "string") {
      try { metadata = JSON.parse(metadata || "{}"); } catch { metadata = {}; }
    }
    return {
      id: row.title_key,
      name: row.name,
      title: row.name,
      type: row.type,
      level: row.level,
      description: row.description,
      rank: row.rank,
      percentile: row.percentile,
      percentileTop: row.percentile,
      metric: row.metric_key,
      metricValue: toNumber(row.metric_value),
      metricUnit: row.metric_unit,
      metricFormatted: metadata.metricFormatted,
      category: row.category,
      animated: row.animated,
      highlight: row.highlight,
      displayPriority: toNumber(row.display_priority),
      dimension: metadata.dimension || row.metric_key,
      period: metadata.period || "累计",
      model: metadata.model || null,
      provider: null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : updatedAt || nowIso(),
    };
  });
  return {
    success: true,
    source: "real",
    updatedAt: updatedAt || nowIso(),
    titles: selectDisplayTitles(allTitles),
    displayBadges: selectDisplayTitles(allTitles),
    allTitles,
    allBadges: allTitles,
    emptyMessage: allTitles.length ? null : "完成更多真实调用后，系统会自动生成你的 FlowAPI 称号。",
    summary: {
      totalBadges: allTitles.length,
      legendaryCount: allTitles.filter((title: any) => title.level === "legendary").length,
      topPercentCount: allTitles.filter((title: any) => Number(title.percentileTop || 0) <= 1 && Number(title.percentileTop || 0) > 0).length,
    },
  };
}

export async function markUserTitlesDirty(userId: string, reason = "usage_changed") {
  if (!userId) return;
  if (!hasDatabase()) {
    const state = memoryTitleStore.states.find((item: any) => item.userId === userId);
    if (state) Object.assign(state, { stale: true, staleReason: reason, updatedAt: nowIso() });
    else memoryTitleStore.states.push({ userId, stale: true, staleReason: reason, updatedAt: nowIso() });
    return;
  }
  await query(
    `INSERT INTO user_title_state (user_id, stale, stale_reason, updated_at)
     VALUES ($1,true,$2,NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET stale = true, stale_reason = $2, updated_at = NOW()`,
    [userId, reason]
  );
}

export async function listTitleRules() {
  const { metrics } = await buildSnapshots();
  const rules = await ensureDefaultTitleRules(metrics);
  return { rules, metrics };
}

export async function updateTitleRule(ruleKey: string, patch: any = {}) {
  if (!ruleKey) return null;
  if (!hasDatabase()) {
    const rule = memoryTitleStore.rules.find((item: any) => item.ruleKey === ruleKey);
    if (!rule) return null;
    Object.assign(rule, patch);
    return rule;
  }
  const result = await query(
    `UPDATE title_rules
     SET enabled = COALESCE($2, enabled),
         category = COALESCE($3, category),
         top_rank_limit = COALESCE($4, top_rank_limit),
         animation_enabled = COALESCE($5, animation_enabled),
         highlight_enabled = COALESCE($6, highlight_enabled),
         sort_priority = COALESCE($7, sort_priority),
         updated_at = NOW()
     WHERE rule_key = $1
     RETURNING *`,
    [
      ruleKey,
      patch.enabled === undefined ? null : Boolean(patch.enabled),
      patch.category || null,
      patch.topRankLimit === undefined ? null : Number(patch.topRankLimit),
      patch.animationEnabled === undefined ? null : Boolean(patch.animationEnabled),
      patch.highlightEnabled === undefined ? null : Boolean(patch.highlightEnabled),
      patch.sortPriority === undefined ? null : Number(patch.sortPriority),
    ]
  );
  return result?.rows?.[0] ? rowToRule(result.rows[0]) : null;
}
