import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";

// New API admin pages are proxied via /newapi-admin/* → 127.0.0.1:8080/*

const NAV_CARDS = [
  {
    key: "dashboard",
    title: "New API 后台",
    desc: "打开 New API 主管理后台，查看概览与系统状态。",
    href: "/newapi-admin",
    icon: "⊡",
  },
  {
    key: "channels",
    title: "渠道管理",
    desc: "管理上游模型渠道（DeepSeek 官方、OpenRouter 等），配置 API Key 与模型列表。",
    href: "/newapi-admin/channel",
    icon: "⚡",
  },
  {
    key: "tokens",
    title: "API Key 管理",
    desc: "查看和管理用户 API Key，调整 Token 额度、分组与模型限制。",
    href: "/newapi-admin/token",
    icon: "🔑",
  },
  {
    key: "logs",
    title: "使用日志",
    desc: "查看所有用户的 API 调用记录、Token 消耗与错误日志。",
    href: "/newapi-admin/log",
    icon: "📋",
  },
];

export default function AdminNewApiPage() {
  const [health, setHealth] = useState(null);
  const [testing, setTesting] = useState(false);

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
    const timer = window.setTimeout(() => {
      void testConnection();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const config = health?.config || {};

  return (
    <AdminLayout currentPath="/admin/new-api">
      <div className="admin-page-shell">
        <div className="admin-page-header">
          <h1>New API 管理</h1>
          <p className="admin-page-sub">
            New API 是 FlowAPI 的上游中转核心，渠道配置、上游模型、API Key 和日志属于管理员功能，请谨慎操作。
          </p>
        </div>

        {/* Action cards — open New API via proxy path */}
        <div className="admin-stat-grid" style={{ marginBottom: 28, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {NAV_CARDS.map((card) => (
            <a
              key={card.key}
              href={card.href}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-stat-card"
              style={{
                cursor: "pointer",
                textAlign: "left",
                border: "1px solid var(--page-card-border)",
                background: "var(--page-card-bg)",
                borderRadius: 14,
                padding: "20px 22px",
                transition: "box-shadow 0.2s, transform 0.2s",
                textDecoration: "none",
                display: "block",
              }}
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
            </a>
          ))}
        </div>

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
            <div className="admin-stat-label">运行时 Key</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>
              {config.hasRuntimeKey ? (
                <span style={{ color: "var(--page-success-text)" }}>已配置</span>
              ) : (
                <span style={{ color: "var(--page-warning-text)" }}>未配置</span>
              )}
            </div>
          </div>
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
            <div className="admin-stat-label">默认 Token 额度</div>
            <div className="admin-stat-value" style={{ fontSize: 15 }}>{(config.defaultQuota || 0).toLocaleString()} Token</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export const dynamic = "force-dynamic";
