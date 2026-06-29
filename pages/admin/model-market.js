import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const MODEL_TYPES = [
  ["text", "文本对话"],
  ["coding", "代码/Codex"],
  ["vision", "视觉理解"],
  ["image", "生成图片"],
  ["image-edit", "图片编辑"],
];

const emptyDraft = {
  modelId: "",
  displayName: "",
  provider: "FlowAPI",
  modelType: "text",
  upstreamModelId: "",
  description: "",
  tags: "",
  officialReleaseDate: "",
  sortOrder: 500,
  enabled: true,
  showInModelSquare: true,
  showInApiKeyCreate: true,
  showInImageGeneration: false,
  recommended: false,
  hot: false,
  free: false,
  memberOnly: false,
  blackGoldOnly: false,
  pricing: {
    billingMode: "token_multiplier",
    multiplier: 1.5,
    inputCostPerMTokens: 0,
    outputCostPerMTokens: 0,
    imageCostPerImageCny: 0,
    imageFixedProfitPerImageCny: 0,
  },
};

function cnMoney(value) {
  const num = Number(value || 0);
  return num > 0 ? `$ API ${num.toFixed(2)}` : "待配置";
}

function statusText(model) {
  if (!model.enabled) return { label: "已下架", tone: "off" };
  if (model.showInModelSquare || model.showInApiKeyCreate || model.showInImageGeneration) return { label: "已发布", tone: "on" };
  return { label: "仅后台", tone: "warn" };
}

function nextActionText(stats) {
  if (!stats.apiKey) return "现在还没有 API Key 可选模型。先点下面的“推荐开通完整包”，前台模型广场和创建 API Key 会一起同步。";
  if (stats.apiKey < 6) return `当前 API Key 只开放了 ${stats.apiKey} 个模型，建议点“推荐开通完整包”补齐 ChatGPT / Codex / Claude / Gemini 等常用入口。`;
  if (!stats.published) return "模型已可创建 API Key，但前台模型广场还没展示。请打开“模型广场”开关或使用推荐开通完整包。";
  return "模型广场和 API Key 创建页已有可用模型。新增上游后，可以继续用一键开通或逐个编辑价格。";
}

const MODEL_FAMILY_SECTIONS = [
  {
    key: "chatgpt",
    label: "ChatGPT",
    description: "给普通聊天、写作、Agent 任务卖的主力入口。",
    match(model) {
      const id = String(model.modelId || "").toLowerCase();
      return model.showInApiKeyCreate && model.enabled && !id.includes("deepseek") && !id.includes("claude") && !id.includes("gemini") && !id.includes("codex") && model.modelType !== "image" && model.modelType !== "image-edit";
    },
  },
  {
    key: "codex",
    label: "Codex",
    description: "给 Cursor、Codex、Claude Code 这类编程场景卖的模型。",
    match(model) {
      const id = String(model.modelId || "").toLowerCase();
      return model.showInApiKeyCreate && model.enabled && (model.modelType === "coding" || id.includes("codex"));
    },
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    description: "国内用户最容易下单的低门槛模型入口。",
    match(model) {
      return model.showInApiKeyCreate && model.enabled && String(model.modelId || "").toLowerCase().includes("deepseek");
    },
  },
  {
    key: "claude",
    label: "Claude",
    description: "高客单价的长文本、写作、分析模型入口。",
    match(model) {
      return model.showInApiKeyCreate && model.enabled && String(model.modelId || "").toLowerCase().includes("claude");
    },
  },
  {
    key: "gemini",
    label: "Gemini",
    description: "多模态和性价比补位，适合做完整产品线。",
    match(model) {
      return model.showInApiKeyCreate && model.enabled && String(model.modelId || "").toLowerCase().includes("gemini");
    },
  },
];

function toDraft(model) {
  return {
    ...emptyDraft,
    modelId: model.modelId || "",
    displayName: model.displayName || "",
    provider: model.provider || "FlowAPI",
    modelType: model.modelType || "text",
    upstreamModelId: model.actualModelId || model.modelId || "",
    description: model.description || "",
    tags: Array.isArray(model.tags) ? model.tags.join("，") : "",
    officialReleaseDate: model.officialReleaseDate || "",
    sortOrder: model.sortOrder || 500,
    enabled: model.enabled !== false,
    showInModelSquare: model.showInModelSquare !== false,
    showInApiKeyCreate: model.showInApiKeyCreate !== false,
    showInImageGeneration: Boolean(model.showInImageGeneration),
    recommended: Boolean(model.recommended),
    hot: Boolean(model.hot),
    free: Boolean(model.free),
    memberOnly: Boolean(model.memberOnly),
    blackGoldOnly: Boolean(model.blackGoldOnly),
    pricing: {
      ...emptyDraft.pricing,
      ...(model.pricing || {}),
    },
  };
}

