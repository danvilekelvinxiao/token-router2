import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

function money(value) {
  const num = Number(value || 0);
  return num > 0 ? `$${num.toFixed(2)}` : "待配置";
}

export default function AdminImageModelsPage() {
  const [models, setModels] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  }

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/image-models");
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "图片模型加载失败");
      const nextModels = Array.isArray(json.models) ? json.models : [];
      setModels(nextModels);
      setDrafts(Object.fromEntries(nextModels.map((item) => [item.id, {
        displayName: item.displayName || "",
        upstreamModel: item.upstreamModel || item.modelId || "",
        provider: item.provider || "openrouter",
        supportsTextToImage: item.supportsTextToImage !== false,
        supportsImageToImage: Boolean(item.supportsImageToImage),
        supportsBatch: Boolean(item.supportsBatch),
        imageCostPerImageCny: item.imageCostPerImageCny || 0,
        imageFixedProfitPerImageCny: item.imageFixedProfitPerImageCny || 0,
        imageSellPricePerImageCny: item.imageSellPricePerImageCny || item.unitPriceRmbTextToImage || 0,
        sortOrder: item.sortOrder || 999,
      }])));
    } catch (error) {
      showToast(error.message || "图片模型加载失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => loadModels());
  }, [loadModels]);

  const stats = useMemo(() => ({
    total: models.length,
    enabled: models.filter((item) => item.enabled).length,
    recommended: models.filter((item) => item.enabled && item.recommended).length,
    imageToImage: models.filter((item) => item.enabled && item.supportsImageToImage).length,
  }), [models]);

  async function toggleModel(model) {
    setBusy(`toggle:${model.id}`);
    try {
      const response = await fetch("/api/admin/image-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          updates: { enabled: !model.enabled },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.model) throw new Error(json.error || "状态更新失败");
      showToast(model.enabled ? "已停用该图片模型" : "已启用该图片模型");
      await loadModels();
    } catch (error) {
      showToast(error.message || "状态更新失败");
    }
    setBusy("");
  }

  function updateDraft(modelId, key, value) {
    setDrafts((current) => ({
      ...current,
      [modelId]: {
        ...(current[modelId] || {}),
        [key]: value,
      },
    }));
  }

  async function saveModel(model) {
    const draft = drafts[model.id] || {};
    setBusy(`save:${model.id}`);
    try {
      const response = await fetch("/api/admin/image-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          updates: {
            displayName: draft.displayName,
            upstreamModel: draft.upstreamModel,
            provider: draft.provider,
            supportsTextToImage: draft.supportsTextToImage,
            supportsImageToImage: draft.supportsImageToImage,
            supportsBatch: draft.supportsBatch,
            imageCostPerImageCny: Number(draft.imageCostPerImageCny || 0),
            imageFixedProfitPerImageCny: Number(draft.imageFixedProfitPerImageCny || 0),
            imageSellPricePerImageCny: Number(draft.imageSellPricePerImageCny || 0),
            sortOrder: Number(draft.sortOrder || 999),
          },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.model) throw new Error(json.error || "保存失败");
      showToast("已保存并同步生成图片页");
      await loadModels();
    } catch (error) {
      showToast(error.message || "保存失败");
    }
    setBusy("");
  }

  async function enableDefaultPack() {
    setBusy("enable-default-pack");
    try {
      const response = await fetch("/api/admin/image-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable_default_pack" }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "默认图片模型启用失败");
      showToast(json.message || "默认图片模型已启用");
      await loadModels();
    } catch (error) {
      showToast(error.message || "默认图片模型启用失败");
    }
    setBusy("");
  }

  return (
    <>
      <Head><title>图片模型管理 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/image-models">
        <main className="admin-image-models">
          <header className="admin-image-models__hero">
            <div>
              <span className="admin-image-models__eyebrow">IMAGE STUDIO CMS</span>
              <h1>图片模型管理</h1>
              <p>这页专门负责 /images 的图片模型。你只需要确认哪些模型启用、每张图卖多少钱，前台生成图片页就会同步更新，不需要手动改代码。</p>
            </div>
            <div className="admin-image-models__actions">
              <button type="button" className="admin-image-models__ghost" onClick={loadModels}>刷新</button>
              <button type="button" className="admin-image-models__primary" onClick={enableDefaultPack} disabled={busy === "enable-default-pack"}>
                {busy === "enable-default-pack" ? "启用中..." : "一键启用默认图片模型"}
              </button>
            </div>
          </header>

          <section className="admin-image-models__stats">
            {[
              ["全部图片模型", stats.total],
              ["当前已启用", stats.enabled],
              ["推荐模型", stats.recommended],
              ["支持改图", stats.imageToImage],
            ].map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>

          <section className="admin-image-models__guide">
            <div>
              <strong>老板最少只做 2 步</strong>
              <span>先点“一键启用默认图片模型”，再检查每张图售价是否大于 0。完成后去前台 /images 直接测试。</span>
            </div>
            <div>
              <Link href="/images" target="_blank">打开生成图片页</Link>
              <Link href="/admin/model-market">返回模型广场管理</Link>
            </div>
          </section>

          <section className="admin-image-models__table-card">
            {loading ? (
              <div className="admin-image-models__empty">正在读取图片模型配置...</div>
            ) : (
              <div className="admin-image-models__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th>能力</th>
                      <th>成本 / 利润 / 售价</th>
                      <th>排序</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((item) => {
                      const draft = drafts[item.id] || {};
                      return (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.displayName}</strong>
                            <input value={draft.displayName || ""} onChange={(event) => updateDraft(item.id, "displayName", event.target.value)} aria-label={`${item.id} 展示名称`} />
                            <input value={draft.upstreamModel || ""} onChange={(event) => updateDraft(item.id, "upstreamModel", event.target.value)} aria-label={`${item.id} 上游模型`} />
                            <span>{draft.provider || item.provider}</span>
                          </td>
                          <td>
                            <div className="admin-image-models__toggles">
                              <button type="button" className={draft.supportsTextToImage !== false ? "active" : ""} onClick={() => updateDraft(item.id, "supportsTextToImage", !(draft.supportsTextToImage !== false))}>文生图</button>
                              <button type="button" className={draft.supportsImageToImage ? "active" : ""} onClick={() => updateDraft(item.id, "supportsImageToImage", !draft.supportsImageToImage)}>改图</button>
                              <button type="button" className={draft.supportsBatch ? "active" : ""} onClick={() => updateDraft(item.id, "supportsBatch", !draft.supportsBatch)}>批量</button>
                            </div>
                          </td>
                          <td>
                            <div className="admin-image-models__price-grid">
                              <label>
                                <span>成本</span>
                                <input type="number" step="0.01" value={draft.imageCostPerImageCny ?? 0} onChange={(event) => updateDraft(item.id, "imageCostPerImageCny", event.target.value)} />
                              </label>
                              <label>
                                <span>利润</span>
                                <input type="number" step="0.01" value={draft.imageFixedProfitPerImageCny ?? 0} onChange={(event) => updateDraft(item.id, "imageFixedProfitPerImageCny", event.target.value)} />
                              </label>
                              <label>
                                <span>售价</span>
                                <input type="number" step="0.01" value={draft.imageSellPricePerImageCny ?? 0} onChange={(event) => updateDraft(item.id, "imageSellPricePerImageCny", event.target.value)} />
                              </label>
                            </div>
                            <span className="admin-image-models__price-hint">当前前台显示：{money(draft.imageSellPricePerImageCny ?? item.imageSellPricePerImageCny ?? item.unitPriceRmbTextToImage)}</span>
                          </td>
                          <td>
                            <input type="number" value={draft.sortOrder ?? 999} onChange={(event) => updateDraft(item.id, "sortOrder", event.target.value)} aria-label={`${item.id} 排序`} />
                          </td>
                          <td>
                            <span className={`admin-image-models__status ${item.enabled ? "on" : "off"}`}>{item.enabled ? "启用中" : "已停用"}</span>
                          </td>
                          <td>
                            <div className="admin-image-models__row-actions">
                              <button type="button" className="admin-image-models__ghost" onClick={() => saveModel(item)} disabled={busy === `save:${item.id}`}>
                                {busy === `save:${item.id}` ? "保存中..." : "保存"}
                              </button>
                              <button type="button" className={item.enabled ? "admin-image-models__danger" : "admin-image-models__primary"} onClick={() => toggleModel(item)} disabled={busy === `toggle:${item.id}`}>
                                {busy === `toggle:${item.id}` ? "处理中..." : item.enabled ? "停用" : "启用"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        {toast ? <div className="models-toast-v3">{toast}</div> : null}
      </AdminLayout>

      <style jsx>{`
        .admin-image-models { display: grid; gap: 16px; color: var(--dash-text); }
        .admin-image-models__hero { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .admin-image-models__eyebrow { color: var(--dash-accent); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        .admin-image-models h1 { margin: 4px 0 0; font-size: 28px; font-weight: 950; letter-spacing: 0; }
        .admin-image-models p { margin: 8px 0 0; max-width: 780px; color: var(--dash-sub); font-size: 13px; line-height: 1.7; }
        .admin-image-models__actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .admin-image-models__primary, .admin-image-models__ghost, .admin-image-models__danger {
          min-height: 40px; border-radius: 10px; padding: 0 14px; font-size: 12px; font-weight: 900; cursor: pointer;
          transition: transform .18s ease, filter .18s ease;
        }
        .admin-image-models__primary { border: 0; color: #fff; background: linear-gradient(135deg,#6366f1,#8b5cf6 56%,#a78bfa); box-shadow: 0 14px 34px rgba(99,102,241,.28); }
        .admin-image-models__ghost { border: 1px solid var(--dash-border); background: var(--dash-card-bg); color: var(--dash-text); }
        .admin-image-models__danger { border: 1px solid rgba(239,68,68,.22); background: rgba(239,68,68,.08); color: #ef4444; }
        .admin-image-models__primary:hover:not(:disabled), .admin-image-models__ghost:hover:not(:disabled), .admin-image-models__danger:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.04); }
        .admin-image-models__stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
        .admin-image-models__stats article, .admin-image-models__guide, .admin-image-models__table-card {
          border: 1px solid var(--dash-border); border-radius: 14px; background: var(--dash-card-bg);
        }
        .admin-image-models__stats article { padding: 15px; }
        .admin-image-models__stats span { display: block; color: var(--dash-sub); font-size: 12px; font-weight: 800; }
        .admin-image-models__stats strong { display: block; margin-top: 8px; font-size: 28px; font-weight: 950; }
        .admin-image-models__guide {
          padding: 15px 16px; display: flex; justify-content: space-between; gap: 16px; align-items: center;
          border-color: rgba(99,102,241,.24); background: linear-gradient(135deg, rgba(99,102,241,.12), rgba(14,165,233,.08));
        }
        .admin-image-models__guide strong, .admin-image-models__guide span { display: block; }
        .admin-image-models__guide span { margin-top: 5px; color: var(--dash-sub); font-size: 12px; line-height: 1.65; }
        .admin-image-models__guide > div:last-child { display: flex; gap: 8px; flex-wrap: wrap; }
        .admin-image-models__guide a {
          min-height: 40px; border-radius: 10px; padding: 0 14px; display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--dash-border); background: var(--dash-card-bg); color: var(--dash-text); text-decoration: none; font-size: 12px; font-weight: 900;
        }
        .admin-image-models__table-card { overflow: hidden; }
        .admin-image-models__table-wrap { overflow: auto; }
        .admin-image-models__empty { padding: 32px; color: var(--dash-sub); text-align: center; }
        table { width: 100%; min-width: 1080px; border-collapse: collapse; }
        th { text-align: left; padding: 12px 14px; color: var(--dash-sub); font-size: 11px; font-weight: 900; background: rgba(99,102,241,.04); }
        td { padding: 14px; border-top: 1px solid var(--dash-border); vertical-align: top; font-size: 13px; }
        td strong, td span { display: block; }
        td span { margin-top: 5px; color: var(--dash-sub); font-size: 11px; }
        td input {
          width: 100%; min-height: 38px; border: 1px solid var(--dash-border); border-radius: 10px;
          background: var(--dash-card-bg); color: var(--dash-text); padding: 8px 10px; font: inherit; outline: none; margin-top: 8px;
        }
        .admin-image-models__toggles, .admin-image-models__row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .admin-image-models__toggles button {
          min-height: 34px; border: 1px solid var(--dash-border); border-radius: 9px; background: transparent; color: var(--dash-sub); padding: 0 10px; font-size: 12px; font-weight: 850; cursor: pointer;
        }
        .admin-image-models__toggles button.active { color: var(--dash-accent); background: rgba(99,102,241,.12); border-color: rgba(99,102,241,.28); }
        .admin-image-models__price-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .admin-image-models__price-grid label { display: grid; gap: 6px; color: var(--dash-sub); font-size: 11px; font-weight: 800; }
        .admin-image-models__price-grid input { margin-top: 0; min-height: 36px; }
        .admin-image-models__price-hint { margin-top: 8px; }
        .admin-image-models__status { display: inline-flex; min-height: 28px; align-items: center; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 900; }
        .admin-image-models__status.on { color: #16a34a; background: rgba(22,163,74,.1); }
        .admin-image-models__status.off { color: #ef4444; background: rgba(239,68,68,.09); }
        @media (max-width: 840px) {
          .admin-image-models__hero, .admin-image-models__guide { display: grid; }
          .admin-image-models__actions, .admin-image-models__guide > div:last-child { justify-content: stretch; }
          .admin-image-models__stats, .admin-image-models__price-grid { grid-template-columns: 1fr; }
          .admin-image-models__guide a, .admin-image-models__actions button { width: 100%; }
        }
      `}</style>
    </>
  );
}
