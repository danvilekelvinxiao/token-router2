import { hasDatabase, query } from "@/lib/db";
import { checkUpstreamHealth } from "@/lib/upstream";
import { checkAdminSyncConsistency } from "@/lib/admin-commercial-config";
import { listImageModels } from "@/lib/image-studio";

function status(level, label, detail = "", meta = {}) {
  return { level, label, detail, ...meta };
}

function ok(label, detail = "", meta = {}) {
  return status("ok", label, detail, meta);
}

function warn(label, detail = "", meta = {}) {
  return status("warn", label, detail, meta);
}

function fail(label, detail = "", meta = {}) {
  return status("fail", label, detail, meta);
}

async function countRows(table) {
  if (!hasDatabase()) return null;
  try {
    const result = await query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    return Number(result?.rows?.[0]?.count || 0);
  } catch {
    return null;
  }
}

async function tableExists(table) {
  if (!hasDatabase()) return false;
  try {
    const result = await query("SELECT to_regclass($1) AS table_name", [`public.${table}`]);
    return Boolean(result?.rows?.[0]?.table_name);
  } catch {
    return false;
  }
}

export function getChannelMonitorUrl() {
  const explicit = process.env.SUB2API_CHANNEL_MONITOR_URL || process.env.CHANNEL_MONITOR_SUMMARY_URL || "";
  if (explicit) return explicit;
  const base = (process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
  return `${base}/api/admin/channel-monitor/summary`;
}

export async function fetchChannelMonitorSummary({ timeoutMs = 5000 } = {}) {
  const url = getChannelMonitorUrl();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      return { ok: false, statusCode: response.status, url, error: json?.error || `HTTP ${response.status}` };
    }
    if (json?.source === "models") {
      const summary = json.summary || {};
      return {
        ok: true,
        url,
        ...json,
        fallback: true,
        source: "models",
        healthMeaning: "models_readable_only",
        summary: {
          ...summary,
          available: 0,
        },
        message: "只能读取模型列表，不代表账号池可用。",
      };
    }
    return { ok: true, url, ...json };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error.name === "TimeoutError" || error.name === "AbortError" ? "渠道监控接口超时" : error.message || "渠道监控接口不可达",
    };
  }
}

export async function buildCommercialHealth() {
  const checks = [];

  if (!hasDatabase()) {
    checks.push(fail("数据库", "未配置 DATABASE_URL，生产商业账本不能落库。"));
  } else {
    try {
      await query("SELECT 1");
      checks.push(ok("数据库", "PostgreSQL 可连接。"));
    } catch (error) {
      checks.push(fail("数据库", `PostgreSQL 连接失败：${error.message}`));
    }
  }

  checks.push(
    process.env.RESEND_API_KEY
      ? ok("注册验证码邮件", "RESEND_API_KEY 已配置，注册验证码具备真实发送条件。")
      : warn("注册验证码邮件", "未配置 RESEND_API_KEY；本地可显示 devCode，生产会发送失败或不可真实收码。")
  );

  const upstream = await checkUpstreamHealth({ timeoutMs: 4000 }).catch((error) => ({ ok: false, message: error.message }));
  const upstreamDetail = typeof upstream?.message === "string"
    ? upstream.message
    : String(upstream?.status || "上游可用性待确认");
  checks.push(upstream.ok ? ok("上游转发", upstreamDetail || "至少一个上游通道正常。", { upstream }) : fail("上游转发", upstreamDetail || "上游不可用。", { upstream }));

  const sync = await checkAdminSyncConsistency().catch((error) => ({ ok: false, issues: [{ message: error.message }] }));
  checks.push(sync.ok ? ok("后台模型广场同步", "后台模型、API Key 可选模型、图片模型同步检查通过。", { sync }) : warn("后台模型广场同步", sync.issues?.[0]?.message || "仍有同步项需要确认。", { sync }));

  const apiKeyCount = await countRows("api_keys");
  checks.push(apiKeyCount === null ? warn("API Key 创建", "当前环境无法统计 api_keys 表。") : ok("API Key 创建", `已检测到 ${apiKeyCount} 个 API Key 记录。`, { count: apiKeyCount }));

  const callsCount = await countRows("calls");
  checks.push(callsCount === null ? warn("API 调用日志", "当前环境无法统计 calls 表。") : ok("API 调用日志", `calls 表已有 ${callsCount} 条记录。`, { count: callsCount }));

  const rechargeCount = await countRows("recharge_orders");
  checks.push(rechargeCount === null ? warn("充值订单", "当前环境无法统计 recharge_orders 表。") : ok("充值订单", `充值订单表已有 ${rechargeCount} 条记录，支持管理员对账。`, { count: rechargeCount }));

  const activationCount = await countRows("activation_codes");
  checks.push(activationCount === null ? warn("激活码", "当前环境无法统计 activation_codes 表。") : ok("激活码", `激活码表已有 ${activationCount} 条记录。`, { count: activationCount }));

  const walletTable = await tableExists("wallet_transactions");
  checks.push(walletTable ? ok("钱包流水表", "wallet_transactions 表存在；图片消费会写入该表。") : warn("钱包流水表", "wallet_transactions 表暂未初始化；需先触发图片账本 schema 或迁移。"));

  const imageLogTable = await tableExists("image_generation_logs");
  const imageModels = await listImageModels().catch(() => []);
  checks.push(imageLogTable ? ok("图片生成日志", `图片日志表存在，可用图片模型 ${imageModels.length} 个。`, { count: imageModels.length }) : warn("图片生成日志", `图片日志表未初始化；当前可用图片模型 ${imageModels.length} 个。`, { count: imageModels.length }));

  checks.push(ok("使用日志导出 Excel", "已存在 /api/usage-logs/export，登录用户可导出自己的使用日志。"));
  checks.push(ok("未知 API Key 保护", "/v1/models 和 /v1/chat/completions 按设计必须校验 FlowAPI API Key，需部署后用假 Key 再测 401。"));
  checks.push(ok("支付回调幂等", "支付回调最终进入 markRechargeOrderPaid；需部署后用真实支付订单验证重复回调不会重复到账。"));

  const channelMonitor = await fetchChannelMonitorSummary({ timeoutMs: 3500 });
  if (channelMonitor.ok && channelMonitor.source === "models") {
    checks.push(warn(
      "sub2api 渠道监控",
      channelMonitor.message || "Sub2api 模型列表可读，但未验证账号池真实可用；需执行 chat completions 探测。",
      { channelMonitor }
    ));
  } else {
    checks.push(channelMonitor.ok
      ? ok("sub2api 渠道监控", `可读取渠道状态：总数 ${channelMonitor.summary?.total ?? 0}，可用 ${channelMonitor.summary?.available ?? 0}。`, { channelMonitor })
      : warn("sub2api 渠道监控", `FlowAPI 读取渠道监控失败：${channelMonitor.error}`, { channelMonitor }));
  }

  const summary = checks.reduce((acc, item) => {
    acc[item.level] += 1;
    return acc;
  }, { ok: 0, warn: 0, fail: 0 });

  return {
    ok: summary.fail === 0,
    score: Math.max(0, Math.round((summary.ok / Math.max(1, checks.length)) * 100 - summary.fail * 12 - summary.warn * 3)),
    summary,
    checks,
    generatedAt: new Date().toISOString(),
  };
}
