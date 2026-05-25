export const dynamic = "force-dynamic";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import { getPublicApiBaseUrl } from "@/lib/public-api";
import { buildCcSwitchConfigUrl } from "@/lib/cc-switch";
import ProviderLogo from "@/components/model-market/ProviderLogo";
import { getModelProduct } from "@/lib/model-products";

const CATEGORY_TABS = [
  { key: "all", label: "全部" },
  { key: "newcomer", label: "新手推荐" },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "codex", label: "Codex 编程" },
  { key: "claude", label: "Claude" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "coming_soon", label: "即将开放" },
];

function newcomerModels(models) {
  return models.filter((m) =>
    m.isAvailable && ["deepseek-chat", "codex-lite", "deepseek-reasoner"].includes(m.id)
  );
}

export default function ModelsPage() {
  const [customer, setCustomer] = useState(null);
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selProvider, setSelProvider] = useState("all");

  const [creating, setCreating] = useState("");
  const [showCreate, setShowCreate] = useState(null);
  const [createdKey, setCreatedKey] = useState(null);
  const [keyReady, setKeyReady] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formExpiry, setFormExpiry] = useState("never");
  const [toast, setToast] = useState("");

  const apiBaseUrl = getPublicApiBaseUrl();

  /* Load data */
  useEffect(() => {
    const stored = localStorage.getItem("flowapi_customer");
    if (stored) try { setCustomer(JSON.parse(stored)); } catch {}

    fetch("/api/models/market")
      .then((r) => r.json())
      .then((data) => { setModels(data.models || []); setProviders(data.providers || []); })
      .catch(() => setError("模型广场加载失败"))
      .finally(() => setLoading(false));
  }, []);

  /* Filter */
  const filtered = useMemo(() => {
    let list = models;
    if (category === "newcomer") list = newcomerModels(models);
    else if (category === "coming_soon") list = models.filter((m) => !m.isAvailable);
    else if (category !== "all") list = models.filter((m) => m.category === category);
    if (selProvider !== "all") list = list.filter((m) => m.providerId === selProvider);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.displayName.toLowerCase().includes(q) || m.publicModelId.toLowerCase().includes(q));
    }
    return list.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
  }, [models, category, selProvider, search]);

  /* Provider list with real counts */
  const sidebar = useMemo(() => {
    const all = [{ id: "all", name: "全部模型", count: models.length }];
    providers.forEach((p) => { if (p.count > 0) all.push(p); });
    return all;
  }, [providers, models]);

  /* Create Key */
  async function doCreateKey() {
    if (!customer) { showToast("请先登录"); return; }
    setCreating(showCreate?.id);
    try {
      const product = getModelProduct(showCreate?.id);
      const res = await fetch("/api/keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, modelId: product?.id || showCreate?.id, label: formLabel || `${showCreate?.displayName} Key` }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { showToast(data?.error?.message || "创建失败"); return; }
      const updated = data.customer || data;
      setCustomer(updated);
      localStorage.setItem("flowapi_customer", JSON.stringify(updated));
      setCreatedKey(data.createdKey || updated.apiKeys?.slice(-1)?.[0] || null);
      setKeyReady(true);
    } catch { showToast("网络异常"); }
    setCreating("");
  }

  function openCcSwitch(key) {
    if (!key?.token) { showToast("没有可用的 API Key"); return; }
    const model = showCreate?.publicModelId || showCreate?.id || "";
    const url = buildCcSwitchConfigUrl({ apiKey: key.token, baseUrl: apiBaseUrl, model, name: "FlowAPI", displayName: showCreate?.displayName || model });
    const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast("已启动 CC-Switch");
  }

  function copyText(label, text) { navigator.clipboard.writeText(text).then(() => showToast(`已复制 ${label}`)); }
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 2000); }

  return (
    <>
      <Head><title>大模型接入广场 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/models">
        <div className="models-page-v2">

          {/* Hero */}
          <div className="models-hero">
            <h1>大模型接入广场</h1>
            <p>选择模型，一键创建 API Key，并自动导入 CC-Switch / Cursor / Claude Code 等工具。</p>
            <div className="models-hero-actions">
              <a href="https://github.com/farion1231/cc-switch/releases/tag/v3.15.0" target="_blank" rel="noreferrer" className="btn-secondary btn-small">下载 CC-Switch</a>
              <Link href="/guide" className="btn-secondary btn-small">查看接入教程</Link>
            </div>
          </div>

          {/* Newcomer hint */}
          <div className="models-newcomer-bar">
            <span>新手推荐：先下载 CC-Switch，再选择模型创建专属 API Key，最后一键导入使用。</span>
          </div>

          {/* Category tabs */}
          <div className="models-category-tabs">
            {CATEGORY_TABS.map((t) => (
              <button key={t.key} type="button" className={category === t.key ? "active" : ""} onClick={() => { setCategory(t.key); setSelProvider("all"); }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="models-search-row">
            <input type="text" className="models-search-input" placeholder="搜索模型名称，例如 GPT、Codex、Claude、DeepSeek" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Layout */}
          <div className="models-layout-v2">
            {/* Sidebar */}
            <aside className="models-provider-sidebar">
              <div className="models-provider-sidebar-title">供应商</div>
              {sidebar.map((p) => (
                <button key={p.id} type="button" className={`models-provider-item ${selProvider === p.id ? "active" : ""}`} onClick={() => setSelProvider(p.id)}>
                  <span className="models-provider-item-logo">
                    <ProviderLogo providerId={p.id} size={20} variant="rounded" />
                  </span>
                  <span className="models-provider-item-name">{p.name}</span>
                  <span className="models-provider-item-count">{p.count}</span>
                </button>
              ))}
            </aside>

            {/* Main */}
            <section className="models-main">
              {loading ? (
                <div className="empty-state"><strong>加载中...</strong><p>正在获取模型数据。</p></div>
              ) : error ? (
                <div className="empty-state">
                  <strong>{error}</strong><p>无法连接后端模型服务，请稍后重试。</p>
                  <button type="button" className="btn-secondary btn-small" onClick={() => window.location.reload()}>重新加载</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <strong>{search ? "没有找到相关模型" : "暂无可用模型"}</strong>
                  <p>{search ? "请尝试搜索 GPT、Codex、Claude、DeepSeek 等关键词。" : "管理员还没有配置可用模型。"}</p>
                </div>
              ) : (
                <div className="models-card-grid">
                  {filtered.map((m) => (
                    <ModelCard
                      key={m.id}
                      model={m}
                      onAccess={() => {
                        if (!customer) { showToast("请先登录"); return; }
                        if (!m.isAvailable) { showToast("该模型暂未开放"); return; }
                        setShowCreate(m);
                        setCreatedKey(null);
                        setKeyReady(false);
                        setFormLabel(`${m.displayName} Key`);
                        setFormExpiry("never");
                      }}
                      creating={creating === m.id}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Create Key Modal */}
        {showCreate && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(null); setKeyReady(false); } }}>
            <div className="modal">
              <div className="modal-header">
                <h2>{keyReady ? "API Key 已创建" : `创建 ${showCreate.displayName} API Key`}</h2>
                <button type="button" className="modal-close" onClick={() => { setShowCreate(null); setKeyReady(false); }}>×</button>
              </div>
              <div className="modal-body">
                {keyReady && createdKey ? (
                  <div style={{ textAlign: "center" }}>
                    <span className="badge badge-success" style={{ marginBottom: 12, display: "inline-block" }}>创建成功</span>
                    <p style={{ fontSize: 13, color: "var(--dash-sub)", marginBottom: 8 }}>API 地址</p>
                    <code style={{ display: "block", padding: 10, borderRadius: 10, background: "var(--dash-card-hover)", border: "1px solid var(--dash-border)", fontSize: 13, marginBottom: 12 }}>{apiBaseUrl}</code>
                    <p style={{ fontSize: 13, color: "var(--dash-sub)", marginBottom: 8 }}>API Key</p>
                    <code className="model-key-display">{createdKey.token}</code>
                    <p style={{ fontSize: 13, color: "var(--dash-sub)", marginBottom: 8, marginTop: 12 }}>模型名称</p>
                    <code style={{ display: "block", padding: 10, borderRadius: 10, background: "var(--dash-card-hover)", border: "1px solid var(--dash-border)", fontSize: 13 }}>{showCreate.publicModelId}</code>
                    <p style={{ fontSize: 11, color: "#ef4444", marginTop: 10 }}>请立即复制，关闭后可能无法再次查看完整密钥。</p>
                  </div>
                ) : (
                  <>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dash-sub)" }}>Key 名称</span>
                      <input className="input" value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder={`${showCreate.displayName} Key`} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dash-sub)" }}>有效期</span>
                      <select className="models-filter-select" value={formExpiry} onChange={(e) => setFormExpiry(e.target.value)} style={{ width: "100%" }}>
                        <option value="never">永不过期</option>
                        <option value="30d">30 天</option>
                        <option value="90d">90 天</option>
                        <option value="1y">1 年</option>
                      </select>
                    </label>
                    <div style={{ padding: 10, borderRadius: 10, background: "var(--dash-card-hover)", border: "1px solid var(--dash-border)", fontSize: 13, color: "var(--dash-sub)", marginBottom: 14 }}>
                      绑定模型：<strong style={{ color: "var(--dash-text)" }}>{showCreate.displayName}</strong>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                {keyReady && createdKey ? (
                  <>
                    <button type="button" className="btn-primary btn-small" onClick={() => copyText("API Key", createdKey.token)}>复制 Key</button>
                    <button type="button" className="btn-secondary btn-small" onClick={() => openCcSwitch(createdKey)}>导入 CC-Switch</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-secondary btn-small" onClick={() => setShowCreate(null)}>取消</button>
                    <button type="button" className="btn-primary btn-small" disabled={!!creating} onClick={doCreateKey}>{creating ? "创建中..." : "创建并复制"}</button>
                    <button type="button" className="btn-secondary btn-small" disabled={!!creating} onClick={async () => { await doCreateKey(); if (createdKey) openCcSwitch(createdKey); }}>创建并导入 CC-Switch</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && <div className="models-toast">{toast}</div>}
      </ConsoleLayout>
    </>
  );
}

/* ==================== ModelCard ==================== */
function ModelCard({ model, onAccess, creating }) {
  const avail = model.isAvailable;
  const comingSoon = model.isComingSoon;
  const badge = avail ? "badge-success" : comingSoon ? "badge-muted" : "badge-danger";

  return (
    <div className={`model-card-v2 ${!avail ? "unavailable" : ""}`}>
      {/* Top */}
      <div className="model-card-v2-top">
        <ProviderLogo providerId={model.providerId} size={30} variant="rounded" />
        <div className="model-card-v2-name-wrap">
          <strong className="model-card-v2-name">{model.displayName}</strong>
          <div className="model-card-v2-type-tags">
            {(model.typeTags || []).slice(0, 3).map((t) => (<span key={t} className="tag">{t}</span>))}
          </div>
        </div>
        <span className={`badge ${badge}`}>{model.statusLabel}</span>
      </div>

      {/* Description */}
      <p className="model-card-v2-desc">{model.description}</p>

      {/* Use case tags */}
      <div className="model-card-v2-tags">
        {(model.useCases || []).slice(0, 4).map((t) => (<span key={t} className="model-card-v2-tag-item">{t}</span>))}
      </div>

      {/* Pricing */}
      {avail ? (
        <div className="model-card-v2-pricing">
          <div className="model-card-v2-price-row"><span>输入</span><b>¥{model.inputPrice} / M tokens</b></div>
          <div className="model-card-v2-price-row"><span>输出</span><b>¥{model.outputPrice} / M tokens</b></div>
        </div>
      ) : (
        <div className="model-card-v2-pricing">
          <span style={{ fontSize: 12, color: "var(--dash-sub)" }}>价格待配置</span>
        </div>
      )}

      {/* Actions */}
      <div className="model-card-v2-actions">
        <button type="button" className="btn-primary btn-small" disabled={!avail || !!creating} onClick={onAccess}>
          {creating ? "创建中..." : avail ? "创建 API Key" : comingSoon ? "即将开放" : "暂不可用"}
        </button>
        <button type="button" className="btn-ghost btn-small" onClick={() => navigator.clipboard.writeText(model.publicModelId).then(() => {})}>
          复制 ID
        </button>
      </div>
    </div>
  );
}
