import { useCallback, useEffect, useState } from "react";

const tabs = [
  ["check", "Token 巡检"],
  ["limits", "限流巡检"],
  ["reports", "报表分析"],
  ["alerts", "异常告警"],
  ["tests", "落地测试"],
];

export default function TokenPoolMaintenanceCenter({ initialTab = "check" }) {
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState({ checkLogs: [], testLogs: [], analysis: null, alerts: [], tasks: [], rateRuns: [], logRuns: [] });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pressureForm, setPressureForm] = useState({ concurrency: 5, requestCount: 60, requestsPerSecond: 10, limitPerMinute: 60, model: "deepseek-chat" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [checkRes, testRes, alertRes, taskRes, rateRunRes, logRunRes] = await Promise.all([
        fetch("/api/admin/token-pool/check-logs"),
        fetch("/api/admin/token-pool/test-logs"),
        fetch("/api/admin/alerts"),
        fetch("/api/admin/maintenance-tasks"),
        fetch("/api/admin/rate-limits/test-runs"),
        fetch("/api/admin/team-usage-logs/test-runs"),
      ]);
      const [check, test, alerts, tasks, rateRuns, logRuns] = await Promise.all([
        checkRes.json().catch(() => ({})),
        testRes.json().catch(() => ({})),
        alertRes.json().catch(() => ({})),
        taskRes.json().catch(() => ({})),
        rateRunRes.json().catch(() => ({})),
        logRunRes.json().catch(() => ({})),
      ]);
      setData((current) => ({
        checkLogs: check.logs || [],
        testLogs: test.logs || [],
        alerts: alerts.alerts || [],
        tasks: tasks.tasks || [],
        rateRuns: rateRuns.runs || [],
        logRuns: logRuns.runs || [],
        analysis: current.analysis,
      }));
      setMessage("");
    } catch (error) {
      setMessage(error.message || "维护中心加载失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "操作失败");
    return json;
  }

  async function run(label, action) {
    try {
      const result = await action();
      setMessage(`${label}已完成`);
      if (result?.analysis) setData((current) => ({ ...current, analysis: result.analysis }));
      await load();
    } catch (error) {
      setMessage(error.message || `${label}失败`);
    }
  }

  return (
    <div style={{ color: "var(--dash-text)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 20 }}>
        <div>
          <span style={eyebrow}>TOKEN POOL OPS</span>
          <h1 style={{ margin: "4px 0 6px", fontSize: 26, fontWeight: 950 }}>Token 池维护中心</h1>
          <p style={{ margin: 0, color: "var(--dash-sub)", fontSize: 13 }}>每周巡检 Token、优化限流、查看周报、处理告警，并执行落地测试。</p>
        </div>
        <button type="button" onClick={load} style={primaryBtn}>刷新</button>
      </header>

      <section style={metricGrid}>
        <Metric label="巡检记录" value={data.checkLogs.length} />
        <Metric label="测试记录" value={data.testLogs.length} />
        <Metric label="打开告警" value={data.alerts.length} tone={data.alerts.length ? "warn" : "good"} />
        <Metric label="维护任务" value={data.tasks.length} />
      </section>

      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "18px 0" }}>
        {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} style={tab === key ? activeTabBtn : tabBtn}>{label}</button>)}
      </nav>
      {message ? <div style={notice}>{message}</div> : null}
      {loading ? <section style={panel}>加载中...</section> : null}

      {!loading && tab === "check" ? (
        <section style={panel}>
          <Toolbar>
            <button type="button" onClick={() => run("Token 巡检", () => post("/api/admin/token-pool/check"))} style={primaryBtn}>立即巡检全部 Token</button>
            <button type="button" onClick={() => run("批量 Token 配置测试", () => post("/api/admin/token-pool/batch-test", { useRealUpstream: false }))} style={ghostBtn}>批量测试 Token</button>
          </Toolbar>
          <DataTable title="Token 巡检结果" rows={data.checkLogs} columns={["status", "riskLevel", "remainingQuota", "successRate", "avgLatencyMs", "lastErrorMessage", "suggestion", "checkedAt"]} />
        </section>
      ) : null}

      {!loading && tab === "limits" ? (
        <section style={panel}>
          <Toolbar>
            <button type="button" onClick={() => run("限流分析", async () => {
              const res = await fetch("/api/admin/rate-limits/analysis");
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "限流分析失败");
              setData((current) => ({ ...current, analysis: json.analysis }));
              return json;
            })} style={primaryBtn}>生成限流建议</button>
          </Toolbar>
          {data.analysis ? <DataTable title="限流优化建议" rows={data.analysis.suggestions || []} columns={["scopeType", "teamId", "currentRequestsPerMinute", "proposedRequestsPerMinute", "action", "suggestion"]} /> : <p style={{ color: "var(--dash-sub)" }}>点击生成限流建议后，这里会展示最近调用与限流分析。</p>}
        </section>
      ) : null}

      {!loading && tab === "reports" ? (
        <section style={panel}>
          <Toolbar>
            <button type="button" onClick={() => run("周报生成", () => post("/api/admin/team-reports/weekly"))} style={primaryBtn}>生成团队周报</button>
            <button type="button" onClick={() => window.open("/api/admin/team-reports/weekly/export", "_blank", "noopener,noreferrer")} style={ghostBtn}>导出周报 Excel/CSV</button>
          </Toolbar>
          <DataTable title="维护任务" rows={data.tasks} columns={["taskKey", "name", "frequency", "lastRunAt", "status", "pendingCount"]} />
        </section>
      ) : null}

      {!loading && tab === "alerts" ? (
        <section style={panel}>
          <Toolbar>
            <button type="button" onClick={() => run("邮件告警配置测试", () => post("/api/admin/alerts/test-email"))} style={primaryBtn}>测试邮件告警</button>
          </Toolbar>
          <DataTable title="异常告警" rows={data.alerts} columns={["level", "title", "content", "suggestion", "createdAt"]} />
        </section>
      ) : null}

      {!loading && tab === "tests" ? (
        <section style={panel}>
          <h2 style={panelTitle}>限流压力测试</h2>
          <div style={formGrid}>
            {["concurrency", "requestCount", "requestsPerSecond", "limitPerMinute", "model"].map((key) => (
              <label key={key} style={{ display: "grid", gap: 5 }}>
                <span style={fieldLabel}>{key}</span>
                <input value={pressureForm[key]} onChange={(event) => setPressureForm({ ...pressureForm, [key]: event.target.value })} style={inputStyle} />
              </label>
            ))}
          </div>
          <Toolbar>
            <button type="button" onClick={() => run("限流压力测试", () => post("/api/admin/rate-limits/test", pressureForm))} style={primaryBtn}>运行模拟压力测试</button>
            <button type="button" onClick={() => run("日志完整性测试", () => post("/api/admin/team-usage-logs/test"))} style={ghostBtn}>运行日志完整性测试</button>
          </Toolbar>
          <DataTable title="限流测试记录" rows={data.rateRuns} columns={["requestCount", "successCount", "rateLimitedCount", "avgLatencyMs", "p95LatencyMs", "suggestion", "createdAt"]} />
          <DataTable title="日志完整性测试" rows={data.logRuns} columns={["score", "totalCases", "passedCases", "partialCases", "failedCases", "createdAt"]} />
        </section>
      ) : null}
    </div>
  );
}

