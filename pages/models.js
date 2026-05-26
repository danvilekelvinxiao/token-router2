export const dynamic = "force-dynamic";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import ModelCard from "@/components/ModelCard";
import ProviderLogo from "@/components/model-market/ProviderLogo";
import { getPublicApiBaseUrl } from "@/lib/public-api";
import { buildCcSwitchConfigUrl } from "@/lib/cc-switch";

const CATEGORY_TABS = [
  { key: "all", label: "全部模型" },
  { key: "newcomer", label: "新手推荐" },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "codex", label: "Codex" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "coming_soon", label: "即将开放" },
];

const CATEGORY_INTROS = {
  all: {
    title: "FlowAPI 大模型广场",
    desc: "第一版只开放 ChatGPT、Codex、DeepSeek、Claude、Gemini 五个模型系列，用户只需要选择模型，不需要理解后台上游渠道。",
  },
  newcomer: {
    title: "新手推荐",
    desc: "建议先用 DeepSeek Chat / DeepSeek Reasoner 完成第一次调用；Codex Lite 仅在健康检查成功后开放给新手。",
  },
  chatgpt: {
    title: "ChatGPT",
    desc: "适合复杂问答、内容生成、方案规划和高质量推理任务。",
  },
  codex: {
    title: "Codex 编程模型",
    desc: "适合 CC-Switch、Cursor、Claude Code、Cline 等编程工具，用于代码生成、Bug 修复和项目重构。",
  },
  deepseek: {
    title: "DeepSeek",
    desc: "高性价比中文和代码模型，适合新手入门、日常对话、轻量编程和推理任务。",
  },
  claude: {
    title: "Claude",
    desc: "适合长文本理解、代码分析、复杂任务拆解和高质量写作。",
  },
  gemini: {
    title: "Gemini",
    desc: "适合多模态理解、快速响应、内容处理和通用 AI 任务。",
  },
  coming_soon: {
    title: "即将开放",
    desc: "这些模型已经进入 FlowAPI 商品规划，等上游渠道、价格和健康检查全部通过后再开放创建 API Key。",
  },
};

const EXPIRY_OPTS = [
  { value: "never", label: "永不过期" },
  { value: "30d", label: "30 天" },
  { value: "90d", label: "90 天" },
  { value: "1y", label: "1 年" },
];

function newcomerModels(models) {
  return models.filter((m) =>
    m.isAvailable && ["deepseek-chat", "deepseek-reasoner", "flowapi-codex-lite"].includes(m.publicModelId)
  );
}

