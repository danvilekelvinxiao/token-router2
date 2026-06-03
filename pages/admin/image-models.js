import Head from "next/head";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import ModelBrandIcon from "@/components/common/model-brand-icon";

export default function AdminImageModelsPage() {
  const [customer] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("flowapi_customer");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [models, setModels] = useState([]);
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      const response = await fetch("/api/admin/image-models");
      const json = await response.json();
      if (!cancelled) {
        const nextModels = Array.isArray(json.models) ? json.models : [];
        setModels(nextModels);
        setDrafts(Object.fromEntries(nextModels.map((item) => [item.id, {
          displayName: item.displayName || "",
          upstreamModel: item.upstreamModel || item.modelId || "",
          provider: item.provider || "openrouter",
          supportsTextToImage: item.supportsTextToImage !== false,
          supportsImageToImage: Boolean(item.supportsImageToImage),
          supportsBatch: Boolean(item.supportsBatch),
          unitPriceRmbTextToImage: item.unitPriceRmbTextToImage || 0,
          unitPriceRmbImageToImage: item.unitPriceRmbImageToImage || 0,
        }])));
      }
    }
    loadModels();
    return () => { cancelled = true; };
  }, []);

  async function toggleModel(model) {
    const response = await fetch("/api/admin/image-models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: model.id,
        updates: { enabled: !model.enabled },
      }),
    });
    const json = await response.json();
    if (json.model) {
      setModels((current) => current.map((item) => item.id === json.model.id ? json.model : item));
    }
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
          unitPriceRmbTextToImage: Number(draft.unitPriceRmbTextToImage || 0),
          unitPriceRmbImageToImage: Number(draft.unitPriceRmbImageToImage || 0),
        },
      }),
    });
    const json = await response.json();
    if (json.model) {
      setModels((current) => current.map((item) => item.id === json.model.id ? json.model : item));
      setDrafts((current) => ({ ...current, [json.model.id]: { ...draft, ...json.model } }));
    }
  }

  return (
    <>
      <Head><title>图片模型管理 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "管理员", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/admin">
        <main className="team-billing-page">
          <section className="image-history-head">
            <div>
              <span>Admin</span>
              <h1>图片模型管理</h1>
              <p>后台可以编辑显示名称、上游模型 ID、厂商、能力和价格；用户端展示 displayName，上游调用使用 modelId。</p>
            </div>
          </section>
          <div className="image-logs-table-wrap">
            <table className="image-logs-table">
              <thead>
                <tr>
                  <th>模型</th>
                  <th>显示名称</th>
                  <th>上游模型</th>
                  <th>厂商</th>
                  <th>文生图</th>
                  <th>图生图</th>
                  <th>批量</th>
                  <th>价格</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {models.map((item) => {
                  const draft = drafts[item.id] || {};
                  const logoModel = draft.upstreamModel || item.upstreamModel || item.displayName;
                  return (
                  <tr key={item.id}>
                    <td><ModelBrandIcon model={logoModel} provider={draft.provider || item.provider} size={30} /></td>
                    <td><input className="admin-image-model-input" value={draft.displayName || ""} onChange={(event) => updateDraft(item.id, "displayName", event.target.value)} /></td>
                    <td><input className="admin-image-model-input mono" value={draft.upstreamModel || ""} onChange={(event) => updateDraft(item.id, "upstreamModel", event.target.value)} /></td>
                    <td><input className="admin-image-model-input" value={draft.provider || ""} onChange={(event) => updateDraft(item.id, "provider", event.target.value)} /></td>
                    <td><input type="checkbox" checked={draft.supportsTextToImage !== false} onChange={(event) => updateDraft(item.id, "supportsTextToImage", event.target.checked)} /></td>
                    <td><input type="checkbox" checked={Boolean(draft.supportsImageToImage)} onChange={(event) => updateDraft(item.id, "supportsImageToImage", event.target.checked)} /></td>
                    <td><input type="checkbox" checked={Boolean(draft.supportsBatch)} onChange={(event) => updateDraft(item.id, "supportsBatch", event.target.checked)} /></td>
                    <td>
                      <div className="admin-image-model-price">
                        <input value={draft.unitPriceRmbTextToImage ?? ""} onChange={(event) => updateDraft(item.id, "unitPriceRmbTextToImage", event.target.value)} />
                        <input value={draft.unitPriceRmbImageToImage ?? ""} onChange={(event) => updateDraft(item.id, "unitPriceRmbImageToImage", event.target.value)} />
                      </div>
                    </td>
                    <td>{item.enabled ? "启用" : "停用"}</td>
                    <td>
                      <div className="admin-image-model-actions">
                        <button type="button" onClick={() => saveModel(item)}>保存</button>
                        <button type="button" onClick={() => toggleModel(item)}>{item.enabled ? "停用" : "启用"}</button>
                      </div>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </main>
      </ConsoleLayout>
    </>
  );
}
