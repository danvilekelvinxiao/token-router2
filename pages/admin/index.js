export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

function StatusDot({ status }) {
  const c = status === "正常" ? "#22c55e" : status === "异常" ? "#ef4444" : "#f59e0b";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block", marginRight: 6 }} />;
}

export default function AdminOverview() {
  const [secret, setSecret] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem("flowapi_admin_secret") || ""));
  const [stats, setStats] = useState([
    { label: "今日调用", value: "-" },
    { label: "今日 Token", value: "-" },
    { label: "今日收入", value: "-" },
    { label: "活跃用户", value: "-" },
  ]);
  const [channelStatus, setChannelStatus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = localStorage.getItem("flowapi_admin_secret") || "";
    fetchOverview(s);
  }, []);

  async function fetchOverview(sec) {
    setLoading(true);
    try {
      const [chRes] = await Promise.all([
        fetch("/api/admin/channels", { headers: { "x-admin-secret": sec } }),
      ]);
      if (chRes.ok) {
        const chData = await chRes.json();
        const channels = chData.channels || [];
        setChannelStatus(channels.map((ch) => ({
          name: ch.name,
          status: ch.status === "active" ? "正常" : "异常",
          latency: "-",
          uptime: ch.status === "active" ? "99.9%" : "-",
        })));
      }

      try {
        const logRes = await fetch(`/api/admin/logs?limit=0`, { headers: { "x-admin-secret": sec } });
        if (logRes.ok) {
          const logData = await logRes.json();
          setStats([
            { label: "今日调用", value: "-" },
            { label: "今日 Token", value: "-" },
            { label: "今日收入", value: "-" },
            { label: "记录总数", value: String(logData.total || 0) },
          ]);
        }
      } catch {}

      try {
        const userRes = await fetch("/api/admin/users", { headers: { "x-admin-secret": sec } });
        if (userRes.ok) {
          const userData = await userRes.json();
          const users = userData.customers || [];
          setStats((prev) => {
            const n = [...prev];
            n[3] = { label: "用户总数", value: String(users.length) };
            return n;
          });
        }
      } catch {}
    } catch {}
    setLoading(false);
  }

  const quickEntries = [
    { label: "新增渠道", href: "/admin/channels", color: "#6366f1" },
    { label: "查看用户", href: "/admin/users", color: "#8b5cf6" },
    { label: "调用日志", href: "/admin/logs", color: "#059669" },
    { label: "安全风控", href: "/admin/security", color: "#f59e0b" },
    { label: "计费规则", href: "/admin/billing-rules", color: "#3b82f6" },
    { label: "系统设置", href: "/admin/settings", color: "#ef4444" },
  ];

  return (
    <>
      <Head><title>管理概览 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>管理概览</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>FlowAPI 平台运行状态与关键指标</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="管理密钥" type="password" style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", width: 140 }} />
              <button onClick={() => { const s = secret.trim(); if (s) { localStorage.setItem("flowapi_admin_secret", s); fetchOverview(s); } }} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>刷新</button>
            </div>
          </header>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--dash-sub)" }}>加载中...</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
                {stats.map((s) => (
                  <div key={s.label} style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "18px 20px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: "'SF Mono', monospace" }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>上游渠道状态</h2>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", paddingBottom: 10, textTransform: "uppercase" }}>渠道</th>
                        <th style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", paddingBottom: 10, textTransform: "uppercase" }}>状态</th>
                        <th style={{ textAlign: "right", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", paddingBottom: 10, textTransform: "uppercase" }}>可用率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelStatus.map((ch) => (
                        <tr key={ch.name} style={{ borderTop: "1px solid var(--dash-border)" }}>
                          <td style={{ padding: "10px 0", fontSize: 13, fontWeight: 600 }}>{ch.name}</td>
                          <td style={{ padding: "10px 0", fontSize: 13 }}><StatusDot status={ch.status} />{ch.status}</td>
                          <td style={{ padding: "10px 0", fontSize: 13, fontFamily: "'SF Mono', monospace", textAlign: "right", color: "var(--dash-sub)" }}>{ch.uptime}</td>
                        </tr>
                      ))}
                      {channelStatus.length === 0 && (
                        <tr><td colSpan={3} style={{ padding: 20, textAlign: "center", color: "var(--dash-sub)" }}>暂无渠道数据</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>快捷入口</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {quickEntries.map((e) => (
                      <Link key={e.label} href={e.href} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderRadius: 8,
                        border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)",
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
            </>
          )}
        </div>
      </AdminLayout>
    </>
  );
}
