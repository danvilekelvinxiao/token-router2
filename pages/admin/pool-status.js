import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

function percent(value) {
  const number = Number(value || 0);
  return `${Math.round(number * 1000) / 10}%`;
}

function statusClass(status = "unknown") {
  if (["healthy", "available"].includes(status)) return "ok";
  if (["degraded", "busy", "rate_limited", "cooldown"].includes(status)) return "warn";
  if (["down", "error", "expired"].includes(status)) return "bad";
  return "muted";
}

function formatTime(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString("zh-CN", { hour12: false }); } catch { return value; }
}

export default function AdminPoolStatusPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("accounts");

  async function load({ refresh = false, runChecks = false } = {}) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/pool-status", refresh ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runChecks }),
      } : undefined);
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.success === false) throw new Error(json.error || "号池状态读取失败");
      setData(json);
    } catch (err) {
      setError(err.message || "号池状态读取失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => load());
  }, []);

  const summary = data?.summary || {};
  const accounts = data?.accounts || [];
  const channels = data?.channels || [];
  const events = data?.events || [];
  const activeRows = tab === "channels" ? channels : tab === "events" ? events : accounts;
  const updatedText = formatTime(data?.generatedAt);

  return (
    <>
      <Head><title>号池实时状态 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/pool-status">
        <main className="pool-admin-page">
          <header>
            <div>
              <span>POOL OBSERVABILITY</span>
              <h1>号池实时状态</h1>
              <p>统一读取 token_pool、渠道配置、巡检日志和调用窗口指标；后台展示经过脱敏的账号、渠道与事件详情，公开页面只返回聚合状态。</p>
            </div>
            <div className="actions">
              <button type="button" onClick={() => load()} disabled={loading || refreshing}>{loading ? "读取中..." : "读取缓存"}</button>
              <button type="button" className="secondary" onClick={() => load({ refresh: true, runChecks: true })} disabled={loading || refreshing}>{refreshing ? "巡检中..." : "立即巡检并刷新"}</button>
            </div>
          </header>

          {error ? <div className="error">{error}</div> : null}

          <section className="summary">
            <article className={statusClass(data?.status)}>
              <span>整体状态</span>
              <strong>{data?.statusLabel || "待确认"}</strong>
              <small>{updatedText}</small>
            </article>
            <article>
              <span>账号池</span>
              <strong>{summary.accounts?.available ?? 0}/{summary.accounts?.total ?? 0}</strong>
              <small>限流 {summary.accounts?.rate_limited ?? 0} · 异常 {summary.accounts?.error ?? 0}</small>
            </article>
            <article>
              <span>渠道</span>
              <strong>{summary.activeChannels ?? 0}/{summary.channels?.total ?? 0}</strong>
              <small>不可用 {summary.channels?.down ?? 0} · 维护 {summary.channels?.maintenance ?? 0}</small>
            </article>
            <article>
              <span>15 分钟窗口</span>
              <strong>{percent(data?.windows?.["15m"]?.errorRate)}</strong>
              <small>{data?.windows?.["15m"]?.total || 0} 次请求 · 平均 {data?.windows?.["15m"]?.avgLatencyMs || 0}ms</small>
            </article>
          </section>

          <section className="notices">
            {(data?.notices || []).length ? data.notices.map((notice) => <p key={notice}>{notice}</p>) : <p>暂无需要处理的号池提示。</p>}
          </section>

          <section className="tabs">
            {[
              ["accounts", `账号池 ${accounts.length}`],
              ["channels", `渠道 ${channels.length}`],
              ["events", `事件 ${events.length}`],
            ].map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
            ))}
          </section>

          <section className="table-card">
            {tab === "accounts" ? (
              <div className="table accounts">
                <div className="thead"><span>账号</span><span>状态</span><span>余量</span><span>模型</span><span>延迟/成功率</span><span>最近错误</span></div>
                {accounts.map((account) => (
                  <div className="row" key={account.ref}>
                    <div><strong>{account.name}</strong><small>{account.idPreview} · {account.provider}</small></div>
                    <span className={`badge ${statusClass(account.status)}`}>{account.statusLabel}</span>
                    <div><strong>{account.quotaPercent == null ? "-" : `${account.quotaPercent}%`}</strong><small>{account.quotaRemaining || 0}/{account.quotaTotal || 0}</small></div>
                    <small>{(account.allowedModels || []).slice(0, 3).join(" / ") || account.modelType || "all"}</small>
                    <small>{account.avgLatencyMs || 0}ms · {percent(account.successRate)}</small>
                    <small>{account.lastError || account.suggestion || "-"}</small>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "channels" ? (
              <div className="table channels">
                <div className="thead"><span>渠道</span><span>状态</span><span>上游</span><span>模型</span><span>优先级</span><span>最近错误</span></div>
                {channels.map((channel) => (
                  <div className="row" key={channel.ref}>
                    <div><strong>{channel.name}</strong><small>{channel.idPreview} · {channel.provider}</small></div>
                    <span className={`badge ${statusClass(channel.status)}`}>{channel.statusLabel}</span>
                    <small>{channel.baseUrl || "-"}</small>
                    <small>{(channel.supportedModels || []).slice(0, 4).join(" / ") || "all"}</small>
                    <small>{channel.priority || 0}</small>
                    <small>{channel.lastError || "-"}</small>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "events" ? (
              <div className="table events">
                <div className="thead"><span>时间</span><span>级别</span><span>类型</span><span>对象</span><span>分类</span><span>消息</span></div>
                {events.map((event) => (
                  <div className="row" key={event.id}>
                    <small>{formatTime(event.createdAt)}</small>
                    <span className={`badge ${event.level === "critical" ? "bad" : event.level === "warning" ? "warn" : "ok"}`}>{event.level || "info"}</span>
                    <small>{event.type}</small>
                    <small>{event.accountRef || event.requestRef || "-"}</small>
                    <small>{event.errorCategory || "-"}</small>
                    <small>{event.message || "-"}</small>
                  </div>
                ))}
              </div>
            ) : null}

            {!loading && activeRows.length === 0 ? <p className="empty">暂无数据。请先配置账号池/渠道，或点击“立即巡检并刷新”。</p> : null}
            {loading && !data ? <p className="empty">正在读取号池状态...</p> : null}
          </section>
        </main>
      </AdminLayout>

      <style jsx>{`
        .pool-admin-page { color: var(--dash-text); display: grid; gap: 14px; }
        header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 16px; padding: 22px; }
        header span { color: var(--dash-accent); font-size: 11px; font-weight: 950; letter-spacing: .12em; }
        h1 { margin: 6px 0 0; font-size: 30px; font-weight: 950; }
        header p { max-width: 760px; margin: 8px 0 0; color: var(--dash-sub); font-size: 13px; line-height: 1.7; }
        .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        button { min-height: 40px; border: 0; border-radius: 10px; padding: 0 14px; color: #fff; font-weight: 900; cursor: pointer; background: linear-gradient(135deg,#6366f1,#8b5cf6); }
        button.secondary { background: rgba(99,102,241,.16); color: var(--dash-text); border: 1px solid var(--dash-border); }
        button:disabled { opacity: .65; cursor: not-allowed; }
        .error { border: 1px solid rgba(239,68,68,.22); background: rgba(239,68,68,.1); color: #ef4444; border-radius: 12px; padding: 12px; font-weight: 800; }
        .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
        .summary article, .notices, .tabs, .table-card { border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 14px; padding: 15px; }
        .summary article.ok { border-color: rgba(34,197,94,.34); }
        .summary article.warn { border-color: rgba(245,158,11,.34); }
        .summary article.bad { border-color: rgba(239,68,68,.34); }
        .summary span, .summary small { display: block; color: var(--dash-sub); font-size: 12px; font-weight: 800; }
        .summary strong { display: block; margin: 7px 0; font-size: 23px; font-weight: 950; overflow-wrap: anywhere; }
        .notices { display: grid; gap: 8px; }
        .notices p { margin: 0; color: var(--dash-sub); font-size: 13px; line-height: 1.6; }
        .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
        .tabs button { background: transparent; color: var(--dash-sub); border: 1px solid var(--dash-border); }
        .tabs button.active { color: #fff; background: linear-gradient(135deg,#2563eb,#7c3aed); border-color: transparent; }
        .table-card { overflow-x: auto; }
        .table { min-width: 980px; display: grid; gap: 8px; }
        .thead, .row { display: grid; gap: 12px; align-items: center; }
        .accounts .thead, .accounts .row { grid-template-columns: 1.35fr 90px 100px 1.25fr 120px 1.5fr; }
        .channels .thead, .channels .row { grid-template-columns: 1.25fr 90px 1.25fr 1.25fr 70px 1.5fr; }
        .events .thead, .events .row { grid-template-columns: 160px 90px 110px 150px 120px 1.8fr; }
        .thead { color: var(--dash-sub); font-size: 12px; font-weight: 950; padding: 0 10px; }
        .row { border: 1px solid var(--dash-border); background: color-mix(in srgb, var(--dash-card-bg) 82%, transparent); border-radius: 12px; padding: 12px 10px; }
        .row strong { display: block; font-size: 13px; font-weight: 950; }
        .row small { color: var(--dash-sub); line-height: 1.45; overflow-wrap: anywhere; }
        .badge { display: inline-flex; width: fit-content; align-items: center; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 950; background: rgba(100,116,139,.14); color: var(--dash-sub); }
        .badge.ok { background: rgba(34,197,94,.13); color: #16a34a; }
        .badge.warn { background: rgba(245,158,11,.14); color: #d97706; }
        .badge.bad { background: rgba(239,68,68,.13); color: #ef4444; }
        .empty { margin: 0; color: var(--dash-sub); border: 1px dashed var(--dash-border); border-radius: 12px; padding: 20px; }
        @media (max-width: 900px) { header { display: grid; } .summary { grid-template-columns: 1fr; } .actions { justify-content: flex-start; } }
      `}</style>
    </>
  );
}
