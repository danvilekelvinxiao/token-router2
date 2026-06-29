import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const tabs = [
  ["overview", "团队总览"],
  ["members", "成员限制"],
  ["keys", "团队 Key"],
  ["usage", "Token 去向"],
  ["logs", "调用日志"],
  ["billing", "团队账单"],
];

const roleOptions = [
  ["member", "成员"],
  ["finance", "财务"],
  ["admin", "管理员"],
];

const limitTypeOptions = [
  ["none", "无限制"],
  ["daily", "每日限制"],
  ["weekly", "每周限制"],
  ["monthly", "每月限制"],
  ["total", "总限制"],
];

const limitUnitOptions = [
  ["cny", "$ API 余额限制"],
  ["token", "Token 额度"],
  ["request", "请求次数"],
];

function money(value) {
  return `$ API ${Number(value || 0).toFixed(4)}`;
}

function money2(value) {
  return `$ API ${Number(value || 0).toFixed(2)}`;
}

function tokens(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function time(value) {
  if (!value) return "暂无";
  return new Date(value).toLocaleString("zh-CN");
}

function shortId(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "-";
  if (clean.length <= 18) return clean;
  return `${clean.slice(0, 10)}...${clean.slice(-4)}`;
}

function purposeText(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "未填写用途";
  const labels = {
    chat: "对话调用",
    image: "图片生成",
    code: "代码开发",
    writing: "文案写作",
    team: "团队调用",
  };
  return labels[clean] || clean;
}

function limitText(limit) {
  if (!limit?.enabled) return "无限制";
  const typeLabel = Object.fromEntries(limitTypeOptions)[limit.limitType] || "限制";
  const unitLabel = Object.fromEntries(limitUnitOptions)[limit.limitUnit] || "";
  const used = limit.limitUnit === "token"
    ? tokens(limit.usedTokens)
    : limit.limitUnit === "request"
      ? tokens(limit.usedRequests)
      : money2(limit.usedCny);
  const amount = limit.limitUnit === "token" || limit.limitUnit === "request"
    ? tokens(limit.limitAmount)
    : money2(limit.limitAmount);
  return `${typeLabel}：${used} / ${amount} ${unitLabel}`;
}

export default function TeamSpaceConsole({ initialTab = "overview" }) {
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState({ teams: [], team: null, members: [], logs: [], modelCosts: [], apiKeyCosts: [], summary: {}, wallet: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamId, setTeamId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", type: "工作室", scenario: "综合使用", teamSize: "1-5人" });
  const [inviteForm, setInviteForm] = useState({ role: "member", type: "daily", unit: "cny", amount: "10", maxUses: "5" });
  const [lastInvite, setLastInvite] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (nextTeamId = "") => {
    setLoading(true);
    try {
      const query = nextTeamId ? `?teamId=${encodeURIComponent(nextTeamId)}` : "";
      const response = await fetch(`/api/team/overview${query}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "团队空间加载失败");
      const selectedTeamId = json.team?.id || json.teams?.[0]?.id || "";
      setTeamId(selectedTeamId);
      if (selectedTeamId) {
        try { localStorage.setItem("flowapi_active_team_id", selectedTeamId); } catch {}
      }
      setData(json);
      setError("");
    } catch (err) {
      setError(err.message || "团队空间加载失败");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let stored = "";
    try { stored = localStorage.getItem("flowapi_active_team_id") || ""; } catch {}
    queueMicrotask(() => load(stored));
    const onSpaceChange = (event) => load(event.detail?.teamId || "");
    window.addEventListener("flowapi-space-change", onSpaceChange);
    return () => window.removeEventListener("flowapi-space-change", onSpaceChange);
  }, [load]);

  const canManageMembers = ["owner", "admin"].includes(data.role);
  const canExport = ["owner", "finance"].includes(data.role);
  const activeTeam = data.team || data.teams?.find((team) => team.id === teamId);
  const logs = data.logs || [];
  const failedLogs = logs.filter((log) => log.success === false);

  const health = useMemo(() => {
    const rate = Number(data.summary?.successRate || 100);
    if (rate >= 98) return ["稳定", "success"];
    if (rate >= 90) return ["需观察", "warn"];
    return ["需处理", "danger"];
  }, [data.summary?.successRate]);

  async function createTeam() {
    setSaving(true);
    try {
      const response = await fetch("/api/team/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "团队创建失败");
      setCreateOpen(false);
      await load(json.team?.id || "");
    } catch (err) {
      setError(err.message || "团队创建失败");
    }
    setSaving(false);
  }

  async function createInvite() {
    if (!teamId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          teamId,
          role: inviteForm.role,
          type: inviteForm.type,
          unit: inviteForm.unit,
          amount: Number(inviteForm.amount || 0),
          maxUses: Number(inviteForm.maxUses || 0),
          enabled: inviteForm.type !== "none",
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "邀请链接生成失败");
      setLastInvite(json.invite);
    } catch (err) {
      setError(err.message || "邀请链接生成失败");
    }
    setSaving(false);
  }

  async function updateLimit(member, next = {}) {
    if (!teamId || !member?.userId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_limit",
          teamId,
          userId: member.userId,
          limit: {
            enabled: next.type !== "none",
            type: next.type || member.limit?.limitType || "daily",
            unit: next.unit || member.limit?.limitUnit || "cny",
            amount: Number(next.amount ?? member.limit?.limitAmount ?? 10),
          },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "限制保存失败");
      await load(teamId);
    } catch (err) {
      setError(err.message || "限制保存失败");
    }
    setSaving(false);
  }

  if (loading) return <main className="team-console"><section className="team-console-panel">正在读取团队数据...</section></main>;

  return (
    <main className="team-console">
      <section className="team-console-hero">
        <div>
          <span>Team Workspace</span>
          <h1>{activeTeam?.name || "团队空间"}</h1>
          <p>统一查看团队 API 消耗、成员用量和限制。普通成员只能看到自己的数据，队长和财务可以对账导出。</p>
        </div>
        <div className="team-console-actions">
          <select value={teamId} onChange={(event) => load(event.target.value)} aria-label="切换团队空间">
            {(data.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name} · {team.roleLabel}</option>)}
          </select>
          <button type="button" onClick={() => setCreateOpen((value) => !value)}>创建团队</button>
          <button type="button" onClick={() => load(teamId)}>刷新</button>
        </div>
      </section>

      {error ? <div className="team-console-notice">{error}</div> : null}

      {!activeTeam ? (
        <section className="team-console-empty">
          <h2>还没有团队空间</h2>
          <p>创建一个团队后，你就可以邀请成员、分配调用限制、创建团队 API Key，并按成员对账。</p>
          <button type="button" onClick={() => setCreateOpen(true)}>创建第一个团队</button>
        </section>
      ) : null}

      {createOpen ? (
        <section className="team-console-panel">
          <h2>创建团队</h2>
          <div className="team-console-form-grid">
            <label>团队名称<input value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="例如：小红书内容工作室" /></label>
            <label>团队类型<select value={createForm.type} onChange={(event) => setCreateForm({ ...createForm, type: event.target.value })}><option>工作室</option><option>企业</option><option>内容团队</option><option>技术团队</option><option>学校 / 教育</option></select></label>
            <label>使用场景<select value={createForm.scenario} onChange={(event) => setCreateForm({ ...createForm, scenario: event.target.value })}><option>综合使用</option><option>AI 文案</option><option>代码开发</option><option>图片生成</option><option>客户服务</option></select></label>
            <label>团队规模<select value={createForm.teamSize} onChange={(event) => setCreateForm({ ...createForm, teamSize: event.target.value })}><option>1-5人</option><option>6-20人</option><option>21-50人</option><option>50人以上</option></select></label>
          </div>
          <button type="button" onClick={createTeam} disabled={saving || !createForm.name.trim()}>{saving ? "创建中..." : "确认创建团队"}</button>
        </section>
      ) : null}

      {activeTeam ? (
        <>
          <section className="team-console-metrics">
            <Metric label="团队余额" value={money2(data.wallet?.balanceCny || data.summary?.walletBalanceCny || 0)} />
            <Metric label="总花费" value={money2(data.summary?.totalCostCny || 0)} />
            <Metric label="总 Token" value={tokens(data.summary?.totalTokens || 0)} />
            <Metric label="请求次数" value={tokens(data.summary?.requestCount || 0)} />
            <Metric label="成功率" value={`${Number(data.summary?.successRate || 100).toFixed(1)}%`} tone={health[1]} />
            <Metric label="最耗费成员" value={data.summary?.mostExpensiveMember || "暂无"} />
          </section>

          <nav className="team-console-tabs">
            {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={tab === key ? "active" : ""}>{label}</button>)}
          </nav>

          {tab === "overview" ? (
            <section className="team-console-grid">
              <Panel title="团队现在发生了什么">
                <MiniRow label="当前角色" value={data.roleLabel || "成员"} />
                <MiniRow label="团队类型" value={activeTeam.type || "工作室"} />
                <MiniRow label="主要场景" value={activeTeam.scenario || "综合使用"} />
                <MiniRow label="常用模型" value={data.summary?.topModel || "暂无"} />
                <MiniRow label="异常请求" value={`${failedLogs.length} 条`} />
              </Panel>
              <Panel title="模型花费排行">
                <RankList rows={data.modelCosts || []} nameKey="model" value={(item) => `${money2(item.costCny)} · ${tokens(item.tokens)} Token`} empty="还没有模型消费记录" />
              </Panel>
              <Panel title="API Key 花费排行">
                <RankList rows={data.apiKeyCosts || []} nameKey="apiKeyId" value={(item) => `${money2(item.costCny)} · ${item.requests} 次`} empty="还没有团队 Key 消费记录" />
              </Panel>
            </section>
          ) : null}

          {tab === "members" ? (
            <section className="team-console-panel">
              <div className="team-console-panel-head">
                <div><h2>团队成员与限制</h2><p>邀请和管理团队成员，设置他们每天、每月或总共能用多少 Token 额度、余额限制或请求次数。</p></div>
                {canManageMembers ? <button type="button" onClick={createInvite} disabled={saving}>{saving ? "生成中..." : "生成邀请链接"}</button> : null}
              </div>
              {canManageMembers ? (
                <div className="team-console-invite-row">
                  <select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}>{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <select value={inviteForm.type} onChange={(event) => setInviteForm({ ...inviteForm, type: event.target.value })}>{limitTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <select value={inviteForm.unit} onChange={(event) => setInviteForm({ ...inviteForm, unit: event.target.value })}>{limitUnitOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <input value={inviteForm.amount} onChange={(event) => setInviteForm({ ...inviteForm, amount: event.target.value })} inputMode="decimal" aria-label="默认限制" />
                </div>
              ) : null}
              {lastInvite ? <div className="team-console-invite-result">邀请链接：<code>{`${typeof window !== "undefined" ? window.location.origin : ""}/invite/team/${lastInvite.inviteCode || lastInvite.invite_code}`}</code></div> : null}
              <Table
                columns={["成员", "角色", "今日花费", "本月 Token", "剩余限制", "成功率", "最近使用", "操作"]}
                rows={(data.members || []).map((member) => ({
                  key: member.userId,
                  cells: [
                    member.memberName || member.userId,
                    member.roleLabel,
                    money2(member.usage?.todayCostCny || 0),
                    tokens(member.usage?.monthTokens || 0),
                    limitText(member.limit),
                    `${Number(member.usage?.successRate || 100).toFixed(1)}%`,
                    time(member.usage?.lastUsedAt),
                    canManageMembers ? <InlineLimitEditor key={member.userId} member={member} onSave={updateLimit} saving={saving} /> : "仅查看",
                  ],
                }))}
                empty="还没有团队成员，先生成邀请链接。"
              />
            </section>
          ) : null}

          {tab === "keys" ? (
            <section className="team-console-panel">
              <div className="team-console-panel-head">
                <div><h2>团队 API Key</h2><p>不同项目或成员用不同 Key，队长可以按 Key 追踪 Token 和花费。</p></div>
                <Link href="/api-management">去创建团队 Key</Link>
              </div>
              <Table
                columns={["API Key", "请求次数", "Token", "花费", "说明"]}
                rows={(data.apiKeyCosts || []).map((item) => ({
                  key: item.apiKeyId,
                  cells: [item.apiKeyId, item.requests, tokens(item.tokens), money2(item.costCny), "所有调用都会写入团队账本"],
                }))}
                empty="还没有团队 Key 消费记录。创建 API Key 时选择当前团队即可归入团队账本。"
              />
            </section>
          ) : null}

          {tab === "usage" ? (
            <section className="team-console-panel">
              <div className="team-console-panel-head">
                <div><h2>Token 去向</h2><p>队长可以按成员、API Key、用途、输入/输出 Token 和 Request ID 追踪每一笔消耗。</p></div>
              </div>
              <Table
                columns={["时间", "成员", "API Key", "模型 / 用途", "输入", "输出", "总 Token", "花费", "Request ID"]}
                rows={logs.map((log) => ({
                  key: `usage-${log.id || log.requestId}`,
                  cells: [
                    time(log.createdAt),
                    log.userId || "成员",
                    <code key="api-key" className="team-console-inline-code">{shortId(log.apiKeyId)}</code>,
                    <div key="model-purpose" className="team-console-stack"><strong>{log.model || "未知模型"}</strong><span>{purposeText(log.purpose)}</span></div>,
                    tokens(log.inputTokens),
                    tokens(log.outputTokens),
                    tokens(log.totalTokens),
                    money(log.actualCostCny),
                    <code key="request-id" className="team-console-inline-code">{shortId(log.requestId)}</code>,
                  ],
                }))}
                empty="还没有 Token 去向记录。团队成员真实调用成功后会自动写入。"
              />
            </section>
          ) : null}

          {tab === "logs" ? (
            <section className="team-console-panel">
              <div className="team-console-panel-head"><div><h2>团队调用日志</h2><p>每一笔 Token 花在哪里、谁用了、哪个模型、是否成功，都在这里追踪。</p></div></div>
              <Table
                columns={["时间", "成员", "API Key", "模型", "用途", "Token", "花费", "状态", "Request ID"]}
                rows={logs.map((log) => ({
                  key: log.id || log.requestId,
                  cells: [
                    time(log.createdAt),
                    log.userId || "成员",
                    <code key="api-key" className="team-console-inline-code">{shortId(log.apiKeyId)}</code>,
                    log.model || "未知模型",
                    purposeText(log.purpose),
                    `${tokens(log.inputTokens)} / ${tokens(log.outputTokens)} / ${tokens(log.totalTokens)}`,
                    money(log.actualCostCny),
                    log.success === false ? `失败：${log.errorCode || "未知"}` : "成功",
                    <code key="request-id" className="team-console-inline-code">{shortId(log.requestId)}</code>,
                  ],
                }))}
                empty="还没有团队调用日志。"
              />
            </section>
          ) : null}

          {tab === "billing" ? (
            <section className="team-console-panel">
              <div className="team-console-panel-head">
                <div><h2>团队账单</h2><p>团队充值、模型调用、成员消费、失败请求都按同一个团队维度对账。</p></div>
                {canExport ? <a href={`/api/team/billing/export?teamId=${encodeURIComponent(teamId)}`}>导出 CSV</a> : null}
              </div>
              <Table
                columns={["时间", "成员", "类型", "金额", "Token", "说明", "Request ID"]}
                rows={(data.transactions || []).map((item) => ({
                  key: item.id,
                  cells: [time(item.createdAt), item.userId || "团队", item.type, money2(item.amountCny), tokens(item.tokens), item.description || "团队账本流水", item.requestId || "-"],
                }))}
                empty="还没有团队账单流水。真实调用成功后会自动写入。"
              />
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function Metric({ label, value, tone = "" }) {
  return <article className={`team-console-metric ${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function Panel({ title, children }) {
  return <section className="team-console-panel"><h2>{title}</h2>{children}</section>;
}

function MiniRow({ label, value }) {
  return <div className="team-console-mini-row"><span>{label}</span><strong>{value}</strong></div>;
}

function RankList({ rows = [], nameKey, value, empty }) {
  if (!rows.length) return <p className="team-console-empty-text">{empty}</p>;
  return <div className="team-console-rank">{rows.slice(0, 6).map((item, index) => <div key={item[nameKey] || index}><span>{index + 1}. {item[nameKey] || "未知"}</span><strong>{value(item)}</strong></div>)}</div>;
}

function Table({ columns = [], rows = [], empty = "暂无数据" }) {
  return (
    <div className="team-console-table-wrap">
      <table className="team-console-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.key}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}
          {!rows.length ? <tr><td colSpan={columns.length} className="team-console-empty-cell">{empty}</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function InlineLimitEditor({ member, onSave, saving }) {
  const [type, setType] = useState(member.limit?.limitType || "daily");
  const [unit, setUnit] = useState(member.limit?.limitUnit || "cny");
  const [amount, setAmount] = useState(String(member.limit?.limitAmount || 10));
  return (
    <div className="team-console-inline-editor">
      <select value={type} onChange={(event) => setType(event.target.value)}>{limitTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select value={unit} onChange={(event) => setUnit(event.target.value)}>{limitUnitOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label="成员限制" />
      <button type="button" onClick={() => onSave(member, { type, unit, amount })} disabled={saving}>保存</button>
    </div>
  );
}
