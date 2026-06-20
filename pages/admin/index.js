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
  const [stats, setStats] = useState([
    { label: "今日调用", value: "-" },
    { label: "今日 Token", value: "-" },
    { label: "今日收入", value: "-" },
    { label: "商业评分", value: "-" },
  ]);
  const [channelStatus, setChannelStatus] = useState([]);
  const [commercialHealth, setCommercialHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
  }, []);

  async function fetchOverview() {
    setLoading(true);
    try {
      const [chRes] = await Promise.all([
        fetch("/api/admin/channels", { credentials: "include" }),
      ]);
      if (chRes.ok) {
        const chData = await chRes.json();
        const channels = chData.channels || [];
        setChannelStatus(channels.map((ch) => ({
          name: ch.name,
          status: ch.status === "active" ? "正常" : "异常",
          latency: "-",
          uptime: ch.last_health_check_at ? "已检测" : "未检测",
        })));
      }

      try {
        const logRes = await fetch(`/api/admin/logs?limit=0`, { credentials: "include" });
        if (logRes.ok) {
          const logData = await logRes.json();
          setStats([
            { label: "今日调用", value: String(logData.todayCount || logData.today || "—") },
            { label: "今日 Token", value: logData.todayTokens ? String(Math.round(logData.todayTokens).toLocaleString()) : "—" },
            { label: "今日收入", value: logData.todayRevenue ? `¥${Number(logData.todayRevenue).toFixed(2)}` : "—" },
            { label: "记录总数", value: String(logData.total || 0) },
          ]);
        }
      } catch {}

      try {
        const userRes = await fetch("/api/admin/users", { credentials: "include" });
        if (userRes.ok) {
          const userData = await userRes.json();
          const users = userData.customers || [];
          setStats((prev) => {
            const n = [...prev];
            n[3] = { label: "商业评分", value: n[3]?.value || "—", note: `用户总数 ${users.length}` };
            return n;
          });
        }
      } catch {}

      try {
        const healthRes = await fetch("/api/admin/commercial-health", { credentials: "include" });
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setCommercialHealth(healthData);
          setStats((prev) => {
            const n = [...prev];
            n[3] = {
              label: "商业评分",
              value: `${healthData.score ?? 0}`,
              note: `正常 ${healthData.summary?.ok ?? 0} / 待确认 ${healthData.summary?.warn ?? 0} / 异常 ${healthData.summary?.fail ?? 0}`,
            };
            return n;
          });
        }
      } catch {}
    } catch {}
    setLoading(false);
  }

  const quickEntries = [
    { label: "商业闭环检查", href: "/admin/commercial-health", color: "#6366f1" },
  ];

  const topIssues = (commercialHealth?.checks || [])
    .filter((item) => item.level !== "ok")
    .slice(0, 3);

  return (
    <>
      <Head><title>管理概览 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>管理概览</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>FlowAPI 平台运行状态、商业评分和下一步动作</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => fetchOverview()} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>刷新</button>
            </div>
          </header>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--dash-sub)" }}>加载中...</div>
          ) : (
            <>
              {commercialHealth ? (
                <div style={{ marginBottom: 16, border: "1px solid var(--dash-border)", borderRadius: 14, padding: 18, background: "linear-gradient(180deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", color: "var(--dash-accent)", marginBottom: 8 }}>老板当前判断</div>
                      <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.02em" }}>
                        {Number(commercialHealth.score || 0) >= 85 ? "可以公开放量" : Number(commercialHealth.score || 0) >= 65 ? "适合灰度收费" : "仍需收敛后再放量"}
                      </div>
                      <div style={{ marginTop: 6, color: "var(--dash-sub)", fontSize: 13, lineHeight: 1.7 }}>
                        当前商业评分 {commercialHealth.score ?? 0}，正常 {commercialHealth.summary?.ok ?? 0} 项，待确认 {commercialHealth.summary?.warn ?? 0} 项，异常 {commercialHealth.summary?.fail ?? 0} 项。
                      </div>
                    </div>
                    <div style={{ minWidth: 240, padding: "12px 14px", borderRadius: 12, background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)" }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dash-sub)", marginBottom: 6 }}>下一步优先处理</div>
                      <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.6 }}>
                        {topIssues.length ? topIssues[0].label : "当前没有红黄项，继续做真实用户验证"}
                      </div>
                      {topIssues.length ? (
                        <div style={{ fontSize: 12, color: "var(--dash-sub)", marginTop: 6, lineHeight: 1.6 }}>
                          {topIssues[0].detail}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
                {stats.map((s) => (
                  <div key={s.label} style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "18px 20px", display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: "'SF Mono', monospace" }}>{s.value}</div>
                    {s.note ? <div style={{ fontSize: 12, color: "var(--dash-sub)", lineHeight: 1.5 }}>{s.note}</div> : null}
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

              {topIssues.length ? (
                <div style={{ marginTop: 16, display: "grid", gap: 10, background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "18px 20px" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>需要先处理的事项</h2>
                  <div style={{ display: "grid", gap: 8 }}>
                    {topIssues.map((item) => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "12px 0", borderTop: "1px solid var(--dash-border)" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800 }}>{item.label}</div>
                          <div style={{ marginTop: 4, color: "var(--dash-sub)", fontSize: 12, lineHeight: 1.6 }}>{item.detail}</div>
                        </div>
                        <div style={{ alignSelf: "center", fontSize: 12, fontWeight: 900, color: item.level === "fail" ? "#ef4444" : "#f59e0b" }}>
                          {item.level === "fail" ? "异常" : "待确认"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </AdminLayout>
    </>
  );
}