export default function ModelsPage() {
  const [customer, setCustomer] = useState(null);
  const [models, setModels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const [creating, setCreating] = useState("");
  const [showCreate, setShowCreate] = useState(null);
  const [createdKey, setCreatedKey] = useState(null);
  const [keyReady, setKeyReady] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formExpiry, setFormExpiry] = useState("never");
  const [toast, setToast] = useState("");

  const apiBaseUrl = getPublicApiBaseUrl();
  const isAdmin = customer?.role === "admin";

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const stored = localStorage.getItem("flowapi_customer");
      if (stored) setCustomer(JSON.parse(stored));
    } catch {}
    fetch("/api/models/market")
      .then((r) => r.json())
      .then((data) => {
        setModels(data.models || []);
        setCategories(data.categories || data.providers || []);
      })
      .catch(() => setError("模型广场加载失败"))
      .finally(() => setLoading(false));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const filtered = useMemo(() => {
    let list = models;
    if (category === "newcomer") list = newcomerModels(models);
    else if (category === "coming_soon") list = list.filter((m) => m.status === "coming_soon");
    else if (category !== "all") list = list.filter((m) => m.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.publicModelId.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
  }, [models, category, search]);

  const sidebar = useMemo(() => {
    const fallback = CATEGORY_TABS.map((item) => ({
      id: item.key,
      name: item.label,
      count: item.key === "all" ? models.length : 0,
    }));
    return (categories.length ? categories : fallback).filter((item) => item.id === "all" || item.count > 0 || item.id === "coming_soon");
  }, [categories, models.length]);

  const intro = CATEGORY_INTROS[category] || CATEGORY_INTROS.all;

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 2400); }

  async function doCreateKey() {
    if (!customer || !showCreate) { showToast("请先登录"); return null; }
    setCreating(showCreate.id);
    try {
      if (!showCreate.isAvailable) { showToast("该模型暂未开放"); setCreating(""); return null; }
      const res = await fetch("/api/keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id, modelId: showCreate.publicModelId || showCreate.id,
          label: formLabel || `${showCreate.displayName} Key`,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { showToast(data?.error?.message || "创建失败"); return null; }
      const updated = data.customer || data;
      const nextKey = data.createdKey || updated.apiKeys?.slice(-1)?.[0] || null;
      setCustomer(updated);
      localStorage.setItem("flowapi_customer", JSON.stringify(updated));
      setCreatedKey(nextKey);
      setKeyReady(true);
      return nextKey;
    } catch {
      showToast("网络异常");
      return null;
    } finally {
      setCreating("");
    }
  }

  function openCcSwitch(key) {
    if (!key?.token) { showToast("没有可用的 API Key"); return; }
    const url = buildCcSwitchConfigUrl({
      apiKey: key.token, baseUrl: apiBaseUrl,
      model: showCreate?.publicModelId || "",
      name: "FlowAPI", displayName: showCreate?.displayName || "",
    });
    window.open(url, "_blank", "noreferrer");
    showToast("已启动 CC-Switch");
  }

  function openCreateModal(m) {
    if (!customer) { showToast("请先登录"); return; }
    if (!m.isAvailable) { showToast("该模型暂未开放"); return; }
    setShowCreate(m); setCreatedKey(null); setKeyReady(false);
    setFormLabel(`${m.displayName} Key`); setFormExpiry("never");
  }

  function closeModal() { setShowCreate(null); setKeyReady(false); }

  return (
    <>
      <Head><title>大模型接入广场 - FlowAPI</title></Head>
      <ConsoleLayout
        customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }}
        currentPath="/models"
      >
        <div className="models-page-v2">

          {/* Hero */}
          <div className="models-hero">
            <h1>大模型接入广场</h1>
            <p>选择模型，一键创建 API Key，并自动导入 CC-Switch / Cursor / Claude Code 等工具。</p>
            <div className="models-hero-actions">
              <Link href="/guide" className="btn-secondary btn-small">帮助指南</Link>
              <Link href="/dashboard" className="btn-secondary btn-small">我的 Key</Link>
              {isAdmin && <Link href="/admin/models" className="btn-secondary btn-small">管理</Link>}
            </div>
          </div>

          {/* Newcomer */}
          <div className="models-newcomer-bar">
            <span>新手推荐：先下载 CC-Switch，再选择模型创建专属 API Key，最后一键导入使用。</span>
            <a href="https://github.com/farion1231/cc-switch/releases/tag/v3.15.0"
               target="_blank" rel="noreferrer" className="btn-secondary btn-small">下载 CC-Switch</a>
            <Link href="/guide" className="btn-secondary btn-small">接入教程</Link>
          </div>

          {/* Search + filter */}
          <div className="models-search-row">
            <input type="text" className="models-search-input"
                   placeholder="搜索模型名称，例如 GPT-5.5、Codex、Claude、DeepSeek、Gemini"
                   value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Layout */}
          <div className="models-layout-v2">
            <aside className="models-provider-sidebar">
              <div className="models-provider-sidebar-title">模型系列</div>
              {sidebar.map((p) => (
                <button key={p.id} type="button"
                        className={`models-provider-item${category === p.id ? " active" : ""}`}
                        onClick={() => setCategory(p.id)}>
                  <span className="models-provider-item-logo">
                    <ProviderLogo providerId={getSeriesLogoId(p.id)} size={20} variant="rounded" />
                  </span>
                  <span className="models-provider-item-name">{p.name}</span>
                  <span className="models-provider-item-count">{p.count}</span>
                </button>
              ))}
            </aside>

            <section className="models-main">
              <div className="models-series-intro-card">
                <div>
                  <span className="models-page-kicker">Model Series</span>
                  <h2>{intro.title}</h2>
                  <p>{intro.desc}</p>
                </div>
                <span className="models-series-intro-count">{filtered.length} 个模型</span>
              </div>
              {loading ? (
                <div className="empty-state">
                  <strong>加载中...</strong>
                  <p>正在获取模型数据。</p>
                </div>
              ) : error ? (
                <div className="empty-state">
                  <strong>模型广场加载失败</strong>
                  <p>无法连接后端模型服务，请稍后重试。</p>
                  <button type="button" className="btn-secondary btn-small"
                          onClick={() => window.location.reload()}>重新加载</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <strong>{search ? "没有找到相关模型" : "暂无可用模型"}</strong>
                  <p>{search
                    ? "请尝试搜索 GPT、Codex、Claude、DeepSeek 等关键词。"
                    : "管理员还没有配置可用模型，请先在后台同步上游模型并完成健康检查。"}</p>
                  {!search && isAdmin && (
                    <Link href="/admin/models" className="btn-primary btn-small">前往配置</Link>
                  )}
                </div>
              ) : (
                <div className="models-card-grid">
                  {filtered.map((m) => (
                    <ModelCard key={m.id} model={m} isAdmin={isAdmin}
                               creating={creating === m.id}
                               onAccess={() => openCreateModal(m)} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Create Key Modal */}
        {showCreate && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
            <div className="modal">
              <div className="modal-header">
                <h2>{keyReady ? "API Key 已创建" : `创建 ${showCreate.displayName} API Key`}</h2>
                <button type="button" className="modal-close" onClick={closeModal}>×</button>
              </div>

              <div className="modal-body">
                {keyReady && createdKey ? (
                  <div className="models-key-result">
                    <span className="badge badge-success">创建成功</span>
                    <p className="models-key-result-label">API 地址</p>
                    <code className="model-key-display">{apiBaseUrl}</code>
                    <p className="models-key-result-label">API Key</p>
                    <code className="model-key-display">{createdKey.token}</code>
                    <p className="models-key-result-label">模型名称</p>
                    <code className="model-key-display">{showCreate.publicModelId}</code>
                    <p className="models-key-result-warn">请立即复制，关闭后可能无法再次查看完整密钥。</p>
                  </div>
                ) : (
                  <>
                    <div className="models-create-field">
                      <span className="models-create-field-label">Key 名称</span>
                      <input className="models-search-input" value={formLabel}
                             onChange={(e) => setFormLabel(e.target.value)}
                             placeholder={`${showCreate.displayName} Key`} />
                    </div>
                    <div className="models-create-field">
                      <span className="models-create-field-label">有效期</span>
                      <select className="models-filter-select" value={formExpiry}
                              onChange={(e) => setFormExpiry(e.target.value)}>
                        {EXPIRY_OPTS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="models-create-binding">
                      绑定模型：<strong>{showCreate.displayName}</strong>{" "}
                      ({showCreate.publicModelId})
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                {keyReady && createdKey ? (
                  <>
                    <button type="button" className="btn-primary btn-small"
                            onClick={() => navigator.clipboard.writeText(createdKey.token).then(() => showToast("已复制"))}>
                      复制 Key
                    </button>
                    <button type="button" className="btn-secondary btn-small"
                            onClick={() => openCcSwitch(createdKey)}>
                      导入 CC-Switch
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-secondary btn-small" onClick={closeModal}>取消</button>
                    <button type="button" className="btn-primary btn-small"
                            disabled={!!creating} onClick={doCreateKey}>
                      {creating ? "创建中..." : "创建并复制"}
                    </button>
                    <button type="button" className="btn-secondary btn-small" disabled={!!creating}
                            onClick={async () => {
                              const nextKey = await doCreateKey();
                              if (nextKey) openCcSwitch(nextKey);
                            }}>
                      创建并导入 CC-Switch
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {toast && <div className="models-toast">{toast}</div>}
      </ConsoleLayout>
    </>
  );
}

function getSeriesLogoId(id) {
  if (id === "chatgpt") return "openai";
  if (id === "claude") return "anthropic";
  if (id === "gemini") return "google";
  if (id === "codex") return "codex";
  if (id === "deepseek") return "deepseek";
  return "openai";
}
