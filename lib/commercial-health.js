import { hasDatabase, pingDatabase, query } from "@/lib/db";
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
    const result = await query("SELECT to_regclass($1) AS table_name", [`public.${table}`]);
    if (!result?.rows?.[0]?.table_name) return null;
    const count = await query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    return Number(count?.rows?.[0]?.count || 0);
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
  const base = (process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL || process.env.NEW_API_BASE_URL || process.env.NEW_API_ADMIN_URL || "").replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/api/channel-monitor/summary`;
}

function getChannelMonitorHeaders() {
  const token = String(
    process.env.SUB2API_CHANNEL_MONITOR_TOKEN
    || process.env.CHANNEL_MONITOR_SUMMARY_TOKEN
    || ""
  ).trim();
  if (!token) return {};

  const headerName = String(
    process.env.SUB2API_CHANNEL_MONITOR_AUTH_HEADER
    || process.env.CHANNEL_MONITOR_SUMMARY_AUTH_HEADER
    || process.env.NEW_API_CHANNEL_MONITOR_AUTH_HEADER
    || process.env.NEW_API_ADMIN_AUTH_HEADER
    || "Authorization"
  ).trim() || "Authorization";

  if (headerName.toLowerCase() === "authorization") {
    return { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` };
  }
  return { [headerName]: token };
}

function getSub2ApiHealthHeaders() {
  const token = String(
    process.env.SUB2API_API_KEY
    || process.env.SUB2API_KEY
    || ""
  ).trim();
  if (!token) return {};
  return {
    Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
  };
}

