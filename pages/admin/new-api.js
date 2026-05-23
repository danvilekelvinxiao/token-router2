import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";

const NEW_API_ADMIN_URL =
  process.env.NEXT_PUBLIC_NEW_API_ADMIN_URL || "";

// Build internal admin links — the public URL is flowapi.fun, New API runs on same box port 3001
function getNewApiBaseUrl() {
  if (NEW_API_ADMIN_URL) return NEW_API_ADMIN_URL.replace(/\/+$/, "");
  // When hosted on the same server, use relative path to port 3001
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3001";
    return `http://${host}:3001`;
  }
  return "";
}

const NAV_CARDS = [
  {
    key: "dashboard",
    title: "New API 后台",
    desc: "打开 New API 主管理后台，查看概览与系统状态。",
    href: () => getNewApiBaseUrl(),
    icon: "⊡",
  },
  {
    key: "channels",
    title: "渠道管理",
    desc: "管理上游模型渠道（DeepSeek 官方、OpenRouter 等），配置 API Key 与模型列表。",
    href: () => `${getNewApiBaseUrl()}/channel`,
    icon: "⚡",
  },
  {
    key: "tokens",
    title: "令牌管理",
    desc: "查看和管理用户 API 令牌，调整额度、分组与模型限制。",
    href: () => `${getNewApiBaseUrl()}/token`,
    icon: "🔑",
  },
  {
    key: "logs",
    title: "使用日志",
    desc: "查看所有用户的 API 调用记录、Token 消耗与错误日志。",
    href: () => `${getNewApiBaseUrl()}/log`,
    icon: "📋",
  },
];

export default function AdminNewApiPage() {
  const [health, setHealth] = useState(null);
  const [testing, setTesting] = useState(false);
  const adminUrl = getNewApiBaseUrl();

  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/newapi/health");
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ status: "error", message: "无法连接 New API" });
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    void testConnection();
  }, []);

  const config = health?.config || {};

  return (
    <AdminLayout currentPath="/admin/new-api">
      <div className="admin-page-shell">
        <div className="admin-page-header">
          <h1>New API 管理</h1>
          <p className="admin-page-sub">
            New API 是 FlowAPI 的上游中转核心，渠道配置、上游模型、令牌和日志属于管理员功能，请谨慎操作。
          </p>
        </div>

        {!adminUrl ? (
          <div
            style={{
              padding: 24,
              borderRadius: 12,
              background: "var(--page-warning-bg)",
              color: "var(--page-warning-text)",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            未配置 New API 管理地址，请在环境变量 <code>NEXT_PUBLIC_NEW_API_ADMIN_URL</code> 中设置。
          </div>
        ) : (
          <>
            {/* Action cards — open New API in new tab */}
            <div className="admin-stat-grid" style={{ marginBottom: 28, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
              {NAV_CARDS.map((card) => (
                <button
                  key={card.key}
                  className="admin-stat-card"
                  style={{
                    cursor: "pointer",
                    textAlign: "left",
                    border: "1px solid var(--page-card-border)",
                    background: "var(--page-card-bg)",
                    borderRadius: 14,
                    padding: "20px 22px",
                    transition: "box-shadow 0.2s, transform 0.2s",
                  }}
                  onClick={() => window.open(card.href(), "_blank", "noopener,noreferrer")}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.08)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "";
                    e.currentTarget.style.transform = "";
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
                  <strong style={{ display: "block", fontSize: 15, marginBottom: 4, color: "var(--page-heading)" }}>
                    {card.title}
                  </strong>
                  <span style={{ fontSize: 13, color: "var(--page-sub)", lineHeight: 1.5 }}>
                    {card.desc}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--dash-accent, #6366f1)",
                    }}
                  >
                    打开 →
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Health check */}
        <div className="admin-section" style={{ marginBottom: 28 }}>
          <h2 className="admin-section-title">健康检查</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <button className="btn-primary" onClick={testConnection} disabled={testing}>
              {testing ? "检测中..." : "测试连接"}
            </button>
            {health && (
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: health.status === "ok" ? "var(--page-success-text)" : "var(--page-warning-text)",
                }}
              >
                {health.status === "ok" ? "● 在线" : `● ${health.message || "离线"}`}
                {health.latencyMs != null ? ` (${health.latencyMs}ms)` : ""}
              </span>
            )}
          </div>
          {health && (
            <div className="admin-info-block">
              <pre style={{ fontSize: 13, color: "var(--page-code-text)", background: "var(--page-code-bg)", padding: "12px 16px", borderRadius: 8, overflow: "auto", maxHeight: 200 }}>
                {JSON.stringify(health, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Status overview */}
        <div className="admin-stat-grid" style={{ marginBottom: 28 }}>
          <div className="admin-stat-card">
            <div className="admin-stat-label">管理员 Token</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>
              {config.hasAdminToken ? (
                <span style={{ color: "var(--page-success-text)" }}>已配置</span>
              ) : (
                <span style={{ color: "var(--page-warning-text)" }}>未配置</span>
              )}
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">默认分组</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>{config.defaultGroup || "default"}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">默认额度</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>{(config.defaultQuota || 0).toLocaleString()} Token</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export const dynamic = "force-dynamic";
