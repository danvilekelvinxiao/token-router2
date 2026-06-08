import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import FlowApiBrandText from "@/components/brand/flowapi-brand-text";
import ConsoleLayout from "@/components/ConsoleLayout";
import ModelLogo from "@/components/ModelLogo";
import CardDetailModal, { DetailRows, DetailTable } from "@/components/CardDetailModal";
import InteractiveCard from "@/components/InteractiveCard";
import { buildCcSwitchCodexConfig, buildCcSwitchConfigUrl } from "@/lib/cc-switch";
import { getPublicApiBaseUrl } from "@/lib/public-api";
import { formatDateTime, formatPercent, formatRequestCount, formatSmallCny, formatToken as formatUnifiedToken } from "@/lib/format/number-format";
import { useLocale } from "@/components/providers/locale-provider";
import { applyLocalePrice } from "@/lib/pricing/locale-pricing";

const API_BASE_URL = getPublicApiBaseUrl();
const DEFAULT_MODEL_ID = "deepseek-chat";
const CC_SWITCH_RELEASE_URL = "https://github.com/farion1231/cc-switch/releases/tag/v3.15.0";
const CC_SWITCH_WINDOWS_URL = "https://github.com/farion1231/cc-switch/releases/download/v3.15.0/CC-Switch-v3.15.0-Windows.msi";

function maskToken(token = "") {
  if (!token || token.length <= 14) return "sk-******";
  const prefix = token.startsWith("sk-") ? "sk-" : "";
  const body = token.startsWith("sk-") ? token.slice(3) : token;
  return `${prefix}${body.slice(0, 4)}************${body.slice(-4)}`;
}

function formatDate(value) {
  if (!value) return "暂无记录";
  return formatDateTime(value);
}

function formatCny(value) {
  return formatSmallCny(value);
}

function formatToken(value) {
  return formatUnifiedToken(value);
}

function pricePerMLabel(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "价格同步中";
  return `${formatSmallCny(number)} / M Token`;
}

function modelPriceSummary(model = {}, locale = "zh-CN") {
  const input = Number(model.flowapiInputPricePerM || model.inputPricePerM || 0);
  const output = Number(model.flowapiOutputPricePerM || model.outputPricePerM || 0);
  if (!input && !output) return "价格同步中";
  return `输入 ${pricePerMLabel(applyLocalePrice(input, locale))} · 输出 ${pricePerMLabel(applyLocalePrice(output, locale))}`;
}

function keyStatus(key = {}) {
  if (key.disabledAt) return { label: "已禁用", tone: "danger" };
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return { label: "已过期", tone: "danger" };
  if (key.quotaLimit?.status === "exceeded") return { label: "已达限额", tone: "danger" };
  return { label: "已启用", tone: "success" };
}

const LIMIT_TYPE_OPTIONS = [
  { value: "none", label: "不限额", hint: "使用账户可用余额" },
  { value: "total", label: "总额度", hint: "达到后暂停调用" },
  { value: "daily", label: "每日", hint: "每天 00:00 重置" },
  { value: "weekly", label: "每周", hint: "周一 00:00 重置" },
  { value: "monthly", label: "每月", hint: "每月 1 日重置" },
  { value: "custom", label: "自定义", hint: "按固定周期重置" },
];

function defaultLimitForm(source = null) {
  const limit = source?.quotaLimit || source || {};
  return {
    type: limit.type || "none",
    unit: limit.unit || "cny",
    amount: limit.amount ? String(limit.amount) : "",
    resetIntervalValue: limit.resetIntervalValue ? String(limit.resetIntervalValue) : "24",
    resetIntervalUnit: limit.resetIntervalUnit || "hour",
  };
}

function buildLimitPayload(form = {}) {
  return {
    type: form.type || "none",
    unit: form.unit || "cny",
    amount: form.type === "none" ? 0 : Number(form.amount || 0),
    resetIntervalValue: form.type === "custom" ? Number(form.resetIntervalValue || 0) : 0,
    resetIntervalUnit: form.type === "custom" ? form.resetIntervalUnit || "hour" : "hour",
  };
}

function getLimitValidationMessage(form = {}) {
  if (!form || form.type === "none") return "";
  const amount = Number(form.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "请填写大于 0 的额度限制";
  if (form.type !== "custom") return "";
  const interval = Number(form.resetIntervalValue || 0);
  if (!Number.isFinite(interval) || interval <= 0) return "请填写有效的自定义重置周期";
  if (form.resetIntervalUnit === "minute" && interval < 60) return "自定义分钟周期不能少于 60 分钟";
  return "";
}

function formatLimitValue(value, unit = "cny") {
  return unit === "token" ? formatToken(value) : formatCny(value);
}

function getLimitCopy(limit = {}) {
  if (!limit?.enabled || limit.type === "none") {
    return { title: "额度：不限额", detail: "仍受账户余额和套餐余额限制", percent: 0, tone: "neutral" };
  }
  const typeLabel = {
    total: "总额度",
    daily: "今日",
    weekly: "本周",
    monthly: "本月",
    custom: "本周期",
  }[limit.type] || "本周期";
  const resetText = limit.type === "total"
    ? "手动调整后恢复"
    : limit.nextResetAt
      ? `${formatDate(limit.nextResetAt)} 重置`
      : "到期自动重置";
  const tone = limit.percent >= 100 ? "danger" : limit.percent >= 80 ? "warning" : "success";
  return {
    title: `${typeLabel}已用 ${formatLimitValue(limit.used, limit.unit)} / ${formatLimitValue(limit.amount, limit.unit)}`,
    detail: resetText,
    percent: Math.min(100, Math.max(0, Number(limit.percent || 0))),
    tone,
  };
}

function normalizeModel(model = {}) {
  return {
    ...model,
    id: model.id || model.modelId || model.displayName,
    displayName: model.displayName || model.name || "Unknown Model",
    modelId: model.modelId || model.publicModelId || "",
    provider: model.provider || "FlowAPI",
    description: model.description || "模型介绍同步中。",
    enabled: model.enabled !== false,
    tags: Array.isArray(model.tags) ? model.tags : [],
    recommended: Boolean(model.recommended || model.isRecommended),
    isMemberOnly: Boolean(model.isMemberOnly),
    memberLevelRequired: model.memberLevelRequired || null,
    flowapiInputPricePerM: model.flowapiInputPricePerM || model.inputPricePerM || null,
    flowapiOutputPricePerM: model.flowapiOutputPricePerM || model.outputPricePerM || null,
    primaryButtonHref: model.primaryButtonHref || "/api-management",
  };
}

function readRequestedModelId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("model") || "";
}

