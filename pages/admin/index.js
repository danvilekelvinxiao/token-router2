export const dynamic = "force-dynamic";
import Head from "next/head";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

const MOCK_STATS = [
  { label: "今日调用", value: "1,284", change: "+12%", up: true },
  { label: "今日 Token 消耗", value: "8.42M", change: "+8%", up: true },
  { label: "今日收入", value: "¥ 24.68", change: "+5%", up: true },
  { label: "今日毛利", value: "¥ 12.34", change: "+3%", up: true },
];

const MOCK_CHANNEL_STATUS = [
  { name: "DeepSeek 官方", status: "正常", latency: "320ms", uptime: "99.9%" },
  { name: "聚合路由", status: "正常", latency: "480ms", uptime: "99.7%" },
  { name: "阿里云模型", status: "异常", latency: "2.4s", uptime: "94.2%" },
  { name: "Together AI", status: "正常", latency: "260ms", uptime: "99.9%" },
];

const MOCK_QUICK_ENTRIES = [
  { label: "新增渠道", href: "/admin/channels", color: "#6366f1" },
  { label: "查看用户", href: "/admin/users", color: "#8b5cf6" },
  { label: "调用日志", href: "/admin/logs", color: "#059669" },
  { label: "安全风控", href: "/admin/security", color: "#f59e0b" },
  { label: "计费规则", href: "/admin/billing-rules", color: "#3b82f6" },
  { label: "系统设置", href: "/admin/settings", color: "#ef4444" },
];

function StatusDot({ status }) {
  const c = status === "正常" ? "#22c55e" : status === "异常" ? "#ef4444" : "#f59e0b";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block", marginRight: 6 }} />;
}

export default function AdminOverview() {
  return (
    <>
      <Head><title>管理后台 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>管理概览</h1>
            <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>FlowAPI 平台运行状态与关键指标</p>
          </header>

          {/* Stat Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
            {MOCK_STATS.map((s) => (
              <div key={s.label} style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: "'SF Mono', monospace" }}>{s.value}</div>
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: s.up ? "var(--dash-green)" : "var(--dash-red)" }}>{s.change} ↑</div>
              </div>
            ))}
          </div>

          {/* Channel Status + Quick Entry */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Channel Status */}
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>上游渠道状态</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", paddingBottom: 10, textTransform: "uppercase" }}>渠道</th>
                    <th style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", paddingBottom: 10, textTransform: "uppercase" }}>状态</th>
                    <th style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", paddingBottom: 10, textTransform: "uppercase" }}>延迟</th>
                    <th style={{ textAlign: "right", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", paddingBottom: 10, textTransform: "uppercase" }}>可用率</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_CHANNEL_STATUS.map((ch) => (
                    <tr key={ch.name} style={{ borderTop: "1px solid var(--dash-border)" }}>
                      <td style={{ padding: "10px 0", fontSize: 13, fontWeight: 600 }}>{ch.name}</td>
                      <td style={{ padding: "10px 0", fontSize: 13 }}><StatusDot status={ch.status} />{ch.status}</td>
                      <td style={{ padding: "10px 0", fontSize: 13, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>{ch.latency}</td>
                      <td style={{ padding: "10px 0", fontSize: 13, fontFamily: "'SF Mono', monospace", textAlign: "right", color: "var(--dash-sub)" }}>{ch.uptime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Quick Entry */}
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>快捷入口</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {MOCK_QUICK_ENTRIES.map((e) => (
                  <Link key={e.label} href={e.href} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderRadius: 8,
                    border: `1px solid var(--dash-border)`, background: "var(--dash-card-bg)",
                    textDecoration: "none", color: "var(--dash-text)", fontSize: 14, fontWeight: 700,
                    transition: "border-color 0.15s ease",
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, flex: "none" }} />
                    {e.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
