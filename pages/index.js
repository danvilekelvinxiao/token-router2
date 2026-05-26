import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import ModelLeaderboard from "@/components/dashboard/model-leaderboard";
import { formatTokens } from "@/lib/model-format";

const apiBaseUrl = "https://api.flowapi.fun/v1";
const localApiBase = "/api";

const modelCategories = [
  "推荐模型",
  "高性价比",
  "代码编程",
  "中文写作",
  "长文本",
  "多模态",
  "Claude 系列",
  "GPT 系列",
  "DeepSeek 系列",
  "Gemini 系列",
  "Qwen 系列",
];

const callSteps = [
  "创建 API Key",
  "复制 Model ID",
  "设置 Base URL",
  "发起第一次调用",
  "查看调用流水",
  "余额不足时充值",
];

const quickSteps = [
  {
    title: "注册账号",
    text: "勾选用户协议后完成注册，系统会生成真实客户档案。",
  },
  {
    title: "创建 API Key",
    text: "Key 默认脱敏展示，只有创建后才能复制完整密钥。",
  },
  {
    title: "选模型并调用",
    text: "复制 Model ID，使用同一个 FlowAPI Key 即可接入主流模型。",
  },
];

const helpSnippets = [
  {
    name: "Base URL",
    value: apiBaseUrl,
  },
  {
    name: "调用路径",
    value: `${apiBaseUrl}/chat/completions`,
  },
  {
    name: "最小请求体",
    value: `{
  "model": "deepseek/deepseek-chat",
  "messages": [
    { "role": "user", "content": "写一封外贸开发信" }
  ]
}`,
  },
];

const emptyDashboardMetrics = {
  requestCount: 0,
  totalTokens: 0,
  totalSpend: 0,
  todaySpend: 0,
  weekSpend: 0,
  monthSpend: 0,
  hasData: false,
};

function formatCny(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "暂无数据";
  }

  return `¥${Number(value).toFixed(digits)}`;
}

