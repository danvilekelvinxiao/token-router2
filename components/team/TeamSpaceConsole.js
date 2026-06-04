import { useEffect, useState } from "react";

export default function TeamSpaceConsole({ initialTab = "overview" }) {
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState({ teams: [], tokens: [], logs: [], reports: [], members: [], metrics: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [overviewRes, memberRes] = await Promise.all([
        fetch("/api/team/overview"),
        fetch("/api/team/members"),
      ]);
      const [overview, members] = await Promise.all([
        overviewRes.json().catch(() => ({})),
        memberRes.json().catch(() => ({})),
      ]);
      if (!overviewRes.ok) throw new Error(overview.error || "团队空间加载失败");
      setData({ ...overview, members: members.members || [] });
      setError("");
    } catch (err) {
      setError(err.message || "团队空间加载失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, []);

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <section style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 900, color: "var(--dash-accent)", letterSpacing: "0.08em" }}>TEAM SPACE</span>
          <h1 style={{ margin: "4px 0 6px", fontSize: 28, fontWeight: 950, color: "var(--page-heading)" }}>团队空间</h1>
          <p style={{ margin: 0, color: "var(--dash-sub)", fontSize: 14 }}>查看团队 Token 池状态、团队用量、调用日志和日报表。上游 Token 原文永远不会展示给成员。</p>
        </div>
        <button type="button" onClick={load} style={primaryBtn}>刷新</button>
      </section>

      {error ? <div style={notice}>{error}</div> : null}
      {loading ? <div style={panel}>加载中...</div> : null}

      {!loading ? (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
            <Metric label="团队数" value={data.metrics?.teamCount || 0} />
            <Metric label="Token 数" value={data.metrics?.tokenCount || 0} />
            <Metric label="正常 Token" value={data.metrics?.normalTokenCount || 0} />
            <Metric label="今日调用" value={data.metrics?.todayCalls || 0} />
            <Metric label="今日 Token" value={Number(data.metrics?.todayTokens || 0).toLocaleString()} />
            <Metric label="今日花费" value={`¥${Number(data.metrics?.todayCostCny || 0).toFixed(4)}`} />
          </section>

          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              ["overview", "团队概览"],
              ["usage", "团队用量"],
              ["logs", "团队日志"],
              ["reports", "团队报表"],
              ["members", "团队成员"],
            ].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTab(key)} style={tab === key ? activeTabBtn : tabBtn}>{label}</button>
            ))}
          </nav>

          {tab === "overview" ? (
            <section style={panel}>
              <h2 style={panelTitle}>团队 Token 池状态</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
                {(data.tokens || []).map((token) => (
                  <article key={token.id} style={miniCard}>
                    <strong>{token.name}</strong>
                    <span>{token.provider} · {token.modelType || "通用"}</span>
                    <small>状态：{token.runtimeStatus?.label || token.status}</small>
                    <small>余额：{Number(token.quotaRemaining || 0).toLocaleString()} / {Number(token.quotaTotal || 0).toLocaleString()}</small>
                    <small>用途：{(token.allowedPurposes || []).join("、") || "全部用途"}</small>
                  </article>
                ))}
                {!data.tokens?.length ? <p style={{ color: "var(--dash-sub)" }}>当前账号暂无可查看的团队 Token 池数据。</p> : null}
              </div>
            </section>
          ) : null}

          {tab === "usage" ? <DataTable title="团队用量" rows={data.tokens || []} columns={["name", "provider", "todayCalls", "todayTokens", "monthTokens", "todayCostCny", "monthCostCny", "successRate"]} /> : null}
          {tab === "logs" ? <DataTable title="团队日志" rows={data.logs || []} columns={["requestId", "model", "purpose", "cacheHit", "totalTokens", "actualCostCny", "success", "durationMs", "errorCode"]} /> : null}
          {tab === "reports" ? <DataTable title="团队报表" rows={data.reports || []} columns={["reportDate", "teamName", "calls", "successRate", "totalTokens", "actualCostCny", "savedCny", "recommendation"]} /> : null}
          {tab === "members" ? <DataTable title="团队成员" rows={data.members || []} columns={["memberName", "role", "status", "userId"]} /> : null}
        </>
      ) : null}
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <article style={metricCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DataTable({ title, rows = [], columns = [] }) {
  return (
    <section style={panel}>
      <h2 style={panelTitle}>{title}</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
          <thead><tr>{columns.map((key) => <th key={key} style={thStyle}>{key}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index}>
                {columns.map((key) => <td key={key} style={tdStyle}>{format(row[key])}</td>)}
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={columns.length} style={{ ...tdStyle, textAlign: "center", color: "var(--dash-sub)" }}>暂无数据</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function format(value) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(4);
  if (Array.isArray(value)) return value.join("、");
  return String(value ?? "");
}

const panel = { padding: 20, borderRadius: 12, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)" };
const panelTitle = { margin: "0 0 14px", fontSize: 16, fontWeight: 900, color: "var(--dash-text)" };
const metricCard = { padding: "16px 18px", borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", display: "grid", gap: 6, color: "var(--dash-text)" };
const miniCard = { padding: 14, borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)", display: "grid", gap: 5, color: "var(--dash-text)" };
const primaryBtn = { border: "none", borderRadius: 8, padding: "10px 16px", color: "#fff", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontSize: 13, fontWeight: 800, cursor: "pointer" };
const tabBtn = { border: "1px solid var(--dash-border)", borderRadius: 8, padding: "8px 13px", color: "var(--dash-text)", background: "transparent", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const activeTabBtn = { ...primaryBtn, padding: "8px 13px", fontSize: 12 };
const notice = { padding: "10px 14px", borderRadius: 8, marginBottom: 12, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontWeight: 800, fontSize: 13 };
const thStyle = { textAlign: "left", padding: "10px 12px", fontSize: 11, color: "var(--dash-sub)", borderBottom: "1px solid var(--dash-border)", whiteSpace: "nowrap" };
const tdStyle = { padding: "12px", fontSize: 12, borderBottom: "1px solid var(--dash-border)", color: "var(--dash-text)", verticalAlign: "top", overflowWrap: "anywhere" };
