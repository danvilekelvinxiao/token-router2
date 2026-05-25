export const dynamic = "force-dynamic";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import { getPublicApiBaseUrl } from "@/lib/public-api";
import { buildCcSwitchCodexConfig, buildCcSwitchConfigUrl } from "@/lib/cc-switch";
import ModelLogo from "@/components/ModelLogo";
import ProviderLogo from "@/components/model-market/ProviderLogo";
import { getModelProduct, listModelProducts } from "@/lib/model-products";
import { PROVIDERS, FEATURED_PROVIDER_IDS, detectProviderFromModel } from "@/lib/providers";

/* ==================== Data ==================== */
const providers = ["全部供应商", "UniAPI", "OpenAI", "Anthropic", "Google", "DeepSeek", "Alibaba", "Moonshot", "Meta"];
const billingTypes = ["全部类型", "按量计费"];
const tags = ["全部标签", "免费体验", "高性价比", "Coding 推荐", "长上下文", "高速响应", "中文", "写作", "代码", "推理", "低价", "长文本"];

const codexPlusProduct = getModelProduct("codex-plus");
const codexProProduct = getModelProduct("codex-pro");
const codexLiteProduct = getModelProduct("codex-lite");
const gpt55Product = getModelProduct("flowapi-gpt55");
const gpt54ProProduct = getModelProduct("flowapi-gpt54-pro");
const gpt54Product = getModelProduct("flowapi-gpt54");
const claudeSonnetProduct = getModelProduct("flowapi-claude-sonnet");
const claudeOpusProduct = getModelProduct("flowapi-claude-opus");
const codexPlusModelId = codexPlusProduct?.publicModelId || "flowapi-codex-plus";
const codexPlusAvailable = Boolean(codexPlusProduct?.isAvailable);
const codexPlusActualModel = codexPlusProduct?.actualModelId || "gpt-5.5";

function productModel(product, fallback = {}) {
  return {
    id: product?.publicModelId || fallback.id,
    productId: product?.id || fallback.productId,
    name: product?.displayName || fallback.name,
    provider: product?.provider || fallback.provider || "UniAPI",
    providerId: product?.provider ? detectProviderFromModel("", product.provider) : "uniapi",
    input: product?.isAvailable ? "按高级模型倍率计费" : "即将开放",
    output: product?.isAvailable ? "按高级模型倍率计费" : "即将开放",
    context: "按上游模型",
    typeTags: fallback.typeTags || [],
    tags: fallback.tags || ["Coding 推荐"],
    bestFor: product?.isAvailable
      ? `${product.description}（供应商：${product.provider}，路由：${product.actualModelId}）`
      : `${product?.displayName || fallback.name} 上游未测试通过，暂不允许创建 Key`,
    rank: fallback.rank || 1,
    isAvailable: Boolean(product?.isAvailable),
    isComingSoon: Boolean(product?.isComingSoon),
    billingType: product?.isAvailable ? "按量计费" : "即将开放",
    category: fallback.category || "other",
  };
}

const freeModels = [
  { id: "deepseek-chat", productId: "deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek", providerId: "deepseek", context: "64K", speed: "高速响应", allowance: "注册赠送额度内可用", limit: "适合测试，不建议高并发生产", bestFor: "聊天、API 测试、简单 Coding", tags: ["免费体验", "新手推荐", "高性价比", "中文", "低价"], typeTags: ["文本", "对话"], isAvailable: true, category: "deepseek" },
  { id: "qwen/qwen-2.5-7b-instruct", name: "Qwen 2.5 7B", provider: "Alibaba", providerId: "qwen", context: "32K", speed: "轻量快速", allowance: "限量免费测试", limit: "每日请求次数有限", bestFor: "中文问答、低成本验证、批量小任务", tags: ["免费体验", "高性价比", "中文"], typeTags: ["文本", "对话"], category: "qwen" },
  { id: "google/gemini-2.0-flash-lite", name: "Gemini Flash Lite", provider: "Google", providerId: "google", context: "1M", speed: "长文本友好", allowance: "注册赠送额度内可用", limit: "适合长文测试，不保证高并发", bestFor: "长上下文、资料整理、快速问答", tags: ["免费体验", "长上下文", "高速响应"], typeTags: ["文本", "多模态"], category: "gemini" },
  { id: "meta-llama/llama-3.1-8b-instruct", name: "Llama 3.1 8B", provider: "Meta", providerId: "meta", context: "128K", speed: "稳定测试", allowance: "限量免费测试", limit: "主要用于接入流程验证", bestFor: "英文问答、基础测试、低成本验证", tags: ["免费体验", "低价"], typeTags: ["文本", "对话"], category: "meta" },
];

