export const dynamic = "force-dynamic";
import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import { buildCcSwitchCodexConfig, buildCcSwitchConfigUrl } from "@/lib/cc-switch";
import { getPublicApiBaseUrl } from "@/lib/public-api";
import InteractiveCard from "@/components/InteractiveCard";
import CardDetailModal, { DetailRows, DetailTable } from "@/components/CardDetailModal";
import { listModelProducts } from "@/lib/model-products";
const API_BASE_URL = getPublicApiBaseUrl();
const defaultModel = "gpt-5.5";
const CC_SWITCH_RELEASE_URL = "https://github.com/farion1231/cc-switch/releases/tag/v3.15.0";
const CC_SWITCH_WINDOWS_URL = "https://github.com/farion1231/cc-switch/releases/download/v3.15.0/CC-Switch-v3.15.0-Windows.msi";
const MODEL_PRODUCT_OPTIONS = listModelProducts({ includeUnavailable: true });

/* ==================== helpers ==================== */

function formatDate(value) {
  if (!value) return "从未";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function getStatus(key) {
  if (key.disabledAt) return { label: "已禁用", tone: "danger" };
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return { label: "已过期", tone: "danger" };
  return { label: "已启用", tone: "success" };
}

function displayToken(token = "") {
  return String(token || "");
}

function computeExpiry(value, customDate = "") {
  if (!value || value === "never") return null;
  if (value === "custom") return customDate || null;
  const date = new Date();
  if (value === "30d") date.setDate(date.getDate() + 30);
  else if (value === "90d") date.setDate(date.getDate() + 90);
  else if (value === "1y") date.setFullYear(date.getFullYear() + 1);
  else return value;
  return date.toISOString();
}

function makeCcSwitchConfig(keys, apiBaseUrl) {
  if (keys.length === 1) {
    const model = keys[0].publicModelId || defaultModel;
    return JSON.stringify(buildCcSwitchCodexConfig({
      apiKey: keys[0].token, baseUrl: apiBaseUrl, model,
    }), null, 2);
  }
  return JSON.stringify({
    name: "FlowAPI", app: "codex", endpoint: apiBaseUrl,
    keys: keys.map((key) => ({
      name: key.label,
      apiKey: key.token,
      api_key: key.token,
      model: key.publicModelId || defaultModel,
    })),
  }, null, 2);
}

function CopyButton({ value, label }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="guide-copy-btn" onClick={async () => {
      await navigator.clipboard.writeText(value);
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    }}>
      {ok ? "已复制" : label || "复制"}
    </button>
  );
}

function Toast({ text }) {
  if (!text) return null;
  return <div className="guide-toast-new">{text}</div>;
}

