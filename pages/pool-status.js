import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";

function percent(value) {
  const number = Number(value || 0);
  return `${Math.round(number * 1000) / 10}%`;
}

function statusClass(status = "unknown") {
  if (status === "healthy" || status === "available") return "ok";
  if (status === "degraded" || status === "busy" || status === "rate_limited") return "warn";
  if (status === "down" || status === "error" || status === "expired") return "bad";
  return "muted";
}

export default function PublicPoolStatusPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/public/pool-status");
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.success === false) throw new Error(json.message || json.error || "号池状态读取失败");
      setData(json);
    } catch (err) {
      setError(err.message || "号池状态读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => load());
  }, []);

  const summary = data?.summary || {};
  const accountSummary = summary.accounts || {};
  const channelSummary = summary.channels || {};
  const windows = data?.windows || {};
  const displayStatus = data?.status || "unknown";
  const displayLabel = data?.statusLabel || "待确认";
  let updatedText = "等待刷新";
  if (data?.generatedAt) {
    try { updatedText = new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false }); } catch { updatedText = data.generatedAt; }
  }

  return (
    <>
      <Head>
        <title>FlowAPI 号池实时状态</title>
        <meta name="description" content="FlowAPI sub2api 号池、渠道和中转站实时聚合状态。" />
      </Head>
      <main className="status-shell">
        <nav className="topbar">
          <Link href="/" className="brand">Flow<span>API</span></Link>
          <div className="topbar-actions">
            <Link href="/login">登录</Link>
            <Link href="/dashboard">控制台</Link>
          </div>
        </nav>

        <section className={`hero ${statusClass(displayStatus)}`}>
          <div>
            <span className="eyebrow">POOL STATUS</span>
            <h1>FlowAPI 号池实时状态</h1>
            <p>这里展示对用户安全的聚合状态：账号池可用性、渠道健康度、最近调用错误率和维护提示。敏感凭证、账号详情、完整错误和用户内容不会公开展示。</p>
          </div>
          <div className="hero-state">
            <span className={`pulse ${statusClass(displayStatus)}`} />
            <strong>{loading && !data ? "读取中" : displayLabel}</strong>
            <small>更新时间：{updatedText}</small>
            <button type="button" onClick={load} disabled={loading}>{loading ? "刷新中..." : "刷新"}</button>
          </div>
        </section>

        {error ? <div className="error">{error}</div> : null}

        <section className="summary-grid">
          <article>
            <span>整体状态</span>
            <strong>{displayLabel}</strong>
            <small>缓存读取，避免页面打开时触发昂贵全量检测</small>
          </article>
          <article>
            <span>可用账号</span>
            <strong>{accountSummary.available ?? 0}/{accountSummary.total ?? 0}</strong>
            <small>仅展示聚合数量，不公开账号身份</small>
          </article>
          <article>
            <span>活跃渠道</span>
            <strong>{summary.activeChannels ?? 0}/{channelSummary.total ?? 0}</strong>
            <small>健康与波动渠道会参与可用性统计</small>
          </article>
          <article>
            <span>15 分钟错误率</span>
            <strong>{percent(windows["15m"]?.errorRate)}</strong>
            <small>{windows["15m"]?.total || 0} 次调用样本</small>
          </article>
        </section>

        <section className="panel-grid">
          <article className="panel">
            <div className="panel-title">
              <span>账号池聚合</span>
              <strong>{accountSummary.total || 0}</strong>
            </div>
            <div className="bars">
              {[
                ["available", "可用", accountSummary.available || 0],
                ["busy", "繁忙/低余量", accountSummary.busy || 0],
                ["rate_limited", "限流", accountSummary.rate_limited || 0],
                ["expired", "过期", accountSummary.expired || 0],
                ["error", "异常", accountSummary.error || 0],
                ["disabled", "禁用", accountSummary.disabled || 0],
              ].map(([key, label, value]) => (
                <div className="bar-row" key={key}>
                  <span>{label}</span>
                  <div><i style={{ width: `${accountSummary.total ? Math.min(100, (Number(value) / Number(accountSummary.total)) * 100) : 0}%` }} /></div>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <span>最近窗口</span>
              <strong>请求健康</strong>
            </div>
            <div className="window-list">
              {["5m", "15m", "1h"].map((key) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{windows[key]?.total || 0} 次</strong>
                  <small>失败 {windows[key]?.failed || 0} · 错误率 {percent(windows[key]?.errorRate)}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="channels">
          <div className="section-head">
            <span>PUBLIC CHANNELS</span>
            <h2>公开渠道健康</h2>
            <p>只展示安全聚合字段：渠道别名、状态、模型范围、成功率和延迟。</p>
          </div>
          <div className="channel-list">
            {(data?.channels || []).map((channel) => (
              <article key={channel.ref}>
                <span className={`dot ${statusClass(channel.status)}`} />
                <div>
                  <strong>{channel.name || channel.provider || "FlowAPI 渠道"}</strong>
                  <p>{(channel.supportedModels || []).slice(0, 4).join(" / ") || "多模型统一调度"}</p>
                </div>
                <small>{channel.statusLabel || channel.status}</small>
                <code>{percent(channel.successRate)} · {channel.avgLatencyMs || 0}ms</code>
              </article>
            ))}
            {!loading && !(data?.channels || []).length ? <p className="empty">暂无公开渠道数据，后台配置完成并刷新缓存后会自动显示。</p> : null}
          </div>
        </section>

        {(data?.notices || []).length ? (
          <section className="notices">
            {(data.notices || []).map((notice) => <p key={notice}>{notice}</p>)}
          </section>
        ) : null}
      </main>

      <style jsx>{`
        .status-shell { min-height: 100vh; padding: 24px; color: #e5eefb; background: radial-gradient(circle at top left, rgba(99,102,241,.24), transparent 32%), linear-gradient(135deg, #07111f 0%, #0f172a 46%, #111827 100%); }
        .topbar { max-width: 1160px; margin: 0 auto 18px; display: flex; justify-content: space-between; align-items: center; }
        .brand { color: #fff; font-size: 20px; font-weight: 950; text-decoration: none; letter-spacing: -.02em; }
        .brand span { color: #60a5fa; }
        .topbar-actions { display: flex; gap: 10px; }
        .topbar-actions a { color: #cbd5e1; border: 1px solid rgba(148,163,184,.25); border-radius: 999px; padding: 8px 12px; text-decoration: none; font-size: 13px; font-weight: 800; }
        .hero, .summary-grid, .panel-grid, .channels, .notices, .error { max-width: 1160px; margin-left: auto; margin-right: auto; }
        .hero { display: grid; grid-template-columns: 1fr 260px; gap: 18px; align-items: stretch; border: 1px solid rgba(148,163,184,.2); background: rgba(15,23,42,.72); border-radius: 28px; padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,.32); }
        .hero.ok { border-color: rgba(34,197,94,.28); }
        .hero.warn { border-color: rgba(245,158,11,.28); }
        .hero.bad { border-color: rgba(239,68,68,.32); }
        .eyebrow, .section-head span { color: #93c5fd; font-size: 12px; font-weight: 950; letter-spacing: .16em; }
        h1 { margin: 10px 0 12px; font-size: clamp(32px, 5vw, 56px); line-height: .98; letter-spacing: -.06em; }
        .hero p, .section-head p { margin: 0; color: #94a3b8; line-height: 1.75; font-size: 14px; max-width: 760px; }
        .hero-state { border: 1px solid rgba(148,163,184,.18); background: rgba(2,6,23,.36); border-radius: 22px; padding: 18px; display: grid; place-items: center; text-align: center; gap: 10px; }
        .hero-state strong { font-size: 28px; font-weight: 950; }
        .hero-state small { color: #94a3b8; font-size: 12px; }
        button { border: 0; border-radius: 12px; padding: 10px 16px; color: #fff; background: linear-gradient(135deg, #2563eb, #7c3aed); font-weight: 900; cursor: pointer; }
        button:disabled { opacity: .7; cursor: not-allowed; }
        .pulse, .dot { width: 12px; height: 12px; border-radius: 999px; background: #64748b; display: inline-block; }
        .pulse { width: 18px; height: 18px; box-shadow: 0 0 0 10px rgba(100,116,139,.12); }
        .ok { background: #22c55e; box-shadow: 0 0 0 10px rgba(34,197,94,.12); }
        .warn { background: #f59e0b; box-shadow: 0 0 0 10px rgba(245,158,11,.12); }
        .bad { background: #ef4444; box-shadow: 0 0 0 10px rgba(239,68,68,.12); }
        .error { margin-top: 14px; border: 1px solid rgba(239,68,68,.28); background: rgba(239,68,68,.12); color: #fecaca; border-radius: 16px; padding: 14px; font-weight: 900; }
        .summary-grid { margin-top: 16px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .summary-grid article, .panel, .channels, .notices { border: 1px solid rgba(148,163,184,.18); background: rgba(15,23,42,.66); border-radius: 20px; padding: 18px; }
        .summary-grid span, .panel-title span { color: #94a3b8; font-size: 12px; font-weight: 900; }
        .summary-grid strong, .panel-title strong { display: block; margin-top: 8px; font-size: 26px; font-weight: 950; }
        .summary-grid small { display: block; margin-top: 8px; color: #64748b; font-size: 12px; line-height: 1.5; }
        .panel-grid { margin-top: 12px; display: grid; grid-template-columns: 1.1fr .9fr; gap: 12px; }
        .panel-title { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 14px; }
        .bars { display: grid; gap: 10px; }
        .bar-row { display: grid; grid-template-columns: 90px 1fr 40px; gap: 10px; align-items: center; color: #cbd5e1; font-size: 13px; }
        .bar-row div { height: 8px; border-radius: 999px; background: rgba(148,163,184,.16); overflow: hidden; }
        .bar-row i { display: block; height: 100%; background: linear-gradient(90deg, #22c55e, #60a5fa); border-radius: inherit; }
        .bar-row strong { text-align: right; }
        .window-list { display: grid; gap: 10px; }
        .window-list div { border: 1px solid rgba(148,163,184,.14); border-radius: 14px; padding: 12px; }
        .window-list span, .window-list small { color: #94a3b8; font-size: 12px; }
        .window-list strong { display: block; margin: 4px 0; font-size: 20px; }
        .channels { margin-top: 12px; }
        .section-head h2 { margin: 8px 0; font-size: 26px; }
        .channel-list { display: grid; gap: 10px; margin-top: 14px; }
        .channel-list article, .empty { display: grid; grid-template-columns: 14px 1fr 90px 130px; gap: 12px; align-items: center; border: 1px solid rgba(148,163,184,.14); background: rgba(2,6,23,.22); border-radius: 14px; padding: 13px; }
        .channel-list strong { font-size: 14px; }
        .channel-list p { margin: 4px 0 0; color: #94a3b8; font-size: 12px; }
        .channel-list small { color: #bfdbfe; font-weight: 900; }
        code { color: #94a3b8; text-align: right; }
        .notices { margin-top: 12px; }
        .notices p { margin: 0 0 8px; color: #fde68a; line-height: 1.6; }
        .notices p:last-child { margin-bottom: 0; }
        @media (max-width: 900px) { .status-shell { padding: 16px; } .hero, .panel-grid, .summary-grid, .channel-list article, .empty { grid-template-columns: 1fr; } code { text-align: left; } }
      `}</style>
    </>
  );
}
