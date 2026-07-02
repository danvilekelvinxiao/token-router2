import { useEffect, useMemo, useState } from "react";

const TOKEN_TYPES = ["OpenAI", "Claude", "Gemini", "Qwen", "文心一言", "讯飞星火", "通义千问", "Telegram Bot Token", "OpenRouter", "自定义 OpenAI Compatible", "本地模型", "其他"];
const PURPOSES = ["文案生成", "模型测试", "原型验证", "代码生成", "图片生成", "客服问答", "数据分析", "自动化任务", "测试调用"];

const statusMap = {
  normal: { label: "正常", color: "#16a34a", bg: "rgba(22,163,74,0.12)" },
  low_quota: { label: "额度不足", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  expiring: { label: "即将过期", color: "#eab308", bg: "rgba(234,179,8,0.14)" },
  expired: { label: "已过期", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  rate_limited: { label: "被限流", color: "#ca8a04", bg: "rgba(202,138,4,0.12)" },
  error: { label: "异常", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  disabled: { label: "禁用", color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  checking: { label: "检测中", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
};

function Badge({ status }) {
  const cfg = statusMap[status] || statusMap.normal;
  return <span style={{ color: cfg.color, background: cfg.bg, borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 800 }}>{cfg.label}</span>;
}

function Field({ label, value, onChange, type = "text", options, placeholder }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--dash-sub)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      {type === "select" ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>
          <option value="">请选择</option>
          {options.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </label>
  );
}

const emptyToken = {
  name: "",
  tokenType: "自定义 OpenAI Compatible",
  modelType: "",
  provider: "",
  teamId: "",
  quotaTotal: "",
  quotaRemaining: "",
  expiresAt: "",
  usageScope: "all",
  allowedTeamIds: "",
  allowedModels: "",
  allowedPurposes: "",
  environmentScope: "all",
  notes: "",
  status: "normal",
  priority: 5,
  weight: 5,
  enabled: true,
  baseUrl: "",
  apiPath: "/v1/chat/completions",
  secret: "",
};

const emptyTeam = {
  name: "",
  code: "",
  description: "",
  monthlyBudgetCny: "",
  monthlyTokenBudget: "",
  status: "active",
};

const emptyRule = {
  scopeType: "global",
  provider: "",
  model: "",
  teamId: "",
  apiKeyId: "",
  requestsPerMinute: 60,
  requestsPerHour: 0,
  requestsPerDay: 0,
  tokensPerMinute: 0,
  tokensPerDay: 0,
  concurrencyLimit: 0,
  bufferRatio: 0.9,
  cooldownSeconds: 30,
  enabled: true,
};

export default function TeamTokenPoolConsole({ initialTab = "tokens" }) {
  const [tab, setTab] = useState(initialTab);
  const [teams, setTeams] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [reports, setReports] = useState([]);
  const [cacheSettings, setCacheSettings] = useState({ enabled: false, defaultTtlSeconds: 300, teamIds: [], models: [], purposes: [] });
  const [tokenForm, setTokenForm] = useState(emptyToken);
  const [teamForm, setTeamForm] = useState(emptyTeam);
  const [ruleForm, setRuleForm] = useState(emptyRule);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [teamRes, tokenRes, ruleRes, cacheRes, logRes, reportRes] = await Promise.all([
        fetch("/api/admin/teams"),
        fetch("/api/admin/token-pool"),
        fetch("/api/admin/rate-limits"),
        fetch("/api/admin/request-cache/settings"),
        fetch("/api/admin/team-usage-logs?limit=80"),
        fetch(`/api/admin/team-reports?date=${new Date().toISOString().slice(0, 10)}`),
      ]);
      const [teamData, tokenData, ruleData, cacheData, logData, reportData] = await Promise.all([
        teamRes.json().catch(() => ({})),
        tokenRes.json().catch(() => ({})),
        ruleRes.json().catch(() => ({})),
        cacheRes.json().catch(() => ({})),
        logRes.json().catch(() => ({})),
        reportRes.json().catch(() => ({})),
      ]);
      setTeams(teamData.teams || []);
      setTokens(tokenData.tokens || []);
      setRules(ruleData.rules || []);
      setCacheSettings(cacheData.settings || { enabled: false, defaultTtlSeconds: 300 });
      setLogs(logData.logs || []);
      setReports(reportData.reports || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "加载团队 Token 池失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadAll();
    });
  }, []);

  const metrics = useMemo(() => ({
    teams: teams.length,
    tokens: tokens.length,
    normal: tokens.filter((item) => item.runtimeStatus?.status === "normal").length,
    warning: tokens.filter((item) => item.runtimeStatus?.status && item.runtimeStatus.status !== "normal").length,
    calls: logs.length,
    cost: logs.reduce((sum, item) => sum + Number(item.actualCostCny || 0), 0),
  }), [teams, tokens, logs]);

  function setTokenField(key, value) {
    setTokenForm((current) => ({ ...current, [key]: value }));
  }

  async function saveToken() {
    const res = await fetch(tokenForm.id ? `/api/admin/token-pool/${tokenForm.id}` : "/api/admin/token-pool", {
      method: tokenForm.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenForm),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Token 保存失败");
    setTokenForm(emptyToken);
    await loadAll();
  }

  async function saveTeam() {
    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamForm),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "团队保存失败");
    setTeamForm(emptyTeam);
    await loadAll();
  }

  async function saveRule() {
    const res = await fetch("/api/admin/rate-limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleForm),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "限流规则保存失败");
    setRuleForm(emptyRule);
    await loadAll();
  }

  async function saveCache() {
    const res = await fetch("/api/admin/request-cache/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...cacheSettings,
        teamIds: Array.isArray(cacheSettings.teamIds) ? cacheSettings.teamIds.join(",") : cacheSettings.teamIds,
        models: Array.isArray(cacheSettings.models) ? cacheSettings.models.join(",") : cacheSettings.models,
        purposes: Array.isArray(cacheSettings.purposes) ? cacheSettings.purposes.join(",") : cacheSettings.purposes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "缓存配置保存失败");
    await loadAll();
  }

  async function run(action) {
    try {
      await action();
      setMessage("已保存");
    } catch (error) {
      setMessage(error.message || "操作失败");
    }
  }

  async function generateReport() {
    await fetch("/api/admin/team-reports", { method: "POST" });
    await loadAll();
  }

  return (
    <div style={{ color: "var(--dash-text)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <span style={eyebrow}>TEAM TOKEN POOL</span>
          <h1 style={{ margin: "4px 0 6px", fontSize: 26, fontWeight: 950 }}>团队 Token 池</h1>
          <p style={{ margin: 0, color: "var(--dash-sub)", fontSize: 13 }}>把企业分散的上游 Token 集中录入、分类、监控、限流、缓存、统计和对账。</p>
        </div>
        <button type="button" onClick={loadAll} style={primaryBtn}>刷新状态</button>
      </header>

      <section style={metricGrid}>
        <Metric label="团队数" value={metrics.teams} />
        <Metric label="Token 总数" value={metrics.tokens} />
        <Metric label="正常 Token" value={metrics.normal} tone="good" />
        <Metric label="异常提醒" value={metrics.warning} tone={metrics.warning ? "warn" : "good"} />
        <Metric label="最近日志" value={metrics.calls} />
        <Metric label="最近花费" value={`¥${metrics.cost.toFixed(4)}`} />
      </section>

      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "18px 0" }}>
        {[
          ["tokens", "Token 录入"],
          ["teams", "团队管理"],
          ["status", "状态监控"],
          ["limits", "限流规则"],
          ["cache", "请求缓存"],
          ["logs", "团队日志"],
          ["reports", "每日报表"],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} style={tab === key ? activeTabBtn : tabBtn}>{label}</button>
        ))}
      </nav>

      {message ? <div style={notice}>{message}</div> : null}
      {loading ? <div style={panel}>加载中...</div> : null}

      {!loading && tab === "tokens" ? (
        <section style={twoColumn}>
          <div style={panel}>
            <h2 style={panelTitle}>{tokenForm.id ? "编辑 Token" : "录入 Token"}</h2>
            <div style={formGrid}>
              <Field label="Token 名称" value={tokenForm.name} onChange={(v) => setTokenField("name", v)} placeholder="OpenAI Token - 产品部 - 原型验证" />
              <Field label="Token 类型" type="select" options={TOKEN_TYPES} value={tokenForm.tokenType} onChange={(v) => setTokenField("tokenType", v)} />
              <Field label="所属平台" value={tokenForm.provider} onChange={(v) => setTokenField("provider", v)} placeholder="OpenAI / Gemini / OpenRouter" />
              <Field label="所属团队" type="select" options={teams.map((item) => ({ label: item.name, value: item.id })).map((item) => item.value)} value={tokenForm.teamId} onChange={(v) => setTokenField("teamId", v)} />
              <Field label="模型类型" value={tokenForm.modelType} onChange={(v) => setTokenField("modelType", v)} placeholder="chat / image / embedding" />
              <Field label="Base URL" value={tokenForm.baseUrl} onChange={(v) => setTokenField("baseUrl", v)} placeholder="https://api.example.com" />
              <Field label="API Path" value={tokenForm.apiPath} onChange={(v) => setTokenField("apiPath", v)} placeholder="/v1/chat/completions" />
              <Field label="上游 Token" type="password" value={tokenForm.secret} onChange={(v) => setTokenField("secret", v)} placeholder={tokenForm.id ? "留空则不更换" : "sk-..."} />
              <Field label="额度" type="number" value={tokenForm.quotaTotal} onChange={(v) => setTokenField("quotaTotal", v)} />
              <Field label="剩余额度" type="number" value={tokenForm.quotaRemaining} onChange={(v) => setTokenField("quotaRemaining", v)} />
              <Field label="有效期" type="date" value={tokenForm.expiresAt?.slice(0, 10) || ""} onChange={(v) => setTokenField("expiresAt", v)} />
              <Field label="优先级" type="number" value={tokenForm.priority} onChange={(v) => setTokenField("priority", v)} />
              <Field label="权重" type="number" value={tokenForm.weight} onChange={(v) => setTokenField("weight", v)} />
              <Field label="允许模型" value={tokenForm.allowedModels} onChange={(v) => setTokenField("allowedModels", v)} placeholder="gpt-5.5,gpt-4o-mini" />
              <Field label="允许用途" value={tokenForm.allowedPurposes} onChange={(v) => setTokenField("allowedPurposes", v)} placeholder="文案生成,模型测试" />
              <Field label="备注" type="textarea" value={tokenForm.notes} onChange={(v) => setTokenField("notes", v)} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => run(saveToken)} style={primaryBtn}>保存 Token</button>
              <button type="button" onClick={() => setTokenForm(emptyToken)} style={ghostBtn}>清空</button>
            </div>
          </div>
          <TokenTable tokens={tokens} teams={teams} onEdit={(token) => setTokenForm({ ...emptyToken, ...token, secret: "" })} onReload={loadAll} />
        </section>
      ) : null}

      {!loading && tab === "teams" ? (
        <section style={twoColumn}>
          <div style={panel}>
            <h2 style={panelTitle}>新增团队</h2>
            <div style={formGrid}>
              <Field label="团队名称" value={teamForm.name} onChange={(v) => setTeamForm({ ...teamForm, name: v })} placeholder="市场部" />
              <Field label="团队 Code" value={teamForm.code} onChange={(v) => setTeamForm({ ...teamForm, code: v })} placeholder="marketing" />
              <Field label="月预算 ¥" type="number" value={teamForm.monthlyBudgetCny} onChange={(v) => setTeamForm({ ...teamForm, monthlyBudgetCny: v })} />
              <Field label="月 Token 预算" type="number" value={teamForm.monthlyTokenBudget} onChange={(v) => setTeamForm({ ...teamForm, monthlyTokenBudget: v })} />
              <Field label="描述" type="textarea" value={teamForm.description} onChange={(v) => setTeamForm({ ...teamForm, description: v })} />
            </div>
            <button type="button" onClick={() => run(saveTeam)} style={{ ...primaryBtn, marginTop: 16 }}>保存团队</button>
          </div>
          <div style={panel}>
            <h2 style={panelTitle}>团队列表</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {teams.map((team) => (
                <article key={team.id} style={miniCard}>
                  <strong>{team.name}</strong>
                  <span>{team.code}</span>
                  <small>{team.description || "暂无描述"}</small>
                  <em>月预算 ¥{Number(team.monthlyBudgetCny || 0).toFixed(2)} / {Number(team.monthlyTokenBudget || 0).toLocaleString()} Token</em>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {!loading && tab === "status" ? <StatusPanel tokens={tokens} /> : null}
      {!loading && tab === "limits" ? (
        <section style={twoColumn}>
          <div style={panel}>
            <h2 style={panelTitle}>新增限流规则</h2>
            <div style={formGrid}>
              <Field label="限流层级" type="select" options={["global", "provider", "model", "team", "api_key", "token"]} value={ruleForm.scopeType} onChange={(v) => setRuleForm({ ...ruleForm, scopeType: v })} />
              <Field label="团队" type="select" options={teams.map((item) => item.id)} value={ruleForm.teamId} onChange={(v) => setRuleForm({ ...ruleForm, teamId: v })} />
              <Field label="平台" value={ruleForm.provider} onChange={(v) => setRuleForm({ ...ruleForm, provider: v })} />
              <Field label="模型" value={ruleForm.model} onChange={(v) => setRuleForm({ ...ruleForm, model: v })} />
              <Field label="每分钟请求" type="number" value={ruleForm.requestsPerMinute} onChange={(v) => setRuleForm({ ...ruleForm, requestsPerMinute: v })} />
              <Field label="每日 Token" type="number" value={ruleForm.tokensPerDay} onChange={(v) => setRuleForm({ ...ruleForm, tokensPerDay: v })} />
              <Field label="缓冲比例" type="number" value={ruleForm.bufferRatio} onChange={(v) => setRuleForm({ ...ruleForm, bufferRatio: v })} />
              <Field label="冷却秒数" type="number" value={ruleForm.cooldownSeconds} onChange={(v) => setRuleForm({ ...ruleForm, cooldownSeconds: v })} />
            </div>
            <button type="button" onClick={() => run(saveRule)} style={{ ...primaryBtn, marginTop: 16 }}>保存限流规则</button>
          </div>
          <DataTable title="限流规则" rows={rules} columns={["scopeType", "provider", "model", "teamId", "requestsPerMinute", "tokensPerDay", "cooldownSeconds"]} />
        </section>
      ) : null}

      {!loading && tab === "cache" ? (
        <section style={panel}>
          <h2 style={panelTitle}>请求缓存配置</h2>
          <div style={formGrid}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
              <input type="checkbox" checked={cacheSettings.enabled === true} onChange={(event) => setCacheSettings({ ...cacheSettings, enabled: event.target.checked })} />
              开启请求缓存
            </label>
            <Field label="默认缓存秒数" type="number" value={cacheSettings.defaultTtlSeconds || 300} onChange={(v) => setCacheSettings({ ...cacheSettings, defaultTtlSeconds: Number(v) })} />
            <Field label="限定团队 ID" value={Array.isArray(cacheSettings.teamIds) ? cacheSettings.teamIds.join(",") : cacheSettings.teamIds || ""} onChange={(v) => setCacheSettings({ ...cacheSettings, teamIds: v })} />
            <Field label="限定模型" value={Array.isArray(cacheSettings.models) ? cacheSettings.models.join(",") : cacheSettings.models || ""} onChange={(v) => setCacheSettings({ ...cacheSettings, models: v })} />
            <Field label="限定用途" value={Array.isArray(cacheSettings.purposes) ? cacheSettings.purposes.join(",") : cacheSettings.purposes || ""} onChange={(v) => setCacheSettings({ ...cacheSettings, purposes: v })} />
          </div>
          <button type="button" onClick={() => run(saveCache)} style={{ ...primaryBtn, marginTop: 16 }}>保存缓存配置</button>
        </section>
      ) : null}

      {!loading && tab === "logs" ? <DataTable title="团队调用日志" rows={logs} columns={["requestId", "teamId", "tokenId", "model", "purpose", "cacheHit", "totalTokens", "actualCostCny", "success", "durationMs", "errorCode"]} /> : null}
      {!loading && tab === "reports" ? (
        <section style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <h2 style={panelTitle}>团队每日报表</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={generateReport} style={primaryBtn}>生成今日日报</button>
              <a href={`/api/admin/team-reports/export?date=${new Date().toISOString().slice(0, 10)}`} style={ghostLink}>导出 CSV</a>
            </div>
          </div>
          <DataTable rows={reports} columns={["reportDate", "teamName", "calls", "successRate", "totalTokens", "actualCostCny", "savedCny", "cacheHits", "rateLimitedCount", "recommendation"]} />
        </section>
      ) : null}
    </div>
  );
}

function TokenTable({ tokens, teams, onEdit, onReload }) {
  async function checkToken(id) {
    await fetch(`/api/admin/token-pool/${id}/check`, { method: "POST" });
    await onReload();
  }
  async function deleteToken(id) {
    if (!confirm("确认删除这个上游 Token？")) return;
    await fetch(`/api/admin/token-pool/${id}`, { method: "DELETE" });
    await onReload();
  }
  const teamName = (id) => teams.find((team) => team.id === id)?.name || id || "全部团队";
  return (
    <div style={panel}>
      <h2 style={panelTitle}>Token 池列表</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead><tr>{["名称", "平台", "团队", "状态", "余额", "用途/模型", "最近错误", "操作"].map((item) => <th key={item} style={thStyle}>{item}</th>)}</tr></thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id} style={trStyle}>
                <td style={tdStyle}><strong>{token.name}</strong><br /><small>{token.tokenPreview || "未保存 Token"}</small></td>
                <td style={tdStyle}>{token.provider}<br /><small>{token.tokenType}</small></td>
                <td style={tdStyle}>{teamName(token.teamId)}</td>
                <td style={tdStyle}><Badge status={token.runtimeStatus?.status || token.status} /></td>
                <td style={tdStyle}>{Number(token.quotaRemaining || 0).toLocaleString()} / {Number(token.quotaTotal || 0).toLocaleString()}</td>
                <td style={tdStyle}><small>{(token.allowedPurposes || []).join(" / ") || "全部用途"}</small><br /><small>{(token.allowedModels || []).join(", ") || "全部模型"}</small></td>
                <td style={tdStyle}><small>{token.lastError || "-"}</small></td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => onEdit(token)} style={smallBtn}>编辑</button>
                    <button type="button" onClick={() => checkToken(token.id)} style={smallBtn}>检测</button>
                    <button type="button" onClick={() => deleteToken(token.id)} style={{ ...smallBtn, color: "#ef4444" }}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
            {!tokens.length ? <tr><td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "var(--dash-sub)" }}>暂无 Token，请先录入企业/团队上游 Token。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPanel({ tokens }) {
  return (
    <section style={panel}>
      <h2 style={panelTitle}>Token 状态监控</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {tokens.map((token) => (
          <article key={token.id} style={miniCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <strong>{token.name}</strong>
              <Badge status={token.runtimeStatus?.status || token.status} />
            </div>
            <span>{token.provider} · {token.modelType || "通用模型"}</span>
            <small>今日调用 {token.todayCalls || 0} 次，今日 Token {Number(token.todayTokens || 0).toLocaleString()}</small>
            <small>成功率 {Math.round(Number(token.successRate || 0) * 100)}%，平均响应 {token.avgLatencyMs || 0}ms</small>
            <small>有效期：{token.expiresAt ? token.expiresAt.slice(0, 10) : "长期"}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function DataTable({ title, rows = [], columns = [] }) {
  const keys = columns.length ? columns : Object.keys(rows[0] || {});
  return (
    <section style={panel}>
      {title ? <h2 style={panelTitle}>{title}</h2> : null}
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead><tr>{keys.map((key) => <th key={key} style={thStyle}>{key}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index} style={trStyle}>
                {keys.map((key) => <td key={key} style={tdStyle}>{formatCell(row[key])}</td>)}
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={keys.length || 1} style={{ ...tdStyle, textAlign: "center", color: "var(--dash-sub)" }}>暂无数据</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatCell(value) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(4);
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

function Metric({ label, value, tone }) {
  const color = tone === "good" ? "#16a34a" : tone === "warn" ? "#f97316" : "var(--dash-text)";
  return (
    <article style={metricCard}>
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </article>
  );
}

const eyebrow = { fontSize: 11, fontWeight: 900, color: "var(--dash-accent)", letterSpacing: "0.08em" };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 };
const metricCard = { padding: "16px 18px", borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", display: "grid", gap: 6 };
const panel = { padding: 20, borderRadius: 12, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)" };
const panelTitle = { margin: "0 0 14px", fontSize: 16, fontWeight: 900 };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 };
const twoColumn = { display: "grid", gridTemplateColumns: "minmax(320px,0.85fr) minmax(420px,1.15fr)", gap: 14, alignItems: "start" };
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: "inherit" };
const primaryBtn = { border: "none", borderRadius: 8, padding: "10px 16px", color: "#fff", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontSize: 13, fontWeight: 800, cursor: "pointer", textDecoration: "none" };
const ghostBtn = { border: "1px solid var(--dash-border)", borderRadius: 8, padding: "10px 16px", color: "var(--dash-text)", background: "transparent", fontSize: 13, fontWeight: 800, cursor: "pointer" };
const ghostLink = { ...ghostBtn, display: "inline-flex", alignItems: "center", textDecoration: "none" };
const tabBtn = { ...ghostBtn, padding: "8px 13px", fontSize: 12 };
const activeTabBtn = { ...primaryBtn, padding: "8px 13px", fontSize: 12 };
const notice = { padding: "10px 14px", borderRadius: 8, marginBottom: 12, background: "rgba(99,102,241,0.1)", color: "var(--dash-accent)", fontWeight: 800, fontSize: 13 };
const miniCard = { padding: 14, borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)", display: "grid", gap: 5 };
const tableStyle = { width: "100%", minWidth: 920, borderCollapse: "collapse" };
const thStyle = { textAlign: "left", padding: "10px 12px", fontSize: 11, color: "var(--dash-sub)", borderBottom: "1px solid var(--dash-border)", whiteSpace: "nowrap" };
const tdStyle = { padding: "12px", fontSize: 12, borderBottom: "1px solid var(--dash-border)", verticalAlign: "top", maxWidth: 260, overflowWrap: "anywhere" };
const trStyle = { borderBottom: "1px solid var(--dash-border)" };
const smallBtn = { border: "1px solid var(--dash-border)", borderRadius: 7, padding: "6px 9px", color: "var(--dash-text)", background: "transparent", fontSize: 11, fontWeight: 800, cursor: "pointer" };
