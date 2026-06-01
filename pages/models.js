export const dynamic = "force-dynamic";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import FlowApiBrandText from "@/components/brand/flowapi-brand-text";
import ConsoleLayout from "@/components/ConsoleLayout";
import ModelLogo from "@/components/ModelLogo";
import { formatTokens } from "@/lib/model-format";
import { getPublicApiBaseUrl } from "@/lib/public-api";
import { sanitizePublicModelProvider } from "@/lib/public-model-provider";

const DEFAULT_CATEGORIES = [
  { id: "all", name: "全部" },
  { id: "recommended", name: "推荐" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "gpt", name: "GPT" },
  { id: "claude", name: "Claude" },
  { id: "gemini", name: "Gemini" },
  { id: "qwen", name: "Qwen" },
  { id: "low-cost", name: "低成本" },
  { id: "code-programming", name: "代码编程" },
  { id: "chinese-writing", name: "中文写作" },
  { id: "long-text", name: "长文本" },
  { id: "multimodal", name: "多模态" },
];

function isAdminCustomer(customer) {
  const email = String(customer?.email || "").toLowerCase();
  return Boolean(customer?.role === "admin" || customer?.isAdmin || customer?.id === "cus_admin" || email === "xiaoyijie@flowapi.fun");
}

function normalizeModel(model) {
  const publicModel = sanitizePublicModelProvider(model);
  return {
    ...model,
    id: model.id || model.modelId || model.displayName,
    displayName: model.displayName || model.name || "Unknown Model",
    provider: publicModel.provider || "FlowAPI",
    providerName: publicModel.provider || "FlowAPI",
    modelId: model.modelId || model.publicModelId || "",
    categories: Array.isArray(model.categories) ? model.categories : ["all"],
    tags: Array.isArray(model.tags) ? model.tags : [],
    useCases: Array.isArray(model.useCases) ? model.useCases : [],
    notRecommendedFor: Array.isArray(model.notRecommendedFor) ? model.notRecommendedFor : [],
    recommendedUserTypes: Array.isArray(model.recommendedUserTypes) ? model.recommendedUserTypes : [],
    baseUrl: model.baseUrl || getPublicApiBaseUrl(),
    primaryButtonText: model.primaryButtonText || "立即接入",
    primaryButtonHref: model.primaryButtonHref || "/api-management",
    secondaryButtonText: model.secondaryButtonText || "复制 Model ID",
    secondaryButtonHref: model.secondaryButtonHref || "",
    sortOrder: Number(model.sortOrder || 99),
    enabled: model.enabled !== false,
    isMemberOnly: Boolean(model.isMemberOnly),
    memberLevelRequired: model.memberLevelRequired || null,
    isFreeModel: Boolean(model.isFreeModel),
    isFreeForMember: Boolean(model.isFreeForMember),
    memberDailyFreeLimitTokens: Number(model.memberDailyFreeLimitTokens || 0),
    visibleToNonMember: model.visibleToNonMember !== false,
    nonMemberPrompt: model.nonMemberPrompt || "该模型为 FLOWAPI 黑金会员专属模型，开通会员后即可使用。",
  };
}

function hasRealPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function priceLabel(value) {
  if (!hasRealPrice(value)) return "价格同步中";
  return `¥${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2)} / M Token`;
}

function discountLabel(model) {
  const officialInput = Number(model.officialInputPricePerM || 0);
  const officialOutput = Number(model.officialOutputPricePerM || 0);
  const flowInput = Number(model.flowapiInputPricePerM || model.inputPricePerM || 0);
  const flowOutput = Number(model.flowapiOutputPricePerM || model.outputPricePerM || 0);
  const officialTotal = officialInput + officialOutput;
  const flowTotal = flowInput + flowOutput;
  if (!officialTotal || !flowTotal) return "官方价格同步中";
  const ratio = flowTotal / officialTotal;
  const discount = Math.max(0, Math.min(99, Math.round((1 - ratio) * 100)));
  if (discount <= 0) return "与官方价格持平";
  return `相比官方约省 ${discount}%`;
}

function numberLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "暂无数据";
  return number.toLocaleString("zh-CN");
}

function cnyLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "暂无数据";
  return `¥${number.toFixed(2)}`;
}

function percentLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "占比同步中";
  return `${number.toFixed(1)}%`;
}

function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_:-]+/g, "")
    .trim();
}

function findCmsModelForUsage(rankItem, cmsModels) {
  const candidates = [
    rankItem?.model,
    rankItem?.modelId,
    rankItem?.publicModelId,
    rankItem?.routedModel,
    rankItem?.requestedModel,
  ].map(normalizeMatchText).filter(Boolean);

  if (!candidates.length) return null;

  return cmsModels.find((model) => {
    const values = [
      model.displayName,
      model.modelId,
      model.publicModelId,
      model.id,
    ].map(normalizeMatchText).filter(Boolean);

    return values.some((value) => candidates.some((candidate) => value === candidate || value.includes(candidate) || candidate.includes(value)));
  }) || null;
}

function trendLabel(item) {
  if (item?.isNew) return { text: "new", className: "new" };
  const number = Number(item?.changePercent);
  if (!Number.isFinite(number)) return null;
  if (number > 0) return { text: `↑${Math.abs(number)}%`, className: "up" };
  if (number < 0) return { text: `↓${Math.abs(number)}%`, className: "down" };
  return { text: "0%", className: "flat" };
}

function generateCurl(model, apiBaseUrl) {
  if (model?.curlExample) return model.curlExample;
  return `curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer 你的 API Key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model?.modelId || "deepseek-chat"}","messages":[{"role":"user","content":"你好"}]}'`;
}

function generatePython(model, apiBaseUrl) {
  return `import requests

response = requests.post(
    "${apiBaseUrl}/chat/completions",
    headers={
        "Authorization": "Bearer 你的 API Key",
        "Content-Type": "application/json",
    },
    json={
        "model": "${model?.modelId || "deepseek-chat"}",
        "messages": [{"role": "user", "content": "你好"}],
    },
)

print(response.json())`;
}

function generateJavaScript(model, apiBaseUrl) {
  return `const response = await fetch("${apiBaseUrl}/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer 你的 API Key",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "${model?.modelId || "deepseek-chat"}",
    messages: [{ role: "user", content: "你好" }]
  })
});

console.log(await response.json());`;
}

function modelHref(href, model) {
  const target = href || "/api-management";
  if (!model?.modelId) return target;
  if (target.includes("?")) return `${target}&model=${encodeURIComponent(model.modelId)}`;
  return `${target}?model=${encodeURIComponent(model.modelId)}`;
}

