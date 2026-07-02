type ActivityCall = Record<string, any>;

type ActivityRecharge = Record<string, any>;

export type ActivityRechargeRecord = {
  id: string;
  time: string;
  method: string;
  amount: number;
  createdAt: string;
};

export type ActivityModelStat = {
  name: string;
  cost: number;
  calls: number;
  color: string;
};

export type ActivityTimelinePoint = {
  label: string;
  value: number;
  fullLabel?: string;
};

export type ActivityRangeKey = "today" | "week" | "month";

export type ActivityRangeData = {
  key: ActivityRangeKey;
  title: string;
  rechargeAmount: number;
  costApi: number;
  callTimes: number;
  rechargeRecords: ActivityRechargeRecord[];
  modelStats: ActivityModelStat[];
  timeline: ActivityTimelinePoint[];
  insight: string;
};

export type ActivityDayDetail = {
  titleDate: string;
  ranges: Record<ActivityRangeKey, ActivityRangeData>;
};

export type ActivityDay = {
  date?: string;
  day?: number;
  level?: number;
  requests?: number;
  tokens?: number;
  spend?: number;
  rechargeAmount?: number;
  isToday?: boolean;
  detail?: ActivityDayDetail;
};

export type ActivityCalendar = {
  label: string;
  weeks: Array<Array<ActivityDay | null>>;
  maxRequests: number;
  todayKey: string;
  thresholds: {
    low: number;
    high: number;
  };
};