function CompactAccessAnimation() {
  const nodes = ["API Key + Base URL", "CC-Switch", defaultModel, "开始调用"];
  return (
    <div className="guide-mini-flow" aria-label="FlowAPI 接入路径示意图">
      <span className="flow-access-kicker">接入路径示意图</span>
      <div className="guide-mini-flow-track">
        {nodes.map((item, index) => (
          <div key={item} className="guide-mini-flow-node">
            <strong>{item}</strong>
            {index < nodes.length - 1 ? <span aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
      <p>不要选择 OpenAI Official 预设栏，建议添加自定义接入。</p>
    </div>
  );
}

function QuickConnectPanel({ apiBaseUrl, onCreateKey }) {
  return (
    <section className="guide-quick-connect">
      <div className="guide-quick-copy">
        <span className="flow-access-kicker">快速接入 FlowAPI</span>
        <h2>3 分钟接入 FlowAPI</h2>
        <p>复制 Base URL 和 API Key，选择模型，即可在 CC-Switch、Cherry Studio、Chatbox、Claude Code 等工具中调用模型。</p>
        <div className="guide-quick-info-grid">
          <article>
            <span>Base URL</span>
            <code>{apiBaseUrl}</code>
            <CopyButton value={apiBaseUrl} label="复制 Base URL" />
          </article>
          <article>
            <span>API Key</span>
            <code>先选择模型后创建</code>
            <button type="button" onClick={onCreateKey}>选择模型创建</button>
          </article>
          <article>
            <span>默认模型</span>
            <code>{defaultModel}</code>
            <CopyButton value={defaultModel} label="复制模型 ID" />
          </article>
        </div>
      </div>
      <CompactAccessAnimation />
    </section>
  );
}

function TutorialSteps({ apiBaseUrl }) {
  const steps = [
    ["01", "下载 CC-Switch 自动配置", "先下载并安装 CC-Switch，准备好本地调用环境。"],
    ["02", "进入模型广场", "先选择你要使用的模型或套餐，再创建对应的 API Key。"],
    ["03", "创建该模型 API Key", "在模型卡片或下方弹窗中确认模型后创建，避免把 Codex / GPT 任务误绑定到其他模型。"],
    ["04", "填写配置", <>名称：<b>FlowAPI</b><br />API 请求地址：<code>{apiBaseUrl}</code><br />API Key：填写刚创建的 API Key<br />模型名称：填写你选择的 Model ID，例如 <code>{defaultModel}</code></>],
    ["05", "点击测试", "测试成功后，即可在支持 OpenAI-Compatible API 的工具中使用 FlowAPI。"],
  ];

  return (
    <section className="guide-clear-steps">
      <div className="guide-section-title">
        <span className="flow-access-kicker">小白步骤教程</span>
        <h2>按这 5 步填写，不用理解复杂 API</h2>
        <p>重点记住三件事：Base URL 填 {API_BASE_URL}，先选模型，再创建该模型专用 API Key。</p>
      </div>
      <div className="guide-clear-step-list">
        {steps.map(([num, title, desc]) => (
          <article key={num} className="guide-clear-step-card">
            <span>{num}</span>
            <div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="guide-error-strip">
        <div><b>401</b><span>API Key 填错或已停用，请回到 API 管理页面重新复制。</span></div>
        <div><b>404</b><span>Base URL 错误，通常少了 /v1，或工具走了错误路径。</span></div>
        <div><b>503</b><span>模型服务暂时不可用，可先换模型再重试。</span></div>
      </div>
    </section>
  );
}

function CcSwitchConfigPanel({ apiBaseUrl, onCreateKey, onAutoConfig, onCopyConfig }) {
  return (
    <section className="ccswitch-panel">
      <div className="ccswitch-main">
        <span className="flow-access-kicker">CC-Switch</span>
        <h2>CC-Switch 快速配置</h2>
        <p>选择模型并创建 API Key 后，可将 Base URL、API Key 和该模型 ID 导入 CC-Switch。如果自动导入失败，也可以复制下方配置手动填写。</p>
        <div className="ccswitch-actions">
          <button type="button" onClick={onCreateKey}>选择模型创建 Key</button>
          <button type="button" onClick={onAutoConfig}>导入 CC-Switch</button>
          <button type="button" onClick={onCopyConfig}>复制配置</button>
        </div>
      </div>
      <div className="ccswitch-download-card">
        <strong>下载 CC-Switch 自动配置</strong>
        <p>下载区域放在这里备用。Windows 用户优先下载 .msi 安装包，不要下载 .sig 文件。</p>
        <div>
          <a href={CC_SWITCH_WINDOWS_URL} target="_blank" rel="noopener noreferrer">Windows .msi</a>
          <a href={CC_SWITCH_RELEASE_URL} target="_blank" rel="noopener noreferrer">macOS</a>
          <a href={CC_SWITCH_RELEASE_URL} target="_blank" rel="noopener noreferrer">Linux</a>
          <a href={CC_SWITCH_RELEASE_URL} target="_blank" rel="noopener noreferrer">全部版本</a>
        </div>
      </div>
      <div className="ccswitch-base-url">
        <span>手动 Base URL</span>
        <code>{apiBaseUrl}</code>
        <CopyButton value={apiBaseUrl} label="复制" />
      </div>
    </section>
  );
}

function buildGuideStepDetail(step, apiBaseUrl, onCreateKey) {
  const curl = `curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer 你的 API Key" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${defaultModel}",
       "messages": [{"role":"user","content":"你好"}]}'`;
  const configs = {
    download: {
      title: "01 下载 CC-Switch 自动配置",
      description: "先选择自动配置或手动配置，准备好本地调用环境。",
      rows: [
        { label: "Mac 下载", value: CC_SWITCH_RELEASE_URL },
        { label: "Windows 下载", value: "CC-Switch-v3.15.0-Windows.msi" },
        { label: "安装步骤", value: "下载 → 安装 → 打开 CC-Switch → 允许浏览器拉起" },
        { label: "下一步", value: "创建 API Key" },
      ],
      table: [
        { step: "1", title: "下载客户端", description: "按电脑系统选择 Mac 或 Windows 版本" },
        { step: "2", title: "安装并打开", description: "首次打开时按系统提示允许运行" },
        { step: "3", title: "回到 FlowAPI", description: "创建 API Key 后点击 CC Switch 自动配置" },
      ],
      customSection: {
        title: "配置方式",
        content: (
          <div className="guide-config-choice-grid">
            <article className="guide-config-choice-card primary">
              <span>选项一</span>
              <h4>自动配置</h4>
              <p>适合新手。下载工具后自动写入 FlowAPI Base URL 和推荐模型配置，减少手动填写错误。</p>
              <a href={CC_SWITCH_WINDOWS_URL} target="_blank" rel="noopener noreferrer">下载自动配置工具</a>
            </article>
            <article className="guide-config-choice-card">
              <span>选项二</span>
              <h4>手动配置</h4>
              <p>适合已经熟悉 Claude Code / Cursor / Cherry Studio 等客户端的用户，可查看 Base URL、API Key 和模型 ID 后自行配置。</p>
              <div className="guide-manual-config-box">
                <div><small>Base URL</small><code>{apiBaseUrl}</code></div>
                <div><small>Model ID 示例</small><code>{defaultModel}</code></div>
              </div>
              <div className="guide-config-choice-actions">
                <button type="button" onClick={() => navigator.clipboard.writeText(apiBaseUrl)}>复制 Base URL</button>
                <button type="button" onClick={() => navigator.clipboard.writeText(defaultModel)}>复制 Model ID</button>
                <Link href="/help#manual-config">查看手动配置教程</Link>
              </div>
            </article>
          </div>
        ),
      },
      actions: <><a href={CC_SWITCH_WINDOWS_URL} target="_blank" rel="noopener noreferrer">下载自动配置工具</a><Link href="/help#manual-config">查看帮助指南</Link></>,
    },
    createKey: {
      title: "02 创建 API Key",
      description: "API Key 是你的调用凭证，复制到客户端或代码里才能使用模型。",
      rows: [
        { label: "API Key 是什么", value: "用于识别你的账户和扣费记录的访问凭证" },
        { label: "如何创建", value: "点击 API 管理区里的“创建 API Key”" },
        { label: "如何保管", value: "不要发到公开群、截图或代码仓库" },
        { label: "泄露风险", value: "别人拿到后可能消耗你的余额" },
      ],
      table: [
        { step: "1", title: "点击创建", description: "建议命名为 Cursor / Claude Code / 项目名" },
        { step: "2", title: "复制 API Key", description: "只复制给你自己的工具或服务器" },
        { step: "3", title: "定期检查", description: "发现异常消耗可以立即禁用或删除" },
      ],
      actions: <button type="button" onClick={onCreateKey}>创建 API Key</button>,
    },
    config: {
      title: "03 配置调用地址",
      description: "Base URL 和模型名决定请求发往哪里、使用哪个模型。",
      rows: [
        { label: "Base URL", value: apiBaseUrl },
        { label: "Chat Completions", value: `${apiBaseUrl}/chat/completions` },
        { label: "Embeddings", value: `${apiBaseUrl}/embeddings` },
        { label: "推荐模型", value: defaultModel },
      ],
      table: [
        { step: "Base URL", title: apiBaseUrl, description: "FlowAPI 统一接入地址，直接复制使用" },
        { step: "Model", title: defaultModel, description: "可在模型广场复制其他模型 ID" },
        { step: "Curl", title: curl, description: "复制后替换你的 API Key 即可测试" },
      ],
      actions: <><button type="button" onClick={() => navigator.clipboard.writeText(apiBaseUrl)}>复制 Base URL</button><Link href="/help#manual-config">手动配置</Link></>,
    },
    start: {
      title: "04 开始使用",
      description: "完成配置后先跑一次最短测试，再去数据面板看 Token 消耗。",
      rows: [
        { label: "最短流程", value: "下载 CC-Switch 自动配置 → 创建 API Key → 自动配置 → 发起测试" },
        { label: "成功标志", value: "返回 200 或模型回复内容" },
        { label: "常见错误", value: "余额不足、API Key 错误、模型名写错、网络超时" },
        { label: "下一步", value: "查看数据面板和模型广场" },
      ],
      table: [
        { step: "测试命令", title: curl, description: "确认 API Key、余额和模型链路可用" },
        { step: "调用失败", title: "查看中文错误提示", description: "按 suggestion 提示检查余额、API Key 和模型名" },
        { step: "查看流水", title: "数据面板", description: "每次调用会记录 Token、成本和状态" },
      ],
      actions: <><Link href="/dashboard">查看用量</Link><Link href="/help#manual-config">查看教程</Link></>,
    },
  };
  const config = configs[step] || configs.download;
  return {
    title: config.title,
    description: config.description,
    badge: "API 接入步骤",
    exportFileName: `API管理_${config.title.replace(/\s+/g, "")}`,
    exportSheets: [
      { sheetName: "操作说明", data: config.rows.map((item) => ({ metric: item.label, value: item.value })) },
      { sheetName: "步骤明细", data: config.table },
    ],
    actions: config.actions,
    sections: [
      { title: "核心说明", content: <DetailRows rows={config.rows} /> },
      ...(config.customSection ? [config.customSection] : []),
      { title: "步骤明细", content: <DetailTable columns={[
        { key: "step", label: "步骤" },
        { key: "title", label: "内容" },
        { key: "description", label: "说明" },
      ]} rows={config.table} /> },
    ],
  };
}

/* ==================== Quick Start Cards ==================== */

function StepCards({ onCreateKey, onAutoConfig, onOpenDetail }) {
  return (
    <section className="guide-three-steps">
      {/* Card 01 */}
      <InteractiveCard className="guide-step-wide" title="下载 CC-Switch 自动配置" hint="点击查看安装说明" onClick={() => onOpenDetail("download")}>
        <div className="guide-step-wide-top">
          <div className="guide-step-wide-num">01</div>
          <h3>下载 CC-Switch 自动配置</h3>
          <p>先下载并安装客户端/配置工具，准备好本地调用环境。</p>
        </div>
        <div className="guide-step-wide-bottom">
          <div className="guide-dl-btns">
            <a className="guide-step-action guide-dl-btn flowapi-action-button" href={CC_SWITCH_WINDOWS_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Windows 自动配置</a>
            <a className="guide-step-action guide-dl-btn flowapi-action-button" href={CC_SWITCH_RELEASE_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>macOS 自动配置</a>
            <a className="guide-step-action guide-dl-btn" href={CC_SWITCH_RELEASE_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>⇣ 全部版本</a>
          </div>
          <p className="guide-dl-hint">无法访问 GitHub？请优先使用上方站内下载按钮。</p>
        </div>
      </InteractiveCard>

      {/* Card 02 */}
      <InteractiveCard className="guide-step-wide" title="创建 API Key" hint="点击查看 API Key说明" onClick={() => onOpenDetail("createKey")}>
        <div className="guide-step-wide-top">
          <div className="guide-step-wide-num">02</div>
          <h3>创建 API Key</h3>
          <p>创建你的专属 API Key，用于在客户端或代码中调用模型。</p>
        </div>
        <div className="guide-step-wide-bottom">
          <button className="guide-step-action" onClick={(event) => { event.stopPropagation(); onCreateKey(); }}>创建 API Key</button>
        </div>
      </InteractiveCard>

      {/* Card 03 */}
      <InteractiveCard className="guide-step-wide" title="配置调用地址" hint="点击查看配置参数" onClick={() => onOpenDetail("config")}>
        <div className="guide-step-wide-top">
          <div className="guide-step-wide-num">03</div>
          <h3>配置调用地址</h3>
          <p>启动 CC-Switch 后，自动填入 Base URL、API Key和推荐模型。</p>
        </div>
        <div className="guide-step-wide-bottom">
          <button className="guide-step-action" onClick={(event) => { event.stopPropagation(); onAutoConfig(); }}>启动 CC-Switch</button>
          <p className="guide-autoconfig-hint">
            <Link href="/help#manual-config" onClick={(event) => event.stopPropagation()}>自动配置失败？查看手动配置教程</Link>
          </p>
        </div>
      </InteractiveCard>

      {/* Card 04 */}
      <InteractiveCard className="guide-step-wide" title="开始使用" hint="点击查看测试说明" onClick={() => onOpenDetail("start")}>
        <div className="guide-step-wide-top">
          <div className="guide-step-wide-num">04</div>
          <h3>开始使用</h3>
          <p>完成配置后发起第一次调用，并在数据面板查看 Token 消耗。</p>
        </div>
        <div className="guide-step-wide-bottom guide-step-links">
          <Link className="guide-step-action" href="/dashboard" onClick={(event) => event.stopPropagation()}>查看用量</Link>
          <Link className="guide-step-action secondary" href="/models" onClick={(event) => event.stopPropagation()}>选择模型</Link>
        </div>
      </InteractiveCard>
    </section>
  );
}

/* ==================== API Secret Management (migrated from api-management.js) ==================== */

function ApiKeyManager({ customer, setCustomer, createSignal = 0 }) {
  const [apiBaseUrl, setApiBaseUrl] = useState(getPublicApiBaseUrl);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [openMoreKeyId, setOpenMoreKeyId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: "", expiresAt: "never", customDate: "", modelId: "" });
  const [detailKey, setDetailKey] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setApiBaseUrl(getPublicApiBaseUrl()));
  }, []);

  const apiKeys = useMemo(() => customer?.apiKeys || [], [customer]);

  useEffect(() => {
    if (apiKeys.length > 0) return;
    // Auto-open create modal for new users without any keys
  }, [apiKeys.length]);

  const filteredKeys = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apiKeys.filter((key) =>
      !q || [key.label, key.token, getStatus(key).label].join(" ").toLowerCase().includes(q)
    );
  }, [apiKeys, query]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredKeys.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageKeys = filteredKeys.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedKeys = apiKeys.filter((key) => selectedIds.includes(key.id));
  const allPageSelected = pageKeys.length > 0 && pageKeys.every((key) => selectedIds.includes(key.id));
  const primaryKey = apiKeys[0] || null;

  function updateCustomer(data) {
    setCustomer(data);
    localStorage.setItem("flowapi_customer", JSON.stringify(data));
    setSelectedIds((ids) => ids.filter((id) => data.apiKeys?.some((key) => key.id === id)));
  }

  function showMessage(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 1800);
  }

  function selectModelProduct(product) {
    if (!product.isAvailable) {
      showMessage("该模型暂未开放，请联系客服开通或选择其他模型。");
      return;
    }
    setForm((value) => ({
      ...value,
      modelId: product.id,
      label: value.label?.startsWith("API Key") ? `${product.displayName} Key` : value.label,
    }));
  }

  async function copyText(label, text) {
    await navigator.clipboard.writeText(text);
    showMessage(`${label} 已复制`);
  }

  function openCcSwitch(key) {
    if (!key?.token || !String(key.token).startsWith("sk-")) {
      showMessage("没有拿到完整 sk- 开头 API Key，已停止导入 CC-Switch。请重新创建 API Key。");
      return;
    }
    const currentApiBaseUrl = getPublicApiBaseUrl();
    setApiBaseUrl(currentApiBaseUrl);
    const model = key.publicModelId || defaultModel;
    const ccUrl = buildCcSwitchConfigUrl({
      apiKey: key.token,
      baseUrl: currentApiBaseUrl,
      model,
      name: key.label || "FlowAPI",
      displayName: key.modelDisplayName || model,
    });
    const anchor = document.createElement("a");
    anchor.href = ccUrl;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  const openCreateModal = useCallback(() => {
    setForm({ label: `API Key ${apiKeys.length + 1}`, expiresAt: "never", customDate: "", modelId: "" });
    setModal({ type: "create" });
  }, [apiKeys.length]);

  useEffect(() => {
    if (createSignal <= 0 || !customer) return;
    const timer = window.setTimeout(() => openCreateModal(), 0);
    return () => window.clearTimeout(timer);
  }, [createSignal, customer, openCreateModal]);

  function openEditModal(key) {
    setForm({
      label: key.label,
      expiresAt: key.expiresAt ? "custom" : "never",
      customDate: key.expiresAt ? new Date(key.expiresAt).toISOString().slice(0, 10) : "",
    });
    setModal({ type: "edit", key });
  }

  async function submitKey() {
    if (!customer) {
      showMessage("请先登录后再创建 API Key");
      return;
    }
    if (modal?.type !== "edit" && !form.modelId) {
      showMessage("请先选择要使用的模型，再创建 API Key");
      return;
    }
    if (form.expiresAt === "custom" && !form.customDate) {
      showMessage("请选择自定义过期日期");
      return;
    }
    setSaving(true);
    const fallbackLabel = modal?.type === "edit" ? "API Key" : `API Key ${apiKeys.length + 1}`;
    const body = {
      customerId: customer.id, label: form.label.trim() || fallbackLabel,
      expiresAt: computeExpiry(form.expiresAt, form.customDate),
      modelId: form.modelId,
    };
    try {
      const res = await fetch("/api/keys", {
        method: modal?.type === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal?.type === "edit" ? { ...body, keyId: modal.key.id } : body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showMessage(data?.error?.message || data?.suggestion || data?.error || "创建失败，请稍后重试");
        return;
      }

      const updatedCustomer = data?.customer || data;
      updateCustomer(updatedCustomer);
      showMessage(modal?.type === "edit" ? "API Key已更新" : "API Key已创建，请立即复制保存");
      setModal(null);
      if (modal?.type !== "edit") {
        const newKey = data.createdKey || (updatedCustomer.apiKeys || []).slice(-1)[0];
        if (newKey) setTimeout(() => openCcSwitch(newKey), 300);
      }
    } catch {
      showMessage("网络异常，请检查连接后重试");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDisabled(key) {
    if (!customer) return;
    const disabled = !key.disabledAt;
    const res = await fetch("/api/keys", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id, keyId: key.id, disabled }),
    });
    if (res.ok) {
      updateCustomer(await res.json());
      showMessage(disabled ? "API Key已禁用" : "API Key已启用");
    }
  }

  async function deleteKeys(keys) {
    if (!customer || keys.length === 0) return;
    if (!window.confirm(`确认删除 ${keys.length} 个 API Key？删除后无法恢复。`)) return;
    setSaving(true);
    let latest = customer;
    for (const key of keys) {
      const res = await fetch("/api/keys", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: latest.id, keyId: key.id }),
      });
      if (res.ok) latest = await res.json();
    }
    updateCustomer(latest);
    showMessage("API Key已删除");
    setSaving(false);
  }

  function getModalActionDisabledReason() {
    if (!modal) return "";
    if (!customer) return "请先登录后创建 API Key";
    if (saving) return "";
    if (modal.type !== "edit" && !form.modelId) return "请选择默认模型后创建 API Key";
    if (form.expiresAt === "custom" && !form.customDate) return "请选择自定义过期日期";
    return "";
  }

  function toggleSelected(keyId) {
    setSelectedIds((ids) => (ids.includes(keyId) ? ids.filter((id) => id !== keyId) : [...ids, keyId]));
  }

  function togglePageSelected() {
    if (allPageSelected) {
      setSelectedIds((ids) => ids.filter((id) => !pageKeys.some((key) => key.id === id)));
      return;
    }
    setSelectedIds((ids) => Array.from(new Set([...ids, ...pageKeys.map((key) => key.id)])));
  }

  async function openKeyDetail(key) {
    setDetailKey(key);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch(`/api/flowapi/keys/${key.id}/usage`);
      const data = await res.json();
      setDetailData(data);
    } catch {
      setDetailData({ success: false, error: "加载失败" });
    }
    setDetailLoading(false);
  }

  if (!customer) {
    return (
      <div className="api-manager-empty">
        <h1>请先登录</h1>
        <p>登录后即可创建和管理你的 API Key。</p>
        <Link href="/login" className="btn-primary">前往登录</Link>
      </div>
    );
  }

  return (
    <div id="api-keys-section" className="guide-api-keys">
      {/* Hero banner */}
      <div className="api-hero-banner">
        <div>
          <h1>API 管理</h1>
          <p>为不同模型创建独立 API Key，方便管理额度、权限和消耗。请先选择你要使用的模型，再创建对应的 API Key。</p>
        </div>
        <div className="api-hero-actions">
          <a href={CC_SWITCH_WINDOWS_URL} target="_blank" rel="noopener noreferrer">下载 CC-Switch 自动配置</a>
          <Link href="/models">前往模型广场</Link>
          <button type="button" onClick={openCreateModal}>选择模型创建</button>
        </div>
      </div>

      <div className="api-flow-steps">
        {[
          ["01", "下载 CC-Switch 自动配置", "先安装配置工具"],
          ["02", "选择模型", "到模型广场选 GPT / Codex / Claude"],
          ["03", "创建该模型 Key", "不同模型独立管理"],
          ["04", "导入并测试", "自动写入 CC-Switch"],
        ].map(([num, title, desc]) => (
          <article key={num}>
            <span>{num}</span>
            <strong>{title}</strong>
            <small>{desc}</small>
          </article>
        ))}
      </div>

      {/* API key card */}
      <div className="api-start-card">
        <div className="api-start-head">
          <h2>API Key</h2>
          <p>管理你的 API Key 和调用权限</p>
        </div>
        <div className={`api-primary-key-row ${primaryKey ? "" : "without-action"}`}>
          <strong>{primaryKey?.label || "尚未创建 API Key"}</strong>
          <code>{displayToken(primaryKey?.token || "")}</code>
          {primaryKey ? (
            <div className="api-key-actions">
              <button type="button" onClick={() => copyText(primaryKey.label, primaryKey.token)}>复制</button>
            </div>
          ) : null}
          <span>{primaryKey?.lastUsedAt ? formatDate(primaryKey.lastUsedAt) : "未使用"}</span>
        </div>
      </div>

      <div className="api-help-hint">
        <div>
          <strong>需要完整操作教程？</strong>
          <p>如果你需要完整操作教程，可以查看帮助指南中的「API 接入教程」或点击「手动配置」查看详细步骤。</p>
        </div>
        <div className="api-help-hint-actions">
          <Link href="/help#chatgpt-guide">查看帮助指南</Link>
          <Link href="/help#manual-config">手动配置</Link>
        </div>
      </div>

      {/* API secret table */}
      <div className="flow-api-keys-card">
        <div className="flow-api-keys-toolbar">
          <div className="flow-token-actions">
            <button type="button" className="primary" onClick={openCreateModal}>选择模型创建 API Key</button>
            <Link href="/models" className="flow-token-link">前往模型广场</Link>
            <button type="button" disabled={selectedKeys.length === 0} onClick={() => copyText("CC Switch 配置", makeCcSwitchConfig(selectedKeys, apiBaseUrl))}>CC Switch 备用配置</button>
            <button type="button" disabled={selectedKeys.length === 0} onClick={() => copyText("所选 API Key", selectedKeys.map((key) => key.token).join("\n"))}>复制所选</button>
            <button type="button" className="danger" disabled={selectedKeys.length === 0 || saving} onClick={() => deleteKeys(selectedKeys)}>删除所选</button>
          </div>
          <div className="flow-token-searches">
            <label><span>⌕</span>
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索关键字" />
            </label>
          </div>
        </div>

        <table className="flow-api-key-table">
          <thead>
            <tr>
              <th className="flow-check"><input type="checkbox" checked={allPageSelected} onChange={togglePageSelected} /></th>
              <th>API Key名称</th>
              <th>绑定模型</th>
              <th>状态</th>
              <th>剩余额度 / 总额度</th>
              <th>API Key</th>
              <th>最后调用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageKeys.map((key) => {
              const status = getStatus(key);
              return (
                <tr key={key.id} className="api-key-row" onClick={() => openKeyDetail(key)}>
                  <td className="flow-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(key.id)} onChange={() => toggleSelected(key.id)} /></td>
                  <td className="flow-name-cell">{key.label}</td>
                  <td className="flow-model-cell">
                    <strong>{key.modelDisplayName || "未绑定模型"}</strong>
                    <code>{key.publicModelId || "请重新创建模型专用 Key"}</code>
                  </td>
                  <td><span className={`flow-status-pill ${status.tone}`}>{status.label}</span></td>
                  <td><span className="flow-soft-pill">无限额度</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span className="flow-token-pill">
                      <code>{displayToken(key.token)}</code>
                      <button type="button" className="copy" onClick={() => copyText(key.label, key.token)}>复制</button>
                    </span>
                  </td>
                  <td className="flow-last-used">{key.lastUsedAt ? formatDate(key.lastUsedAt) : "从未调用"}</td>
                  <td className="flow-row-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="flow-more-menu-wrap">
                      <button
                        type="button"
                        className="flow-btn-more"
                        onClick={() => setOpenMoreKeyId((current) => (current === key.id ? null : key.id))}
                        aria-expanded={openMoreKeyId === key.id}
                      >
                        更多
                      </button>
                      {openMoreKeyId === key.id ? (
                        <div className="flow-more-menu">
                          <button type="button" onClick={() => { setOpenMoreKeyId(null); openCcSwitch(key); }}>CC Switch</button>
                          <button type="button" onClick={() => { setOpenMoreKeyId(null); openEditModal(key); }}>编辑</button>
                          <button type="button" onClick={() => { setOpenMoreKeyId(null); toggleDisabled(key); }}>{key.disabledAt ? "启用" : "禁用"}</button>
                          <button type="button" className="danger" onClick={() => { setOpenMoreKeyId(null); deleteKeys([key]); }}>删除</button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {pageKeys.length === 0 && (
          <div className="flow-empty">暂无 API Key，请先前往模型广场选择模型，或点击“选择模型创建 API Key”。</div>
        )}

        <footer className="flow-table-foot">
          共 {filteredKeys.length} 个 API Key
          {totalPages > 1 && (
            <span>
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
              <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</button>
            </span>
          )}
        </footer>
      </div>

      {message && <div className="api-toast">{message}</div>}

      {/* Create/Edit Modal */}
      {modal && (
        <div className="api-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <div className="api-modal">
            <header>
              <div>
                <span>{modal.type === "edit" ? "编辑 API Key" : "添加 API Key"}</span>
                <h2>{modal.type === "edit" ? modal.key.label : "创建新的 API Key"}</h2>
              </div>
              <button type="button" onClick={() => setModal(null)}>×</button>
            </header>
            <div className="api-modal-body">
              <label>名称
                <input value={form.label} onChange={(event) => setForm((value) => ({ ...value, label: event.target.value }))} placeholder="例如：Cursor / Claude Code / 客户A" autoFocus />
              </label>
              {modal.type !== "edit" ? (
                <div className="api-model-choice-field">
                  <span>选择要创建 API Key 的模型</span>
                  <div className="api-model-choice-grid">
                    {MODEL_PRODUCT_OPTIONS.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className={`${form.modelId === product.id ? "active" : ""} ${product.isAvailable ? "" : "disabled"}`}
                        aria-disabled={!product.isAvailable}
                        onClick={() => selectModelProduct(product)}
                      >
                        <span className="api-model-card-head">
                          <strong title={product.displayName}>{product.displayName}</strong>
                          <em>{product.isAvailable ? (form.modelId === product.id ? "已选择" : "可用") : "即将开放"}</em>
                        </span>
                        <code title={product.publicModelId}>{product.publicModelId}</code>
                        <small title={product.isAvailable ? product.description : "即将开放，联系客服开通。"}>
                          {product.isAvailable ? product.description : "即将开放，联系客服开通。"}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="api-expiry-field">
                <span>过期时间</span>
                <div className="api-expiry-grid">
                  {[["never","永不过期","长期稳定使用"],["30d","30 天","短期测试"],["90d","90 天","季度项目"],["1y","1 年","年度使用"],["custom","自定义日期","指定到期日"]].map(([value, title, desc]) => (
                    <button key={value} type="button" className={`${form.expiresAt === value ? "active" : ""} ${value === "custom" ? "wide" : ""}`} onClick={() => setForm((current) => ({ ...current, expiresAt: value }))}>
                      <strong>{title}</strong><small>{desc}</small>
                    </button>
                  ))}
                </div>
              </div>
              {form.expiresAt === "custom" && (
                <label>自定义日期
                  <input type="date" min={new Date().toISOString().slice(0, 10)} value={form.customDate} onChange={(event) => setForm((value) => ({ ...value, customDate: event.target.value }))} />
                </label>
              )}
            </div>
            <footer>
              {getModalActionDisabledReason() ? <p className="api-action-disabled-hint" role="status">{getModalActionDisabledReason()}</p> : null}
              <button type="button" className="api-action" onClick={() => setModal(null)}>取消</button>
              <button type="button" className="api-action primary flowapi-primary-action" disabled={saving || Boolean(getModalActionDisabledReason())} data-loading={saving ? "true" : "false"} onClick={submitKey}>
                {saving ? <span className="api-action-spinner" aria-hidden="true" /> : null}
                {saving ? "保存中..." : modal.type === "edit" ? "保存修改" : "创建 API Key"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== Main Page ==================== */

export default function GuidePage() {
  const [customer, setCustomer] = useState(null);
  const [toast, setToast] = useState("");
  const [stepDetail, setStepDetail] = useState(null);
  const [createSignal, setCreateSignal] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem("flowapi_customer");
    if (!stored) return;
    try {
      const c = JSON.parse(stored);
      queueMicrotask(() => setCustomer(c));
      fetch(`/api/customer?customerId=${c.id}`)
        .then((r) => r.ok && r.json())
        .then((data) => {
          if (data) { setCustomer(data); localStorage.setItem("flowapi_customer", JSON.stringify(data)); }
        })
        .catch(() => {});
    } catch { /* ignore */ }
  }, []);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 2000);
  }

  function scrollToKeys() {
    document.getElementById("api-keys-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openCreateKey() {
    scrollToKeys();
    if (!customer) {
      showToast("请先登录后再创建 API Key");
      return;
    }
    setCreateSignal((value) => value + 1);
  }

  function handleAutoConfig() {
    const primaryKey = customer?.apiKeys?.[0];
    if (!primaryKey?.token || !String(primaryKey.token).startsWith("sk-")) {
      showToast("请先创建 API Key");
      return;
    }
    try {
      const currentApiBaseUrl = getPublicApiBaseUrl();
      const model = primaryKey.publicModelId || defaultModel;
      const url = buildCcSwitchConfigUrl({
        apiKey: primaryKey.token,
        baseUrl: currentApiBaseUrl,
        model,
        name: "FlowAPI",
        displayName: primaryKey.modelDisplayName || model,
      });
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noreferrer";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      showToast("正在启动 CC-Switch...");
    } catch { /* fallback */ }
    setTimeout(() => {
      showToast("正在尝试启动 CC-Switch。如果没有自动打开，请前往帮助指南查看手动配置教程。");
    }, 1200);
  }

  function openStepDetail(step) {
    setStepDetail(buildGuideStepDetail(step, getPublicApiBaseUrl(), openCreateKey));
  }

  const guideExportSheets = [
    { sheetName: "操作步骤", data: [
      { step: "01", title: "下载 CC-Switch 自动配置", description: "先下载并安装客户端/配置工具，准备好本地调用环境。" },
      { step: "02", title: "创建 API Key", description: "创建你的专属 API Key，用于客户端或代码调用模型。" },
      { step: "03", title: "配置调用地址", description: "Base URL 和模型名按 FlowAPI 说明填写。" },
      { step: "04", title: "开始使用", description: "发起测试调用，并在数据面板查看用量。" },
    ] },
    { sheetName: "接口配置", data: [
      { metric: "Base URL", value: getPublicApiBaseUrl(), description: "统一接入地址" },
      { metric: "示例模型", value: defaultModel, description: "可替换为模型广场中的模型 ID" },
      { metric: "常见错误", value: "余额不足 / API Key 错误 / 模型名错误 / 网络超时", description: "按中文错误提示排查" },
    ] },
  ];
  const apiBaseUrl = getPublicApiBaseUrl();

  return (
    <>
      <Head>
        <title>API 管理 - FlowAPI</title>
        <meta name="description" content="三步即可开始，不懂 API 也能照着配置 CC-Switch 接入 FlowAPI。" />
      </Head>

      <ConsoleLayout
        customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }}
        currentPath="/guide"
      >
        <div className="guide-page">
          {/* ===== Hero ===== */}
          <section className="guide-hero">
            <span className="guide-hero-badge">
              <span className="guide-hero-badge-text">FLOWAPI 中转站</span>
            </span>
            <h1>三步即可开始</h1>
            <p>不懂 API 也能照着配置，几分钟即可使用 FlowAPI 中转站。</p>
            <div className="guide-hero-steps">
              <span>下载工具</span>
              <span>创建 API Key</span>
              <span>自动配置</span>
              <span>查看用量</span>
            </div>
          </section>

          {/* ===== Three Steps ===== */}
          <StepCards onCreateKey={openCreateKey} onAutoConfig={handleAutoConfig} onOpenDetail={openStepDetail} />

          {/* ===== API Key Manager ===== */}
          <ApiKeyManager customer={customer} setCustomer={setCustomer} createSignal={createSignal} />
        </div>
        <Toast text={toast} />
        <CardDetailModal
          open={Boolean(stepDetail)}
          onClose={() => setStepDetail(null)}
          title={stepDetail?.title}
          description={stepDetail?.description}
          badge={stepDetail?.badge}
          sections={stepDetail?.sections}
          actions={stepDetail?.actions}
        />
      </ConsoleLayout>
    </>
  );
}
