import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import ModelLogo from "@/components/ModelLogo";
import CardDetailModal, { DetailRows, DetailTable } from "@/components/CardDetailModal";

const API_BASE_URL = "https://flowapi.fun/v1";

function maskToken(token = "") {
  if (!token || token.length <= 14) return "sk-******";
  const prefix = token.startsWith("sk-") ? "sk-" : "";
  const body = token.startsWith("sk-") ? token.slice(3) : token;
  return `${prefix}${body.slice(0, 4)}************${body.slice(-4)}`;
}

function formatDate(value) {
  if (!value) return "暂无记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatCny(value) {
  const number = Number(value || 0);
  if (number > 0 && number < 0.01) return `¥${number.toFixed(6)}`;
  return `¥${number.toFixed(2)}`;
}

function formatToken(value) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(2)}M Token`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K Token`;
  return `${number.toLocaleString("zh-CN")} Token`;
}

function keyStatus(key = {}) {
  if (key.disabledAt) return { label: "已禁用", tone: "danger" };
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return { label: "已过期", tone: "danger" };
  return { label: "已启用", tone: "success" };
}

function normalizeModel(model = {}) {
  return {
    id: model.id || model.modelId || model.displayName,
    displayName: model.displayName || model.name || "Unknown Model",
    modelId: model.modelId || model.publicModelId || "",
    provider: model.provider || "FlowAPI",
    description: model.description || "模型介绍同步中。",
    enabled: model.enabled !== false,
    isMemberOnly: Boolean(model.isMemberOnly),
    primaryButtonHref: model.primaryButtonHref || "/api-management",
  };
}

