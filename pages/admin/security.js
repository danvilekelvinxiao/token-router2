export const dynamic = "force-dynamic";
import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";

const MOCK_BLACKLIST = [
  { id: "bl_1", type: "IP", value: "103.45.67.89", reason: "高频暴力调用", addedAt: "2026-05-15 14:22", status: "active" },
  { id: "bl_2", type: "IP", value: "45.33.32.156", reason: "疑似爬虫行为", addedAt: "2026-05-16 09:10", status: "active" },
  { id: "bl_3", type: "密匙", value: "sk-abc123****", reason: "密匙泄露", addedAt: "2026-05-17 22:05", status: "active" },
];

const MOCK_RISK_RULES = [
  { id: "rr_1", name: "单 IP 高频请求拦截", condition: "60秒内 > 120 次请求", action: "临时封禁 30 分钟", enabled: true },
  { id: "rr_2", name: "异常错误码连续触发封禁", condition: "5分钟内 429/500 > 50 次", action: "封禁 1 小时 + 通知", enabled: true },
  { id: "rr_3", name: "短时间大量 Token 消耗预警", condition: "10分钟内 > 1M Token", action: "标记预警 + 限速", enabled: true },
  { id: "rr_4", name: "同一 API 密匙多地调用预警", condition: "30分钟内 > 3 个不同 IP", action: "标记 + 通知用户", enabled: false },
  { id: "rr_5", name: "疑似密匙泄露提醒", condition: "异常来源调用模式匹配", action: "自动禁用 API 密匙 + 邮件通知", enabled: true },
  { id: "rr_6", name: "余额异常消耗提醒", condition: "1小时消耗 > 账户余额 80%", action: "通知 + 建议充值", enabled: true },
];

const MOCK_RISK_EVENTS = [
  { id: "ev_1", time: "2026-05-18 10:32:15", type: "高频请求", user: "Test Bot", detail: "IP 103.45.67.89 在 60 秒内发起 287 次请求", level: "high", handled: true },
  { id: "ev_2", time: "2026-05-18 09:15:08", type: "密匙泄露", user: "Li Ming", detail: "API 密匙 sk-abc123 在 3 个国家同时被调用", level: "critical", handled: true },
  { id: "ev_3", time: "2026-05-18 08:44:51", type: "Token 异常", user: "Zhang Wei", detail: "10 分钟内消耗 2.8M Token，远超日常均值", level: "medium", handled: false },
];

function LevelBadge({ level }) {
  const map = { high: { label: "高", color: "#ef4444" }, critical: { label: "严重", color: "#dc2626" }, medium: { label: "中", color: "#f59e0b" }, low: { label: "低", color: "#22c55e" } };
  const s = map[level] || map.medium;
  return <span style={{ padding: "3px 10px", borderRadius: 999, background: s.color + "18", color: s.color, fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

export default function AdminSecurity() {
  return (
    <>
      <Head><title>管理后台 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/security">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>安全风控</h1>
            <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理黑名单、风控规则和风险事件处理</p>
          </header>

          {/* Blacklist */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dash-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>黑名单管理</h2>
              <button style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 加入黑名单</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead><tr style={{ background: "var(--dash-card-hover)" }}><th style={thS}>类型</th><th style={thS}>值</th><th style={thS}>原因</th><th style={thS}>添加时间</th><th style={thS}>操作</th></tr></thead>
                <tbody>
                  {MOCK_BLACKLIST.map((b) => (
                    <tr key={b.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                      <td style={tdS}><span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: b.type === "IP" ? "rgba(99,102,241,0.1)" : "rgba(245,158,11,0.1)", color: b.type === "IP" ? "#6366f1" : "#f59e0b" }}>{b.type}</span></td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{b.value}</td>
                      <td style={tdS}>{b.reason}</td>
                      <td style={{ ...tdS, color: "var(--dash-sub)" }}>{b.addedAt}</td>
                      <td style={tdS}><button style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>移除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Risk Rules + Events */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Risk Rules */}
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>风控规则</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {MOCK_RISK_RULES.map((r) => (
                  <div key={r.id} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--dash-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</span>
                      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: r.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: r.enabled ? "#22c55e" : "var(--dash-sub)" }}>{r.enabled ? "开" : "关"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--dash-sub)", margin: "4px 0" }}>{r.condition}</div>
                    <div style={{ fontSize: 11, color: "var(--dash-accent)", fontWeight: 600 }}>→ {r.action}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Events */}
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>风险事件</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {MOCK_RISK_EVENTS.map((ev) => (
                  <div key={ev.id} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid var(--dash-border)", borderLeft: `3px solid ${ev.level === "critical" ? "#dc2626" : ev.level === "high" ? "#ef4444" : "#f59e0b"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <LevelBadge level={ev.level} />
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{ev.type}</span>
                      </div>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: ev.handled ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", color: ev.handled ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>{ev.handled ? "已处理" : "待处理"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--dash-sub)", marginBottom: 3 }}>{ev.user} · {ev.time}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.5 }}>{ev.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}

const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 16px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "12px 16px", fontSize: 13, verticalAlign: "middle" };
