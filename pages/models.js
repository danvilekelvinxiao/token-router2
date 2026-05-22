export const dynamic = "force-dynamic";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import { getPublicApiBaseUrl } from "@/lib/public-api";
import { buildCcSwitchCodexConfig, buildCcSwitchConfigUrl } from "@/lib/cc-switch";
import ModelLogo from "@/components/ModelLogo";

const providers = ["全部供应商", "OpenAI", "Anthropic", "Google", "DeepSeek", "Alibaba", "Moonshot", "Meta"];
const billingTypes = ["全部类型", "按量计费"];
const tags = ["全部标签", "免费体验", "高性价比", "Coding 推荐", "长上下文", "图片/多模态", "高速响应", "中文", "写作", "代码", "推理", "低价", "长文本"];

const freeModels = [
  { id: "deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek", context: "64K", speed: "高速响应", allowance: "注册赠送额度内可用", limit: "适合测试，不建议高并发生产", bestFor: "聊天、API 测试、简单 Coding", tags: ["免费体验", "新手推荐", "高性价比", "中文", "低价"] },
  { id: "qwen/qwen-2.5-7b-instruct", name: "Qwen 2.5 7B", provider: "Alibaba", context: "32K", speed: "轻量快速", allowance: "限量免费测试", limit: "每日请求次数有限", bestFor: "中文问答、低成本验证、批量小任务", tags: ["免费体验", "高性价比", "中文"] },
  { id: "google/gemini-2.0-flash-lite", name: "Gemini Flash Lite", provider: "Google", context: "1M", speed: "长文本友好", allowance: "注册赠送额度内可用", limit: "适合长文测试，不保证高并发", bestFor: "长上下文、资料整理、快速问答", tags: ["免费体验", "长上下文", "高速响应"] },
  { id: "meta-llama/llama-3.1-8b-instruct", name: "Llama 3.1 8B", provider: "Meta", context: "128K", speed: "稳定测试", allowance: "限量免费测试", limit: "主要用于接入流程验证", bestFor: "英文问答、基础测试、低成本验证", tags: ["免费体验", "低价"] },
];

const modelSections = [
  {
    id: "codex",
    title: "Codex / Coding 模型",
    description: "适合 Claude Code、Codex、Cursor、自动化脚本和代码任务，优先推荐稳定、推理和代码能力更强的模型。",
    badge: "编程优先",
    models: [
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner", provider: "DeepSeek", input: "¥3.9600 / 1M Tokens", output: "¥15.7680 / 1M Tokens", context: "64K", tags: ["推理", "代码", "Coding 推荐", "中文"], bestFor: "复杂推理、数学、编程和代码任务", rank: 1 },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", input: "¥1.0800 / 1M Tokens", output: "¥4.3200 / 1M Tokens", context: "128K", tags: ["推理", "代码", "低价", "Coding 推荐"], bestFor: "分析总结、结构化任务、代码辅助", rank: 2 },
      { id: "anthropic/claude-3.5-haiku", name: "Claude Haiku", provider: "Anthropic", input: "¥5.7600 / 1M Tokens", output: "¥28.8000 / 1M Tokens", context: "200K", tags: ["长文本", "写作", "推理", "Coding 推荐"], bestFor: "英文代码解释、长文阅读、轻量推理", rank: 3 },
    ],
  },
  {
    id: "chatgpt",
    title: "ChatGPT 模型",
    description: "适合习惯 ChatGPT 体验的用户，用于通用问答、总结、结构化输出和办公场景。",
    badge: "OpenAI 系列",
    models: [
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", input: "¥1.0800 / 1M Tokens", output: "¥4.3200 / 1M Tokens", context: "128K", tags: ["推理", "代码", "低价", "Coding 推荐"], bestFor: "高性价比 ChatGPT 类体验、总结和结构化任务", rank: 1 },
      { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", input: "¥18.0000 / 1M Tokens", output: "¥72.0000 / 1M Tokens", context: "128K", tags: ["推理", "写作", "图片/多模态"], bestFor: "更强通用问答、多模态和复杂内容生成", rank: 2 },
    ],
  },
  {
    id: "ranked",
    title: "其他热门模型排行",
    description: "按综合使用场景、中文体验、长文本能力和成本表现排序，方便快速选择替代模型。",
    badge: "按推荐排名",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek", input: "¥1.0080 / 1M Tokens", output: "¥2.0160 / 1M Tokens", context: "64K", tags: ["中文", "低价", "写作", "高性价比", "免费体验"], bestFor: "中文内容、客服、批量文案", rank: 1 },
      { id: "qwen/qwen3-32b", name: "Qwen3 32B", provider: "Alibaba", input: "¥2.1600 / 1M Tokens", output: "¥6.4800 / 1M Tokens", context: "128K", tags: ["中文", "写作", "代码", "高性价比"], bestFor: "外贸邮件、中文办公、商务沟通", rank: 2 },
      { id: "google/gemini-2.0-flash-001", name: "Gemini Flash", provider: "Google", input: "¥0.7200 / 1M Tokens", output: "¥2.8800 / 1M Tokens", context: "1M", tags: ["长文本", "低价", "推理", "长上下文", "高速响应"], bestFor: "长上下文、资料整理、快速问答", rank: 3 },
      { id: "moonshot/kimi-k2", name: "Kimi K2", provider: "Moonshot", input: "¥3.6000 / 1M Tokens", output: "¥14.4000 / 1M Tokens", context: "128K", tags: ["中文", "长文本", "写作", "长上下文"], bestFor: "中文资料整理、长文分析、办公场景", rank: 4 },
    ],
  },
];