const allModels = [
  // Codex
  { id: codexPlusModelId, productId: "codex-plus", name: "Codex Plus", provider: "UniAPI", providerId: "uniapi", input: codexPlusAvailable ? "¥6.00 / M" : "即将开放", output: codexPlusAvailable ? "¥24.00 / M" : "即将开放", context: "按上游", typeTags: ["代码", "对话", "工具"], tags: ["代码", "Coding 推荐", "Agent"], bestFor: codexPlusAvailable ? `代码生成、Agent 编程（底层：UniAPI，上游：${codexPlusActualModel}）` : "上游未测试通过，暂不允许创建 Key", rank: 1, isAvailable: codexPlusAvailable, category: "codex", billingType: codexPlusAvailable ? "按量计费" : "即将开放" },
  productModel(codexProProduct, { id: "flowapi-codex-pro", productId: "codex-pro", name: "Codex Pro", typeTags: ["代码", "对话", "工具"], tags: ["代码", "Coding 推荐", "Agent"], rank: 2, category: "codex" }),
  productModel(codexLiteProduct, { id: "flowapi-codex-lite", productId: "codex-lite", name: "Codex Lite", typeTags: ["代码", "文本"], tags: ["代码", "低价", "轻量"], rank: 3, category: "codex" }),
  // ChatGPT
  productModel(gpt55Product, { id: "flowapi-gpt55", productId: "flowapi-gpt55", name: "GPT-5.5", typeTags: ["文本", "对话", "工具"], tags: ["高级推理", "长文本", "Coding 推荐"], rank: 1, category: "chatgpt" }),
  productModel(gpt54ProProduct, { id: "flowapi-gpt54-pro", productId: "flowapi-gpt54-pro", name: "GPT-5.4 Pro", typeTags: ["文本", "对话", "工具"], tags: ["推理", "代码", "高级"], rank: 2, category: "chatgpt" }),
  productModel(gpt54Product, { id: "flowapi-gpt54", productId: "flowapi-gpt54", name: "GPT-5.4", typeTags: ["文本", "对话"], tags: ["通用", "办公", "结构化"], rank: 3, category: "chatgpt" }),
  // Claude
  productModel(claudeSonnetProduct, { id: "flowapi-claude-sonnet", productId: "flowapi-claude-sonnet", name: "Claude Sonnet", typeTags: ["文本", "对话", "工具"], tags: ["长文本", "推理", "写作", "分析"], rank: 1, category: "claude" }),
  productModel(claudeOpusProduct, { id: "flowapi-claude-opus", productId: "flowapi-claude-opus", name: "Claude Opus", typeTags: ["文本", "对话", "工具"], tags: ["最强推理", "深度分析", "专业写作"], rank: 2, category: "claude" }),
  // DeepSeek
  { id: "deepseek-chat", productId: "deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek", providerId: "deepseek", input: "¥1.01 / M", output: "¥2.02 / M", context: "64K", typeTags: ["文本", "对话"], tags: ["中文", "低价", "写作", "高性价比"], bestFor: "中文内容、客服、批量文案", rank: 1, isAvailable: true, category: "deepseek", billingType: "按量计费" },
  { id: "deepseek-reasoner", productId: "deepseek-reasoner", name: "DeepSeek Reasoner", provider: "DeepSeek", providerId: "deepseek", input: "¥3.96 / M", output: "¥15.77 / M", context: "64K", typeTags: ["文本", "推理"], tags: ["推理", "代码", "数学"], bestFor: "复杂推理、数学、编程", rank: 2, isAvailable: true, category: "deepseek", billingType: "按量计费" },
  // Gemini
  { id: "google/gemini-2.0-flash-001", name: "Gemini Flash", provider: "Google", providerId: "google", input: "¥0.72 / M", output: "¥2.88 / M", context: "1M", typeTags: ["文本", "多模态"], tags: ["长文本", "低价", "高速"], bestFor: "长上下文、资料整理、快速问答", rank: 1, category: "gemini", billingType: "按量计费" },
  // GPT-4o Mini
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", providerId: "openai", input: "即将开放", output: "即将开放", context: "128K", typeTags: ["文本", "对话"], tags: ["推理", "代码", "低价"], bestFor: "高性价比 ChatGPT 类体验", rank: 4, isAvailable: false, category: "chatgpt", billingType: "即将开放" },
  // Qwen
  { id: "qwen/qwen3-32b", name: "Qwen3 32B", provider: "Alibaba", providerId: "qwen", input: "¥2.16 / M", output: "¥6.48 / M", context: "128K", typeTags: ["文本", "对话"], tags: ["中文", "写作", "代码"], bestFor: "外贸邮件、中文办公、商务沟通", rank: 2, category: "qwen", billingType: "按量计费" },
  // Moonshot
  { id: "moonshot/kimi-k2", name: "Kimi K2", provider: "Moonshot", providerId: "moonshot", input: "¥3.60 / M", output: "¥14.40 / M", context: "128K", typeTags: ["文本", "长文本"], tags: ["中文", "长文本", "写作"], bestFor: "中文资料整理、长文分析", rank: 3, category: "moonshot", billingType: "按量计费" },
];