function formatDateTime(value) {
  if (!value) {
    return "暂无数据";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无数据";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function maskToken(token = "") {
  if (!token) return "";
  if (token.length <= 10) return `${token.slice(0, 3)}****${token.slice(-3)}`;
  return `${token.slice(0, 6)}****${token.slice(-4)}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || `请求失败 (${response.status})`);
  }

  return data;
}

function modelMatchesCategory(model, category) {
  const blob = [
    model.name,
    model.provider,
    model.modelId,
    model.actualModelId,
    model.bestFor,
    ...(model.routeKeywords || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  switch (category) {
    case "推荐模型":
      return true;
    case "高性价比":
      return Number(model.inputPriceCny || 0) <= 6 || Number(model.outputPriceCny || 0) <= 12;
    case "代码编程":
      return /code|coding|编程|代码|agent|cursor|claude code|codex/i.test(blob);
    case "中文写作":
      return /中文|写作|文案|客服|办公|外贸|开发信|标题/i.test(blob);
    case "长文本":
      return /长文|长文本|context|推理|分析|论文|研究/i.test(blob);
    case "多模态":
      return /多模态|图片|视频|vision|multimodal/i.test(blob);
    case "Claude 系列":
      return /claude/i.test(blob);
    case "GPT 系列":
      return /gpt/i.test(blob);
    case "DeepSeek 系列":
      return /deepseek/i.test(blob);
    case "Gemini 系列":
      return /gemini/i.test(blob);
    case "Qwen 系列":
      return /qwen/i.test(blob);
    default:
      return true;
  }
}

function deriveModelLabels(model) {
  const labels = [];
  if (Number(model.inputPriceCny || 0) <= 6) labels.push("高性价比");
  if (/中文|写作|文案|客服|办公/i.test(`${model.bestFor} ${model.provider}`)) labels.push("中文友好");
  if (/code|coding|编程|代码|agent/i.test(`${model.bestFor} ${model.routeKeywords?.join(" ")}`)) labels.push("编程");
  if (/claude|gpt|deepseek|gemini|qwen/i.test(`${model.provider} ${model.name}`)) labels.push("主流模型");
  if (Number(model.quality || 0) >= 95) labels.push("推荐新手");
  return Array.from(new Set(labels)).slice(0, 3);
}

function buildDailySeries(calls) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });

  return days.map((date) => {
    const key = date.toISOString().slice(0, 10);
    const items = calls.filter((call) => String(call.createdAt || "").slice(0, 10) === key);
    const spend = items.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    const tokens = items.reduce((sum, item) => sum + Number(item.promptTokens || 0) + Number(item.completionTokens || 0), 0);
    return {
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      spend,
      tokens,
      count: items.length,
    };
  });
}

function getCallFormula(call) {
  if (Number(call.promptTokens || 0) === 0 && Number(call.completionTokens || 0) === 0) {
    return "上游未返回有效计费结果";
  }

  return `${formatTokens(call.promptTokens)} + ${formatTokens(call.completionTokens)} Token 按模型费率计费`;
}

function SectionTitle({ eyebrow, title, text }) {
  return (
    <div className="section-heading compact-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <article className="stat-card stat-card-compact">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function AppButton({ children, variant = "primary", onClick, type = "button", disabled = false }) {
  const className =
    variant === "ghost"
      ? "secondary-button"
      : variant === "text"
        ? "ghost-link text-link"
        : "primary-button";

  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function HomePage() {
  const [models, setModels] = useState([]);
  const [modelFilter, setModelFilter] = useState("推荐模型");
  const [selectedCompare, setSelectedCompare] = useState([]);
  const [activeModel, setActiveModel] = useState(null);
  const [adminSnapshot, setAdminSnapshot] = useState(null);
  const [currentCustomerId, setCurrentCustomerId] = useState("");
  const [customer, setCustomer] = useState(null);
  const [savedApiKey, setSavedApiKey] = useState("");
  const [copyLabel, setCopyLabel] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [globalRank, setGlobalRank] = useState(null);
  const [usageRank, setUsageRank] = useState(null);
  const [rankPeriod, setRankPeriod] = useState("week");
  const [loadingGlobalRank, setLoadingGlobalRank] = useState(true);
  const [loadingUsageRank, setLoadingUsageRank] = useState(true);
  const [registerForm, setRegisterForm] = useState({
    phone: "",
    company: "",
    agreedToTerms: true,
  });
  const [loginForm, setLoginForm] = useState({
    phone: "",
    company: "",
  });
  const [newKeyLabel, setNewKeyLabel] = useState("主 API Key");
  const [rechargeAmount, setRechargeAmount] = useState("100");
  const [activationCode, setActivationCode] = useState("");
  const [adminTargetCustomer, setAdminTargetCustomer] = useState("");
  const [adminAdjustAmount, setAdminAdjustAmount] = useState("50");
  const [adminAdjustReason, setAdminAdjustReason] = useState("运营调账");
  const [adminActivationAmount, setAdminActivationAmount] = useState("100");
  const [adminActivationNote, setAdminActivationNote] = useState("新手激活码");
  const [promptText, setPromptText] = useState(
    "请用中文解释 FlowAPI 的接入步骤，并推荐一个适合新手的模型。",
  );
  const [callResult, setCallResult] = useState("");
  const [callStatus, setCallStatus] = useState("");
  const [callLoading, setCallLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentCustomerId) {
      window.localStorage.setItem("flowapi_customer_id", currentCustomerId);
      if (savedApiKey) {
        window.localStorage.setItem(`flowapi_api_key_${currentCustomerId}`, savedApiKey);
      }
    }
  }, [currentCustomerId, savedApiKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      setLoadingModels(true);
      try {
        const data = await fetchJson("/api/models");
        if (!cancelled) {
          setModels(data.models || []);
        }
      } catch {
        if (!cancelled) {
          setModels([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingModels(false);
        }
      }
    }

    loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomer() {
      if (!currentCustomerId) {
        setCustomer(null);
        return;
      }

      setLoadingCustomer(true);
      try {
        const data = await fetchJson(`${localApiBase}/customer?customerId=${encodeURIComponent(currentCustomerId)}`);
        if (!cancelled) {
          setCustomer(data.customer || null);
          if (data.customer?.apiKeys?.length && !savedApiKey) {
            const firstKey = data.customer.apiKeys.find((key) => key.token);
            if (firstKey?.token) {
              setSavedApiKey(firstKey.token);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setCustomer(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingCustomer(false);
        }
      }
    }

    loadCustomer();
    return () => {
      cancelled = true;
    };
  }, [currentCustomerId, savedApiKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadAdmin() {
      setLoadingAdmin(true);
      try {
        const data = await fetchJson("/api/admin");
        if (!cancelled) {
          setAdminSnapshot(data);
          const firstCustomer = data.customers?.[0]?.id || "";
          if (!adminTargetCustomer && firstCustomer) {
            setAdminTargetCustomer(firstCustomer);
          }
        }
      } catch {
        if (!cancelled) {
          setAdminSnapshot(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingAdmin(false);
        }
      }
    }

    loadAdmin();
    return () => {
      cancelled = true;
    };
  }, [adminTargetCustomer]);

  useEffect(() => {
    let cancelled = false;

    async function loadRanks() {
      setLoadingGlobalRank(true);
      setLoadingUsageRank(true);

      try {
        const [globalData, usageData] = await Promise.all([
          fetchJson("/api/market/model-rank"),
          fetchJson(`/api/analytics/model-usage-rank?period=${encodeURIComponent(rankPeriod)}`),
        ]);

        if (!cancelled) {
          setGlobalRank(globalData);
          setUsageRank(usageData);
        }
      } catch {
        if (!cancelled) {
          setGlobalRank({
            success: true,
            source: "empty",
            sourceLabel: "全球",
            updatedAt: null,
            status: "syncing",
            models: [],
          });
          setUsageRank({
            success: true,
            source: "empty",
            period: rankPeriod,
            updatedAt: null,
            models: [],
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingGlobalRank(false);
          setLoadingUsageRank(false);
        }
      }
    }

    loadRanks();
    return () => {
      cancelled = true;
    };
  }, [rankPeriod]);

  const metrics = customer?.metrics || emptyDashboardMetrics;
  const visibleModels = useMemo(() => {
    return models.filter((model) => modelMatchesCategory(model, modelFilter));
  }, [models, modelFilter]);
  const compareModels = useMemo(
    () => models.filter((model) => selectedCompare.includes(model.modelId)),
    [models, selectedCompare],
  );
  const dailySeries = useMemo(() => buildDailySeries(customer?.calls || []), [customer?.calls]);
  const callLogs = customer?.calls || [];
  const balanceEvents = customer?.balanceEvents || [];
  const currentKey = savedApiKey || customer?.apiKeys?.find((item) => item.token)?.token || "";
  const currentKeyMasked = currentKey ? maskToken(currentKey) : "暂无数据";
  const selectedDetail = activeModel || visibleModels[0] || models[0] || null;
  const adminTotals = adminSnapshot?.totals || {};

  async function copyText(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyLabel(label);
      window.setTimeout(() => setCopyLabel(""), 1800);
    } catch {
      setCopyLabel("复制失败");
    }
  }

  async function refreshCustomerData(nextCustomerId = currentCustomerId) {
    if (!nextCustomerId) return;
    const data = await fetchJson(`${localApiBase}/customer?customerId=${encodeURIComponent(nextCustomerId)}`);
    setCustomer(data.customer || null);
  }

  async function registerAccount(event) {
    event.preventDefault();
    const payload = {
      phone: registerForm.phone.trim(),
      company: registerForm.company.trim(),
      agreedToTerms: registerForm.agreedToTerms,
    };

    const data = await fetchJson("/api/customer", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const nextCustomerId = data.customer?.id || "";
    setCustomer(data.customer || null);
    setCurrentCustomerId(nextCustomerId);
    setLoginForm({
      phone: payload.phone,
      company: payload.company,
    });
    if (nextCustomerId) {
      setSavedApiKey("");
    }
    setRegisterForm((prev) => ({ ...prev, phone: "", company: "" }));
  }

  async function loginAccount(event) {
    event.preventDefault();
    const payload = {
      phone: loginForm.phone.trim(),
      company: loginForm.company.trim(),
    };

    const data = await fetchJson("/api/customer", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const nextCustomerId = data.customer?.id || "";
    setCustomer(data.customer || null);
    setCurrentCustomerId(nextCustomerId);
    if (nextCustomerId && !savedApiKey) {
      setSavedApiKey(window.localStorage.getItem(`flowapi_api_key_${nextCustomerId}`) || "");
    }
  }

  async function createApiKey() {
    if (!currentCustomerId) {
      throw new Error("请先注册或登录");
    }

    const data = await fetchJson("/api/keys", {
      method: "POST",
      body: JSON.stringify({
        customerId: currentCustomerId,
        label: newKeyLabel.trim() || "主 API Key",
      }),
    });

    if (data.newApiKey?.token) {
      setSavedApiKey(data.newApiKey.token);
      await copyText("API Key", data.newApiKey.token);
    }

    setCustomer(data.customer || null);
  }

  async function rechargeBalance() {
    if (!currentCustomerId) {
      throw new Error("请先注册或登录");
    }

    const data = await fetchJson("/api/usage", {
      method: "POST",
      body: JSON.stringify({
        action: "recharge",
        customerId: currentCustomerId,
        amount: rechargeAmount,
      }),
    });

    setCustomer(data.customer || null);
    await refreshAdminSnapshot();
  }

  async function redeemCode() {
    if (!currentCustomerId) {
      throw new Error("请先注册或登录");
    }

    const data = await fetchJson("/api/usage", {
      method: "POST",
      body: JSON.stringify({
        action: "redeemActivationCode",
        customerId: currentCustomerId,
        code: activationCode.trim(),
      }),
    });

    setCustomer(data.customer || null);
    setActivationCode("");
    await refreshAdminSnapshot();
  }

  async function refreshAdminSnapshot() {
    const data = await fetchJson("/api/admin");
    setAdminSnapshot(data);
  }

  async function refreshRankboards(nextPeriod = rankPeriod) {
    setLoadingGlobalRank(true);
    setLoadingUsageRank(true);

    try {
      const [globalData, usageData] = await Promise.all([
        fetchJson("/api/market/model-rank"),
        fetchJson(`/api/analytics/model-usage-rank?period=${encodeURIComponent(nextPeriod)}`),
      ]);

      setGlobalRank(globalData);
      setUsageRank(usageData);
    } catch {
      setGlobalRank({
        success: true,
        source: "empty",
        sourceLabel: "全球",
        updatedAt: null,
        status: "syncing",
        models: [],
      });
      setUsageRank({
        success: true,
        source: "empty",
        period: nextPeriod,
        updatedAt: null,
        models: [],
      });
    } finally {
      setLoadingGlobalRank(false);
      setLoadingUsageRank(false);
    }
  }

  async function runFirstCall() {
    if (!currentKey) {
      setCallStatus("请先创建 API Key");
      return;
    }

    setCallLoading(true);
    setCallStatus("正在调用上游模型...");
    setCallResult("");

    try {
      const data = await fetchJson("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${currentKey}`,
        },
        body: JSON.stringify({
          model: selectedDetail?.modelId || "auto",
          messages: [{ role: "user", content: promptText }],
        }),
      });

      const content = data.choices?.[0]?.message?.content || "上游没有返回文本内容。";
      setCallStatus(`调用成功：${data.token_router?.routed_model || selectedDetail?.name || "未知模型"}`);
      setCallResult(content);
      await refreshCustomerData();
      await refreshAdminSnapshot();
      await refreshRankboards();
    } catch (error) {
      setCallStatus(error.message || "调用失败");
      setCallResult("");
      await refreshCustomerData();
      await refreshAdminSnapshot();
      await refreshRankboards();
    } finally {
      setCallLoading(false);
    }
  }

  function toggleCompare(modelId) {
    setSelectedCompare((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((item) => item !== modelId);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), modelId];
      }
      return [...prev, modelId];
    });
  }

  return (
    <>
      <Head>
        <title>FlowAPI - AI Token 中转站与资产控制台</title>
        <meta
          name="description"
          content="FlowAPI 是面向中国大陆用户的 AI Token 中转站，支持注册、API Key、模型选择、真实调用、充值、数据面板和管理员后台。"
        />
      </Head>

      <main className="site-shell app-shell">
        <header className="top-nav">
          <a className="brand" href="#home" aria-label="FlowAPI">
            <span className="brand-mark">F</span>
            <span>
              <strong>FlowAPI</strong>
              <small>AI Token Control Center</small>
            </span>
          </a>

          <nav className="nav-links" aria-label="主导航">
            <a href="#models">大模型接入</a>
            <a href="#api">API 管理</a>
            <a href="#dashboard">数据面板</a>
            <a href="#help">帮助指南</a>
            <a href="#recharge">充值</a>
            <a href="#admin">管理员后台</a>
          </nav>

          <div className="nav-actions">
            <a className="ghost-link" href="#auth">注册 / 登录</a>
            <a className="solid-link" href="#api">去创建 Key</a>
          </div>
        </header>

        <section className="hero-section hero-console" id="home">
          <div className="hero-copy">
            <div className="eyebrow">
              <span>注册 → Key → 模型 → 调用 → 充值 → 复购</span>
              <span>真实数据优先</span>
            </div>
            <h1>选择你的 AI 模型</h1>
            <p className="hero-subtitle">一个 FlowAPI Key，即可接入 DeepSeek、GPT、Claude、Gemini、Qwen 等主流模型。</p>
            <p className="hero-text">
              这里不是演示站。每个余额、每条调用、每次充值、每个 Key 都来自真实接口；没有数据时只展示“暂无数据 / 数据同步中”。
            </p>
            <div className="hero-actions">
              <AppButton onClick={() => copyText("Base URL", apiBaseUrl)}>复制 Base URL</AppButton>
              <a className="secondary-button" href="#auth">去注册账号</a>
              <a className="secondary-button" href="#help">查看接入教程</a>
            </div>
            <div className="hero-keywords">
              <span>Base URL: {apiBaseUrl}</span>
              <span>金额统一使用 ¥</span>
              <span>API Key 默认脱敏</span>
              <span>无数据时不伪造 0K</span>
            </div>
          </div>

          <aside className="routing-board hero-sidecard">
            <div className="board-header">
              <span>FlowAPI Endpoint</span>
              <strong>Live</strong>
            </div>
            <div className="endpoint-row">
              <span>Base URL</span>
              <code>{apiBaseUrl}</code>
              <button type="button" onClick={() => copyText("Base URL", apiBaseUrl)}>
                复制
              </button>
            </div>
            <div className="endpoint-row">
              <span>API Key</span>
              <code>{currentKeyMasked}</code>
              <button
                type="button"
                onClick={() => currentKey && copyText("API Key", currentKey)}
                disabled={!currentKey}
              >
                复制
              </button>
            </div>
            <div className="endpoint-row">
              <span>Model ID</span>
              <code>{selectedDetail?.modelId || "暂无数据"}</code>
              <button
                type="button"
                onClick={() => selectedDetail?.modelId && copyText("Model ID", selectedDetail.modelId)}
                disabled={!selectedDetail?.modelId}
              >
                复制
              </button>
            </div>
            <div className="board-metrics">
              <div>
                <small>当前余额</small>
                <strong>{customer ? formatCny(customer.balance) : "暂无数据"}</strong>
              </div>
              <div>
                <small>请求次数</small>
                <strong>{customer ? formatTokens(metrics.requestCount) : "暂无数据"}</strong>
              </div>
              <div>
                <small>Token 总量</small>
                <strong>{customer ? formatTokens(metrics.totalTokens) : "暂无数据"}</strong>
              </div>
            </div>
            <div className="route-flow">
              {callSteps.map((step) => (
                <span key={step}>{step}</span>
              ))}
            </div>
            <p className="copy-state">{copyLabel ? `${copyLabel} 已复制` : "所有关键参数都能真实复制"}</p>
          </aside>

          <div className="capability-grid">
            <StatCard label="今日消耗" value={customer ? formatCny(metrics.todaySpend) : "暂无数据"} hint="来自真实调用" />
            <StatCard label="本周消耗" value={customer ? formatCny(metrics.weekSpend) : "暂无数据"} hint="近 7 天累计" />
            <StatCard label="本月消耗" value={customer ? formatCny(metrics.monthSpend) : "暂无数据"} hint="近 30 天累计" />
            <StatCard label="调用流水" value={customer ? formatTokens(metrics.requestCount) : "暂无数据"} hint="真实请求记录" />
          </div>
        </section>

        <section className="section-block" id="auth">
          <SectionTitle
            eyebrow="注册 / 登录"
            title="先让用户真正进站"
            text="注册时必须同意用户协议。注册成功后再创建 API Key，整个流程才算完成第一步。"
          />
          <div className="auth-grid">
            <form className="form-panel" onSubmit={registerAccount}>
              <h3>注册账号</h3>
              <label>
                手机号
                <input
                  value={registerForm.phone}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="请输入手机号"
                />
              </label>
              <label>
                公司 / 组织
                <input
                  value={registerForm.company}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, company: event.target.value }))}
                  placeholder="例如：跨境电商工作室"
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={registerForm.agreedToTerms}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, agreedToTerms: event.target.checked }))}
                />
                <span>我已阅读并同意用户协议</span>
              </label>
              <AppButton type="submit">完成注册</AppButton>
            </form>

            <form className="form-panel" onSubmit={loginAccount}>
              <h3>登录 / 继续使用</h3>
              <label>
                手机号
                <input
                  value={loginForm.phone}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="输入已注册手机号"
                />
              </label>
              <label>
                公司 / 组织
                <input
                  value={loginForm.company}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, company: event.target.value }))}
                  placeholder="可选"
                />
              </label>
              <AppButton variant="ghost" type="submit">
                进入控制台
              </AppButton>
              <p className="form-note">登录后可继续查看 Key、余额、调用和后台统计。</p>
            </form>

            <div className="form-panel note-panel">
              <h3>协议提醒</h3>
              <p>没有真实账号就不展示假余额，没有真实调用就只显示空状态，这样新手不会被错误数据骗进来。</p>
              <div className="inline-tags">
                <span>真实 Key</span>
                <span>真实调用</span>
                <span>真实余额</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block" id="models">
          <SectionTitle
            eyebrow="大模型接入"
            title="先选模型，再复制 Model ID"
            text="默认展示推荐模型。用户可以筛选、对比、查看详情和直接复制模型名。"
          />
          <div className="chip-row">
            {modelCategories.map((category) => (
              <button
                key={category}
                type="button"
                className={modelFilter === category ? "chip chip-active" : "chip"}
                onClick={() => setModelFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {selectedCompare.length > 0 && compareModels.length > 0 && (
            <div className="compare-panel">
              <div className="compare-head">
                <h3>模型对比</h3>
                <span>已选 {compareModels.length} 个模型</span>
              </div>
              <div className="compare-table-wrap">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th>Provider</th>
                      <th>输入价格</th>
                      <th>输出价格</th>
                      <th>推荐场景</th>
                      <th>新手友好</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareModels.map((model) => (
                      <tr key={model.modelId}>
                        <td>{model.name}</td>
                        <td>{model.provider}</td>
                        <td>{formatCny(model.inputPriceCny)}/M Token</td>
                        <td>{formatCny(model.outputPriceCny)}/M Token</td>
                        <td>{model.bestFor || "暂无数据"}</td>
                        <td>{Number(model.quality || 0) >= 92 ? "是" : "一般"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="model-grid">
            {loadingModels && (
              <div className="empty-block full-span">模型数据同步中...</div>
            )}
            {!loadingModels && visibleModels.map((model) => {
              const labels = deriveModelLabels(model);
              const selected = selectedCompare.includes(model.modelId);
              return (
                <article className="model-card" key={model.modelId}>
                  <div className="model-topline">
                    <div>
                      <span className="model-logo">{(model.name || model.provider || "?").slice(0, 1)}</span>
                      <h3>{model.name}</h3>
                    </div>
                    <label className="model-select">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleCompare(model.modelId)}
                      />
                      对比
                    </label>
                  </div>
                  <p>{model.provider} · {model.bestFor || "暂无适用场景"}</p>
                  <div className="model-meta">
                    <span>Model ID：{model.modelId}</span>
                    <span>输入 {formatCny(model.inputPriceCny)}/M Token</span>
                    <span>输出 {formatCny(model.outputPriceCny)}/M Token</span>
                  </div>
                  <div className="model-tags">
                    {labels.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  <div className="model-actions">
                    <button type="button" className="secondary-button" onClick={() => copyText("Model ID", model.modelId)}>
                      复制 Model ID
                    </button>
                    <button type="button" className="secondary-button" onClick={() => setActiveModel(model)}>
                      查看详情
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="newbie-panel">
            <div>
              <h3>不知道选哪个？</h3>
              <p>中文日常任务优先选 DeepSeek，代码任务优先选 Claude 或 GPT，批量低成本任务优先选 Qwen 或 DeepSeek。</p>
            </div>
            <div className="newbie-actions">
              <button type="button" className="primary-button" onClick={() => setModelFilter("推荐模型")}>
                直接使用推荐配置
              </button>
              <a className="secondary-button" href="#api">去创建 API Key</a>
            </div>
          </div>
        </section>

        <section className="section-block" id="api">
          <SectionTitle
            eyebrow="API 管理"
            title="默认隐藏完整 API Key"
            text="用户创建 Key 之后，可以复制、禁用、切换和继续调用。第一次调用前，先把 Base URL、Key 和 Model ID 准备好。"
          />
          <div className="api-grid">
            <div className="panel-box">
              <h3>当前账号</h3>
              <div className="field-list">
                <div>
                  <span>客户编号</span>
                  <strong>{customer?.id || "暂无数据"}</strong>
                </div>
                <div>
                  <span>公司名称</span>
                  <strong>{customer?.company || "暂无数据"}</strong>
                </div>
                <div>
                  <span>余额</span>
                  <strong>{customer ? formatCny(customer.balance) : "暂无数据"}</strong>
                </div>
                <div>
                  <span>API Key</span>
                  <strong>{currentKeyMasked}</strong>
                </div>
              </div>
            </div>

            <div className="panel-box">
              <h3>创建 API Key</h3>
              <label>
                Key 名称
                <input value={newKeyLabel} onChange={(event) => setNewKeyLabel(event.target.value)} />
              </label>
              <AppButton
                onClick={async () => {
                  try {
                    await createApiKey();
                  } catch (error) {
                    setCallStatus(error.message || "创建失败");
                  }
                }}
              >
                创建并复制 Key
              </AppButton>
              <p className="form-note">只要复制一次完整 Key，后面后台默认继续脱敏展示。</p>
            </div>

            <div className="panel-box">
              <h3>首调用引导</h3>
              <ol className="step-list">
                <li>下载或打开 CC Switch / 客户端</li>
                <li>复制 Base URL</li>
                <li>复制 API Key</li>
                <li>复制 Model ID</li>
                <li>发起第一次调用</li>
                <li>进入数据面板看流水</li>
              </ol>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={() => copyText("Base URL", apiBaseUrl)}>
                  复制 Base URL
                </button>
                <a className="secondary-button" href="#help">
                  查看帮助指南
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block" id="dashboard">
          <SectionTitle
            eyebrow="数据面板"
            title="真实调用、真实 Token、真实扣费"
            text="如果没有真实数据，就直接显示空状态，不伪造 0K 和 ¥0.00。"
          />
          <div className="stats-grid stats-grid-wide">
            <StatCard label="当前余额" value={customer ? formatCny(customer.balance) : "暂无数据"} hint="实时余额" />
            <StatCard label="今日消耗" value={customer ? formatCny(metrics.todaySpend) : "暂无数据"} hint="24 小时" />
            <StatCard label="本周消耗" value={customer ? formatCny(metrics.weekSpend) : "暂无数据"} hint="7 天" />
            <StatCard label="本月消耗" value={customer ? formatCny(metrics.monthSpend) : "暂无数据"} hint="30 天" />
            <StatCard label="总 Token" value={customer ? formatTokens(metrics.totalTokens) : "暂无数据"} hint="输入 + 输出" />
            <StatCard label="请求次数" value={customer ? formatTokens(metrics.requestCount) : "暂无数据"} hint="真实流水" />
          </div>

          <div className="dashboard-grid">
            <div className="panel-box">
              <div className="panel-head">
                <h3>Token 消耗趋势</h3>
                <span>{metrics.hasData ? "近 7 天" : "暂无数据"}</span>
              </div>
              {metrics.hasData ? (
                <div className="trend-bars">
                  {dailySeries.map((day) => (
                    <div key={day.label} className="trend-row">
                      <span>{day.label}</span>
                      <b>
                        <i style={{ width: `${Math.min(100, day.tokens ? day.tokens / Math.max(...dailySeries.map((item) => item.tokens || 0), 1) * 100 : 0)}%` }} />
                      </b>
                      <em>{formatTokens(day.tokens)}</em>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-block">暂无真实调用数据，等第一次调用后这里会自动更新。</div>
              )}
            </div>

            <div className="panel-box">
              <div className="panel-head">
                <h3>调用流水</h3>
                <span>{callLogs.length ? `${callLogs.length} 条` : "暂无数据"}</span>
              </div>
              <div className="log-table-wrap">
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>模型</th>
                      <th>Token</th>
                      <th>扣费</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {callLogs.length ? callLogs.map((call) => (
                      <tr key={call.id}>
                        <td>{formatDateTime(call.createdAt)}</td>
                        <td>{call.routedModel || call.requestedModel || "暂无数据"}</td>
                        <td>{formatTokens(Number(call.promptTokens || 0) + Number(call.completionTokens || 0))}</td>
                        <td>{formatCny(call.cost, 4)}</td>
                        <td>{call.status >= 400 ? `失败 ${call.status}` : `成功 ${call.status}`}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="5">
                          <div className="empty-inline">暂无真实调用流水 / 数据同步中</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel-box full-span">
              <div className="panel-head">
                <h3>价格计算公式</h3>
                <span>按真实请求展示</span>
              </div>
              <div className="formula-grid">
                {callLogs.length ? callLogs.slice(0, 5).map((call) => (
                  <div key={call.id} className="formula-card">
                    <strong>{call.routedModel || call.requestedModel || "未知模型"}</strong>
                    <span>{getCallFormula(call)}</span>
                    <em>{formatCny(call.cost, 4)}</em>
                  </div>
                )) : (
                  <div className="empty-block">没有调用时，这里只显示空状态，不展示伪造公式。</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="section-block leaderboard-section" id="model-ranks">
          <SectionTitle
            eyebrow="模型排行"
            title="全球模型热度排行"
            text="基于全球公开模型热度数据，仅供选择模型时参考。"
          />
          <ModelLeaderboard
            key={`global-${globalRank?.updatedAt || "syncing"}-${globalRank?.models?.length || 0}`}
            title="全球模型热度排行"
            subtitle="基于全球公开模型热度数据，仅供选择模型时参考。"
            sourceLabel={
              !globalRank?.models?.length && globalRank?.status === "syncing"
                ? "全球 · 同步中"
                : globalRank?.status === "synced"
                  ? "全球 · 实时数据"
                  : "全球 · 最近同步数据"
            }
            updatedAt={globalRank?.updatedAt || ""}
            items={globalRank?.models || []}
            loading={loadingGlobalRank}
            emptyText="全球模型热度数据同步中"
          />

          <ModelLeaderboard
            key={`usage-${rankPeriod}-${usageRank?.updatedAt || "syncing"}-${usageRank?.models?.length || 0}`}
            title="FlowAPI 站内模型用量排行"
            subtitle="基于 FlowAPI 用户真实调用数据，展示本站最常被使用的大模型。"
            sourceLabel="FlowAPI · 实时数据"
            updatedAt={usageRank?.updatedAt || ""}
            items={usageRank?.models || []}
            loading={loadingUsageRank}
            emptyText="暂无站内模型调用数据。完成真实调用后，这里会展示 FlowAPI 用户最常使用的模型。"
            period={rankPeriod}
            onPeriodChange={setRankPeriod}
          />
        </section>

        <section className="section-block" id="recharge">
          <SectionTitle
            eyebrow="充值"
            title="余额不足时再充值"
            text="充值后余额变化会立即写入账户和调用链路，方便后续核算与复购。"
          />
          <div className="recharge-grid">
            <div className="panel-box">
              <h3>手动充值</h3>
              <label>
                充值金额（¥）
                <input value={rechargeAmount} onChange={(event) => setRechargeAmount(event.target.value)} />
              </label>
              <AppButton
                onClick={async () => {
                  try {
                    await rechargeBalance();
                  } catch (error) {
                    setCallStatus(error.message || "充值失败");
                  }
                }}
              >
                立即充值
              </AppButton>
              <p className="form-note">充值后再调用，Token 会继续扣费，不会用假值替代。</p>
            </div>

            <div className="panel-box">
              <h3>激活码兑换</h3>
              <label>
                激活码
                <input value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder="ACT-XXXX-XXXXX" />
              </label>
              <AppButton
                variant="ghost"
                onClick={async () => {
                  try {
                    await redeemCode();
                  } catch (error) {
                    setCallStatus(error.message || "兑换失败");
                  }
                }}
              >
                兑换激活码
              </AppButton>
            </div>

            <div className="panel-box">
              <h3>余额变动记录</h3>
              <div className="event-list">
                {balanceEvents.length ? balanceEvents.map((event) => (
                  <div key={event.id} className="event-row">
                    <span>{formatDateTime(event.createdAt)}</span>
                    <strong>{event.status}</strong>
                    <em>{formatCny(event.amount, 4)}</em>
                  </div>
                )) : (
                  <div className="empty-block">暂无余额变动记录。</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="section-block" id="help">
          <SectionTitle
            eyebrow="帮助指南"
            title="新手只要照着复制就能接入"
            text="把开发者真正要复制的内容放在前面：Base URL、API Key、Model ID、调用示例。"
          />
          <div className="help-grid">
            <div className="help-links">
              {quickSteps.map((step, index) => (
                <article key={step.title} className="help-card">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>

            <div className="code-panel">
              {helpSnippets.map((item) => (
                <div key={item.name} className="code-block-wrap">
                  <div className="panel-head">
                    <h3>{item.name}</h3>
                    <button type="button" className="secondary-button" onClick={() => copyText(item.name, item.value)}>
                      复制
                    </button>
                  </div>
                  <pre className="code-block">{item.value}</pre>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section-block" id="profile">
          <SectionTitle
            eyebrow="个人资料"
            title="账户信息和支持入口"
            text="让用户知道自己是谁、还剩多少余额、能不能继续用、遇到问题该找谁。"
          />
          <div className="profile-grid">
            <div className="panel-box">
              <h3>当前资料</h3>
              <div className="field-list">
                <div>
                  <span>手机号</span>
                  <strong>{customer?.phone || "暂无数据"}</strong>
                </div>
                <div>
                  <span>公司 / 组织</span>
                  <strong>{customer?.company || "暂无数据"}</strong>
                </div>
                <div>
                  <span>协议状态</span>
                  <strong>{customer?.agreedToTerms ? "已同意" : "暂无数据"}</strong>
                </div>
                <div>
                  <span>最后调用</span>
                  <strong>{formatDateTime(metrics.latestCallAt)}</strong>
                </div>
              </div>
            </div>

            <div className="panel-box">
              <h3>邀请与支持</h3>
              <div className="inline-tags">
                <span>QQ 群</span>
                <span>客服</span>
                <span>邀请返佣</span>
                <span>激活码</span>
              </div>
              <p className="form-note">没有真实活动数据时会显示空状态，不伪造邀请收益。</p>
            </div>
          </div>
        </section>

        <section className="section-block" id="admin">
          <SectionTitle
            eyebrow="管理员后台"
            title="用户、Key、充值、调用、风控一屏看清"
            text="管理员可以看到真实用户、调用日志、充值记录和模型使用情况。"
          />
          <div className="stats-grid stats-grid-wide">
            <StatCard label="用户数" value={adminSnapshot ? formatTokens(adminTotals.users) : "暂无数据"} hint="真实账户" />
            <StatCard label="API Key" value={adminSnapshot ? formatTokens(adminTotals.apiKeys) : "暂无数据"} hint="已创建 Key" />
            <StatCard label="调用数" value={adminSnapshot ? formatTokens(adminTotals.calls) : "暂无数据"} hint="调用流水" />
            <StatCard label="充值次数" value={adminSnapshot ? formatTokens(adminTotals.recharges) : "暂无数据"} hint="到账记录" />
            <StatCard label="当前总余额" value={adminSnapshot ? formatCny(adminTotals.balance) : "暂无数据"} hint="账户余额合计" />
            <StatCard label="模型利润" value={adminSnapshot ? formatCny(adminTotals.spend) : "暂无数据"} hint="按真实调用累加" />
          </div>

          <div className="admin-grid">
            <div className="panel-box">
              <div className="panel-head">
                <h3>用户管理</h3>
                <span>{adminSnapshot?.customers?.length || 0} 人</span>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>余额</th>
                      <th>请求数</th>
                      <th>最后调用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSnapshot?.customers?.length ? adminSnapshot.customers.map((item) => (
                      <tr key={item.id}>
                        <td>{item.company || item.phone || item.id}</td>
                        <td>{formatCny(item.balance)}</td>
                        <td>{formatTokens(item.metrics?.requestCount)}</td>
                        <td>{formatDateTime(item.metrics?.latestCallAt)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="4"><div className="empty-inline">暂无真实用户数据</div></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel-box">
              <div className="panel-head">
                <h3>风控事件</h3>
                <span>{adminSnapshot?.riskEvents?.length || 0} 条</span>
              </div>
              <div className="event-list">
                {adminSnapshot?.riskEvents?.length ? adminSnapshot.riskEvents.map((event, index) => (
                  <div key={`${event.id || index}`} className="event-row">
                    <span>{formatDateTime(event.createdAt)}</span>
                    <strong>{event.type || "未知事件"}</strong>
                    <em>{event.description || "暂无说明"}</em>
                  </div>
                )) : (
                  <div className="empty-block">暂无真实风控事件。</div>
                )}
              </div>
            </div>

            <div className="panel-box">
              <div className="panel-head">
                <h3>管理员动作</h3>
                <span>真实写入内存态</span>
              </div>
              <label>
                目标客户
                <input value={adminTargetCustomer} onChange={(event) => setAdminTargetCustomer(event.target.value)} />
              </label>
              <label>
                调整金额（可正可负）
                <input value={adminAdjustAmount} onChange={(event) => setAdminAdjustAmount(event.target.value)} />
              </label>
              <label>
                调整原因
                <input value={adminAdjustReason} onChange={(event) => setAdminAdjustReason(event.target.value)} />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={async () => {
                    const data = await fetchJson("/api/admin", {
                      method: "POST",
                      body: JSON.stringify({
                        action: "adjustBalance",
                        customerId: adminTargetCustomer || currentCustomerId,
                        amount: adminAdjustAmount,
                        reason: adminAdjustReason,
                      }),
                    });
                    setAdminSnapshot(data.snapshot || null);
                    setCustomer(data.customer || null);
                  }}
                >
                  调整余额
                </button>
              </div>

              <div className="divider" />

              <label>
                激活码金额（¥）
                <input value={adminActivationAmount} onChange={(event) => setAdminActivationAmount(event.target.value)} />
              </label>
              <label>
                激活码备注
                <input value={adminActivationNote} onChange={(event) => setAdminActivationNote(event.target.value)} />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={async () => {
                    const data = await fetchJson("/api/admin", {
                      method: "POST",
                      body: JSON.stringify({
                        action: "createActivationCode",
                        amount: adminActivationAmount,
                        note: adminActivationNote,
                      }),
                    });
                    setAdminSnapshot(data.snapshot || null);
                  }}
                >
                  生成激活码
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block" id="call">
          <SectionTitle
            eyebrow="第一次调用"
            title="用真实 Key 发起一次模型请求"
            text="如果上游没有配置，页面会明确显示错误；如果成功，调用流水和扣费会立刻出现。"
          />
          <div className="chat-box call-box">
            <textarea value={promptText} onChange={(event) => setPromptText(event.target.value)} />
            <div className="chat-actions">
              <button type="button" onClick={runFirstCall} disabled={callLoading}>
                {callLoading ? "正在调用..." : "发起第一次调用"}
              </button>
              <span>{callStatus || "请先创建 API Key，再选择模型并调用。"}</span>
            </div>
            {callResult && <div className="chat-result">{callResult}</div>}
          </div>
        </section>

        {selectedDetail && (
          <section className="section-block">
            <div className="detail-panel">
              <div className="detail-head">
                <div>
                  <span>模型详情</span>
                  <h2>{selectedDetail.name}</h2>
                </div>
                <button type="button" className="secondary-button" onClick={() => setActiveModel(null)}>
                  关闭
                </button>
              </div>
              <div className="detail-grid">
                <div className="panel-box">
                  <h3>模型介绍</h3>
                  <p>{selectedDetail.bestFor || "暂无数据"}</p>
                  <div className="inline-tags">
                    <span>{selectedDetail.provider}</span>
                    <span>{selectedDetail.modelId}</span>
                  </div>
                </div>
                <div className="panel-box">
                  <h3>调用示例</h3>
                  <pre className="code-block">{`curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer ${currentKey || "sk-xxxx"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${selectedDetail.modelId}",
    "messages": [
      {"role": "user", "content": "写一封跨境电商开发信"}
    ]
  }'`}</pre>
                </div>
              </div>
            </div>
          </section>
        )}

        <footer className="site-footer">
          <strong>FlowAPI</strong>
          <span>注册 → 创建 Key → 选模型 → 调用 → 充值 → 复购</span>
        </footer>
      </main>
    </>
  );
}