export default function ModelsPage() {
  const [customer, setCustomer] = useState(null);
  const [provider, setProvider] = useState("全部供应商");
  const [billingType, setBillingType] = useState("全部类型");
  const [tag, setTag] = useState("全部标签");
  const [search, setSearch] = useState("");
  const [accessModel, setAccessModel] = useState(null);
  const [accessMode, setAccessMode] = useState(null);
  const [toast, setToast] = useState("");
  const apiBaseUrl = getPublicApiBaseUrl();

  useEffect(() => {
    const stored = localStorage.getItem("flowapi_customer");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        queueMicrotask(() => setCustomer(parsed));
      } catch {}
    }
  }, []);

  function copyText(label, text) {
    navigator.clipboard.writeText(text).then(() => {
      setToast(`已复制${label}`);
      setTimeout(() => setToast(""), 2000);
    });
  }

  function openAccess(model) {
    if (!customer) {
      setAccessModel(model);
      setAccessMode("login");
      return;
    }
    if (!customer.apiKeys?.length) {
      setAccessModel(model);
      setAccessMode("create-key");
      return;
    }
    setAccessModel(model);
    setAccessMode("ready");
  }

  function getPrimaryApiKey() {
    return customer?.apiKeys?.find((key) => key?.token)?.token || "";
  }

  function openCcSwitchConfig(model) {
    if (!customer) {
      setAccessModel(model);
      setAccessMode("login");
      return;
    }

    const apiKey = getPrimaryApiKey();
    if (!apiKey) {
      setAccessModel(model);
      setAccessMode("create-key");
      return;
    }

    const url = buildCcSwitchConfigUrl({
      apiKey,
      baseUrl: apiBaseUrl,
      model: model.id,
      name: "FlowAPI",
    });
    window.open(url, "_blank", "noopener,noreferrer");
    setToast(`正在配置 ${model.name} 到 CC-Switch`);
    setTimeout(() => setToast(""), 2000);
  }

  function copyCcSwitchConfig(model) {
    if (!customer) {
      setAccessModel(model);
      setAccessMode("login");
      return;
    }

    const apiKey = getPrimaryApiKey();
    if (!apiKey) {
      setAccessModel(model);
      setAccessMode("create-key");
      return;
    }

    const config = buildCcSwitchCodexConfig({
      apiKey,
      baseUrl: apiBaseUrl,
      model: model.id,
    });
    const text = [
      "auth.json 文件内容：",
      JSON.stringify(config.auth, null, 2),
      "",
      "config.toml 文件内容：",
      config.config,
    ].join("\n");
    copyText("CC-Switch 配置", text);
  }

  function matchesFilter(m) {
    if (provider !== "全部供应商" && m.provider !== provider) return false;
    if (tag !== "全部标签" && !(m.tags || []).includes(tag)) return false;
    const query = search.trim().toLowerCase();
    if (query && !m.name.toLowerCase().includes(query) && !m.id.toLowerCase().includes(query)) return false;
    return true;
  }
  const filteredFreeModels = freeModels.filter(matchesFilter);
  const filteredSections = modelSections
    .map((section) => ({
      ...section,
      models: section.models.filter(matchesFilter).sort((a, b) => (a.rank || 99) - (b.rank || 99)),
    }))
    .filter((section) => section.models.length > 0);
  const filteredModelCount = filteredSections.reduce((sum, section) => sum + section.models.length, 0);

  const safeCustomer = customer || { name: "用户", email: "", balance: 0 };
  return (
    <><Head><title>模型广场 - FlowAPI</title></Head>
    <ConsoleLayout customer={safeCustomer} currentPath="/models">
    <div className="model-access-layout" style={{ display: "flex", gap: 24, paddingTop: 12 }}>
      <aside className="model-filter-panel" style={{ width: 220, flexShrink: 0 }}>
        <PillGroup title="供应商" values={providers} active={provider} setActive={setProvider} tone="purple" />
        <PillGroup title="类型" values={billingTypes} active={billingType} setActive={setBillingType} tone="blue" />
        <PillGroup title="标签" values={tags} active={tag} setActive={setTag} tone="green" />
      </aside>
      <div className="model-access-main" style={{ flex: 1, minWidth: 0 }}>
        <section className="model-hero-panel">
          <div>
            <span className="model-hero-kicker">多模型统一接入入口</span>
            <h1>大模型接入广场</h1>
            <p className="model-hero-copy">
              <span>选择模型、复制 Model ID 和调用示例，用同一个 FlowAPI Base URL</span>
              <br />
              <span>接入 DeepSeek、GPT、Claude、Gemini 等模型。</span>
            </p>
          </div>
          <Link href="/guide" className="model-guide-link">去 API 管理</Link>
        </section>

        <section className="free-model-section">
          <div className="section-heading-row">
            <div>
              <h2>免费模型接入端口</h2>
              <p>无需先充值也能完成首次 API 测试，适合新用户验证接入流程。</p>
            </div>
            <span>免费试用 · 新手推荐 · 低成本验证</span>
          </div>
          <div className="free-model-grid">
            {filteredFreeModels.map((model) => (
              <FreeModelCard key={model.id} model={model} onAccess={openAccess} onConfigure={openCcSwitchConfig} />
            ))}
          </div>
        </section>

        <div className="model-toolbar" style={{ display: "flex", gap: 10, margin: "24px 0 16px" }}>
          <input type="text" placeholder="搜索模型或 Model ID..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 14, outline: "none", fontFamily: "inherit" }} />
        </div>

        {filteredSections.length > 0 ? (
          <div className="model-section-stack">
            {filteredSections.map((section) => (
              <ModelSection
                key={section.id}
                section={section}
                totalCount={filteredModelCount}
                onAccess={openAccess}
                onConfigure={openCcSwitchConfig}
              />
            ))}
          </div>
        ) : (
          <section>
            <div className="empty-state-card">没有找到匹配模型，试试清空筛选或搜索 DeepSeek / GPT / Claude。</div>
          </section>
        )}
      </div>
    </div>
    </ConsoleLayout>
    <AccessModal
      model={accessModel}
      mode={accessMode}
      apiBaseUrl={apiBaseUrl}
      apiKey={getPrimaryApiKey()}
      onClose={() => setAccessModel(null)}
      onCopy={copyText}
      onConfigure={openCcSwitchConfig}
      onCopyConfig={copyCcSwitchConfig}
    />
    {toast ? <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "#111", color: "#fff", padding: "10px 24px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>{toast}</div> : null}
    </>
  );
}