export default function ModelsPage() {
  const [customer, setCustomer] = useState(null);
  const [models, setModels] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [pageSettings, setPageSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("recommended");
  const [selectedModel, setSelectedModel] = useState(null);
  const [toast, setToast] = useState("");
  const [popularModels, setPopularModels] = useState([]);
  const [popularSource, setPopularSource] = useState("loading");
  const [popularUpdatedAt, setPopularUpdatedAt] = useState(null);
  const [popularLoading, setPopularLoading] = useState(true);
  const [membership, setMembership] = useState(null);

  const apiBaseUrl = getPublicApiBaseUrl();
  const isAdmin = isAdminCustomer(customer);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const stored = localStorage.getItem("flowapi_customer");
      if (stored) setCustomer(JSON.parse(stored));
    } catch {}

    let cancelled = false;
    async function loadContent() {
      setLoading(true);
      setError("");
      try {
        const [modelsRes, categoriesRes, settingsRes] = await Promise.all([
          fetch("/api/content/models"),
          fetch("/api/content/model-categories"),
          fetch("/api/content/page-settings").catch(() => null),
        ]);
        const modelsJson = await modelsRes.json();
        const categoriesJson = await categoriesRes.json();
        const settingsJson = settingsRes ? await settingsRes.json().catch(() => null) : null;
        if (cancelled) return;

        if (!modelsRes.ok || !modelsJson?.success) {
          throw new Error("models_sync_failed");
        }

        const cmsModels = Array.isArray(modelsJson.models) ? modelsJson.models : [];
        const cmsCategories = Array.isArray(categoriesJson?.categories) ? categoriesJson.categories : DEFAULT_CATEGORIES;
        setModels(cmsModels.map(normalizeModel).filter((item) => item.enabled));
        setCategories(cmsCategories.length ? cmsCategories : DEFAULT_CATEGORIES);
        setPageSettings(Array.isArray(settingsJson?.settings) ? settingsJson.settings : Array.isArray(settingsJson?.data) ? settingsJson.data : []);
      } catch {
        if (!cancelled) setError("模型数据同步中");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadContent();
    return () => { cancelled = true; };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!customer?.id) return undefined;
    let cancelled = false;
    fetch("/api/user/wallet-summary")
      .then((res) => res.ok ? res.json() : null)
      .then((json) => { if (!cancelled) setMembership(json?.membership || null); })
      .catch(() => { if (!cancelled) setMembership(null); });
    return () => { cancelled = true; };
  }, [customer?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadPopularModels({ silent = false } = {}) {
      if (!silent) setPopularLoading(true);
      try {
        const response = await fetch("/api/analytics/model-usage-rank?period=week", { cache: "no-store" });
        const json = await response.json();
        if (cancelled) return;

        const rows = response.ok && json?.success && json?.source === "real" && Array.isArray(json.models)
          ? json.models.filter((item) => Number(item?.tokens) > 0).slice(0, 5)
          : [];

        setPopularModels(rows);
        setPopularSource(rows.length ? "real" : "empty");
        setPopularUpdatedAt(json?.updatedAt || null);
      } catch {
        if (!cancelled) {
          setPopularModels([]);
          setPopularSource("empty");
          setPopularUpdatedAt(null);
        }
      } finally {
        if (!cancelled) setPopularLoading(false);
      }
    }

    loadPopularModels();
    const timer = window.setInterval(() => loadPopularModels({ silent: true }), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const moduleEnabled = (key) => {
    const item = pageSettings.find((setting) => setting.page === "models" && setting.moduleKey === key);
    return item ? item.enabled !== false : true;
  };
  const showCurlExamples = moduleEnabled("show-curl");

  const visibleCategories = useMemo(() => {
    const withAll = categories.some((item) => item.id === "all" || item.slug === "all") ? categories : [DEFAULT_CATEGORIES[0], ...categories];
    return withAll
      .filter((item) => item.enabled !== false)
      .map((item) => ({ ...item, id: item.slug || item.id }))
      .filter((item, index, list) => list.findIndex((next) => next.id === item.id) === index)
      .sort((a, b) => Number(a.sortOrder || 99) - Number(b.sortOrder || 99));
  }, [categories]);

  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return models
      .filter((model) => {
        if (category !== "all" && !model.categories.includes(category)) return false;
        if (!query) return true;
        return [
          model.displayName,
          model.provider,
          model.modelId,
          model.description,
          ...(model.tags || []),
          ...(model.useCases || []),
        ].some((value) => String(value || "").toLowerCase().includes(query));
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.sortOrder - b.sortOrder);
  }, [models, category, search]);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  }

  async function copyText(text, message = "已复制") {
    if (!text) {
      showToast("暂无可复制内容");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(message);
    } catch {
      showToast("复制失败，请手动复制");
    }
  }

  function focusModel(model) {
    if (!model) return;
    setCategory("all");
    setSearch(model.modelId || model.displayName);
    setTimeout(() => {
      document.getElementById(`model-${model.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  const curlExample = selectedModel ? generateCurl(selectedModel, apiBaseUrl) : "";

  return (
    <>
      <Head><title>选择你的 AI 模型 - FlowAPI</title></Head>
      <ConsoleLayout
        customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }}
        currentPath="/models"
      >
        <main className="models-market-page">
          {moduleEnabled("show-recommend") && (
            <section className="models-market-recommend">
              <div className="models-section-head">
                <div>
                  <span className="models-market-kicker"><FlowApiBrandText size="sm" /> Live Top 5</span>
                  <h2><FlowApiBrandText /> 最受欢迎 Top 5 大模型</h2>
                </div>
                <p>基于 <FlowApiBrandText size="sm" /> 用户真实调用数据实时更新，只展示已有调用记录的模型。</p>
              </div>
              <PopularModelsTop5
                items={popularModels}
                loading={popularLoading}
                source={popularSource}
                updatedAt={popularUpdatedAt}
                models={models}
                onCopy={copyText}
                onFocus={focusModel}
              />
            </section>
          )}

          <section className="models-market-toolbar">
            <div className="models-search-box">
              <span>搜索</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索模型名称 / Provider / Model ID"
              />
            </div>
            {moduleEnabled("show-categories") && (
              <div className="models-category-strip" aria-label="模型分类">
                <Link href="/free-models" className="models-free-market-link">免费模型广场</Link>
                {visibleCategories.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={category === item.id ? "active" : ""}
                    onClick={() => setCategory(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="models-market-list">
            <div className="models-section-head">
              <div>
                <span className="models-market-kicker">Model Shelf</span>
                <h2>模型货架</h2>
              </div>
              <p>{loading ? "正在同步模型配置" : `当前展示 ${filteredModels.length} 个模型`}</p>
            </div>

            {loading ? (
              <div className="models-card-grid-v3">
                {Array.from({ length: 6 }).map((_, index) => <div key={index} className="models-skeleton-card" />)}
              </div>
            ) : error ? (
              <div className="models-market-empty">
                <strong>模型数据同步中</strong>
                <p>请稍后刷新，或联系管理员检查模型配置。</p>
              </div>
            ) : models.length === 0 ? (
              <div className="models-market-empty">
                <strong>暂无可用模型</strong>
                <p>管理员上架模型后将在这里展示。</p>
                {isAdmin && <Link href="/admin/content" className="models-market-primary">前往内容管理</Link>}
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="models-market-empty">
                <strong>没有找到相关模型</strong>
                <p>换一个关键词，或切换到全部分类再试。</p>
              </div>
            ) : (
              <div className="models-card-grid-v3">
                {filteredModels.map((model) => (
                  <ModelMarketCard
                    key={model.id}
                    model={model}
                    showPrice={moduleEnabled("show-price")}
                    isMember={membership?.status === "active" && membership?.level === "black_gold"}
                    onMemberRequired={() => showToast(model.nonMemberPrompt || "该模型为 FLOWAPI 黑金会员专属模型")}
                    onCopy={() => copyText(model.modelId, "Model ID 已复制")}
                    onDetails={() => setSelectedModel(model)}
                  />
                ))}
              </div>
            )}
          </section>

        </main>

        {selectedModel && (
          <ModelDetailModal
            model={selectedModel}
            apiBaseUrl={apiBaseUrl}
            curlExample={curlExample}
            showCurlExamples={showCurlExamples}
            onClose={() => setSelectedModel(null)}
            onCopy={copyText}
          />
        )}

        {toast && <div className="models-toast-v3">{toast}</div>}
      </ConsoleLayout>
    </>
  );
}

function PopularModelsTop5({ items, loading, source, updatedAt, models, onCopy, onFocus }) {
  const statusText = source === "real"
    ? `FlowAPI · 实时数据${updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}`
    : "FlowAPI · 数据同步中";

  if (loading) {
    return (
      <div className="models-popular-panel">
        <div className="models-popular-status">{statusText}</div>
        <div className="models-popular-grid">
          {Array.from({ length: 5 }).map((_, index) => <div key={index} className="models-popular-skeleton" />)}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="models-popular-panel">
        <div className="models-popular-status">{statusText}</div>
        <div className="models-popular-empty">
          <strong>暂无站内模型调用数据</strong>
          <p>完成真实调用后，这里会实时展示 <FlowApiBrandText size="sm" /> 网站最受欢迎的前 5 名大模型。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="models-popular-panel">
      <div className="models-popular-status">{statusText}</div>
      <div className="models-popular-grid">
        {items.map((item) => {
          const cmsModel = findCmsModelForUsage(item, models);
          return (
            <PopularModelCard
              key={`${item.rank}-${item.model}`}
              item={item}
              cmsModel={cmsModel}
              onCopy={onCopy}
              onFocus={onFocus}
            />
          );
        })}
      </div>
    </div>
  );
}

function PopularModelCard({ item, cmsModel, onCopy, onFocus }) {
  const trend = trendLabel(item);
  const displayName = cmsModel?.displayName || item.model;
  const provider = cmsModel?.provider || item.provider || "FlowAPI";
  const tokenText = item.tokensLabel || formatTokens(item.tokens);
  const hasModelId = Boolean(cmsModel?.modelId);
  const shareText = percentLabel(item.share);

  return (
    <article className={`models-popular-card rank-${item.rank <= 3 ? item.rank : "normal"}`}>
      <div className="models-popular-rank">#{item.rank}</div>
      <div className="models-popular-logo">
        <ModelLogo model={displayName} provider={provider} size={42} />
      </div>
      <div className="models-popular-main">
        <div className="models-popular-title-row">
          <h3>{displayName}</h3>
          {trend ? <span className={`models-popular-trend ${trend.className}`}>{trend.text}</span> : null}
        </div>
        <p>by {provider}</p>
        <div className="models-popular-desc">{cmsModel?.description || "站内真实调用热度上升中的模型，详细用途可进入模型货架查看。"}</div>
      </div>
      <div className="models-popular-metrics" title={`Token：${tokenText} Token\n请求次数：${numberLabel(item.requests)} 次\n消耗金额：${cnyLabel(item.costCny)}\n占比：${shareText}`}>
        <strong>{tokenText} Token</strong>
        <span>{numberLabel(item.requests)} 次调用 · {shareText}</span>
      </div>
      <div className="models-popular-actions">
        {cmsModel ? (
          <button type="button" className="models-market-primary" onClick={() => onFocus(cmsModel)}>立即接入</button>
        ) : (
          <button type="button" className="models-market-secondary" onClick={() => onFocus({ displayName: item.model, modelId: item.model, id: item.model })}>查看模型货架</button>
        )}
        <button
          type="button"
          className="models-market-secondary"
          onClick={() => onCopy(cmsModel?.modelId, "Model ID 已复制")}
          disabled={!hasModelId}
        >
          复制 Model ID
        </button>
      </div>
    </article>
  );
}

function ModelMarketCard({ model, showPrice, onCopy, onDetails, isMember = false, onMemberRequired }) {
  const tags = (model.tags || []).slice(0, 3);
  const moreTags = Math.max(0, (model.tags || []).length - tags.length);
  const primaryText = model.primaryButtonText || "立即接入";
  const secondaryText = model.secondaryButtonText || "复制 Model ID";
  const secondaryHref = model.secondaryButtonHref;
  const lockedForMember = model.isMemberOnly && !isMember;
  const discountText = discountLabel(model);
  const guardedCopy = () => {
    if (lockedForMember) {
      onMemberRequired?.();
      return;
    }
    onCopy();
  };
  return (
    <article id={`model-${model.id}`} className={`models-market-card${model.isRecommended ? " recommended" : ""}${model.isMemberOnly ? " member-only" : ""}`}>
      <div className="models-card-topline">
        <ModelLogo model={model.displayName} provider={model.provider || model.logo} size={42} />
        <div>
          <h3>{model.displayName}</h3>
          <p>by {model.provider}</p>
        </div>
        {model.isBeginnerFriendly ? <span className="models-newbie-badge">新手推荐</span> : null}
        {model.isMemberOnly ? <span className="models-member-badge">黑金会员专属</span> : null}
        {model.isFreeModel ? <span className="models-free-badge">免费模型</span> : null}
      </div>

      <div className="models-price-grid">
        <div><span>输入价格</span><strong>{showPrice ? priceLabel(model.flowapiInputPricePerM || model.inputPricePerM) : "价格同步中"}</strong></div>
        <div><span>输出价格</span><strong>{showPrice ? priceLabel(model.flowapiOutputPricePerM || model.outputPricePerM) : "价格同步中"}</strong></div>
      </div>

      <div className="models-discount-strip">
        <span>{discountText}</span>
        <small>官方：输入 {priceLabel(model.officialInputPricePerM)} · 输出 {priceLabel(model.officialOutputPricePerM)}</small>
      </div>

      <div className="models-model-id">
        <span>Model ID</span>
        <button type="button" onClick={guardedCopy} title="复制 Model ID">{model.modelId || "同步中"}</button>
      </div>

      <p className="models-card-desc">{model.description || "模型用途同步中。"}</p>

      <div className="models-card-tags">
        {tags.map((tag) => <span key={tag}>{tag}</span>)}
        {moreTags > 0 ? <span>+{moreTags}</span> : null}
      </div>

      <div className="models-card-actions">
        {lockedForMember ? (
          <Link className="models-market-primary" href="/recharge">开通黑金会员</Link>
        ) : (
          <Link className="models-market-primary" href={modelHref(model.primaryButtonHref, model)}>{primaryText}</Link>
        )}
        {secondaryHref ? (
          lockedForMember ? <button type="button" className="models-market-secondary" onClick={onMemberRequired}>查看普通模型</button> : <Link className="models-market-secondary" href={modelHref(secondaryHref, model)}>{secondaryText}</Link>
        ) : (
          <button type="button" className="models-market-secondary" onClick={guardedCopy}>{secondaryText}</button>
        )}
        <button type="button" className="models-market-ghost" onClick={onDetails}>查看详情</button>
      </div>
    </article>
  );
}

function ModelDetailModal({ model, apiBaseUrl, curlExample, showCurlExamples, onClose, onCopy }) {
  const pythonExample = model.pythonExample || generatePython(model, apiBaseUrl);
  const jsExample = model.javascriptExample || generateJavaScript(model, apiBaseUrl);

  return (
    <div className="models-detail-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="models-detail-modal">
        <header>
          <div>
            <span className="models-market-kicker">Model Detail</span>
            <h2>{model.displayName}</h2>
            <p>by {model.provider}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="models-detail-body">
          <section className="models-detail-summary">
            <div>
              <span>Model ID</span>
              <code>{model.modelId}</code>
              <button type="button" onClick={() => onCopy(model.modelId, "Model ID 已复制")}>复制</button>
            </div>
            <div>
              <span>Base URL</span>
              <code>{apiBaseUrl}</code>
              <button type="button" onClick={() => onCopy(apiBaseUrl, "Base URL 已复制")}>复制</button>
            </div>
            <div>
              <span>输入价格</span>
              <strong>{priceLabel(model.inputPricePerM)}</strong>
            </div>
            <div>
              <span>输出价格</span>
              <strong>{priceLabel(model.outputPricePerM)}</strong>
            </div>
          </section>

          <section className="models-detail-text">
            <h3>模型介绍</h3>
            <p>{model.detailDescription || model.description || "模型介绍同步中。"}</p>
          </section>

          <section className="models-detail-columns">
            <div>
              <h3>适合场景</h3>
              {(model.useCases?.length ? model.useCases : ["中文问答", "代码辅助", "日常任务"]).map((item) => <span key={item}>{item}</span>)}
            </div>
            <div>
              <h3>不适合场景</h3>
              {(model.notRecommendedFor?.length ? model.notRecommendedFor : ["价格或能力未同步的高风险业务"]).map((item) => <span key={item}>{item}</span>)}
            </div>
            <div>
              <h3>推荐用户</h3>
              {(model.recommendedUserTypes?.length ? model.recommendedUserTypes : ["新手用户", "开发者", "内容团队"]).map((item) => <span key={item}>{item}</span>)}
            </div>
          </section>

          {showCurlExamples && (
            <>
              <CodeBlock title="CURL 示例" code={curlExample} onCopy={onCopy} />
              <CodeBlock title="Python 示例" code={pythonExample} onCopy={onCopy} />
              <CodeBlock title="JavaScript 示例" code={jsExample} onCopy={onCopy} />
            </>
          )}

          <section className="models-detail-errors">
            <h3>常见错误</h3>
            <p><b>401：</b>API Key 填错或已禁用，请回到 API 管理检查。</p>
            <p><b>404：</b>Model ID 填错，请重新复制模型卡片里的 Model ID。</p>
            <p><b>402：</b>余额不足，请充值后继续调用。</p>
          </section>
        </div>

        <footer>
          <Link className="models-market-primary" href={modelHref(model.primaryButtonHref, model)}>{model.primaryButtonText || "去创建 API Key"}</Link>
          {showCurlExamples && (
            <button type="button" className="models-market-secondary" onClick={() => onCopy(curlExample, "CURL 示例已复制")}>复制 CURL 示例</button>
          )}
        </footer>
      </div>
    </div>
  );
}

function CodeBlock({ title, code, onCopy }) {
  return (
    <section className="models-code-block">
      <div>
        <h3>{title}</h3>
        <button type="button" onClick={() => onCopy(code, `${title}已复制`)}>复制</button>
      </div>
      <pre><code>{code}</code></pre>
    </section>
  );
}