function findRequestedModel(list = [], requested = "") {
  const target = String(requested || "").trim().toLowerCase();
  if (!target) return null;
  return list.find((model) => {
    return [model.modelId, model.publicModelId, model.id, model.displayName]
      .filter(Boolean)
      .some((value) => String(value).trim().toLowerCase() === target);
  }) || null;
}

function ApiManagementGuideHero({ onCreateKey }) {
  return (
    <section className="guide-hero api-management-guide-hero">
      <span className="guide-hero-badge">
        <span className="guide-hero-badge-text"><FlowApiBrandText text="FLOWAPI" /> 中转站</span>
      </span>
      <h1>三步即可开始</h1>
      <p>不懂 API 也能照着配置。先选模型，再创建 API Key，复制 Base URL 后即可开始调用。</p>
      <div className="guide-hero-steps">
        <span>下载工具</span>
        <span>创建 API Key</span>
        <span>自动配置</span>
        <span>查看用量</span>
      </div>
      <div className="api-management-guide-actions">
        <button type="button" className="flowapi-action-button" onClick={onCreateKey}>选择模型创建 API Key</button>
        <Link href="/models">前往模型广场</Link>
      </div>
    </section>
  );
}

function ApiManagementGuideSteps({ onCreateKey, onAutoConfig, onOpenDetail }) {
  return (
    <section className="guide-three-steps api-management-guide-steps">
      <InteractiveCard className="guide-step-wide" title="下载 CC-Switch 自动配置" hint="点击查看安装说明" onClick={() => onOpenDetail("download")}>
        <div className="guide-step-wide-top">
          <div className="guide-step-wide-num">01</div>
          <h3>下载 CC-Switch 自动配置</h3>
          <p>先下载并安装客户端 / 配置工具，准备好本地调用环境。</p>
        </div>
        <div className="guide-step-wide-bottom">
          <div className="guide-dl-btns">
            <a className="guide-step-action guide-dl-btn flowapi-action-button" href={CC_SWITCH_WINDOWS_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Windows 自动配置</a>
            <a className="guide-step-action guide-dl-btn flowapi-action-button" href={CC_SWITCH_RELEASE_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>macOS 自动配置</a>
            <a className="guide-step-action guide-dl-btn flowapi-action-button" href={CC_SWITCH_RELEASE_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>全部版本</a>
          </div>
          <p className="guide-dl-hint">无法访问 GitHub？请优先使用上方站内下载按钮。</p>
        </div>
      </InteractiveCard>

      <InteractiveCard className="guide-step-wide" title="创建 API Key" hint="点击查看 API Key 说明" onClick={() => onOpenDetail("createKey")}>
        <div className="guide-step-wide-top">
          <div className="guide-step-wide-num">02</div>
          <h3>创建 API Key</h3>
          <p>创建你的专属 API Key，用于在客户端或代码中调用模型。</p>
        </div>
        <div className="guide-step-wide-bottom">
          <button className="guide-step-action flowapi-action-button" type="button" onClick={(event) => { event.stopPropagation(); onCreateKey(); }}>选择模型创建</button>
        </div>
      </InteractiveCard>

      <InteractiveCard className="guide-step-wide" title="配置调用地址" hint="点击查看配置参数" onClick={() => onOpenDetail("config")}>
        <div className="guide-step-wide-top">
          <div className="guide-step-wide-num">03</div>
          <h3>配置调用地址</h3>
          <p>启动 CC-Switch 后，填入 Base URL、API Key 和 Model ID。</p>
        </div>
        <div className="guide-step-wide-bottom">
          <button className="guide-step-action flowapi-action-button" type="button" onClick={(event) => { event.stopPropagation(); onAutoConfig(); }}>启动 CC-Switch</button>
          <p className="guide-autoconfig-hint">
            <Link href="/help#manual-config" onClick={(event) => event.stopPropagation()}>自动配置失败？查看手动配置教程</Link>
          </p>
        </div>
      </InteractiveCard>

      <InteractiveCard className="guide-step-wide" title="开始使用" hint="点击查看测试说明" onClick={() => onOpenDetail("start")}>
        <div className="guide-step-wide-top">
          <div className="guide-step-wide-num">04</div>
          <h3>开始使用</h3>
          <p>完成配置后发起第一次调用，并在数据面板查看 Token 消耗。</p>
        </div>
        <div className="guide-step-wide-bottom guide-step-links">
          <Link className="guide-step-action flowapi-action-button" href="/dashboard" onClick={(event) => event.stopPropagation()}>查看用量</Link>
          <Link className="guide-step-action secondary" href="/models" onClick={(event) => event.stopPropagation()}>选择模型</Link>
        </div>
      </InteractiveCard>
    </section>
  );
}

export default function ApiManagementPage() {
  const { locale } = useLocale();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState([]);
  const [apiGroups, setApiGroups] = useState([]);
  const [membership, setMembership] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ label: "", modelId: "", groupId: "", expiresAt: "never", customDate: "", limit: defaultLimitForm() });
  const [createdKey, setCreatedKey] = useState(null);
  const [toast, setToast] = useState("");
  const [detail, setDetail] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [limitEditorKey, setLimitEditorKey] = useState(null);
  const [limitForm, setLimitForm] = useState(defaultLimitForm());
  const [savingLimit, setSavingLimit] = useState(false);
  const [ccSwitchFallback, setCcSwitchFallback] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const stored = localStorage.getItem("flowapi_customer");
    if (!stored) {
      queueMicrotask(() => { if (!cancelled) setLoading(false); });
      return undefined;
    }
    let localCustomer = null;
    try { localCustomer = JSON.parse(stored); } catch {
      localStorage.removeItem("flowapi_customer");
      queueMicrotask(() => { if (!cancelled) setLoading(false); });
      return undefined;
    }
    queueMicrotask(() => setCustomer(localCustomer));
    Promise.all([
      fetch(`/api/customer?customerId=${localCustomer.id}`).then((res) => res.ok ? res.json() : localCustomer),
      fetch("/api/models/api-key-options").then((res) => res.ok ? res.json() : { data: [] }),
      fetch("/api/groups/available").then((res) => res.ok ? res.json() : { groups: [] }),
      fetch("/api/user/wallet-summary").then((res) => res.ok ? res.json() : null).catch(() => null),
    ]).then(([freshCustomer, modelJson, groupJson, walletJson]) => {
      if (cancelled) return;
      setCustomer(freshCustomer);
      localStorage.setItem("flowapi_customer", JSON.stringify(freshCustomer));
      const list = (modelJson.data || modelJson.models || []).map(normalizeModel).filter((model) => model.enabled);
      const groups = groupJson.groups || [];
      const requestedModel = findRequestedModel(list, readRequestedModelId());
      const defaultModelId = requestedModel?.modelId || list[0]?.modelId || "";
      const defaultGroupId = groups.find((group) => group.recommended && group.available)?.id || groups.find((group) => group.available)?.id || groups[0]?.id || "";
      setModels(list);
      setApiGroups(groups);
      setSelectedModelId((current) => current || defaultModelId);
      setCreateForm((current) => ({
        ...current,
        modelId: current.modelId || defaultModelId,
        label: current.label || (requestedModel ? `${requestedModel.displayName} Key` : ""),
        groupId: current.groupId || defaultGroupId,
      }));
      setMembership(walletJson?.membership || null);
      if (requestedModel) {
        window.setTimeout(() => {
          scrollToCreateCard();
          showToast(`已为你选中 ${requestedModel.displayName}`);
        }, 250);
      }
    }).catch(() => {
      if (!cancelled) setToast("数据同步中，请稍后刷新。");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const apiKeys = useMemo(() => customer?.apiKeys || [], [customer?.apiKeys]);
  const selectedModel = useMemo(() => models.find((model) => model.modelId === selectedModelId) || models[0] || null, [models, selectedModelId]);
  const groupMap = useMemo(() => new Map(apiGroups.map((group) => [group.id, group])), [apiGroups]);
  const selectedCreateGroup = useMemo(() => groupMap.get(createForm.groupId) || apiGroups.find((group) => group.recommended && group.available) || apiGroups[0] || null, [apiGroups, createForm.groupId, groupMap]);
  const isBlackGoldMember = membership?.status === "active" && membership?.level === "black_gold";
  const filteredKeys = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return apiKeys;
    return apiKeys.filter((key) => [key.label, key.publicModelId, key.modelDisplayName, key.modelGroup].some((value) => String(value || "").toLowerCase().includes(text)));
  }, [apiKeys, query]);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  async function copyText(value, label = "已复制") {
    await navigator.clipboard.writeText(String(value || ""));
    showToast(label);
  }

  function scrollToCreateCard() {
    document.getElementById("api-create-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function refreshCustomer() {
    if (!customer?.id) return;
    const res = await fetch(`/api/customer?customerId=${customer.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setCustomer(data);
    localStorage.setItem("flowapi_customer", JSON.stringify(data));
  }

  function openCreateModal(model = selectedModel) {
    scrollToCreateCard();
    if (!model?.modelId) {
      showToast("模型配置同步中，请稍后再试");
      return;
    }
    setSelectedModelId(model.modelId);
    setCreateForm((current) => ({
      ...current,
      label: current.label || `${model.displayName} Key`,
      modelId: model.modelId,
      expiresAt: current.expiresAt || "never",
    }));
    setCreatedKey(null);
    setCreateModalOpen(true);
  }

  function handleAutoConfig() {
    const primaryKey = apiKeys[0];
    if (!primaryKey?.token || !String(primaryKey.token).startsWith("sk-")) {
      showToast("请先在下方创建 API Key，再启动 CC-Switch");
      scrollToCreateCard();
      return;
    }
    launchCcSwitchWithKey(primaryKey);
    showToast("正在启动 CC-Switch");
  }

  function launchCcSwitchWithKey(key) {
    if (!key?.token || !String(key.token).startsWith("sk-")) {
      setCcSwitchFallback({
        key,
        canImport: false,
        message: "为了安全，完整 API Key 只在创建时显示一次。如需一键导入，请重新创建 API Key。",
      });
      return;
    }
    const modelId = key?.publicModelId || selectedModel?.modelId || DEFAULT_MODEL_ID;
    const manualConfig = buildCcSwitchCodexConfig({ apiKey: key.token, baseUrl: API_BASE_URL, model: modelId });
    const url = buildCcSwitchConfigUrl({
      apiKey: key?.token,
      baseUrl: API_BASE_URL,
      model: modelId,
      name: "FlowAPI",
      displayName: key?.modelDisplayName || modelId,
    });
    setCcSwitchFallback({ key, canImport: true, url, manualConfig, modelId, message: "未检测到 CC-Switch 已打开，请先安装后重试。" });
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => {
      setCcSwitchFallback((current) => current?.url === url ? current : current);
    }, 1200);
  }

  function openGuideDetail(step) {
    const curl = `curl ${API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer 你的 API Key" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${selectedModel?.modelId || DEFAULT_MODEL_ID}",
       "messages": [{"role":"user","content":"你好"}]}'`;
    const configs = {
      download: {
        title: "01 下载 CC-Switch 自动配置",
        description: "先下载并安装配置工具，准备好本地调用环境。",
        rows: [
          { label: "Windows 下载", value: "CC-Switch-v3.15.0-Windows.msi" },
          { label: "全部版本", value: CC_SWITCH_RELEASE_URL },
          { label: "下一步", value: "回到本页选择模型并创建 API Key" },
        ],
        actions: <a className="flowapi-action-button" href={CC_SWITCH_WINDOWS_URL} target="_blank" rel="noopener noreferrer">下载 CC-Switch 自动配置</a>,
      },
      createKey: {
        title: "02 创建 API Key",
        description: "API Key 是你的调用凭证，请在下方创建区选择模型后创建。",
        rows: [
          { label: "当前模型", value: selectedModel?.modelId || "模型同步中" },
          { label: "创建位置", value: "本页创建 API Key 卡片" },
          { label: "安全提醒", value: "API Key 默认脱敏展示，完整值只在复制时使用" },
        ],
        actions: <button type="button" onClick={() => openCreateModal(selectedModel)}>选择模型创建 API Key</button>,
      },
      config: {
        title: "03 配置调用地址",
        description: "把 Base URL、API Key、Model ID 分别填入你的客户端。",
        rows: [
          { label: "Base URL", value: API_BASE_URL },
          { label: "Model ID", value: selectedModel?.modelId || DEFAULT_MODEL_ID },
          { label: "Chat Completions", value: `${API_BASE_URL}/chat/completions` },
        ],
        actions: <button type="button" onClick={() => copyText(API_BASE_URL, "Base URL 已复制")}>复制 Base URL</button>,
      },
      start: {
        title: "04 开始使用",
        description: "完成配置后先跑一次最短测试，再去数据面板看 Token 消耗。",
        rows: [
          { label: "成功标志", value: "返回 200 或模型回复内容" },
          { label: "调用流水", value: "数据面板会展示模型、Token、金额和状态" },
          { label: "常见错误", value: "余额不足、API Key 错误、模型名写错、网络超时" },
        ],
        actions: <Link href="/dashboard">查看数据面板</Link>,
      },
    };
    const config = configs[step] || configs.download;
    setDetail({
      title: config.title,
      description: config.description,
      badge: "API 接入步骤",
      sections: [
        { title: "核心说明", content: <DetailRows rows={config.rows} /> },
        { title: "测试示例", content: <DetailTable columns={[
          { key: "step", label: "项目" },
          { key: "title", label: "内容" },
          { key: "description", label: "说明" },
        ]} rows={[
          { step: "Base URL", title: API_BASE_URL, description: "FlowAPI 统一接入地址，直接复制使用" },
          { step: "Model", title: selectedModel?.modelId || DEFAULT_MODEL_ID, description: "可在模型广场复制其他模型 ID" },
          { step: "Curl", title: curl, description: "替换为你的 API Key 后即可测试" },
        ]} /> },
      ],
      actions: config.actions,
    });
  }

  function canSelectModel(model) {
    return Boolean(model?.modelId) && (!model.isMemberOnly || isBlackGoldMember);
  }

  function getCreateDisabledReason() {
    if (!customer?.id) return "请先登录后创建 API Key";
    if (creating) return "";
    if (!createForm.modelId) return "请选择默认模型后创建 API Key";
    const model = models.find((item) => item.modelId === createForm.modelId) || selectedModel;
    if (!model?.modelId) return "模型配置同步中，请稍后再创建";
    if (!canSelectModel(model)) return "当前模型需要黑金会员权限";
    if (!selectedCreateGroup?.id) return "请选择 API 线路后创建 API Key";
    if (!selectedCreateGroup.available) return "当前 API 线路已停用，请选择其他线路";
    if (!groupSupportsModel(selectedCreateGroup, model)) return "当前线路不支持所选模型，请更换线路或模型";
    if (createForm.expiresAt === "custom" && !createForm.customDate) return "请选择自定义过期日期";
    return getLimitValidationMessage(createForm.limit);
  }

  function groupSupportsModel(group, model) {
    const supported = Array.isArray(group?.supportedModels) ? group.supportedModels : [];
    if (!supported.length) return true;
    const aliases = [model?.id, model?.modelId, model?.actualModelId, model?.displayName]
      .map((item) => String(item || "").toLowerCase())
      .filter(Boolean);
    return supported.some((item) => aliases.includes(String(item || "").toLowerCase()));
  }

  function selectCreateModel(model) {
    if (!canSelectModel(model)) {
      showToast("该模型为黑金会员专属，开通会员后即可选择");
      return;
    }
    setSelectedModelId(model.modelId);
    setCreateForm((current) => ({
      ...current,
      modelId: model.modelId,
      label: current.label && current.label !== `${selectedModel?.displayName || ""} Key` ? current.label : `${model.displayName} Key`,
    }));
  }

  function resolveCreateExpiresAt() {
    if (createForm.expiresAt === "never") return null;
    if (createForm.expiresAt === "custom") return createForm.customDate || null;
    const days = createForm.expiresAt === "30d" ? 30 : createForm.expiresAt === "90d" ? 90 : createForm.expiresAt === "1y" ? 365 : 0;
    if (!days) return null;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  async function createKey() {
    const model = models.find((item) => item.modelId === createForm.modelId) || selectedModel;
    if (!model?.modelId || creating) return;
    if (!canSelectModel(model)) {
      showToast("该模型为黑金会员专属，开通会员后即可选择");
      return;
    }
    if (createForm.expiresAt === "custom" && !createForm.customDate) {
      showToast("请选择自定义过期日期");
      return;
    }
    const limitMessage = getLimitValidationMessage(createForm.limit);
    if (limitMessage) {
      showToast(limitMessage);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          modelId: model.modelId,
          label: createForm.label.trim() || `${model.displayName} Key`,
          expiresAt: resolveCreateExpiresAt(),
          locale,
          limit: buildLimitPayload(createForm.limit),
          groupId: createForm.groupId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || "创建失败");
      const updated = data.customer || data;
      setCustomer(updated);
      localStorage.setItem("flowapi_customer", JSON.stringify(updated));
      const created = data.createdKey || null;
      setCreatedKey(created);
      if (created?.token && String(created.token).startsWith("sk-")) {
        launchCcSwitchWithKey(created);
        showToast("API Key 创建成功，已自动导入 CC-Switch");
      } else {
        showToast("API Key 已创建，请立即复制保存");
      }
    } catch (error) {
      showToast(error.message || "创建失败，请稍后重试");
    } finally {
      setCreating(false);
    }
  }

  async function toggleKey(key) {
    const disabled = !key.disabledAt;
    const res = await fetch("/api/keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id, keyId: key.id, disabled }),
    });
    if (res.ok) {
      await refreshCustomer();
      showToast(disabled ? "API Key 已禁用" : "API Key 已启用");
    } else {
      showToast("操作失败，请稍后重试");
    }
  }

  async function deleteKey(key) {
    if (!window.confirm(`确认删除 ${key.label || "这个 API Key"}？删除后无法恢复。`)) return;
    const res = await fetch("/api/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id, keyId: key.id }),
    });
    if (res.ok) {
      await refreshCustomer();
      showToast("API Key 已删除");
    } else {
      showToast("删除失败，请稍后重试");
    }
  }

  function openLimitEditor(key) {
    setLimitEditorKey(key);
    setLimitForm(defaultLimitForm(key));
  }

  async function saveLimitEditor() {
    if (!limitEditorKey || savingLimit) return;
    setSavingLimit(true);
    try {
      const res = await fetch("/api/keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          keyId: limitEditorKey.id,
          limit: buildLimitPayload(limitForm),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || "额度保存失败");
      setCustomer(data);
      localStorage.setItem("flowapi_customer", JSON.stringify(data));
      setLimitEditorKey(null);
      showToast("API Key 额度已更新");
    } catch (error) {
      showToast(error.message || "额度保存失败");
    } finally {
      setSavingLimit(false);
    }
  }

  function renderLimitFields(form, setForm) {
    const active = form.type !== "none";
    return (
      <div className="api-key-limit-editor">
        <div className="api-key-limit-type-grid">
          {LIMIT_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={form.type === option.value ? "active" : ""}
              onClick={() => setForm((current) => ({ ...current, type: option.value }))}
            >
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </button>
          ))}
        </div>
        {active ? (
          <div className="api-key-limit-input-row">
            <label>
              <span>额度上限</span>
              <input
                type="number"
                min="0"
                step={form.unit === "cny" ? "0.01" : "1"}
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder={form.unit === "cny" ? "例如 100" : "例如 1000000"}
              />
            </label>
            <label>
              <span>单位</span>
              <select value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}>
                <option value="cny">¥ 金额</option>
                <option value="token">Token</option>
              </select>
            </label>
            {form.type === "custom" ? (
              <>
                <label>
                  <span>每隔</span>
                  <input
                    type="number"
                    min={form.resetIntervalUnit === "minute" ? "60" : "1"}
                    value={form.resetIntervalValue}
                    onChange={(event) => setForm((current) => ({ ...current, resetIntervalValue: event.target.value }))}
                  />
                </label>
                <label>
                  <span>周期</span>
                  <select value={form.resetIntervalUnit} onChange={(event) => setForm((current) => ({ ...current, resetIntervalUnit: event.target.value }))}>
                    <option value="minute">分钟</option>
                    <option value="hour">小时</option>
                    <option value="day">天</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>
        ) : (
          <p className="api-key-limit-note">该 API Key 可使用账户可用余额内的全部额度，仍受账户余额、套餐余额和会员赠送额度限制。</p>
        )}
        {active ? <p className="api-key-limit-note">达到限额后，此 API Key 将暂停请求；失败或未扣费调用不会计入额度。</p> : null}
      </div>
    );
  }

  async function openUsage(key) {
    setUsageLoading(true);
    setDetail({
      title: key.label || "API Key 详情",
      description: "正在同步该 API Key 的真实调用数据。",
      badge: "API Key",
      sections: [{ title: "加载中", content: <p className="api-management-empty-text">正在读取真实调用记录...</p> }],
    });
    try {
      const res = await fetch(`/api/newapi/keys/${encodeURIComponent(key.id)}/usage`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "同步失败");
      const rows = [
        { label: "API Key", value: data.key?.maskedKey || maskToken(key.token) },
        { label: "绑定模型", value: key.modelDisplayName || key.publicModelId || "未绑定模型" },
        { label: "线路", value: `${groupMap.get(key.modelGroup)?.displayName || key.modelGroup || "默认"} · ${Number(key.priceMultiplier || groupMap.get(key.modelGroup)?.billingMultiplier || 1)}x` },
        { label: "Base URL", value: API_BASE_URL },
        { label: "创建时间", value: formatDate(key.createdAt) },
        { label: "最近调用", value: formatDate(data.key?.lastUsedAt || key.lastUsedAt) },
        { label: "状态", value: keyStatus(key).label },
      ];
      const quotaCopy = getLimitCopy(key.quotaLimit);
      const quotaRows = [
        { label: "额度类型", value: key.quotaLimit?.enabled ? LIMIT_TYPE_OPTIONS.find((item) => item.value === key.quotaLimit.type)?.label || "周期额度" : "不限额" },
        { label: "额度使用", value: quotaCopy.title.replace(/^额度：/, "") },
        { label: "重置时间", value: quotaCopy.detail },
        { label: "累计金额", value: formatCny(key.quotaLimit?.totalUsedCny || 0) },
        { label: "累计 Token", value: formatToken(key.quotaLimit?.totalUsedTokens || 0) },
      ];
      const summaryRows = data.summary ? [
        { label: "总请求", value: formatRequestCount(data.summary.totalRequests) },
        { label: "总 Token", value: formatToken(data.summary.totalTokens) },
        { label: "总消耗", value: formatCny(data.summary.totalSpendCny) },
        { label: "成功率", value: formatPercent(data.summary.successRate) },
      ] : [];
      setDetail({
        title: key.label || "API Key 详情",
        description: data.source === "empty" ? "暂无真实调用记录。完成一次模型调用后，这里会展示 Token、金额、模型和扣费来源。" : "基于该 API Key 的真实调用记录生成。",
        badge: data.source === "real" ? "真实数据" : "暂无数据",
        sections: [
          { title: "接入参数", content: <DetailRows rows={rows} /> },
          { title: "额度使用", content: <DetailRows rows={quotaRows} /> },
          ...(summaryRows.length ? [{ title: "使用汇总", content: <DetailRows rows={summaryRows} /> }] : []),
          {
            title: "最近调用",
            content: data.recentCalls?.length ? (
              <DetailTable
                columns={[
                  { key: "createdAt", label: "时间" },
                  { key: "model", label: "模型" },
                  { key: "totalTokens", label: "Token" },
                  { key: "costCny", label: "消耗" },
                  { key: "status", label: "状态" },
                ]}
                rows={data.recentCalls.slice(0, 8).map((call) => ({
                  ...call,
                  createdAt: formatDate(call.createdAt),
                  model: (
                    <span className="model-name-cell">
                      <ModelLogo model={call.model} provider={call.provider} size={20} />
                      <span className="model-text">
                        <strong className="model-name">{call.model || "未知模型"}</strong>
                        <small className="model-provider">{call.provider || "模型服务"}</small>
                      </span>
                    </span>
                  ),
                  totalTokens: formatToken(call.totalTokens),
                  costCny: formatCny(call.costCny),
                  status: call.status === "success" ? "成功" : call.status === "failed" ? "失败" : "同步中",
                }))}
              />
            ) : <p className="api-management-empty-text">暂无调用记录，不显示假数据。</p>,
          },
        ],
      });
    } catch (error) {
      setDetail({
        title: key.label || "API Key 详情",
        description: "调用数据暂时无法同步。",
        badge: "同步中",
        sections: [{ title: "提示", content: <p className="api-management-empty-text">{error.message || "请稍后重试。"}</p> }],
      });
    } finally {
      setUsageLoading(false);
    }
  }

  const authRequired = !loading && !customer;

  if (!customer) {
    return (
      <main className="landing-shell api-management-auth-shell">
        <section className="api-management-auth-gate">
          <span>{authRequired ? "需要登录" : "同步账号"}</span>
          <h1>{authRequired ? "先登录，再创建你的 FlowAPI Key" : "正在读取你的 API Key 工作台"}</h1>
          <p>
            {authRequired
              ? "注册账号后会获得体验额度。登录后你可以选择模型、创建 API Key、复制 Base URL，并在使用日志里看到每次 Token 和金额消耗。"
              : "正在同步账号、模型和调用记录，请稍等几秒。"}
          </p>
          {authRequired ? (
            <div className="api-management-auth-actions">
              <Link href="/register">注册送 ¥5 体验额度</Link>
              <Link href="/login" className="secondary">登录账号</Link>
              <Link href="/help" className="ghost">看三步教程</Link>
            </div>
          ) : (
            <p className="api-management-empty-text">加载中...</p>
          )}
        </section>
      </main>
    );
  }

  const createDisabledReason = getCreateDisabledReason();
  const createButtonDisabled = creating || Boolean(createDisabledReason);

  return (
    <>
      <Head><title>API 管理 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer} currentPath="/api-management">
        <main className="api-management-page">
          <div className="guide-page api-management-guide-page">
            <ApiManagementGuideHero onCreateKey={() => openCreateModal(selectedModel)} />
            <ApiManagementGuideSteps onCreateKey={() => openCreateModal(selectedModel)} onAutoConfig={handleAutoConfig} onOpenDetail={openGuideDetail} />
          </div>

          <section id="api-create-section" className="api-management-create-card">
            <div className="api-management-card-head">
              <div>
                <span>创建 API Key</span>
                <h2>选择模型创建 API Key</h2>
                <p>每个 Key 绑定一个模型，后续账单、扣费来源和调用记录更容易看懂。</p>
              </div>
              <button type="button" className="btn-primary flowapi-primary-action" disabled={!selectedModel || loading} onClick={() => openCreateModal(selectedModel)}>创建 API Key</button>
            </div>
            <div className="api-management-model-grid">
              {models.slice(0, 8).map((model) => (
                <button key={model.id} type="button" className={selectedModelId === model.modelId ? "selected" : ""} onClick={() => setSelectedModelId(model.modelId)}>
                  <ModelLogo model={model.displayName} provider={model.provider} size={34} />
                  <strong>{model.displayName}</strong>
                  <span>by {model.provider}</span>
                  <code>{model.modelId || "同步中"}</code>
                </button>
              ))}
              {!models.length && !loading ? <div className="api-management-empty-text">模型配置同步中，请稍后刷新或到大模型接入页查看。</div> : null}
            </div>
          </section>

          <section className="api-management-key-panel">
            <div className="api-management-panel-head">
              <div>
                <span>我的 API Keys</span>
                <h2>我的 API Key</h2>
                <p>点击卡片查看真实调用、Token 消耗、扣费来源和最近使用时间。</p>
              </div>
              <label>
                <span>搜索</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 API Key / 模型" />
              </label>
            </div>

            <div className="api-management-key-grid">
              {filteredKeys.map((key) => {
                const status = keyStatus(key);
                const limitCopy = getLimitCopy(key.quotaLimit);
                return (
                  <article key={key.id} className={`api-management-key-card tone-${status.tone}`} onClick={() => openUsage(key)} role="button" tabIndex={0}>
                    <div className="api-key-card-top">
                      <div>
                        <strong>{key.label || "未命名 API Key"}</strong>
                        <span>{key.modelDisplayName || key.publicModelId || "未绑定模型"}</span>
                      </div>
                      <em>{status.label}</em>
                    </div>
                    <code>{maskToken(key.token)}</code>
                    <div className="api-key-card-meta">
                      <span>线路：{groupMap.get(key.modelGroup)?.displayName || key.modelGroup || "默认"} · {Number(key.priceMultiplier || groupMap.get(key.modelGroup)?.billingMultiplier || 1)}x</span>
                      <span>今日使用：{formatToken(key.quotaLimit?.todayUsedTokens || 0)}</span>
                      <span>本月使用：{formatToken(key.quotaLimit?.monthUsedTokens || key.quotaLimit?.totalUsedTokens || 0)}</span>
                      <span>最后调用：{formatDate(key.lastUsedAt)}</span>
                    </div>
                    <div className={`api-key-limit-summary tone-${limitCopy.tone}`}>
                      <div>
                        <span>{limitCopy.title}</span>
                        <small>{limitCopy.detail}</small>
                      </div>
                      {key.quotaLimit?.enabled ? <em>{limitCopy.percent}%</em> : null}
                      {key.quotaLimit?.enabled ? (
                        <div className="api-key-limit-progress" aria-label="额度使用进度">
                          <i style={{ width: `${limitCopy.percent}%` }} />
                        </div>
                      ) : null}
                    </div>
                    <div className="api-key-card-actions" onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="primary" onClick={() => launchCcSwitchWithKey(key)}>使用</button>
                      <button type="button" onClick={() => copyText(key.token, "API Key 已复制")}>复制 API Key</button>
                      <button type="button" onClick={() => openUsage(key)}>详情</button>
                      <button type="button" onClick={() => openLimitEditor(key)}>调整额度</button>
                      <button type="button" onClick={() => toggleKey(key)}>{key.disabledAt ? "启用" : "禁用"}</button>
                      <button type="button" className="danger" onClick={() => deleteKey(key)}>删除</button>
                    </div>
                  </article>
                );
              })}
            </div>

            {!filteredKeys.length ? (
              <div className="api-management-empty">
                <strong>暂无 API Key</strong>
                <p>先选择一个模型并创建 API Key。完成真实调用后，这里会展示每个 Key 的 Token 消耗和扣费来源。</p>
                <button type="button" className="flowapi-primary-action" onClick={() => openCreateModal(selectedModel)} disabled={!selectedModel}>创建第一个 API Key</button>
              </div>
            ) : null}
          </section>
        </main>
      </ConsoleLayout>

      {createModalOpen ? (
        <div className="api-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setCreateModalOpen(false); }}>
          <div className="api-modal api-management-create-modal">
            <header>
              <div>
                <span>创建 API Key</span>
                <h2>{createdKey ? "API Key 创建成功" : "创建新的 API Key"}</h2>
              </div>
              <button type="button" onClick={() => setCreateModalOpen(false)}>×</button>
            </header>

            {createdKey ? (
              <div className="api-modal-body api-create-success-body">
                <div className="api-key-success-panel">
                  <span>创建成功</span>
                  <strong>{maskToken(createdKey.token)}</strong>
                  <p>完整 API Key 只在复制时使用，请妥善保存，不要公开发到群聊、论坛或截图中。</p>
                  <div>
                    <button type="button" className="api-action primary flowapi-primary-action" onClick={() => copyText(createdKey.token, "API Key 已复制")}>复制 API Key</button>
                    <Link href="/help" className="api-action">前往接入教程</Link>
                    <Link href="/models" className="api-action">选择模型</Link>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="api-modal-body">
                  <label>名称
                    <input
                      value={createForm.label}
                      onChange={(event) => setCreateForm((value) => ({ ...value, label: event.target.value }))}
                      placeholder="例如：我的第一个 API Key"
                      autoFocus
                    />
                  </label>

                  <div className="api-model-choice-field">
                    <span>选择可调用模型</span>
                    <div className="api-model-choice-grid api-management-model-choice-grid">
                      {models.map((model) => {
                        const disabled = !canSelectModel(model);
                        return (
                          <button
                            key={model.id}
                            type="button"
                            className={`${createForm.modelId === model.modelId ? "active" : ""} ${disabled ? "disabled" : ""}`}
                            aria-disabled={disabled}
                            onClick={() => selectCreateModel(model)}
                          >
                            <span className="api-model-card-head">
                              <span className="api-model-card-title">
                                <ModelLogo model={model.displayName} provider={model.provider} size={26} />
                                <strong title={model.displayName}>{model.displayName}</strong>
                              </span>
                              <em>{disabled ? "黑金会员专属" : createForm.modelId === model.modelId ? "已选择" : model.recommended ? "推荐" : "可用"}</em>
                            </span>
                            <code title={model.modelId}>{model.modelId || "同步中"}</code>
                            <small>{model.provider} · {modelPriceSummary(model, locale)}</small>
                            {model.tags?.length ? <small>{model.tags.slice(0, 3).join(" · ")}</small> : null}
                          </button>
                        );
                      })}
                      {!models.length ? <div className="api-management-empty-text">模型配置同步中，请稍后刷新或到大模型接入页查看。</div> : null}
                    </div>
                  </div>

                  <div className="api-expiry-field api-group-choice-field">
                    <span>选择线路</span>
                    <div className="api-group-choice-grid">
                      {apiGroups.map((group) => {
                        const model = models.find((item) => item.modelId === createForm.modelId) || selectedModel;
                        const disabled = !group.available || !groupSupportsModel(group, model);
                        return (
                          <button
                            key={group.id}
                            type="button"
                            className={`${createForm.groupId === group.id ? "active" : ""} ${disabled ? "disabled" : ""}`}
                            aria-disabled={disabled}
                            onClick={() => {
                              if (disabled) {
                                showToast(group.available ? "该线路不支持当前模型" : "该线路已停用");
                                return;
                              }
                              setCreateForm((current) => ({ ...current, groupId: group.id }));
                            }}
                          >
                            <span>
                              <strong>{group.displayName}</strong>
                              <em>{group.billingMultiplier}x</em>
                            </span>
                            <small>{group.recommended ? "系统推荐 · " : ""}{group.description || "自动调度线路"}</small>
                            <code>{group.supportedModels?.length ? `${group.modelCount || group.supportedModels.length} 个模型` : "全部模型"}</code>
                          </button>
                        );
                      })}
                      {!apiGroups.length ? <div className="api-management-empty-text">线路配置同步中，请稍后刷新。</div> : null}
                    </div>
                  </div>

                  <div className="api-expiry-field">
                    <span>额度限制</span>
                    {renderLimitFields(createForm.limit, (updater) => setCreateForm((current) => ({
                      ...current,
                      limit: typeof updater === "function" ? updater(current.limit) : updater,
                    })))}
                  </div>

                  <div className="api-expiry-field">
                    <span>过期时间</span>
                    <div className="api-expiry-grid">
                      {[["never","永不过期","长期稳定使用"],["30d","30 天","短期测试"],["90d","90 天","季度项目"],["1y","1 年","年度使用"],["custom","自定义日期","指定到期日"]].map(([value, title, desc]) => (
                        <button key={value} type="button" className={`${createForm.expiresAt === value ? "active" : ""} ${value === "custom" ? "wide" : ""}`} onClick={() => setCreateForm((current) => ({ ...current, expiresAt: value }))}>
                          <strong>{title}</strong><small>{desc}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  {createForm.expiresAt === "custom" ? (
                    <label>自定义日期
                      <input type="date" min={new Date().toISOString().slice(0, 10)} value={createForm.customDate} onChange={(event) => setCreateForm((value) => ({ ...value, customDate: event.target.value }))} />
                    </label>
                  ) : null}
                </div>
                <footer>
                  {createDisabledReason ? <p className="api-action-disabled-hint" role="status">{createDisabledReason}</p> : null}
                  <button type="button" className="api-action" onClick={() => setCreateModalOpen(false)}>取消</button>
                  <button type="button" className="api-action primary flowapi-primary-action" disabled={createButtonDisabled} data-loading={creating ? "true" : "false"} onClick={createKey}>
                    {creating ? <span className="api-action-spinner" aria-hidden="true" /> : null}
                    {creating ? "正在创建 API Key..." : "创建 API Key"}
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      ) : null}

      {limitEditorKey ? (
        <div className="api-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setLimitEditorKey(null); }}>
          <div className="api-modal api-key-limit-modal">
            <header>
              <div>
                <span>调整额度</span>
                <h2>{limitEditorKey.label || "API Key 额度"}</h2>
              </div>
              <button type="button" onClick={() => setLimitEditorKey(null)}>×</button>
            </header>
            <div className="api-modal-body">
              {renderLimitFields(limitForm, setLimitForm)}
            </div>
            <footer>
              <button type="button" className="api-action" onClick={() => setLimitEditorKey(null)}>取消</button>
              <button type="button" className="api-action primary flowapi-primary-action" disabled={savingLimit} data-loading={savingLimit ? "true" : "false"} onClick={saveLimitEditor}>
                {savingLimit ? <span className="api-action-spinner" aria-hidden="true" /> : null}
                {savingLimit ? "保存中..." : "保存额度"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {ccSwitchFallback ? (
        <div className="api-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setCcSwitchFallback(null); }}>
          <div className="api-modal api-key-limit-modal">
            <header>
              <div>
                <span>CC-Switch</span>
                <h2>使用 FlowAPI API Key</h2>
              </div>
              <button type="button" onClick={() => setCcSwitchFallback(null)}>×</button>
            </header>
            <div className="api-modal-body">
              <p className="api-key-limit-note">{ccSwitchFallback.message}</p>
              <DetailRows rows={[
                { label: "类型", value: "OpenAI 兼容" },
                { label: "Base URL", value: API_BASE_URL },
                { label: "默认模型", value: ccSwitchFallback.modelId || ccSwitchFallback.key?.publicModelId || DEFAULT_MODEL_ID },
                { label: "API Key", value: ccSwitchFallback.canImport ? "已写入 deeplink，不在本地保存" : "完整 Key 不可取回" },
              ]} />
              {ccSwitchFallback.manualConfig ? (
                <pre className="api-management-code-preview"><code>{ccSwitchFallback.manualConfig.config}</code></pre>
              ) : null}
            </div>
            <footer>
              <button type="button" className="api-action" onClick={() => setCcSwitchFallback(null)}>取消</button>
              {ccSwitchFallback.url ? <button type="button" className="api-action primary flowapi-primary-action" onClick={() => window.open(ccSwitchFallback.url, "_blank", "noopener,noreferrer")}>重试打开</button> : null}
              <a className="api-action flowapi-action-button" href={CC_SWITCH_WINDOWS_URL} target="_blank" rel="noreferrer">下载 CC-Switch 自动配置</a>
              {ccSwitchFallback.manualConfig ? <button type="button" className="api-action" onClick={() => copyText(ccSwitchFallback.manualConfig.config, "备用配置已复制")}>复制备用配置</button> : null}
              <a className="api-action" href="/help/images#cc-switch" target="_blank" rel="noreferrer">查看手动教程</a>
            </footer>
          </div>
        </div>
      ) : null}

      <CardDetailModal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        {...(detail || {})}
        actions={detail?.actions ?? (usageLoading ? null : <Link href="/help">查看接入教程</Link>)}
      />
      {toast ? <div className="models-toast-v3">{toast}</div> : null}
    </>
  );
}