function ModelSection({ section, totalCount, onAccess, onConfigure }) {
  return (
    <section className={`model-ranked-section model-ranked-section-${section.id}`}>
      <div className="section-heading-row">
        <div>
          <h2>{section.title}</h2>
          <p>{section.description}</p>
        </div>
        <strong>{section.badge} · {section.models.length}/{totalCount}</strong>
      </div>
      <div className="model-card-grid">
        {section.models.map((model) => (
          <ModelCard
            key={`${section.id}-${model.id}`}
            model={model}
            rank={model.rank}
            onAccess={onAccess}
            onConfigure={onConfigure}
          />
        ))}
      </div>
    </section>
  );
}

function maskKey(token = "") {
  if (!token) return "YOUR_API_KEY";
  if (token.length <= 12) return token;
  return `${token.slice(0, 7)}******${token.slice(-5)}`;
}

function PillGroup({ title, values, active, setActive, tone = "blue" }) {
  return (
    <div className="model-filter-block">
      <h3>{title}</h3>
      <div className="model-filter-pills">
        {values.map((value) => (
          <button key={value} type="button" className={`model-filter-pill ${active === value ? `active ${tone}` : ""}`} onClick={() => setActive(value)}>{value}</button>
        ))}
      </div>
    </div>
  );
}

