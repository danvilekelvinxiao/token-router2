import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";

export default function AdminNewApiPage() {
  const [health, setHealth] = useState(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);

  async function testConnection() {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/newapi/health");
      const data = await res.json();
      setHealth(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void testConnection();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const config = health?.config || {};
  const isOnline = health?.ok === true;

  return (
    <AdminLayout>
      <div className="admin-page-shell">
        <div className="admin-page-header">
          <h1>New API 中转内核配置</h1>
          <p className="admin-page-sub">管理上游 New API 服务连接与状态</p>
        </div>

        {/* Status cards */}
        <div className="admin-stat-grid" style={{ marginBottom: 28 }}>
          <div className="admin-stat-card">
            <div className="admin-stat-label">New API 服务地址</div>
            <div className="admin-stat-value" style={{ fontSize: 15, wordBreak: "break-all" }}>
              {config.baseUrl || "—"}
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">用户调用地址</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>
              https://flowapi.fun/v1
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">管理员 Token</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>
              {config.hasAdminToken ? (
                <span style={{ color: "var(--page-success-text)" }}>已配置</span>
              ) : (
                <span style={{ color: "var(--page-warning-text)" }}>未配置（Mock 模式）</span>
              )}
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">默认用户分组</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>
              {config.defaultGroup || "default"}
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">注册赠送额度</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>
              {(config.defaultQuota || 0).toLocaleString()} Token
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">连接状态</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>
              {testing ? (
                "测试中..."
              ) : isOnline ? (
                <span style={{ color: "var(--page-success-text)" }}>在线</span>
              ) : (
                <span style={{ color: "var(--page-warning-text)" }}>
                  {health?.error || "离线"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Test connection button */}
        <div className="admin-section" style={{ marginBottom: 28 }}>
          <h2 className="admin-section-title">连接测试</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button
              className="btn-primary"
              onClick={testConnection}
              disabled={testing}
            >
              {testing ? "测试中..." : "测试连接"}
            </button>
            {error && (
              <span style={{ color: "var(--page-warning-text)", fontSize: 14 }}>
                错误: {error}
              </span>
            )}
          </div>
          {health && (
            <div className="admin-info-block" style={{ marginTop: 16 }}>
              <pre style={{ fontSize: 13, color: "var(--page-code-text)", background: "var(--page-code-bg)", padding: "12px 16px", borderRadius: 8, overflow: "auto" }}>
                {JSON.stringify(health, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Token list mock info */}
        <div className="admin-section">
          <h2 className="admin-section-title">API 说明</h2>
          <div className="admin-info-block">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>接口</th>
                  <th>方法</th>
                  <th>说明</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>/api/newapi/health</code></td>
                  <td>GET</td>
                  <td>测试 New API 服务连接状态</td>
                  <td style={{ color: "var(--page-success-text)" }}>已上线</td>
                </tr>
                <tr>
                  <td><code>/api/newapi/tokens/create</code></td>
                  <td>POST</td>
                  <td>创建用户 API Key（sk- 开头）</td>
                  <td style={{ color: "var(--page-warning-text)" }}>
                    {config.hasAdminToken ? "已上线" : "Mock"}
                  </td>
                </tr>
                <tr>
                  <td><code>/api/newapi/usage</code></td>
                  <td>GET</td>
                  <td>获取用户 Token 用量数据</td>
                  <td style={{ color: "var(--page-warning-text)" }}>
                    {config.hasAdminToken ? "已上线" : "Mock"}
                  </td>
                </tr>
                <tr>
                  <td><code>/api/newapi/quota/recharge</code></td>
                  <td>POST</td>
                  <td>充值后同步用户额度到 New API</td>
                  <td style={{ color: "var(--page-warning-text)" }}>
                    {config.hasAdminToken ? "已上线" : "Mock"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export const dynamic = "force-dynamic";