const MODEL_COLORS = ["#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899"];
const WEEK_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function toValidDate(value: unknown) {
  const date = value ? new Date(value as string) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSlashDate(date: Date) {
  return toDateKey(date).replace(/-/g, "/");
}

function formatMonthDay(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfMonth(date: Date) {
  const next = startOfDay(date);
  next.setDate(1);
  return next;
}

function endOfMonth(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  next.setHours(23, 59, 59, 999);
  return next;
}

function hashString(value: string) {
  return String(value || "").split("").reduce((hash, char) => (((hash << 5) - hash) + char.charCodeAt(0)) >>> 0, 0);
}

function getModelColor(name: string) {
  return MODEL_COLORS[hashString(name) % MODEL_COLORS.length];
}

function getCallModelName(call: ActivityCall) {
  return String(call?.routedModel || call?.requestedModel || call?.model || "未知模型").trim() || "未知模型";
}

function normalizeRechargeMethod(recharge: ActivityRecharge) {
  const raw = String(recharge?.paymentMethod || recharge?.method || recharge?.title || "").trim();
  if (!raw) return recharge?.type === "package" ? "套餐到账" : "余额充值";
  if (raw.includes("支付宝")) return "支付宝";
  if (raw.includes("微信")) return "微信";
  if (raw.includes("USDT")) return "USDT";
  if (raw.includes("套餐")) return "套餐到账";
  return raw;
}

function normalizeCalls(calls: ActivityCall[] = []) {
  return calls
    .map((call) => {
      const date = toValidDate(call?.createdAt);
      if (!date) return null;
      return {
        raw: call,
        date,
        key: toDateKey(date),
        cost: Number(call?.cost || 0),
        tokens: Number(call?.tokens || 0),
        model: getCallModelName(call),
      };
    })
    .filter(Boolean) as Array<{
      raw: ActivityCall;
      date: Date;
      key: string;
      cost: number;
      tokens: number;
      model: string;
    }>;
}

function normalizeRecharges(recharges: ActivityRecharge[] = []) {
  return recharges
    .map((recharge, index) => {
      const date = toValidDate(recharge?.approvedAt || recharge?.createdAt);
      if (!date) return null;
      return {
        id: String(recharge?.id || `recharge-${index}`),
        date,
        key: toDateKey(date),
        amount: Number(recharge?.amount || recharge?.amountCny || 0),
        method: normalizeRechargeMethod(recharge),
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      date: Date;
      key: string;
      amount: number;
      method: string;
    }>;
}

function getHeatLevel(requests: number, maxRequests: number, low: number, high: number) {
  if (!requests || requests <= 0 || maxRequests <= 0) return 0;
  const mid = Math.max(low + 1, Math.round((low + high) / 2));
  if (requests <= low) return 1;
  if (requests <= mid) return 2;
  if (requests <= high) return 3;
  return 4;
}

function sumCallCost(calls: Array<{ cost: number }>) {
  return Number(calls.reduce((sum, call) => sum + Number(call.cost || 0), 0).toFixed(4));
}

function buildRechargeRecords(records: Array<{ id: string; date: Date; amount: number; method: string }>, mode: ActivityRangeKey) {
  return [...records]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8)
    .map((record) => ({
      id: record.id,
      time: mode === "today" ? formatTime(record.date) : `${formatMonthDay(record.date)} ${formatTime(record.date)}`,
      method: record.method,
      amount: Number(record.amount.toFixed(2)),
      createdAt: record.date.toISOString(),
    }));
}

function buildModelStats(calls: Array<{ model: string; cost: number }>) {
  const summary = calls.reduce((map, call) => {
    const current = map.get(call.model) || { name: call.model, cost: 0, calls: 0, color: getModelColor(call.model) };
    current.cost += Number(call.cost || 0);
    current.calls += 1;
    map.set(call.model, current);
    return map;
  }, new Map<string, ActivityModelStat>());

  return Array.from(summary.values())
    .sort((a, b) => b.calls - a.calls || b.cost - a.cost)
    .slice(0, 5)
    .map((item) => ({
      ...item,
      cost: Number(item.cost.toFixed(2)),
    }));
}

function buildTodayTimeline(calls: Array<{ date: Date }>) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}:00`, fullLabel: `${String(hour).padStart(2, "0")}:00`, value: 0 }));
  calls.forEach((call) => {
    buckets[call.date.getHours()].value += 1;
  });
  return buckets;
}

function buildWeekTimeline(calls: Array<{ date: Date }>, weekStart: Date) {
  const buckets = Array.from({ length: 7 }, (_, index) => ({
    label: WEEK_LABELS[index],
    fullLabel: `${formatMonthDay(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index))} ${WEEK_LABELS[index]}`,
    value: 0,
  }));
  calls.forEach((call) => {
    const diff = Math.floor((startOfDay(call.date).getTime() - startOfDay(weekStart).getTime()) / 86400000);
    if (diff >= 0 && diff < 7) buckets[diff].value += 1;
  });
  return buckets;
}

function buildMonthTimeline(calls: Array<{ date: Date }>, monthDate: Date) {
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const buckets = Array.from({ length: daysInMonth }, (_, index) => ({
    label: `${index + 1}日`,
    fullLabel: `${monthDate.getMonth() + 1}月${index + 1}日`,
    value: 0,
  }));
  calls.forEach((call) => {
    const index = call.date.getDate() - 1;
    if (index >= 0 && index < buckets.length) buckets[index].value += 1;
  });
  return buckets;
}

function getTotalTimelineValue(timeline: ActivityTimelinePoint[]) {
  return timeline.reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function buildTodayInsight(timeline: ActivityTimelinePoint[]) {
  const total = getTotalTimelineValue(timeline);
  if (!total) return "⚡ 今日暂无明显流量高峰，调用分布仍在积累中。";
  let bestIndex = 0;
  let bestValue = -1;
  for (let index = 0; index < timeline.length; index += 1) {
    const value = Number(timeline[index]?.value || 0) + Number(timeline[index + 1]?.value || 0);
    if (value > bestValue) {
      bestValue = value;
      bestIndex = index;
    }
  }
  const share = Math.round((bestValue / total) * 100);
  const startHour = String(bestIndex).padStart(2, "0");
  const endHour = String(Math.min(24, bestIndex + 2)).padStart(2, "0");
  return `⚡ 今日流量高峰出现在 ${startHour}:00-${endHour}:00，期间调用占全天的 ${share}%。`;
}

function buildPeakInsight(timeline: ActivityTimelinePoint[], prefix: string) {
  const total = getTotalTimelineValue(timeline);
  if (!total) return `⚡ ${prefix}暂无明显流量高峰，等待更多调用数据生成洞察。`;
  const peak = timeline.reduce((best, item) => Number(item.value || 0) > Number(best.value || 0) ? item : best, timeline[0]);
  const share = Math.round((Number(peak.value || 0) / total) * 100);
  return `⚡ ${prefix}流量集中在 ${peak.label}，该时段调用量占比约 ${share}%。`;
}

function buildRangeData(
  key: ActivityRangeKey,
  title: string,
  calls: Array<{ date: Date; cost: number; model: string }> ,
  recharges: Array<{ id: string; date: Date; amount: number; method: string }>,
  anchorDate: Date,
) {
  const rechargeAmount = Number(recharges.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
  const costApi = Number(sumCallCost(calls).toFixed(2));
  const callTimes = calls.length;
  const modelStats = buildModelStats(calls);
  const timeline = key === "today"
    ? buildTodayTimeline(calls)
    : key === "week"
      ? buildWeekTimeline(calls, startOfWeek(anchorDate))
      : buildMonthTimeline(calls, anchorDate);
  const insight = key === "today"
    ? buildTodayInsight(timeline)
    : buildPeakInsight(timeline, key === "week" ? "本周" : "本月");

  return {
    key,
    title,
    rechargeAmount,
    costApi,
    callTimes,
    rechargeRecords: buildRechargeRecords(recharges, key),
    modelStats,
    timeline,
    insight,
  } satisfies ActivityRangeData;
}

function buildDayDetail(
  date: Date,
  allCalls: ReturnType<typeof normalizeCalls>,
  allRecharges: ReturnType<typeof normalizeRecharges>,
) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);

  const inRange = (value: Date, start: Date, end: Date) => value.getTime() >= start.getTime() && value.getTime() <= end.getTime();

  const todayCalls = allCalls.filter((call) => inRange(call.date, dayStart, dayEnd));
  const todayRecharges = allRecharges.filter((item) => inRange(item.date, dayStart, dayEnd));
  const weekCalls = allCalls.filter((call) => inRange(call.date, weekStart, weekEnd));
  const weekRecharges = allRecharges.filter((item) => inRange(item.date, weekStart, weekEnd));
  const monthCalls = allCalls.filter((call) => inRange(call.date, monthStart, monthEnd));
  const monthRecharges = allRecharges.filter((item) => inRange(item.date, monthStart, monthEnd));

  return {
    titleDate: `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日`,
    ranges: {
      today: buildRangeData("today", "今日", todayCalls, todayRecharges, date),
      week: buildRangeData("week", "本周", weekCalls, weekRecharges, date),
      month: buildRangeData("month", "本月", monthCalls, monthRecharges, date),
    },
  } satisfies ActivityDayDetail;
}

export function buildActivityHeatmapCalendar(calls: ActivityCall[] = [], recharges: ActivityRecharge[] = [], year: number, month: number): ActivityCalendar {
  const normalizedCalls = normalizeCalls(calls);
  const normalizedRecharges = normalizeRecharges(recharges);
  const todayKey = toDateKey(new Date());
  const callsByDate = normalizedCalls.reduce((map, call) => {
    const current = map.get(call.key) || { requests: 0, tokens: 0, spend: 0 };
    current.requests += 1;
    current.tokens += Number(call.tokens || 0);
    current.spend += Number(call.cost || 0);
    map.set(call.key, current);
    return map;
  }, new Map<string, { requests: number; tokens: number; spend: number }>());
  const rechargesByDate = normalizedRecharges.reduce((map, item) => {
    map.set(item.key, Number(((map.get(item.key) || 0) + item.amount).toFixed(2)));
    return map;
  }, new Map<string, number>());

  const monthKeys = Array.from(callsByDate.entries())
    .filter(([key]) => key.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .map(([, value]) => value.requests);
  const maxRequests = Math.max(...monthKeys, 0);
  const low = Math.max(1, Math.ceil(maxRequests * 0.25));
  const high = Math.max(low + 1, Math.ceil(maxRequests * 0.7));

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDow = firstDay.getDay();
  const startCol = startDow === 0 ? 6 : startDow - 1;

  const weeks: Array<Array<ActivityDay | null>> = [];
  let dayNum = 1;
  for (let row = 0; row < 6; row += 1) {
    const week: Array<ActivityDay | null> = [];
    for (let col = 0; col < 7; col += 1) {
      if ((row === 0 && col < startCol) || dayNum > daysInMonth) {
        week.push(null);
        continue;
      }
      const date = new Date(year, month, dayNum);
      const key = toDateKey(date);
      const dayStats = callsByDate.get(key) || { requests: 0, tokens: 0, spend: 0 };
      week.push({
        date: key,
        day: dayNum,
        level: getHeatLevel(dayStats.requests, maxRequests, low, high),
        requests: dayStats.requests,
        tokens: dayStats.tokens,
        spend: Number(dayStats.spend.toFixed(4)),
        rechargeAmount: Number((rechargesByDate.get(key) || 0).toFixed(2)),
        isToday: key === todayKey,
        detail: buildDayDetail(date, normalizedCalls, normalizedRecharges),
      });
      dayNum += 1;
    }
    weeks.push(week);
    if (dayNum > daysInMonth) break;
  }

  return {
    label: `${year}年${month + 1}月`,
    weeks,
    maxRequests,
    todayKey,
    thresholds: { low, high },
  };
}

export function formatActivityDate(value?: string) {
  return value ? String(value).replace(/-/g, "/") : "日期同步中";
}

export function formatActivityApiCost(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "$ 0.00 API";
  return `$ ${number.toFixed(2)} API`;
}

export function formatActivityCalls(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0 次";
  return `${number.toLocaleString("zh-CN")} 次`;
}

export function formatActivityRecharge(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "¥ 0.00";
  return `¥ ${number.toFixed(2)}`;
}