export default function AdminModelMarketPage() {
  const [models, setModels] = useState([]);
  const [sync, setSync] = useState(null);
  const [bootstrapReport, setBootstrapReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState("");
  const [testing, setTesting] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [toast, setToast] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  }

  function adminHeaders() {
    return {
      "Content-Type": "application/json",
    };
  }

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/model-market");
      const data = await response.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || "模型广场配置加载失败");
      setModels(data.models || []);
      setSync(data.sync || null);
    } catch (error) {
      showToast(error.message || "模型广场配置加载失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => loadData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredModels = useMemo(() => {
    const text = query.trim().toLowerCase();
    return models.filter((model) => {
      const matchesText = !text || [model.modelId, model.displayName, model.provider].some((value) => String(value || "").toLowerCase().includes(text));
      const matchesType = typeFilter === "all" || model.modelType === typeFilter;
      return matchesText && matchesType;
    });
  }, [models, query, typeFilter]);

  const stats = useMemo(() => ({
    total: models.length,
    published: models.filter((model) => model.enabled && model.showInModelSquare).length,
    apiKey: models.filter((model) => model.enabled && model.showInApiKeyCreate).length,
    image: models.filter((model) => model.enabled && model.showInImageGeneration).length,
  }), [models]);

  const familySummary = useMemo(() => {
    return MODEL_FAMILY_SECTIONS.map((section) => {
      const count = models.filter((model) => section.match(model)).length;
      return {
        ...section,
        count,
        ok: count > 0,
        hint: count > 0 ? `已开通 ${count} 个` : "还没开通",
      };
    });
  }, [models]);

  const launchChecklist = useMemo(() => {
    const imageCount = Number(sync?.counts?.imageModels || 0);
    return [
      {
        label: "文字模型可售卖",
        ok: stats.apiKey >= 4,
        hint: stats.apiKey >= 4 ? `已开放 ${stats.apiKey} 个可创建 Key 模型` : "先点推荐开通完整包",
      },
      {
        label: "前台模型广场可展示",
        ok: stats.published >= 4,
        hint: stats.published >= 4 ? `前台已展示 ${stats.published} 个模型` : "仍需打开模型广场展示开关",
      },
      {
        label: "图片生成模型已就绪",
        ok: imageCount > 0,
        hint: imageCount > 0 ? `生成图片页已有 ${imageCount} 个模型` : "去图片模型页启用默认模型",
      },
    ];
  }, [stats, sync]);

  function openCreate() {
    setDraft(emptyDraft);
    setDrawerOpen(true);
  }

  function openEdit(model) {
    setDraft(toDraft(model));
    setDrawerOpen(true);
  }

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updatePricing(key, value) {
    setDraft((current) => ({ ...current, pricing: { ...current.pricing, [key]: value } }));
  }

  async function saveModel() {
    if (!draft.modelId.trim()) return showToast("请先填写模型 ID");
    if (!draft.displayName.trim()) return showToast("请先填写前台展示名");
    setSaving(true);
    try {
      const payload = {
        ...draft,
        tags: draft.tags,
        showInImageGeneration: draft.modelType === "image" || draft.modelType === "image-edit" ? draft.showInImageGeneration : false,
        showInApiKeyCreate: draft.modelType === "image" || draft.modelType === "image-edit" ? false : draft.showInApiKeyCreate,
      };
      const response = await fetch("/api/admin/model-market", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || "保存失败");
      showToast("已保存，并同步到前台");
      setDrawerOpen(false);
      await loadData();
    } catch (error) {
      showToast(error.message || "保存失败");
    }
    setSaving(false);
  }

  async function bootstrapModelPack(pack) {
    setBootstrapping(pack);
    try {
      const response = await fetch("/api/admin/model-market", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ action: "bootstrap_model_pack", pack }),
      });
      const data = await response.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || data.message || "模型包开通失败");
      setBootstrapReport({
        pack,
        published: data.published || [],
        skipped: data.skipped || [],
        imagePack: data.imagePack || null,
        acceptance: data.acceptance || null,
        publishedCount: Number(data.publishedCount || 0),
        skippedCount: Number(data.skippedCount || 0),
      });
      const skipped = Number(data.acceptance?.skippedCount ?? data.skippedCount ?? 0);
      showToast(skipped ? `已开通 ${data.publishedCount || 0} 个模型，仍有 ${skipped} 项要处理` : data.message || "推荐模型已开通");
      await loadData();
    } catch (error) {
      showToast(error.message || "模型包开通失败");
    }
    setBootstrapping("");
  }

  async function quickToggle(model, key) {
    try {
      const next = toDraft(model);
      next[key] = !next[key];
      const response = await fetch(`/api/admin/model-market/${encodeURIComponent(model.modelId)}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify(next),
      });
      const data = await response.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || "操作失败");
      showToast("已同步修改");
      await loadData();
    } catch (error) {
      showToast(error.message || "操作失败");
    }
  }

  async function testModel(model) {
    setTesting(model.modelId);
    try {
      const response = await fetch(`/api/admin/model-market/${encodeURIComponent(model.modelId)}/test`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ actualModelId: model.actualModelId || model.modelId }),
      });
      const data = await response.json().catch(() => ({}));
      showToast(data.ok ? `测试通过：${data.latencyMs}ms` : `测试失败：${data.error || "上游不可用"}`);
      await loadData();
    } catch (error) {
      showToast(error.message || "测试失败");
    }
    setTesting("");
  }

  async function deleteModel(model) {
    if (!window.confirm(`确认删除 ${model.displayName}？有真实调用历史的模型建议先下架，不建议删除。`)) return;
    try {
      const response = await fetch(`/api/admin/model-market/${encodeURIComponent(model.modelId)}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || "删除失败");
      showToast("模型已删除");
      await loadData();
    } catch (error) {
      showToast(error.message || "删除失败");
    }
  }

  return (
    <>
      <Head><title>模型广场管理 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/model-market">
        <main className="model-market-admin">
          <header className="model-market-admin__hero">
            <div>
              <span className="model-market-admin__eyebrow">MODEL MARKET CMS</span>
              <h1>模型广场管理</h1>
              <p>这个页面用于管理前台模型广场、API Key 创建页、生成图片页的可见模型、价格和上下架状态。你改完保存，刷新前台即可看到效果。</p>
            </div>
            <div className="model-market-admin__actions">
              <button type="button" className="model-market-admin__ghost" onClick={loadData}>刷新同步</button>
              <button type="button" className="model-market-admin__primary" onClick={openCreate}>新增模型</button>
            </div>
          </header>

          <section className="model-market-admin__stats" aria-label="模型广场同步概览">
            {[
              ["全部后台模型", stats.total],
              ["前台展示", stats.published],
              ["可创建 Key", stats.apiKey],
              ["图片页可用", Number(sync?.counts?.imageModels || stats.image)],
            ].map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>

          <section className="model-market-admin__boss-checklist" aria-label="老板开通清单">
            {launchChecklist.map((item) => (
              <article key={item.label} className={item.ok ? "is-ok" : "is-warn"}>
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </article>
            ))}
          </section>

          <section className={`model-market-admin__sync ${sync?.ok ? "is-ok" : "is-warn"}`}>
            <div>
              <strong>{sync?.ok ? "同步检查通过" : "同步检查需要关注"}</strong>
              <span>{sync?.ok ? "当前后台配置已经能同步到前台关键入口。" : (sync?.issues?.[0]?.message || "请检查价格、API Key 可选模型和图片模型同步状态。")}</span>
            </div>
            <Link href="/models" target="_blank">查看前台效果</Link>
          </section>

          <section className={`model-market-admin__next-action ${stats.apiKey >= 6 ? "is-ok" : "is-urgent"}`}>
            <strong>{stats.apiKey >= 6 ? "下一步：可以开始创建测试 API Key" : "下一步：先把可售模型打开"}</strong>
            <span>{nextActionText(stats)}</span>
            <Link href="/api-management" target="_blank">去看 API Key 创建页</Link>
          </section>

          <section className="model-market-admin__family-grid" aria-label="售卖入口状态">
            {familySummary.map((item) => (
              <article key={item.key} className={item.ok ? "is-ok" : "is-missing"}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </div>
                <b>{item.hint}</b>
              </article>
            ))}
            <article className={Number(sync?.counts?.imageModels || 0) > 0 ? "is-ok" : "is-missing"}>
              <div>
                <strong>图片生成</strong>
                <span>对应 /images 页面和图片商业化闭环，单独在图片模型页管理。</span>
              </div>
              <b>{Number(sync?.counts?.imageModels || 0) > 0 ? `已启用 ${Number(sync?.counts?.imageModels || 0)} 个` : "还没启用"}</b>
            </article>
          </section>

          <section className="model-market-admin__boss-strip" aria-label="老板一键开通模型">
            <div>
              <strong>老板一键开通</strong>
              <span>不会暴露上游字段。你只需要先点“推荐开通完整包”，再去“图片模型”打开默认图片模型，前台模型广场、创建 API Key、生成图片三处就会一起联动。</span>
            </div>
            <div>
              <button type="button" className="model-market-admin__primary" onClick={() => bootstrapModelPack("full")} disabled={Boolean(bootstrapping)}>
                {bootstrapping === "full" ? "铺设中..." : "推荐开通完整包"}
              </button>
              <button type="button" className="model-market-admin__ghost" onClick={() => bootstrapModelPack("starter")} disabled={Boolean(bootstrapping)}>
                {bootstrapping === "starter" ? "开通中..." : "只开基础包"}
              </button>
              <Link href="/admin/image-models">去开图片模型</Link>
            </div>
          </section>

          {bootstrapReport ? (
            <section className="model-market-admin__bootstrap-result" aria-label="一键开通结果">
              <div>
                <strong>{bootstrapReport.pack === "full" ? "完整包处理结果" : "基础包处理结果"}</strong>
                <span>
                  {bootstrapReport.acceptance?.summary || `已开通 ${bootstrapReport.publishedCount} 个模型${bootstrapReport.skippedCount ? `，跳过 ${bootstrapReport.skippedCount} 个模型。` : "。"}`}
                </span>
              </div>
              <div className="model-market-admin__acceptance-grid">
                {[
                  ["模型广场", bootstrapReport.acceptance?.readyForModelSquare, bootstrapReport.acceptance?.modelSquareCount || 0],
                  ["创建 API Key", bootstrapReport.acceptance?.readyForApiKey, bootstrapReport.acceptance?.apiKeyCount || 0],
                  ["生成图片", bootstrapReport.acceptance?.readyForImages, bootstrapReport.acceptance?.imageModelCount || 0],
                ].map(([label, ok, count]) => (
                  <article key={label} className={ok ? "is-ok" : "is-missing"}>
                    <strong>{label}</strong>
                    <span>{ok ? `已同步 ${count} 个` : "还没打通"}</span>
                  </article>
                ))}
              </div>
              <div className="model-market-admin__bootstrap-grid">
                <article>
                  <h3>本次已开通</h3>
                  {bootstrapReport.published.length ? (
                    <ul>
                      {bootstrapReport.published.map((item) => (
                        <li key={item.modelId || item.id}>{item.displayName || item.modelId}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>这次没有新增开通模型。</p>
                  )}
                </article>
                <article>
                  <h3>为什么没开成</h3>
                  {(bootstrapReport.acceptance?.warnings || bootstrapReport.skipped).length ? (
                    <ul>
                      {(bootstrapReport.acceptance?.warnings || bootstrapReport.skipped.map((item) => `${item.displayName || item.id}：${item.reason}`)).map((item, index) => (
                        <li key={`${item}-${index}`}>{typeof item === "string" ? item : `${item.displayName || item.id}：${item.reason}`}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>这次没有跳过项。</p>
                  )}
                </article>
              </div>
              <div className={`model-market-admin__after-action ${bootstrapReport.acceptance?.ok ? "is-ok" : "is-warn"}`}>
                <strong>{bootstrapReport.acceptance?.ok ? "可以进入真实测试" : "还不能放心售卖"}</strong>
                <span>{bootstrapReport.acceptance?.nextStep || "建议先创建测试 API Key，再做一次真实调用确认扣费和日志。"}</span>
                <Link href="/api-management" target="_blank">创建测试 API Key</Link>
              </div>
            </section>
          ) : null}

          <section className="model-market-admin__toolbar">
            <label>
              <span>搜索模型</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入模型名、Model ID 或厂商" />
            </label>
            <label>
              <span>模型类型</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">全部类型</option>
                {MODEL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </section>

          <section className="model-market-admin__table-card">
            {loading ? (
              <div className="model-market-admin__empty">正在读取后台模型配置...</div>
            ) : filteredModels.length ? (
              <div className="model-market-admin__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th>类型</th>
                      <th>价格</th>
                      <th>展示位置</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModels.map((model) => {
                      const status = statusText(model);
                      return (
                        <tr key={model.modelId}>
                          <td>
                            <strong>{model.displayName}</strong>
                            <code>{model.modelId}</code>
                            <span>{model.provider} · {model.source === "system" ? "系统推荐" : "后台发布"} · {model.officialReleaseDate || "发布时间待确认"}</span>
                          </td>
                          <td>{MODEL_TYPES.find(([value]) => value === model.modelType)?.[1] || model.modelType}</td>
                          <td>
                            <strong>{model.modelType?.startsWith("image") ? cnMoney(model.pricing?.imageSellPricePerImageCny) : `${cnMoney(model.pricing?.inputSellPricePerMTokens)} / ${cnMoney(model.pricing?.outputSellPricePerMTokens)}`}</strong>
                            <span>{model.modelType?.startsWith("image") ? "每张图片售价" : "输入/输出 1M Token"}</span>
                          </td>
                          <td>
                            <div className="model-market-admin__switches">
                              <button type="button" className={model.showInModelSquare ? "active" : ""} onClick={() => quickToggle(model, "showInModelSquare")}>模型广场</button>
                              <button type="button" className={model.showInApiKeyCreate ? "active" : ""} onClick={() => quickToggle(model, "showInApiKeyCreate")}>API Key</button>
                              <button type="button" className={model.showInImageGeneration ? "active" : ""} onClick={() => quickToggle(model, "showInImageGeneration")}>图片页</button>
                            </div>
                          </td>
                          <td><span className={`model-market-admin__status ${status.tone}`}>{status.label}</span></td>
                          <td>
                            <div className="model-market-admin__row-actions">
                              <button type="button" onClick={() => openEdit(model)}>编辑</button>
                              <button type="button" onClick={() => testModel(model)} disabled={testing === model.modelId}>{testing === model.modelId ? "测试中" : "测试"}</button>
                              <Link href="/models" target="_blank">前台</Link>
                              <button type="button" className="danger" onClick={() => deleteModel(model)}>删除</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="model-market-admin__empty">
                <strong>还没有匹配的模型</strong>
                <p>可以点击“开通基础推荐包”，先让前台模型广场和 API Key 创建页有可用模型。</p>
              </div>
            )}
          </section>
        </main>

        {drawerOpen ? (
          <div className="model-market-admin__drawer-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
            <aside className="model-market-admin__drawer" aria-label="编辑模型">
              <header>
                <div>
                  <span>MODEL CONFIG</span>
                  <h2>{draft.modelId ? "编辑模型" : "新增模型"}</h2>
                </div>
                <button type="button" onClick={() => setDrawerOpen(false)} aria-label="关闭">×</button>
              </header>

              <div className="model-market-admin__form">
                <label>前台展示名
                  <input value={draft.displayName} onChange={(event) => updateDraft("displayName", event.target.value)} placeholder="例如：Codex Pro" />
                </label>
                <label>模型 ID
                  <input value={draft.modelId} onChange={(event) => updateDraft("modelId", event.target.value)} placeholder="例如：flowapi-codex-pro" />
                </label>
                <label>厂商
                  <input value={draft.provider} onChange={(event) => updateDraft("provider", event.target.value)} placeholder="例如：OpenAI / DeepSeek" />
                </label>
                <label>模型类型
                  <select value={draft.modelType} onChange={(event) => {
                    const nextType = event.target.value;
                    updateDraft("modelType", nextType);
                    if (nextType === "image" || nextType === "image-edit") updateDraft("showInImageGeneration", true);
                  }}>
                    {MODEL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>一句话说明
                  <textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="老板和用户能看懂的模型用途说明" />
                </label>
                <label>标签
                  <input value={draft.tags} onChange={(event) => updateDraft("tags", event.target.value)} placeholder="中文友好，代码，低成本" />
                </label>

                <div className="model-market-admin__toggles">
                  {[
                    ["enabled", "启用模型"],
                    ["showInModelSquare", "展示到模型广场"],
                    ["showInApiKeyCreate", "允许创建 API Key"],
                    ["showInImageGeneration", "展示到生成图片"],
                    ["recommended", "推荐"],
                    ["hot", "热门"],
                    ["free", "免费"],
                    ["memberOnly", "会员专属"],
                  ].map(([key, label]) => (
                    <button key={key} type="button" className={draft[key] ? "active" : ""} onClick={() => updateDraft(key, !draft[key])}>
                      {label}
                    </button>
                  ))}
                </div>

                <details open>
                  <summary>价格与上游设置</summary>
                  <label>上游真实模型 ID
                    <input value={draft.upstreamModelId} onChange={(event) => updateDraft("upstreamModelId", event.target.value)} placeholder="例如：openai/gpt-4o-mini" />
                  </label>
                  <label>官方发布时间
                    <input value={draft.officialReleaseDate} onChange={(event) => updateDraft("officialReleaseDate", event.target.value)} placeholder="YYYY-MM-DD 或 YYYY-MM" />
                  </label>
                  <label>排序
                    <input type="number" value={draft.sortOrder} onChange={(event) => updateDraft("sortOrder", event.target.value)} />
                  </label>
                  <div className="model-market-admin__price-grid">
                    <label>输入成本 / 1M（$ API）
                      <input type="number" step="0.01" value={draft.pricing.inputCostPerMTokens} onChange={(event) => updatePricing("inputCostPerMTokens", event.target.value)} />
                    </label>
                    <label>输出成本 / 1M（$ API）
                      <input type="number" step="0.01" value={draft.pricing.outputCostPerMTokens} onChange={(event) => updatePricing("outputCostPerMTokens", event.target.value)} />
                    </label>
                    <label>售卖倍率
                      <input type="number" step="0.1" value={draft.pricing.multiplier} onChange={(event) => updatePricing("multiplier", event.target.value)} />
                    </label>
                    <label>每张图成本（$ API）
                      <input type="number" step="0.01" value={draft.pricing.imageCostPerImageCny} onChange={(event) => updatePricing("imageCostPerImageCny", event.target.value)} />
                    </label>
                    <label>每张图利润（$ API）
                      <input type="number" step="0.01" value={draft.pricing.imageFixedProfitPerImageCny} onChange={(event) => updatePricing("imageFixedProfitPerImageCny", event.target.value)} />
                    </label>
                  </div>
                </details>
              </div>

              <footer>
                <button type="button" onClick={() => setDrawerOpen(false)}>取消</button>
                <button type="button" className="model-market-admin__primary" onClick={saveModel} disabled={saving}>{saving ? "保存中..." : "保存并同步前台"}</button>
              </footer>
            </aside>
          </div>
        ) : null}

        {toast ? <div className="models-toast-v3">{toast}</div> : null}
      </AdminLayout>

      <style jsx>{`
        .model-market-admin { display: grid; gap: 16px; color: var(--dash-text); }
        .model-market-admin__hero { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
        .model-market-admin__eyebrow { color: var(--dash-accent); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        .model-market-admin h1 { margin: 4px 0 0; font-size: 28px; font-weight: 950; letter-spacing: 0; }
        .model-market-admin p { margin: 8px 0 0; max-width: 820px; color: var(--dash-sub); font-size: 13px; line-height: 1.7; }
        .model-market-admin__actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .model-market-admin input, .model-market-admin select, .model-market-admin textarea,
        .model-market-admin__drawer input, .model-market-admin__drawer select, .model-market-admin__drawer textarea {
          width: 100%; min-height: 42px; border: 1px solid var(--dash-border); border-radius: 10px;
          background: var(--dash-card-bg); color: var(--dash-text); padding: 9px 11px; font: inherit; outline: none;
        }
        .model-market-admin textarea { min-height: 82px; resize: vertical; }
        .model-market-admin__primary, .model-market-admin__ghost {
          min-height: 42px; border-radius: 10px; padding: 0 15px; font-weight: 900; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
        }
        .model-market-admin__primary { border: 0; color: #fff; background: linear-gradient(135deg,#6366f1,#8b5cf6 56%,#a78bfa); box-shadow: 0 14px 34px rgba(99,102,241,.3); }
        .model-market-admin__primary:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.05); }
        .model-market-admin__ghost { border: 1px solid var(--dash-border); background: var(--dash-card-bg); color: var(--dash-text); }
        .model-market-admin__stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
        .model-market-admin__boss-checklist, .model-market-admin__family-grid { display: grid; gap: 10px; }
        .model-market-admin__boss-checklist { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .model-market-admin__family-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .model-market-admin__stats article, .model-market-admin__sync, .model-market-admin__next-action, .model-market-admin__toolbar, .model-market-admin__table-card, .model-market-admin__boss-checklist article, .model-market-admin__family-grid article {
          border: 1px solid var(--dash-border); border-radius: 14px; background: var(--dash-card-bg);
        }
        .model-market-admin__boss-checklist article, .model-market-admin__family-grid article { padding: 15px; display: grid; gap: 10px; }
        .model-market-admin__boss-checklist article strong, .model-market-admin__family-grid article strong { font-size: 14px; }
        .model-market-admin__boss-checklist article span, .model-market-admin__family-grid article span { color: var(--dash-sub); font-size: 12px; line-height: 1.65; }
        .model-market-admin__boss-checklist article.is-ok, .model-market-admin__family-grid article.is-ok { border-color: rgba(22,163,74,.24); background: linear-gradient(135deg, rgba(22,163,74,.1), rgba(99,102,241,.03)); }
        .model-market-admin__boss-checklist article.is-warn, .model-market-admin__family-grid article.is-missing { border-color: rgba(245,158,11,.28); background: linear-gradient(135deg, rgba(245,158,11,.1), rgba(99,102,241,.03)); }
        .model-market-admin__family-grid article b { font-size: 18px; font-weight: 950; }
        .model-market-admin__boss-strip {
          border: 1px solid rgba(99,102,241,.22); border-radius: 14px; padding: 15px 16px;
          background: linear-gradient(135deg, rgba(99,102,241,.12), rgba(14,165,233,.08));
          display: flex; justify-content: space-between; align-items: center; gap: 14px;
        }
        .model-market-admin__bootstrap-result {
          border: 1px solid var(--dash-border); border-radius: 14px; background: var(--dash-card-bg);
          padding: 15px 16px; display: grid; gap: 14px;
        }
        .model-market-admin__bootstrap-result strong, .model-market-admin__bootstrap-result span { display: block; }
        .model-market-admin__bootstrap-result span { margin-top: 5px; color: var(--dash-sub); font-size: 12px; line-height: 1.65; }
        .model-market-admin__bootstrap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .model-market-admin__acceptance-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .model-market-admin__acceptance-grid article {
          border: 1px solid var(--dash-border); border-radius: 12px; padding: 13px; background: rgba(148,163,184,.06);
        }
        .model-market-admin__acceptance-grid article.is-ok { border-color: rgba(22,163,74,.26); background: rgba(22,163,74,.08); }
        .model-market-admin__acceptance-grid article.is-missing { border-color: rgba(245,158,11,.3); background: rgba(245,158,11,.08); }
        .model-market-admin__acceptance-grid strong, .model-market-admin__acceptance-grid span { display: block; }
        .model-market-admin__acceptance-grid span { margin-top: 6px; color: var(--dash-sub); font-size: 12px; }
        .model-market-admin__bootstrap-grid article {
          border: 1px solid var(--dash-border); border-radius: 12px; padding: 14px; background: rgba(148,163,184,.06);
        }
        .model-market-admin__bootstrap-grid h3 { margin: 0 0 10px; font-size: 13px; font-weight: 900; }
        .model-market-admin__bootstrap-grid p, .model-market-admin__bootstrap-grid ul { margin: 0; color: var(--dash-sub); font-size: 12px; line-height: 1.7; }
        .model-market-admin__bootstrap-grid ul { padding-left: 18px; }
        .model-market-admin__after-action {
          border: 1px solid var(--dash-border); border-radius: 12px; padding: 13px 14px;
          display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center;
        }
        .model-market-admin__after-action.is-ok { border-color: rgba(22,163,74,.28); background: rgba(22,163,74,.08); }
        .model-market-admin__after-action.is-warn { border-color: rgba(245,158,11,.3); background: rgba(245,158,11,.08); }
        .model-market-admin__after-action span { color: var(--dash-sub); font-size: 12px; line-height: 1.55; }
        .model-market-admin__after-action a { color: var(--dash-accent); font-weight: 900; text-decoration: none; white-space: nowrap; }
        .model-market-admin__boss-strip strong, .model-market-admin__boss-strip span { display: block; }
        .model-market-admin__boss-strip span { margin-top: 5px; color: var(--dash-sub); font-size: 12px; line-height: 1.65; }
        .model-market-admin__boss-strip > div:last-child { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .model-market-admin__boss-strip a {
          min-height: 42px; border-radius: 10px; padding: 0 15px; display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--dash-border); background: var(--dash-card-bg); color: var(--dash-text); text-decoration: none; font-size: 12px; font-weight: 900;
        }
        .model-market-admin__stats article { padding: 15px; }
        .model-market-admin__stats span { display: block; color: var(--dash-sub); font-size: 12px; font-weight: 800; }
        .model-market-admin__stats strong { display: block; margin-top: 8px; font-size: 28px; font-weight: 950; }
        .model-market-admin__sync { display: flex; justify-content: space-between; gap: 14px; align-items: center; padding: 14px 16px; }
        .model-market-admin__sync strong, .model-market-admin__sync span { display: block; }
        .model-market-admin__sync span { margin-top: 4px; color: var(--dash-sub); font-size: 12px; }
        .model-market-admin__sync a { color: var(--dash-accent); font-weight: 900; text-decoration: none; white-space: nowrap; }
        .model-market-admin__sync.is-ok { border-color: rgba(22,163,74,.24); }
        .model-market-admin__sync.is-warn { border-color: rgba(245,158,11,.28); }
        .model-market-admin__next-action {
          display: grid; grid-template-columns: minmax(150px, auto) 1fr auto; gap: 12px; align-items: center; padding: 14px 16px;
        }
        .model-market-admin__next-action strong { font-size: 14px; }
        .model-market-admin__next-action span { color: var(--dash-sub); font-size: 12px; line-height: 1.65; }
        .model-market-admin__next-action a { color: var(--dash-accent); font-weight: 900; text-decoration: none; white-space: nowrap; }
        .model-market-admin__next-action.is-urgent { border-color: rgba(245,158,11,.34); background: linear-gradient(135deg, rgba(245,158,11,.12), rgba(99,102,241,.07)); }
        .model-market-admin__next-action.is-ok { border-color: rgba(22,163,74,.28); background: linear-gradient(135deg, rgba(22,163,74,.1), rgba(99,102,241,.05)); }
        .model-market-admin__toolbar { display: grid; grid-template-columns: 1fr 220px; gap: 12px; padding: 14px; }
        .model-market-admin__toolbar label, .model-market-admin__form label { display: grid; gap: 7px; color: var(--dash-text); font-size: 12px; font-weight: 850; }
        .model-market-admin__table-card { overflow: hidden; }
        .model-market-admin__table-wrap { overflow: auto; }
        .model-market-admin table { width: 100%; border-collapse: collapse; min-width: 960px; }
        .model-market-admin th { text-align: left; padding: 12px 14px; color: var(--dash-sub); font-size: 11px; font-weight: 900; background: rgba(99,102,241,.04); }
        .model-market-admin td { padding: 14px; border-top: 1px solid var(--dash-border); vertical-align: top; font-size: 13px; }
        .model-market-admin td strong, .model-market-admin td span, .model-market-admin td code { display: block; }
        .model-market-admin td code { margin-top: 5px; color: var(--dash-sub); font-size: 11px; word-break: break-all; }
        .model-market-admin td span { margin-top: 5px; color: var(--dash-sub); font-size: 11px; }
        .model-market-admin__switches, .model-market-admin__row-actions, .model-market-admin__toggles { display: flex; gap: 6px; flex-wrap: wrap; }
        .model-market-admin__switches button, .model-market-admin__row-actions button, .model-market-admin__row-actions a, .model-market-admin__toggles button {
          min-height: 34px; border: 1px solid var(--dash-border); border-radius: 9px; background: transparent; color: var(--dash-sub); padding: 0 10px; font-size: 12px; font-weight: 850; text-decoration: none; cursor: pointer;
        }
        .model-market-admin__switches button.active, .model-market-admin__toggles button.active { color: var(--dash-accent); background: rgba(99,102,241,.12); border-color: rgba(99,102,241,.28); }
        .model-market-admin__row-actions .danger { color: #ef4444; border-color: rgba(239,68,68,.24); }
        .model-market-admin__status { display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: 999px; font-weight: 900; font-size: 12px; }
        .model-market-admin__status.on { color: #16a34a; background: rgba(22,163,74,.1); }
        .model-market-admin__status.off { color: #ef4444; background: rgba(239,68,68,.09); }
        .model-market-admin__status.warn { color: #f59e0b; background: rgba(245,158,11,.11); }
        .model-market-admin__empty { padding: 32px; color: var(--dash-sub); text-align: center; }
        .model-market-admin__drawer-backdrop { position: fixed; inset: 0; z-index: 220; background: rgba(15,23,42,.34); display: flex; justify-content: flex-end; }
        .model-market-admin__drawer { width: min(560px, 100vw); height: 100%; background: var(--dash-card-bg); color: var(--dash-text); box-shadow: -24px 0 70px rgba(15,23,42,.18); display: flex; flex-direction: column; }
        .model-market-admin__drawer header, .model-market-admin__drawer footer { padding: 18px; border-bottom: 1px solid var(--dash-border); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .model-market-admin__drawer footer { border-top: 1px solid var(--dash-border); border-bottom: 0; }
        .model-market-admin__drawer h2 { margin: 3px 0 0; font-size: 20px; }
        .model-market-admin__drawer header span { color: var(--dash-accent); font-size: 11px; font-weight: 900; }
        .model-market-admin__drawer header button, .model-market-admin__drawer footer button:first-child { border: 1px solid var(--dash-border); background: transparent; color: var(--dash-sub); border-radius: 10px; min-height: 40px; padding: 0 14px; cursor: pointer; }
        .model-market-admin__form { padding: 18px; overflow: auto; display: grid; gap: 14px; }
        .model-market-admin__form details { border: 1px solid var(--dash-border); border-radius: 12px; padding: 12px; display: grid; gap: 12px; }
        .model-market-admin__form summary { cursor: pointer; font-weight: 900; margin-bottom: 12px; }
        .model-market-admin__price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 760px) {
          .model-market-admin__hero { display: grid; }
          .model-market-admin__actions { justify-content: stretch; }
          .model-market-admin__stats, .model-market-admin__toolbar, .model-market-admin__bootstrap-grid, .model-market-admin__acceptance-grid, .model-market-admin__boss-checklist, .model-market-admin__family-grid { grid-template-columns: 1fr; }
          .model-market-admin__boss-strip { display: grid; }
          .model-market-admin__boss-strip > div:last-child { justify-content: stretch; }
          .model-market-admin__boss-strip button, .model-market-admin__boss-strip a { width: 100%; }
          .model-market-admin__sync { align-items: flex-start; flex-direction: column; }
          .model-market-admin__next-action { grid-template-columns: 1fr; }
          .model-market-admin__after-action { grid-template-columns: 1fr; }
          .model-market-admin__price-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