function Toolbar({ children }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>{children}</div>;
}

function Metric({ label, value, tone }) {
  const color = tone === "good" ? "#16a34a" : tone === "warn" ? "#f97316" : "var(--dash-text)";
  return <article style={metricCard}><span>{label}</span><strong style={{ color }}>{value}</strong></article>;
}

function DataTable({ title, rows = [], columns = [] }) {
  return (
    <div style={{ marginTop: 14 }}>
      {title ? <h2 style={panelTitle}>{title}</h2> : null}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse" }}>
          <thead><tr>{columns.map((key) => <th key={key} style={thStyle}>{key}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => <tr key={row.id || index}>{columns.map((key) => <td key={key} style={tdStyle}>{format(row[key])}</td>)}</tr>)}
            {!rows.length ? <tr><td colSpan={columns.length || 1} style={{ ...tdStyle, textAlign: "center", color: "var(--dash-sub)" }}>暂无数据</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function format(value) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(4);
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

const eyebrow = { fontSize: 11, fontWeight: 900, color: "var(--dash-accent)", letterSpacing: "0.08em" };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 };
const metricCard = { padding: "16px 18px", borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", display: "grid", gap: 6 };
const panel = { padding: 20, borderRadius: 12, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)" };
const panelTitle = { margin: "0 0 12px", fontSize: 16, fontWeight: 900 };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 14 };
const fieldLabel = { fontSize: 11, color: "var(--dash-sub)", fontWeight: 800 };
const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)" };
const primaryBtn = { border: "none", borderRadius: 8, padding: "10px 16px", color: "#fff", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontSize: 13, fontWeight: 800, cursor: "pointer", textDecoration: "none" };
const ghostBtn = { border: "1px solid var(--dash-border)", borderRadius: 8, padding: "10px 16px", color: "var(--dash-text)", background: "transparent", fontSize: 13, fontWeight: 800, cursor: "pointer" };
const tabBtn = { ...ghostBtn, padding: "8px 13px", fontSize: 12 };
const activeTabBtn = { ...primaryBtn, padding: "8px 13px", fontSize: 12 };
const notice = { padding: "10px 14px", borderRadius: 8, marginBottom: 12, background: "rgba(99,102,241,0.1)", color: "var(--dash-accent)", fontWeight: 800, fontSize: 13 };
const thStyle = { textAlign: "left", padding: "10px 12px", fontSize: 11, color: "var(--dash-sub)", borderBottom: "1px solid var(--dash-border)", whiteSpace: "nowrap" };
const tdStyle = { padding: "12px", fontSize: 12, borderBottom: "1px solid var(--dash-border)", verticalAlign: "top", overflowWrap: "anywhere" };