export default function ApiManagementPage() {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");
  const [detail, setDetail] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stored = localStorage.getItem("flowapi_customer");
    if (!stored) {
      window.location.href = "/login";
      return undefined;
    }
    let localCustomer = null;
    try { localCustomer = JSON.parse(stored); } catch { window.location.href = "/login"; return undefined; }
    queueMicrotask(() => setCustomer(localCustomer));
    Promise.all([
      fetch(`/api/customer?customerId=${localCustomer.id}`).then((res) => res.ok ? res.json() : localCustomer),
      fetch("/api/content/models").then((res) => res.ok ? res.json() : { data: [] }),
    ]).then(([freshCustomer, modelJson]) => {
      if (cancelled) return;
      setCustomer(freshCustomer);
      localStorage.setItem("flowapi_customer", JSON.stringify(freshCustomer));
      const list = (modelJson.data || modelJson.models || []).map(normalizeModel).filter((model) => model.enabled);
      setModels(list);
      setSelectedModelId((current) => current || list[0]?.modelId || "");
    }).catch(() => {
      if (!cancelled) setToast("数据同步中，请稍后刷新。");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const apiKeys = useMemo(() => customer?.apiKeys || [], [customer?.apiKeys]);
  const selectedModel = useMemo(() => models.find((model) => model.modelId === selectedModelId) || models[0] || null, [models, selectedModelId]);
  const filteredKeys = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return apiKeys;
    return apiKeys.filter((key) => [key.label, key.publicModelId, key.modelDisplayName, key.modelGroup].some((value) => String(value || "").toLowerCase().includes(text)));
  }, [apiKeys, query]);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  async function copyText(value, label = "已复制") {
    await navigator.clipboard.writeText(String(value || ""));
    showToast(label);
  }

  async function refreshCustomer() {
    if (!customer?.id) return;
    const res = await fetch(`/api/customer?customerId=${customer.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setCustomer(data);
    localStorage.setItem("flowapi_customer", JSON.stringify(data));
  }

  async function createKey() {
    if (!selectedModel?.modelId || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          modelId: selectedModel.modelId,
          label: `${selectedModel.displayName} Key`,
          expiresAt: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || "创建失败");
      const updated = data.customer || data;
      setCustomer(updated);
      localStorage.setItem("flowapi_customer", JSON.stringify(updated));
      showToast("API Key 已创建，请立即复制保存");
    } catch (error) {
      showToast(error.message || "创建失败，请稍后重试");
    } finally {
      setCreating(false);
    }
  }

  async function toggleKey(key) {
    const disabled = !key.disabledAt;
    const res = await fetch("/api/keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id, keyId: key.id, disabled }),
    });
    if (res.ok) {
      await refreshCustomer();
      showToast(disabled ? "API Key 已禁用" : "API Key 已启用");
    } else {
      showToast("操作失败，请稍后重试");
    }
  }

  async function deleteKey(key) {
    if (!window.confirm(`确认删除 ${key.label || "这个 API Key"}？删除后无法恢复。`)) return;
    const res = await fetch("/api/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id, keyId: key.id }),
    });
    if (res.ok) {
      await refreshCustomer();
      showToast("API Key 已删除");
    } else {
      showToast("删除失败，请稍后重试");
    }
  }

  async function openUsage(key) {
    setUsageLoading(true);
    setDetail({
      title: key.label || "API Key 详情",
      description: "正在同步该 API Key 的真实调用数据。",
      badge: "API Key",
      sections: [{ title: "加载中", content: <p className="api-management-empty-text">正在读取真实调用记录...</p> }],
    });
    try {
      const res = await fetch(`/api/newapi/keys/${encodeURIComponent(key.id)}/usage`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "同步失败");
      const rows = [
        { label: "API Key", value: data.key?.maskedKey || maskToken(key.token) },
        { label: "绑定模型", value: key.modelDisplayName || key.publicModelId || "未绑定模型" },
        { label: "Base URL", value: API_BASE_URL },
        { label: "创建时间", value: formatDate(key.createdAt) },
        { label: "最近调用", value: formatDate(data.key?.lastUsedAt || key.lastUsedAt) },
        { label: "状态", value: keyStatus(key).label },
      ];
      const summaryRows = data.summary ? [
        { label: "总请求", value: `${data.summary.totalRequests} 次` },
        { label: "总 Token", value: formatToken(data.summary.totalTokens) },
        { label: "总消耗", value: formatCny(data.summary.totalSpendCny) },
        { label: "成功率", value: `${data.summary.successRate}%` },
      ] : [];
      setDetail({
        title: key.label || "API Key 详情",
        description: data.source === "empty" ? "暂无真实调用记录。完成一次模型调用后，这里会展示 Token、金额、模型和扣费来源。" : "基于该 API Key 的真实调用记录生成。",
        badge: data.source === "real" ? "真实数据" : "暂无数据",
        sections: [
          { title: "接入参数", content: <DetailRows rows={rows} /> },
          ...(summaryRows.length ? [{ title: "使用汇总", content: <DetailRows rows={summaryRows} /> }] : []),
          {
            title: "最近调用",
            content: data.recentCalls?.length ? (
              <DetailTable
                columns={[
                  { key: "createdAt", label: "时间" },
                  { key: "model", label: "模型" },
                  { key: "totalTokens", label: "Token" },
                  { key: "costCny", label: "消耗" },
                  { key: "status", label: "状态" },
                ]}
                rows={data.recentCalls.slice(0, 8).map((call) => ({
                  ...call,
                  createdAt: formatDate(call.createdAt),
                  totalTokens: formatToken(call.totalTokens),
                  costCny: formatCny(call.costCny),
                  status: call.status === "success" ? "成功" : call.status === "failed" ? "失败" : "同步中",
                }))}
              />
            ) : <p className="api-management-empty-text">暂无调用记录，不显示假数据。</p>,
          },
        ],
      });
    } catch (error) {
      setDetail({
        title: key.label || "API Key 详情",
        description: "调用数据暂时无法同步。",
        badge: "同步中",
        sections: [{ title: "提示", content: <p className="api-management-empty-text">{error.message || "请稍后重试。"}</p> }],
      });
    } finally {
      setUsageLoading(false);
    }
  }

  if (!customer) {
    return (
      <main className="landing-shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--page-sub)" }}>加载中...</p>
      </main>
    );
  }

  return (
    <>
      <Head><title>API 管理 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer} currentPath="/api-management">
        <main className="api-management-page">
          <section className="api-management-hero">
            <div>
              <span>API KEY CONSOLE</span>
              <h1>API 管理</h1>
              <p>先选模型，再创建专属 API Key。复制 Base URL、API Key 和 Model ID 后即可接入 CC-Switch、Cherry Studio、Chatbox 或代码项目。</p>
            </div>
            <Link href="/models">去选择大模型</Link>
          </section>

          <section className="api-management-quickstart">
            <div>
              <span>Base URL</span>
              <code>{API_BASE_URL}</code>
              <button type="button" onClick={() => copyText(API_BASE_URL, "Base URL 已复制")}>复制</button>
            </div>
            <div>
              <span>当前模型</span>
              <code>{selectedModel?.modelId || "模型同步中"}</code>
              <button type="button" disabled={!selectedModel?.modelId} onClick={() => copyText(selectedModel.modelId, "Model ID 已复制")}>复制</button>
            </div>
            <div>
              <span>下一步</span>
              <strong>{apiKeys.length ? "复制已有 API Key 或创建新 Key" : "创建第一个 API Key"}</strong>
              <small>API Key 默认脱敏展示，完整值只在复制时使用。</small>
            </div>
          </section>

          <section className="api-management-create-card">
            <div className="api-management-card-head">
              <div>
                <span>CREATE API KEY</span>
                <h2>选择模型创建 API Key</h2>
                <p>每个 Key 绑定一个模型，后续账单、扣费来源和调用记录更容易看懂。</p>
              </div>
              <button type="button" className="btn-primary" disabled={!selectedModel || creating || loading} onClick={createKey}>{creating ? "创建中..." : "创建 API Key"}</button>
            </div>
            <div className="api-management-model-grid">
              {models.slice(0, 8).map((model) => (
                <button key={model.id} type="button" className={selectedModelId === model.modelId ? "selected" : ""} onClick={() => setSelectedModelId(model.modelId)}>
                  <ModelLogo model={model.displayName} provider={model.provider} size={34} />
                  <strong>{model.displayName}</strong>
                  <span>by {model.provider}</span>
                  <code>{model.modelId || "同步中"}</code>
                </button>
              ))}
              {!models.length && !loading ? <div className="api-management-empty-text">模型配置同步中，请稍后刷新或到大模型接入页查看。</div> : null}
            </div>
          </section>

          <section className="api-management-key-panel">
            <div className="api-management-panel-head">
              <div>
                <span>YOUR API KEYS</span>
                <h2>我的 API Key</h2>
                <p>点击卡片查看真实调用、Token 消耗、扣费来源和最近使用时间。</p>
              </div>
              <label>
                <span>搜索</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Key / 模型" />
              </label>
            </div>

            <div className="api-management-key-grid">
              {filteredKeys.map((key) => {
                const status = keyStatus(key);
                return (
                  <article key={key.id} className={`api-management-key-card tone-${status.tone}`} onClick={() => openUsage(key)} role="button" tabIndex={0}>
                    <div className="api-key-card-top">
                      <div>
                        <strong>{key.label || "未命名 API Key"}</strong>
                        <span>{key.modelDisplayName || key.publicModelId || "未绑定模型"}</span>
                      </div>
                      <em>{status.label}</em>
                    </div>
                    <code>{maskToken(key.token)}</code>
                    <div className="api-key-card-meta">
                      <span>Model ID：{key.publicModelId || "同步中"}</span>
                      <span>最近使用：{formatDate(key.lastUsedAt)}</span>
                    </div>
                    <div className="api-key-card-actions" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => copyText(key.token, "API Key 已复制")}>复制 API Key</button>
                      <button type="button" onClick={() => copyText(key.publicModelId || "", "Model ID 已复制")} disabled={!key.publicModelId}>复制 Model ID</button>
                      <button type="button" onClick={() => toggleKey(key)}>{key.disabledAt ? "启用" : "禁用"}</button>
                      <button type="button" className="danger" onClick={() => deleteKey(key)}>删除</button>
                    </div>
                  </article>
                );
              })}
            </div>

            {!filteredKeys.length ? (
              <div className="api-management-empty">
                <strong>暂无 API Key</strong>
                <p>先选择一个模型并创建 API Key。完成真实调用后，这里会展示每个 Key 的 Token 消耗和扣费来源。</p>
                <button type="button" onClick={createKey} disabled={!selectedModel || creating}>{creating ? "创建中..." : "创建第一个 API Key"}</button>
              </div>
            ) : null}
          </section>
        </main>
      </ConsoleLayout>

      <CardDetailModal open={Boolean(detail)} onClose={() => setDetail(null)} {...(detail || {})} actions={usageLoading ? null : <Link href="/help">查看接入教程</Link>} />
      {toast ? <div className="models-toast-v3">{toast}</div> : null}
    </>
  );
}
