export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { formatApiMoney, formatRmb } from "@/lib/format/number-format";

function StatusDot({ status }) {
  const c = status === "正常" ? "#22c55e" : status === "异常" ? "#ef4444" : "#f59e0b";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block", marginRight: 6 }} />;
}

export default function AdminOverview() {
  const [stats, setStats] = useState([
    { label: "平台 $ API 总余额", value: "-" },
    { label: "今日充值", value: "-" },
    { label: "今日发放", value: "-" },
    { label: "今日消费", value: "-" },
    { label: "本月消费", value: "-" },
    { label: "待审核订单", value: "-" },
    { label: "累计充值人民币", value: "-" },
    { label: "累计发放 $ API", value: "-" },
  ]);
  const [channelStatus, setChannelStatus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
  }, []);

  async function fetchOverview() {
    setLoading(true);
    try {
      const [chRes] = await Promise.all([
        fetch("/api/admin/channels"),
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
        const walletRes = await fetch("/api/admin/wallet-stats");
        if (walletRes.ok) {
          const walletData = await walletRes.json();
          const wallet = walletData.stats || {};
          setStats([
            { label: "平台 $ API 总余额", value: formatApiMoney(wallet.platformApiBalance || 0) },
            { label: "今日充值", value: formatRmb(wallet.todayRechargeRmb || 0) },
            { label: "今日发放", value: formatApiMoney(wallet.todayGrantedApi || 0) },
            { label: "今日消费", value: formatApiMoney(wallet.todayConsumptionApi || 0) },
            { label: "本月消费", value: formatApiMoney(wallet.monthConsumptionApi || 0) },
            { label: "待审核订单", value: `${Number(wallet.pendingOrders || 0).toLocaleString()} 单` },
            { label: "累计充值人民币", value: formatRmb(wallet.totalRechargeRmb || 0) },
            { label: "累计发放 $ API", value: formatApiMoney(wallet.totalGrantedApi || 0) },
          ]);
        }
      } catch {}
    } catch {}
    setLoading(false);
  }

  const quickEntries = [
    { label: "新增渠道", href: "/admin/channels", color: "#6366f1" },
    { label: "毛利审计", href: "/admin/profit", color: "#16a34a" },
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
              <button onClick={() => fetchOverview()} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>刷新</button>
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