function ModelCard({ model, rank, onAccess, onConfigure }) {
  const [copied, setCopied] = useState(false);
  async function copyModel() {
    await navigator.clipboard.writeText(model.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <article className="model-card interactive-card" role="button" tabIndex={0} onClick={() => onAccess(model)} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onAccess(model);
      }
    }}>
      <button type="button" className="interactive-card-icon" onClick={(event) => { event.stopPropagation(); onAccess(model); }}>↗</button>
      {rank ? <span className="model-rank-badge">TOP {rank}</span> : null}
      <div className="model-card-top">
        <div className="model-mark" aria-hidden="true">
          <ModelLogo model={model.id} provider={model.provider} size={28} />
        </div>
        <div>
          <h3>{model.name}</h3>
          <p>{model.provider} · {model.bestFor}</p>
        </div>
        <button type="button" className="model-copy-icon" onClick={(event) => { event.stopPropagation(); copyModel(); }} aria-label={`复制 ${model.name} 模型 ID`}>
          {copied ? "✓" : "▣"}
        </button>
      </div>
      <div className="model-price-lines">
        <div>模型 ID <code>{model.id}</code></div>
        <div>输入价格 {model.input}</div>
        <div>输出价格 {model.output}</div>
        <div>上下文 {model.context}</div>
      </div>
      <div className="model-card-bottom">
        <span className="model-billing">按量计费</span>
        <div>
          {model.tags.slice(0, 4).map((tag) => (<span key={tag} className="model-tag">{tag}</span>))}
        </div>
      </div>
      <div className="model-card-actions">
        <button type="button" className="model-access-btn" onClick={(event) => { event.stopPropagation(); onAccess(model); }}>接入此模型</button>
        <button type="button" className="model-ccswitch-btn" onClick={(event) => { event.stopPropagation(); onConfigure(model); }}>配置到 CC-Switch</button>
      </div>
    </article>
  );
}

function FreeModelCard({ model, onAccess, onConfigure }) {
  return (
    <article className="free-model-card interactive-card" role="button" tabIndex={0} onClick={() => onAccess(model)} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onAccess(model);
      }
    }}>
      <button type="button" className="interactive-card-icon" onClick={(event) => { event.stopPropagation(); onAccess(model); }}>↗</button>
      <div className="free-model-card-top">
        <div className="model-mark" aria-hidden="true">
          <ModelLogo model={model.id} provider={model.provider} size={28} />
        </div>
        <div className="free-model-badges">
          <span>免费试用</span>
          <span>新手推荐</span>
        </div>
      </div>
      <h3>{model.name}</h3>
      <p>{model.bestFor}</p>
      <div className="free-model-meta">
        <div><span>提供商</span><strong>{model.provider}</strong></div>
        <div><span>额度</span><strong>{model.allowance}</strong></div>
        <div><span>速度</span><strong>{model.speed}</strong></div>
        <div><span>上下文</span><strong>{model.context}</strong></div>
      </div>
      <small>{model.limit}。升级套餐可获得更高额度和更稳定并发。</small>
      <div className="free-model-card-actions">
        <button type="button" onClick={(event) => { event.stopPropagation(); onAccess(model); }}>接入此模型</button>
        <button type="button" className="model-ccswitch-btn" onClick={(event) => { event.stopPropagation(); onConfigure(model); }}>配置到 CC-Switch</button>
      </div>
    </article>
  );
}

function AccessModal({ model, mode, apiBaseUrl, apiKey, onClose, onCopy, onConfigure, onCopyConfig }) {
  if (!model) return null;
  const curl = `curl ${apiBaseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_API_KEY"}" \\
  -d '{
    "model": "${model.id}",
    "messages": [
      {
        "role": "user",
        "content": "你好，请介绍你自己"
      }
    ]
  }'`;
  return (
    <div className="model-access-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="model-access-modal">
        <header>
          <div>
            <span>模型接入</span>
            <h2>{model.name}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        {mode === "login" ? (
          <div className="model-access-state">
            <strong>先登录或注册，再领取新手体验额度</strong>
            <p>登录后可以创建 API 密匙，并用免费体验模型完成第一次调用测试。</p>
            <Link href="/register">去注册 / 登录</Link>
          </div>
        ) : mode === "create-key" ? (
          <div className="model-access-state">
            <strong>还没有 API 密匙</strong>
            <p>先去 API 管理页创建一个 API 密匙，再回来复制模型 ID 和调用示例。</p>
            <Link href="/guide">去 API 管理</Link>
          </div>
        ) : (
          <div className="model-access-info">
            <div><span>模型名称</span><code>{model.name}</code></div>
            <div><span>Base URL</span><code>{apiBaseUrl}</code></div>
            <div><span>API 密匙</span><code>{maskKey(apiKey)}</code></div>
            <div><span>Model ID</span><code>{model.id}</code></div>
            <div><span>适用场景</span><code>{model.bestFor}</code></div>
            <pre>{curl}</pre>
            <div className="model-access-modal-actions">
              <button type="button" onClick={() => onCopy("模型 ID", model.id)}>复制模型 ID</button>
              <button type="button" onClick={() => onCopy("调用示例", curl)}>复制调用示例</button>
              <button type="button" onClick={() => onConfigure(model)}>配置到 CC-Switch</button>
              <button type="button" onClick={() => onCopyConfig(model)}>复制 CC-Switch 配置</button>
              <Link href="/help#manual-config">查看帮助指南</Link>
              <Link href="/guide">去 API 管理</Link>
            </div>
          </div>
        )}
        <footer className="model-access-export">
              <Link href="/help#manual-config" className="model-guide-link">接入教程</Link>
          </footer>
            </div>
          </div>
        );
      }
