export const dynamic = "force-dynamic";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import ModelLogo from "@/components/ModelLogo";
import { getPublicApiBaseUrl } from "@/lib/public-api";

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

const RECOMMEND_SCENES = [
  {
    id: "daily",
    title: "中文日常任务",
    match: (model) => model.categories.includes("deepseek") || model.categories.includes("chinese-writing") || model.isBeginnerFriendly,
    fallback: "DeepSeek Chat",
    scene: "适合中文问答、轻量代码、日常任务。",
  },
  {
    id: "code",
    title: "代码编程",
    match: (model) => model.categories.includes("code-programming") || /claude|gpt|codex/i.test(`${model.displayName} ${model.modelId}`),
    fallback: "Claude Sonnet / GPT",
    scene: "适合代码生成、调试、复杂任务。",
  },
  {
    id: "batch",
    title: "低成本批量任务",
    match: (model) => model.categories.includes("low-cost") || /qwen|flash|deepseek/i.test(`${model.displayName} ${model.modelId}`),
    fallback: "Qwen / DeepSeek Flash",
    scene: "适合批量文案、低成本调用、轻量任务。",
  },
];

function isAdminCustomer(customer) {
  const email = String(customer?.email || "").toLowerCase();
  return Boolean(customer?.role === "admin" || customer?.isAdmin || customer?.id === "cus_admin" || email === "xiaoyijie@flowapi.fun");
}

function normalizeModel(model) {
  return {
    ...model,
    id: model.id || model.modelId || model.displayName,
    displayName: model.displayName || model.name || "Unknown Model",
    provider: model.provider || model.providerName || "FlowAPI",
    modelId: model.modelId || model.publicModelId || "",
    categories: Array.isArray(model.categories) ? model.categories : ["all"],
    tags: Array.isArray(model.tags) ? model.tags : [],
    useCases: Array.isArray(model.useCases) ? model.useCases : [],
    notRecommendedFor: Array.isArray(model.notRecommendedFor) ? model.notRecommendedFor : [],
    recommendedUserTypes: Array.isArray(model.recommendedUserTypes) ? model.recommendedUserTypes : [],
    baseUrl: model.baseUrl || getPublicApiBaseUrl(),
    sortOrder: Number(model.sortOrder || 99),
    enabled: model.enabled !== false,
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

  const recommendations = useMemo(() => {
    return RECOMMEND_SCENES.map((scene) => {
      const model = models.find((item) => scene.match(item)) || models.find((item) => item.isRecommended) || null;
      return { ...scene, model };
    });
  }, [models]);

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
          <section className="models-market-hero">
            <div className="models-market-hero-copy">
              <span className="models-market-kicker">AI Token Market</span>
              <h1>选择你的 AI 模型</h1>
              <p>一个 FlowAPI Key，即可接入 DeepSeek、GPT、Claude、Gemini、Qwen 等主流模型。</p>
              <div className="models-market-actions">
                <button type="button" className="models-market-primary" onClick={() => copyText(apiBaseUrl, "Base URL 已复制")}>复制 Base URL</button>
                <Link className="models-market-secondary" href="/guide">创建 API Key</Link>
                <Link className="models-market-secondary" href="/help">查看接入教程</Link>
              </div>
            </div>
            <div className="models-market-base-card">
              <span>Base URL</span>
              <code>{apiBaseUrl}</code>
              <button type="button" onClick={() => copyText(apiBaseUrl, "Base URL 已复制")}>复制</button>
            </div>
          </section>

          {moduleEnabled("show-recommend") && (
            <section className="models-market-recommend">
              <div className="models-section-head">
                <div>
                  <span className="models-market-kicker">Beginner Picks</span>
                  <h2>不知道选哪个？</h2>
                </div>
                <p>先按用途选一个模型，复制 Model ID，再去创建 API Key。</p>
              </div>
              <div className="models-recommend-grid">
                {recommendations.map((item) => (
                  <article key={item.id} className="models-recommend-card">
                    <span>{item.title}</span>
                    <h3>{item.model?.displayName || item.fallback}</h3>
                    <p>{item.scene}</p>
                    <div>
                      <button type="button" onClick={() => item.model ? focusModel(item.model) : setSearch(item.fallback)}>使用推荐模型</button>
                      <button type="button" onClick={() => copyText(item.model?.modelId, "Model ID 已复制")} disabled={!item.model?.modelId}>复制 Model ID</button>
                    </div>
                  </article>
                ))}
              </div>
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
                    onCopy={() => copyText(model.modelId, "Model ID 已复制")}
                    onDetails={() => setSelectedModel(model)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="models-onboarding-steps">
            <div>
              <span className="models-market-kicker">Start in 3 steps</span>
              <h2>三步完成接入</h2>
            </div>
            <div className="models-steps-grid">
              <div><b>1</b><strong>创建 API Key</strong><span>进入 API 管理生成你的专属 Key。</span></div>
              <div><b>2</b><strong>复制 Model ID</strong><span>从模型卡片或详情弹窗复制模型名。</span></div>
              <div><b>3</b><strong>使用 Base URL 调用</strong><span>在客户端填入 Base URL、API Key 和 Model ID。</span></div>
            </div>
            <div className="models-market-actions">
              <Link className="models-market-primary" href="/guide">创建 API Key</Link>
              <Link className="models-market-secondary" href="/help">查看帮助指南</Link>
              {showCurlExamples && (
                <button type="button" className="models-market-secondary" onClick={() => copyText(generateCurl(models[0], apiBaseUrl), "CURL 示例已复制")}>复制 CURL 示例</button>
              )}
            </div>
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

function ModelMarketCard({ model, showPrice, onCopy, onDetails }) {
  const tags = (model.tags || []).slice(0, 3);
  const moreTags = Math.max(0, (model.tags || []).length - tags.length);
  return (
    <article id={`model-${model.id}`} className={`models-market-card${model.isRecommended ? " recommended" : ""}`}>
      <div className="models-card-topline">
        <ModelLogo model={model.displayName} provider={model.provider || model.logo} size={42} />
        <div>
          <h3>{model.displayName}</h3>
          <p>by {model.provider}</p>
        </div>
        {model.isBeginnerFriendly ? <span className="models-newbie-badge">新手推荐</span> : null}
      </div>

      <div className="models-model-id">
        <span>Model ID</span>
        <button type="button" onClick={onCopy} title="复制 Model ID">{model.modelId || "同步中"}</button>
      </div>

      <div className="models-price-grid">
        <div><span>输入</span><strong>{showPrice ? priceLabel(model.inputPricePerM) : "价格同步中"}</strong></div>
        <div><span>输出</span><strong>{showPrice ? priceLabel(model.outputPricePerM) : "价格同步中"}</strong></div>
      </div>

      <p className="models-card-desc">{model.description || "模型用途同步中。"}</p>

      <div className="models-card-tags">
        {tags.map((tag) => <span key={tag}>{tag}</span>)}
        {moreTags > 0 ? <span>+{moreTags}</span> : null}
      </div>

      <div className="models-card-actions">
        <button type="button" className="models-market-primary" onClick={onCopy}>复制 Model ID</button>
        <Link className="models-market-secondary" href={`/guide?model=${encodeURIComponent(model.modelId || "")}`}>立即接入</Link>
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
          <Link className="models-market-primary" href="/guide">去创建 API Key</Link>
          <Link className="models-market-secondary" href="/help">查看帮助指南</Link>
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
