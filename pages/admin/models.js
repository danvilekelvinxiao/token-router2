import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { checkUpstreamHealth } from "@/lib/upstream";

const STATUS_STYLES = {
  available: { label: "可用", color: "#16a34a", bg: "rgba(22,163,74,0.1)" },
  testing: { label: "检测中", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  unavailable: { label: "暂不可用", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  coming_soon: { label: "即将开放", color: "#9ca3af", bg: "rgba(156,163,175,0.1)" },
};

export default function AdminModelsPage() {
  const [products, setProducts] = useState([]);
  const [upstreamModels, setUpstreamModels] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testingModel, setTestingModel] = useState("");
  const [togglingModel, setTogglingModel] = useState("");
  const [errorModal, setErrorModal] = useState(null);
  const [toast, setToast] = useState("");
  const [syncResult, setSyncResult] = useState(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function loadData() {
    setLoading(true);
    try {
      const [configRes, healthRes] = await Promise.all([
        fetch("/api/admin/models-config"),
        fetch("/api/admin/newapi/health"),
      ]);
      const configData = await configRes.json().catch(() => ({}));
      const healthData = await healthRes.json().catch(() => null);
      setProducts(configData.products || []);
      setUpstreamModels(configData.upstreamModels || []);
      setHealth(healthData);
    } catch {
      showToast("加载数据失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  async function syncUniApi() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync-uniapi-models", { method: "POST" });
      const data = await res.json().catch(() => null);
      setSyncResult(data);
      if (data?.ok) {
        showToast(data.message || `同步完成：${data.total || 0} 个模型`);
        await loadData();
      } else {
        showToast(data?.error || "同步失败");
      }
    } catch {
      showToast("同步请求失败");
    }
    setSyncing(false);
  }

  async function healthCheckModel(productId, actualModelId) {
    setTestingModel(productId);
    try {
      const res = await fetch("/api/admin/health-check-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: productId, actualModelId }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        showToast(`${data.modelId} 健康检查通过 (${data.latencyMs}ms)`);
      } else {
        showToast(`${data?.modelId || productId}: ${data?.error || "检测失败"}`);
      }
      await loadData();
    } catch {
      showToast("健康检查请求失败");
    }
    setTestingModel("");
  }

  async function toggleModel(productId, currentAvailable) {
    setTogglingModel(productId);
    try {
      const res = await fetch("/api/admin/models-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          updates: {
            isAvailable: !currentAvailable,
            statusLabel: currentAvailable ? "即将开放" : "可用",
            status: currentAvailable ? "coming_soon" : "available",
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        showToast(`${productId} ${currentAvailable ? "已禁用" : "已启用"}`);
        await loadData();
      } else {
        showToast(data?.error || "操作失败");
      }
    } catch {
      showToast("操作失败");
    }
    setTogglingModel("");
  }

  async function runAllHealthChecks() {
    const availableProducts = products.filter(
      (p) => p.actualModelId && String(p.actualModelId).trim() !== ""
    );
    if (availableProducts.length === 0) {
      showToast("没有配置 actual_model_id 的模型可检测");
      return;
    }
    showToast(`开始检测 ${availableProducts.length} 个模型...`);
    for (const p of availableProducts) {
      await healthCheckModel(p.id, p.actualModelId);
    }
    showToast("全部健康检查完成");
  }

  const statusStyle = (p) => {
    if (p.isAvailable) return STATUS_STYLES.available;
    if (p.isComingSoon) return STATUS_STYLES.coming_soon;
    return STATUS_STYLES.unavailable;
  };

  if (loading) {
    return (
      <AdminLayout currentPath="/admin/models">
        <p style={{ padding: 32, color: "var(--dash-sub)" }}>加载中...</p>
      </AdminLayout>
    );
  }

  return (
    <>
      <Head><title>模型管理 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/models">
        <div className="redeem-admin-page">
          <header className="redeem-admin-header">
            <div>
              <h1>模型诊断与管理</h1>
              <p>管理模型状态、同步 UniAPI 上游、健康检查、启用/禁用模型。</p>
            </div>
            <div className="redeem-admin-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="redeem-btn primary" onClick={syncUniApi} disabled={syncing}>
                {syncing ? "同步中..." : "同步 UniAPI 模型列表"}
              </button>
              <button type="button" className="redeem-btn secondary" onClick={runAllHealthChecks} disabled={testingModel}>
                全部健康检查
              </button>
            </div>
          </header>

          {/* Sync result */}
          {syncResult && (
            <div style={{ padding: 16, marginBottom: 16, borderRadius: 12, background: syncResult.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${syncResult.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
              <strong style={{ color: syncResult.ok ? "#16a34a" : "#ef4444" }}>{syncResult.ok ? "同步成功" : "同步失败"}</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dash-sub)" }}>{syncResult.message || syncResult.error}</p>
              {syncResult.models?.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12 }}>查看 {syncResult.total} 个模型</summary>
                  <div style={{ maxHeight: 200, overflow: "auto", marginTop: 4 }}>
                    {syncResult.models.map((m) => (
                      <code key={m.actualModelId} style={{ display: "block", fontSize: 11, padding: "2px 0" }}>{m.actualModelId} ({m.displayName})</code>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Upstream models count */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 8px" }}>
              上游模型概览
            </h3>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ padding: "12px 20px", borderRadius: 10, background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", minWidth: 140 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "var(--dash-text)" }}>{upstreamModels.length}</div>
                <div style={{ fontSize: 12, color: "var(--dash-sub)" }}>已同步上游模型</div>
              </div>
              <div style={{ padding: "12px 20px", borderRadius: 10, background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", minWidth: 140 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#16a34a" }}>{products.filter((p) => p.isAvailable).length}</div>
                <div style={{ fontSize: 12, color: "var(--dash-sub)" }}>可用模型</div>
              </div>
              <div style={{ padding: "12px 20px", borderRadius: 10, background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", minWidth: 140 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#ef4444" }}>{products.filter((p) => !p.actualModelId || String(p.actualModelId).trim() === "").length}</div>
                <div style={{ fontSize: 12, color: "var(--dash-sub)" }}>缺少 actual_model_id</div>
              </div>
              <div style={{ padding: "12px 20px", borderRadius: 10, background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", minWidth: 140 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#9ca3af" }}>{products.filter((p) => p.isComingSoon && !p.isAvailable).length}</div>
                <div style={{ fontSize: 12, color: "var(--dash-sub)" }}>即将开放</div>
              </div>
            </div>
          </div>

          {/* Model diagnostics table */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 12px" }}>模型诊断</h3>
            <div className="redeem-table-wrap">
              <table className="redeem-table">
                <thead>
                  <tr>
                    <th>public_model_id</th>
                    <th>actual_model_id</th>
                    <th>供应商</th>
                    <th>上游渠道</th>
                    <th>分组</th>
                    <th>状态</th>
                    <th>可用</th>
                    <th>可创建 Key</th>
                    <th>最后检测</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const st = statusStyle(p);
                    return (
                      <tr key={p.id}>
                        <td><code style={{ fontSize: 11 }}>{p.publicModelId}</code></td>
                        <td>
                          <code style={{ fontSize: 11, color: p.actualModelId ? "var(--dash-text)" : "#ef4444" }}>
                            {p.actualModelId || "未设置"}
                          </code>
                        </td>
                        <td>{p.provider}</td>
                        <td>{p.upstreamChannel || "uniapi"}</td>
                        <td><code style={{ fontSize: 11 }}>{p.group}</code></td>
                        <td>
                          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
                            {p.statusLabel || st.label}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: p.isAvailable ? "#16a34a" : "#ef4444", fontWeight: 700 }}>
                            {p.isAvailable ? "是" : "否"}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: p.canCreateKey !== false ? "#16a34a" : "#9ca3af", fontWeight: 700 }}>
                            {p.canCreateKey !== false ? "是" : "否"}
                          </span>
                        </td>
                        <td style={{ fontSize: 11 }}>
                          {p.lastHealthCheckAt ? new Date(p.lastHealthCheckAt).toLocaleString("zh-CN") : "从未"}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="redeem-btn small"
                              style={{ fontSize: 11, padding: "2px 8px" }}
                              disabled={testingModel === p.id || !p.actualModelId}
                              onClick={() => healthCheckModel(p.id, p.actualModelId)}
                            >
                              {testingModel === p.id ? "检测中..." : "测试"}
                            </button>
                            {p.lastError && (
                              <button
                                type="button"
                                className="redeem-btn small"
                                style={{ fontSize: 11, padding: "2px 8px", background: "rgba(239,68,68,0.08)", color: "#ef4444" }}
                                onClick={() => setErrorModal({ model: p.displayName, error: p.lastError })}
                              >
                                错误
                              </button>
                            )}
                            <button
                              type="button"
                              className="redeem-btn small"
                              style={{ fontSize: 11, padding: "2px 8px" }}
                              disabled={togglingModel === p.id}
                              onClick={() => toggleModel(p.id, p.isAvailable)}
                            >
                              {togglingModel === p.id ? "..." : p.isAvailable ? "禁用" : "启用"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Upstream models list */}
          {upstreamModels.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 12px" }}>已同步上游模型 ({upstreamModels.length})</h3>
              <div className="redeem-table-wrap">
                <table className="redeem-table">
                  <thead>
                    <tr>
                      <th>actual_model_id</th>
                      <th>显示名称</th>
                      <th>供应商</th>
                      <th>渠道</th>
                      <th>检测状态</th>
                      <th>同步时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upstreamModels.map((m) => (
                      <tr key={m.id}>
                        <td><code style={{ fontSize: 11 }}>{m.actualModelId}</code></td>
                        <td>{m.displayName}</td>
                        <td>{m.provider}</td>
                        <td>{m.upstreamChannel}</td>
                        <td>
                          <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 11, background: m.isDetected ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: m.isDetected ? "#16a34a" : "#ef4444" }}>
                            {m.isDetected ? "已检测" : "未检测"}
                          </span>
                        </td>
                        <td style={{ fontSize: 11 }}>{m.lastSyncedAt ? new Date(m.lastSyncedAt).toLocaleString("zh-CN") : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Environment variables */}
          <div style={{ padding: 20, border: "1px solid var(--dash-border)", borderRadius: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 12px" }}>环境变量参考</h3>
            <table className="redeem-table">
              <thead>
                <tr><th>环境变量</th><th>说明</th></tr>
              </thead>
              <tbody>
                <tr><td><code>UNIAPI_API_KEY</code></td><td>UniAPI API Key（服务器端，不暴露前端）</td></tr>
                <tr><td><code>FLOWAPI_CLAUDE_SONNET_ACTUAL_MODEL</code></td><td>Claude Sonnet 上游模型 ID</td></tr>
                <tr><td><code>FLOWAPI_CLAUDE_OPUS_ACTUAL_MODEL</code></td><td>Claude Opus 上游模型 ID</td></tr>
                <tr><td><code>FLOWAPI_UNIAPI_CODEX_PLUS_AVAILABLE</code></td><td>开放 Codex Plus</td></tr>
                <tr><td><code>FLOWAPI_UNIAPI_GPT55_AVAILABLE</code></td><td>开放 GPT-5.5</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Error modal */}
        {errorModal && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setErrorModal(null); }}>
            <div className="modal" style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <h2>错误详情 — {errorModal.model}</h2>
                <button type="button" className="modal-close" onClick={() => setErrorModal(null)}>×</button>
              </div>
              <div className="modal-body">
                <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#ef4444", background: "rgba(239,68,68,0.04)", padding: 12, borderRadius: 8 }}>{errorModal.error}</pre>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setErrorModal(null)}>关闭</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="models-toast" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>{toast}</div>
        )}
      </AdminLayout>
    </>
  );
}