function getSub2ApiBaseUrl() {
  const direct = (process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL || process.env.NEW_API_BASE_URL || process.env.NEW_API_ADMIN_URL || "").trim();
  if (direct) return direct.replace(/\/+$/, "");
  const monitorUrl = getChannelMonitorUrl();
  if (!monitorUrl) return "";
  try {
    return new URL(monitorUrl).origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function parseUsageTotalTokens(payload = {}) {
  const usage = payload?.usage || {};
  return Number(usage.total_tokens || 0);
}

async function probeSub2ApiChatCompletion({ base, headers, modelId, timeoutMs = 5000 } = {}) {
  if (!base || !Object.keys(headers || {}).length) return null;
  const url = `${base}/v1/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId || process.env.SUB2API_HEALTH_PROBE_MODEL || "gpt-5.5",
      messages: [{ role: "user", content: "Reply ok" }],
      max_tokens: 1,
      stream: false,
    }),
  });
  const json = await response.json().catch(() => ({}));
  const usageTotalTokens = parseUsageTotalTokens(json);
  const verified = response.ok && usageTotalTokens > 0;
  return {
    ok: verified,
    statusCode: response.status,
    url,
    modelId: modelId || process.env.SUB2API_HEALTH_PROBE_MODEL || "gpt-5.5",
    usageTotalTokens,
    message: verified
      ? "chat completions 探测成功，Sub2api 号池真实可用。"
      : response.ok
        ? "chat completions 返回成功，但 usage.total_tokens 为空，不能判定账号池真实可用。"
        : `chat completions 探测失败：HTTP ${response.status}`,
  };
}

export async function fetchChannelMonitorSummary({ timeoutMs = 5000 } = {}) {
  const monitorUrl = getChannelMonitorUrl();
  const monitorHeaders = getChannelMonitorHeaders();
  const healthHeaders = getSub2ApiHealthHeaders();
  const base = getSub2ApiBaseUrl();
  const healthProbeEnabled = String(process.env.SUB2API_HEALTH_PROBE_ENABLED || "").toLowerCase() === "true";

  if (!monitorUrl && !base) {
    return { ok: false, error: "未配置 SUB2API_BASE_URL 或 SUB2API_INTERNAL_URL" };
  }

  const probes = [];
  if (monitorUrl && Object.keys(monitorHeaders).length) {
    probes.push({ url: monitorUrl, headers: monitorHeaders, kind: "monitor" });
  }
  if (base && Object.keys(monitorHeaders).length) {
    probes.push(
      { url: `${base}/api/admin/channel-monitor/summary`, headers: monitorHeaders, kind: "monitor" },
      { url: `${base}/api/channel-monitor/summary`, headers: monitorHeaders, kind: "monitor" },
    );
  }
  if (healthProbeEnabled && base && Object.keys(healthHeaders).length) {
    probes.push({ url: `${base}/v1/chat/completions`, headers: healthHeaders, kind: "chat" });
  }
  if (base && Object.keys(healthHeaders).length) {
    probes.push({ url: `${base}/v1/models`, headers: healthHeaders, kind: "models" });
  }

  if (!probes.length) {
    return {
      ok: false,
      statusCode: 401,
      error: "未配置渠道监控鉴权 Token 或 sub2api 真实 API Key",
    };
  }

  let lastError = null;
  for (const probe of probes) {
    const { url, headers, kind } = probe;
    try {
      if (kind === "chat") {
        const probeResult = await probeSub2ApiChatCompletion({
          base,
          headers,
          modelId: process.env.SUB2API_HEALTH_PROBE_MODEL || "gpt-5.5",
          timeoutMs,
        });
        if (probeResult?.ok) {
          return {
            ok: true,
            url: probeResult.url,
            source: "chat",
            healthMeaning: "real_account_pool_verified",
            fallback: false,
            summary: { total: 1, available: 1 },
            message: probeResult.message,
            healthProbe: probeResult,
            healthProbeEnabled: true,
          };
        }
        lastError = probeResult || {
          url,
          error: "chat completions 探测失败",
        };
        continue;
      }

      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers,
      });
      const json = await response.json().catch(() => null);
      if (response.ok && json?.success) {
        return {
          ok: true,
          url,
          source: "summary",
          healthMeaning: "summary_readable",
          fallback: false,
          ...json,
        };
      }
      if (response.ok && kind === "models") {
        return {
          ok: true,
          url,
          source: "models",
          healthMeaning: "models_readable_only",
          fallback: true,
          summary: { total: Array.isArray(json?.data) ? json.data.length : 0, available: 0 },
          channels: Array.isArray(json?.data)
            ? json.data.map((item) => ({
              name: item?.id || item?.name || "model",
              label: item?.id || item?.name || "model",
              status: "ok",
              statusCode: 200,
              message: "模型列表可读，但不能证明账号池可用",
            }))
            : [],
          message: "只能读取模型列表，不代表账号池可用。",
          healthProbeEnabled,
        };
      }
      lastError = { statusCode: response.status, url, error: json?.error || `HTTP ${response.status}` };
    } catch (error) {
      lastError = {
        url,
        error: error.name === "TimeoutError" || error.name === "AbortError" ? "渠道监控接口超时" : error.message || "渠道监控接口不可达",
      };
    }
  }

  return {
    ok: false,
    ...(lastError || {}),
    error: lastError?.error || "渠道监控接口不可达",
  };
}

export async function buildCommercialHealth() {
  const checks = [];

  if (!hasDatabase()) {
    checks.push(fail("数据库", "未配置 DATABASE_URL，生产商业账本不能落库。"));
  } else {
    try {
      await pingDatabase();
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
  checks.push(upstream.ok ? ok("上游转发", upstream.message || "至少一个上游通道正常。", { upstream }) : fail("上游转发", upstream.message || "上游不可用。", { upstream }));

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

  const userWalletTable = await tableExists("user_wallets");
  if (userWalletTable) {
    const liabilityResult = hasDatabase()
      ? await query("SELECT COALESCE(SUM(usd_token_balance), 0) AS total FROM user_wallets")
      : null;
    checks.push(ok(
      "用户 Token 钱包",
      userWalletTable ? `user_wallets 表存在；平台 Token 负债 ${Number(liabilityResult?.rows?.[0]?.total || 0).toFixed(2)}。` : "user_wallets 表不存在。",
      { liabilityToken: Number(liabilityResult?.rows?.[0]?.total || 0) }
    ));
  } else {
    checks.push(warn("用户 Token 钱包", "user_wallets 表暂未初始化；模型钱包账本无法落库。"));
  }

  const imageLogTable = await tableExists("image_generation_logs");
  const imageModels = await listImageModels().catch(() => []);
  checks.push(imageLogTable ? ok("图片生成日志", `图片日志表存在，可用图片模型 ${imageModels.length} 个。`, { count: imageModels.length }) : warn("图片生成日志", `图片日志表未初始化；当前可用图片模型 ${imageModels.length} 个。`, { count: imageModels.length }));

  checks.push(ok("使用日志导出 Excel", "已存在 /api/usage-logs/export，登录用户可导出自己的使用日志。"));
  checks.push(warn("未知 API Key 保护", "/v1/models 和 /v1/chat/completions 按设计必须校验 FlowAPI API Key，仍建议部署后用假 Key 复测 401。"));
  checks.push(warn("支付回调幂等", "支付回调最终进入 markRechargeOrderPaid；仍建议部署后用真实支付订单验证重复回调不会重复到账。"));

  const channelMonitor = await fetchChannelMonitorSummary({ timeoutMs: 3500 });
  if (!channelMonitor.ok) {
    checks.push(warn("sub2api 渠道监控", `FlowAPI 读取渠道监控失败：${channelMonitor.error}`, { channelMonitor, advisoryOnly: true }));
  } else if (channelMonitor.healthMeaning === "real_account_pool_verified") {
    checks.push(ok("sub2api 号池真实可用", channelMonitor.message || "chat completions 探测成功，账号池可用。", { channelMonitor }));
  } else if (channelMonitor.source === "models") {
    checks.push(warn(
      "sub2api 渠道监控",
      "Sub2api 模型列表可读，但未验证账号池真实可用；需执行 chat completions 探测。",
      { channelMonitor, advisoryOnly: true },
    ));
  } else {
    checks.push(ok(
      "sub2api 渠道监控",
      channelMonitor.message || `可读取渠道状态：总数 ${channelMonitor.summary?.total ?? 0}，可用 ${channelMonitor.summary?.available ?? 0}。`,
      { channelMonitor },
    ));
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