const categoryTabs = [
  { key: "all", label: "全部" },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "codex", label: "Codex" },
  { key: "claude", label: "Claude" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "gemini", label: "Gemini" },
];

export default function ModelsPage() {
  const [customer, setCustomer] = useState(null);
  const [provider, setProvider] = useState("全部供应商");
  const [billingType, setBillingType] = useState("全部类型");
  const [tag, setTag] = useState("全部标签");
  const [search, setSearch] = useState("");
  const [accessModel, setAccessModel] = useState(null);
  const [accessMode, setAccessMode] = useState(null);
  const [createdKey, setCreatedKey] = useState(null);
  const [creatingModelId, setCreatingModelId] = useState("");
  const [toast, setToast] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProviderId, setSelectedProviderId] = useState("all");
  const [viewMode, setViewMode] = useState("card");
  const apiBaseUrl = getPublicApiBaseUrl();

  useEffect(() => {
    const stored = localStorage.getItem("flowapi_customer");
    if (stored) {
      try { const parsed = JSON.parse(stored); queueMicrotask(() => setCustomer(parsed)); } catch {}
    }
  }, []);

  function copyText(label, text) {
    navigator.clipboard.writeText(text).then(() => { setToast(`已复制${label}`); setTimeout(() => setToast(""), 2000); });
  }

  function resolveProduct(model) { return getModelProduct(model.productId || model.id); }

  function getModelApiKey(model) {
    const product = resolveProduct(model);
    return customer?.apiKeys?.find((key) => key.publicModelId === (product?.publicModelId || model.id))?.token || "";
  }

  async function createKeyForModel(model) {
    if (!customer) { setAccessModel(model); setAccessMode("login"); return; }
    const product = resolveProduct(model);
    if (!product || !product.isAvailable) { setAccessModel(model); setAccessMode("coming-soon"); return; }
    setCreatingModelId(model.id);
    try {
      const res = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: customer.id, modelId: product.id, label: `${product.displayName} Key` }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setToast(data?.error?.message || data?.suggestion || data?.error || "创建失败"); setTimeout(() => setToast(""), 2400); return; }
      const updatedCustomer = data.customer || data;
      setCustomer(updatedCustomer);
      localStorage.setItem("flowapi_customer", JSON.stringify(updatedCustomer));
      setCreatedKey(data.createdKey || updatedCustomer.apiKeys?.slice(-1)?.[0] || null);
      setAccessModel({ ...model, id: product.publicModelId, name: product.displayName, provider: product.provider, bestFor: product.description });
      setAccessMode("created");
      setToast(`${product.displayName} API Key 已创建`);
      setTimeout(() => setToast(""), 2000);
    } catch { setToast("网络异常"); setTimeout(() => setToast(""), 2400); }
    finally { setCreatingModelId(""); }
  }

  function openCcSwitchForModel(model) {
    const key = createdKey || (customer?.apiKeys || []).find((k) => (k.publicModelId || "") === (model.id || ""));
    if (!key?.token || !String(key.token).startsWith("sk-")) {
      setToast("请先创建 API Key 后再导入 CC-Switch");
      setTimeout(() => setToast(""), 2000);
      return;
    }
    const currentApiBaseUrl = getPublicApiBaseUrl();
    const ccUrl = buildCcSwitchConfigUrl({ apiKey: key.token, baseUrl: currentApiBaseUrl, model: model.id, name: model.name || "FlowAPI", displayName: model.name || model.id });
    const a = document.createElement("a"); a.href = ccUrl; a.target = "_blank"; a.rel = "noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setToast("已启动 CC-Switch");
    setTimeout(() => setToast(""), 2000);
  }

  function openAccess(model) {
    if (!customer) { setAccessModel(model); setAccessMode("login"); return; }
    const product = resolveProduct(model);
    if (!product || !product.isAvailable) { setAccessModel(model); setAccessMode("coming-soon"); return; }
    createKeyForModel(model);
  }

  /* ---------- Filtered models ---------- */
  const filteredModels = useMemo(() => {
    let models = allModels;
    if (selectedCategory !== "all") models = models.filter((m) => m.category === selectedCategory);
    if (selectedProviderId !== "all") models = models.filter((m) => m.providerId === selectedProviderId);
    if (provider !== "全部供应商") models = models.filter((m) => m.provider === provider);
    if (tag !== "全部标签") models = models.filter((m) => (m.tags || []).includes(tag));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      models = models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q));
    }
    return models.sort((a, b) => (a.rank || 99) - (b.rank || 99));
  }, [selectedCategory, selectedProviderId, provider, tag, search]);

  /* ---------- Provider sidebar data ---------- */
  const providerSidebarItems = useMemo(() => {
    const items = [{ id: "all", name: "全部供应商", label: "全部", modelCount: allModels.length }];
    const seen = new Set();
    allModels.forEach((m) => {
      const pid = m.providerId || "unknown";
      if (seen.has(pid)) return;
      seen.add(pid);
      const pinfo = PROVIDERS[pid];
      const count = allModels.filter((x) => x.providerId === pid).length;
      items.push({ id: pid, name: m.provider, label: pinfo?.label || m.provider, modelCount: count });
    });
    return items;
  }, []);

  return (
    <>
      <Head><title>大模型接入广场 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/models">
        <div className="models-page-v2">
          {/* Header */}
          <div className="models-page-hero">
            <div>
              <span className="models-page-kicker">大模型接入广场</span>
              <h1>选择模型，一键接入</h1>
              <p>选择模型 → 创建 API Key → 自动导入 CC-Switch → 开始调用，全程不需要手动填复杂配置。</p>
            </div>
          </div>

          {/* Category tabs */}
          <div className="models-category-tabs">
            {categoryTabs.map((tab) => (
              <button key={tab.key} type="button" className={selectedCategory === tab.key ? "active" : ""} onClick={() => { setSelectedCategory(tab.key); setSelectedProviderId("all"); }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="models-layout-v2">
            {/* Left: Provider sidebar */}
            <aside className="models-provider-sidebar">
              <div className="models-provider-sidebar-title">供应商</div>
              {providerSidebarItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`models-provider-item ${selectedProviderId === item.id ? "active" : ""}`}
                  onClick={() => { setSelectedProviderId(item.id); if (item.id !== "all") setSelectedCategory("all"); }}
                >
                  <span className="models-provider-item-logo">
                    <ProviderLogo providerId={item.id} size={20} variant="rounded" />
                  </span>
                  <span className="models-provider-item-name">{item.label}</span>
                  <span className="models-provider-item-count">{item.modelCount}</span>
                </button>
              ))}
            </aside>

            {/* Right: Model cards */}
            <section className="models-main">
              {/* Toolbar */}
              <div className="models-toolbar">
                <div className="models-search-wrap">
                  <input
                    type="text"
                    className="models-search-input"
                    placeholder="模糊搜索模型名称..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="models-toolbar-actions">
                  <select value={provider} onChange={(e) => setProvider(e.target.value)} className="models-filter-select">
                    {providers.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={tag} onChange={(e) => setTag(e.target.value)} className="models-filter-select">
                    {tags.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Card grid */}
              {filteredModels.length === 0 ? (
                <div className="empty-state" style={{ marginTop: 32 }}>
                  <strong>暂无匹配模型</strong>
                  <p>尝试调整筛选条件，或搜索其他模型名称。</p>
                </div>
              ) : (
                <div className="models-card-grid">
                  {filteredModels.map((model) => {
                    const isAvailable = Boolean(model.isAvailable);
                    return (
                      <div key={model.id} className={`model-card-v2 ${isAvailable ? "" : "unavailable"}`}>
                        {/* Top row: logo + name + type tags */}
                        <div className="model-card-v2-top">
                          <ProviderLogo providerId={model.providerId} size={32} variant="rounded" />
                          <div className="model-card-v2-name-wrap">
                            <strong className="model-card-v2-name">{model.name}</strong>
                            <div className="model-card-v2-type-tags">
                              {(model.typeTags || []).slice(0, 3).map((t) => (
                                <span key={t} className="tag">{t}</span>
                              ))}
                            </div>
                          </div>
                          {/* Status badge */}
                          <span className={`badge ${isAvailable ? "badge-success" : "badge-muted"}`}>
                            {isAvailable ? "可用" : model.isComingSoon ? "即将开放" : "暂不可用"}
                          </span>
                        </div>

                        {/* Pricing */}
                        <div className="model-card-v2-pricing">
                          <div className="model-card-v2-price-row">
                            <span>输入价格</span><b>{model.input}</b>
                          </div>
                          <div className="model-card-v2-price-row">
                            <span>输出价格</span><b>{model.output}</b>
                          </div>
                          <div className="model-card-v2-price-row">
                            <span>计费方式</span><b>{model.billingType || "按量计费"}</b>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="model-card-v2-desc">{model.bestFor}</p>

                        {/* Tags */}
                        <div className="model-card-v2-tags">
                          {(model.tags || []).slice(0, 5).map((t) => (
                            <span key={t} className="model-card-v2-tag-item">{t}</span>
                          ))}
                        </div>

                        {/* Actions */}
                        <div className="model-card-v2-actions">
                          <button
                            type="button"
                            className="btn-primary btn-small"
                            disabled={!isAvailable || creatingModelId === model.id}
                            onClick={() => openAccess(model)}
                          >
                            {creatingModelId === model.id ? "创建中..." : isAvailable ? "创建 API Key" : "暂未开放"}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-small"
                            disabled={!isAvailable}
                            onClick={() => openCcSwitchForModel(model)}
                          >
                            导入 CC-Switch
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-small"
                            onClick={() => copyText("模型 ID", model.id)}
                          >
                            复制
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Toast */}
        {toast ? (
          <div className="models-toast">{toast}</div>
        ) : null}

        {/* Access modal */}
        {accessModel && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setAccessModel(null); setAccessMode(null); setCreatedKey(null); } }}>
            <div className="modal">
              <div className="modal-header">
                <h2>{accessMode === "login" ? "请先登录" : accessMode === "coming-soon" ? "模型暂未开放" : accessMode === "created" ? "API Key 已创建" : accessModel.name}</h2>
                <button type="button" className="modal-close" onClick={() => { setAccessModel(null); setAccessMode(null); setCreatedKey(null); }}>×</button>
              </div>
              <div className="modal-body">
                {accessMode === "login" && (
                  <div style={{ textAlign: "center" }}>
                    <p>请先登录 FlowAPI 后再创建 API Key。</p>
                    <Link href="/login" className="btn-primary" style={{ marginTop: 12 }}>前往登录</Link>
                  </div>
                )}
                {accessMode === "coming-soon" && (
                  <div style={{ textAlign: "center" }}>
                    <span className="badge badge-muted" style={{ marginBottom: 12, display: "inline-block" }}>即将开放</span>
                    <p>该模型上游暂未开放，请选择其他可用模型。</p>
                    <button type="button" className="btn-secondary" onClick={() => { setAccessModel(null); setAccessMode(null); }}>选择其他模型</button>
                  </div>
                )}
                {accessMode === "created" && createdKey && (
                  <div style={{ textAlign: "center" }}>
                    <span className="badge badge-success" style={{ marginBottom: 12, display: "inline-block" }}>创建成功</span>
                    <p style={{ fontSize: 13, color: "var(--page-sub)", marginBottom: 16 }}>请立即复制并保存你的 API Key：</p>
                    <code className="model-card-v2-key-display">{createdKey.token}</code>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
                      <button type="button" className="btn-primary btn-small" onClick={() => copyText("API Key", createdKey.token)}>复制 Key</button>
                      <button type="button" className="btn-secondary btn-small" onClick={() => openCcSwitchForModel({ ...accessModel, id: accessModel.id })}>导入 CC-Switch</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => { setAccessModel(null); setAccessMode(null); setCreatedKey(null); }}>关闭</button>
              </div>
            </div>
          </div>
        )}
      </ConsoleLayout>
    </>
  );
}
