import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { listModelProducts } from "@/lib/model-products";
import { MODEL_CATALOG } from "@/lib/models";
import { checkUpstreamHealth } from "@/lib/upstream";

const STATUS_COLORS = {
  available: { label: "可用", color: "#16a34a", bg: "rgba(22,163,74,0.1)" },
  testing: { label: "检测中", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  unavailable: { label: "暂不可用", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  coming_soon: { label: "即将开放", color: "#9ca3af", bg: "rgba(156,163,175,0.1)" },
};

export default function AdminModelsPage() {
  const [products, setProducts] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    setProducts(listModelProducts({ includeUnavailable: true }));
    setCatalog(MODEL_CATALOG);
    runHealthCheck();
  }, []);

  async function runHealthCheck() {
    setHealthLoading(true);
    try {
      const result = await fetch("/api/admin/newapi/health");
      const data = await result.json().catch(() => null);
      setHealth(data || { ok: false, message: "无法获取健康状态" });
    } catch {
      setHealth({ ok: false, message: "健康检查请求失败" });
    }
    setHealthLoading(false);
  }

  return (
    <>
      <Head><title>模型管理 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/models">
        <div className="redeem-admin-page">
          <header className="redeem-admin-header">
            <div>
              <h1>模型与上游管理</h1>
              <p>管理 UniAPI 上游渠道、模型列表、价格分组和前台开放状态。</p>
            </div>
            <div className="redeem-admin-actions">
              <button type="button" className="redeem-btn primary" onClick={runHealthCheck} disabled={healthLoading}>
                {healthLoading ? "检测中..." : "检测上游健康"}
              </button>
            </div>
          </header>

          {/* Health status */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 12px" }}>上游渠道状态</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {health?.upstreams?.map((up) => (
                <div key={up.upstream} style={{ padding: 16, border: "1px solid var(--dash-border)", borderRadius: 14, background: up.ok ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ color: "var(--dash-text)" }}>{up.upstream}</strong>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 800, background: up.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", color: up.ok ? "#16a34a" : "#ef4444" }}>
                      {up.ok ? "正常" : `HTTP ${up.statusCode || "错误"}`}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: 0 }}>{up.message}</p>
                </div>
              )) || (
                <p style={{ color: "var(--dash-sub)", fontSize: 13 }}>暂无上游状态数据，请点击"检测上游健康"。</p>
              )}
            </div>
          </div>

          {/* Model products */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 12px" }}>模型产品列表（大模型广场可见）</h3>
            <div className="redeem-table-wrap">
              <table className="redeem-table">
                <thead>
                  <tr>
                    <th>产品 ID</th>
                    <th>显示名称</th>
                    <th>public_model_id</th>
                    <th>actual_model_id</th>
                    <th>供应商</th>
                    <th>分组</th>
                    <th>状态</th>
                    <th>排序</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const status = p.isAvailable ? STATUS_COLORS.available : p.isComingSoon ? STATUS_COLORS.coming_soon : STATUS_COLORS.unavailable;
                    return (
                      <tr key={p.id}>
                        <td><code>{p.id}</code></td>
                        <td><strong>{p.displayName}</strong></td>
                        <td><code>{p.publicModelId}</code></td>
                        <td><code>{p.actualModelId || "未设置"}</code></td>
                        <td>{p.provider}</td>
                        <td>{p.group}</td>
                        <td><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: status.bg, color: status.color }}>{status.label}</span></td>
                        <td>{p.sortOrder}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Routing catalog */}
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 12px" }}>路由模型列表（API 调用匹配）</h3>
            <div className="redeem-table-wrap">
              <table className="redeem-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>modelId</th>
                    <th>actualModelId</th>
                    <th>供应商</th>
                    <th>输入价格 ¥/M</th>
                    <th>输出价格 ¥/M</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((m) => (
                    <tr key={m.key}>
                      <td><strong>{m.name}</strong></td>
                      <td><code>{m.modelId}</code></td>
                      <td><code>{m.actualModelId || "未设置"}</code></td>
                      <td>{m.provider}</td>
                      <td>¥{m.inputPrice}</td>
                      <td>¥{m.outputPrice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Environment variables */}
          <div style={{ marginTop: 32, padding: 20, border: "1px solid var(--dash-border)", borderRadius: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 12px" }}>需要配置的环境变量</h3>
            <p style={{ fontSize: 13, color: "var(--dash-sub)", marginBottom: 12 }}>在服务器 <code>.env</code> 中设置以下变量来控制模型开放状态：</p>
            <table className="redeem-table">
              <thead>
                <tr><th>环境变量</th><th>说明</th><th>示例</th></tr>
              </thead>
              <tbody>
                <tr><td><code>FLOWAPI_UNIAPI_CODEX_PLUS_AVAILABLE</code></td><td>开放 Codex Plus 模型</td><td>true</td></tr>
                <tr><td><code>FLOWAPI_CODEX_LITE_ACTUAL_MODEL</code></td><td>Codex Lite 上游模型 ID</td><td>gpt-5.3-codex</td></tr>
                <tr><td><code>FLOWAPI_UNIAPI_CODEX_LITE_AVAILABLE</code></td><td>开放 Codex Lite 模型</td><td>true</td></tr>
                <tr><td><code>FLOWAPI_UNIAPI_GPT55_AVAILABLE</code></td><td>开放 GPT-5.5 模型</td><td>true</td></tr>
                <tr><td><code>FLOWAPI_CLAUDE_SONNET_ACTUAL_MODEL</code></td><td>Claude Sonnet 上游模型 ID</td><td>claude-sonnet-4-20250514</td></tr>
                <tr><td><code>FLOWAPI_CLAUDE_SONNET_AVAILABLE</code></td><td>开放 Claude Sonnet</td><td>true</td></tr>
                <tr><td><code>FLOWAPI_CLAUDE_OPUS_ACTUAL_MODEL</code></td><td>Claude Opus 上游模型 ID</td><td>claude-opus-4-20250514</td></tr>
                <tr><td><code>FLOWAPI_CLAUDE_OPUS_AVAILABLE</code></td><td>开放 Claude Opus</td><td>true</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
