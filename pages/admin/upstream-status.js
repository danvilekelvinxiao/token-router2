import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

function statusText(item) {
  if (item?.ok || item?.status === "ok" || item?.status === "healthy") return "正常";
  if (item?.status === "degraded") return "波动";
  return "异常";
}

export default function UpstreamStatusPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/channel-monitor/summary");
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "上游状态读取失败");
      setData(json);
    } catch (err) {
      setError(err.message || "上游状态读取失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => load());
  }, []);

  const upstreams = data?.upstreams || data?.channels || [];

  return (
    <>
      <Head><title>上游状态 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/upstream-status">
        <main className="upstream-status-page">
          <header>
            <div>
              <span>UPSTREAM STATUS</span>
              <h1>上游状态</h1>
              <p>这里看 FlowAPI 当前能不能连到 New API、sub2api、OpenRouter 或备用聚合路由。红色异常会直接影响用户调用成功率。</p>
            </div>
            <div>
              <button type="button" disabled={loading} onClick={() => load()}>{loading ? "检查中..." : "刷新状态"}</button>
            </div>
          </header>

          {error ? <div className="error">{error}</div> : null}

          <section className="summary">
            <article>
              <span>当前状态</span>
              <strong>{data?.ok || data?.success ? "可用" : "待确认"}</strong>
            </article>
            <article>
              <span>活跃上游</span>
              <strong>{data?.activeUpstream || data?.active || "未返回"}</strong>
            </article>
            <article>
              <span>检查数量</span>
              <strong>{upstreams.length}</strong>
            </article>
          </section>

          <section className="list">
            {loading && !data ? <p>正在读取上游状态...</p> : null}
            {upstreams.map((item, index) => {
              const state = statusText(item);
              return (
                <article key={`${item.upstream || item.name || index}`}>
                  <div className={`dot ${state}`} />
                  <div>
                    <strong>{item.upstream || item.name || item.label || `上游 ${index + 1}`}</strong>
                    <p>{item.message || item.suggestion || item.error || "暂无说明"}</p>
                  </div>
                  <span>{state}</span>
                  <code>{item.statusCode || item.latencyMs || item.latency || "-"}</code>
                </article>
              );
            })}
            {!loading && upstreams.length === 0 ? <p>暂无上游状态数据，请先在上游渠道中配置并保存。</p> : null}
          </section>
        </main>
      </AdminLayout>
      <style jsx>{`
        .upstream-status-page { color: var(--dash-text); display: grid; gap: 16px; }
        header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 14px; padding: 22px; }
        header span { color: var(--dash-accent); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        h1 { margin: 6px 0 0; font-size: 28px; font-weight: 950; letter-spacing: 0; }
        header p { max-width: 720px; margin: 8px 0 0; color: var(--dash-sub); font-size: 13px; line-height: 1.7; }
        header div:last-child { display: flex; gap: 8px; }
        input { min-height: 40px; border-radius: 10px; border: 1px solid var(--dash-border); background: var(--dash-card-bg); color: var(--dash-text); padding: 0 12px; }
        button { min-height: 40px; border: 0; border-radius: 10px; padding: 0 14px; color: #fff; font-weight: 900; cursor: pointer; background: linear-gradient(135deg,#6366f1,#8b5cf6); }
        .error { border: 1px solid rgba(239,68,68,.22); background: rgba(239,68,68,.1); color: #ef4444; border-radius: 12px; padding: 12px; font-weight: 800; }
        .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .summary article, .list article, .list p { border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 12px; padding: 15px; }
        .summary span { display: block; color: var(--dash-sub); font-size: 12px; font-weight: 800; }
        .summary strong { display: block; margin-top: 7px; font-size: 22px; font-weight: 950; overflow-wrap: anywhere; }
        .list { display: grid; gap: 10px; }
        .list article { display: grid; grid-template-columns: 10px 1fr 70px 80px; gap: 12px; align-items: center; }
        .dot { width: 9px; height: 9px; border-radius: 99px; background: #ef4444; }
        .dot.正常 { background: #16a34a; }
        .dot.波动 { background: #f59e0b; }
        .list strong { font-size: 14px; font-weight: 950; }
        .list p { margin: 4px 0 0; padding: 0; border: 0; background: transparent; color: var(--dash-sub); font-size: 12px; line-height: 1.5; }
        .list span { font-size: 12px; font-weight: 900; color: var(--dash-accent); }
        code { font-size: 12px; color: var(--dash-sub); text-align: right; }
        @media (max-width: 900px) { header, header div:last-child { display: grid; } .summary, .list article { grid-template-columns: 1fr; } code { text-align: left; } }
      `}</style>
    </>
  );
}
