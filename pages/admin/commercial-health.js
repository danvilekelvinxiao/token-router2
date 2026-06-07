import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const LEVEL_META = {
  ok: { label: "正常", tone: "ok" },
  warn: { label: "待确认", tone: "warn" },
  fail: { label: "异常", tone: "fail" },
};

export default function CommercialHealthPage() {
  const [secret, setSecret] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem("flowapi_admin_secret") || ""));
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  }

  async function runCheck() {
    setLoading(true);
    try {
      localStorage.setItem("flowapi_admin_secret", secret);
      const response = await fetch("/api/admin/commercial-health", {
        headers: secret ? { "x-admin-secret": secret } : {},
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "商业闭环检查失败");
      setHealth(data);
      showToast("商业闭环检查完成");
    } catch (error) {
      showToast(error.message || "商业闭环检查失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => runCheck());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scoreTone = useMemo(() => {
    const score = Number(health?.score || 0);
    if (score >= 85) return "ok";
    if (score >= 65) return "warn";
    return "fail";
  }, [health?.score]);

  return (
    <>
      <Head><title>商业化闭环检查 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/commercial-health">
        <main className="commercial-health-page">
          <header className="commercial-health-hero">
            <div>
              <span>COMMERCIAL LOOP</span>
              <h1>商业化闭环检查</h1>
              <p>一键检查注册验证码、API Key、模型广场、上游转发、扣费账本、充值订单、图片生成、Excel 导出和 sub2api 渠道状态。</p>
            </div>
            <div className="commercial-health-actions">
              <input
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                onBlur={() => localStorage.setItem("flowapi_admin_secret", secret)}
                type="password"
                placeholder="管理密钥"
                aria-label="管理密钥"
              />
              <button type="button" onClick={runCheck} disabled={loading}>{loading ? "检查中..." : "一键检查商业闭环"}</button>
            </div>
          </header>

          <section className={`commercial-health-score ${scoreTone}`}>
            <div>
              <span>商业化就绪评分</span>
              <strong>{health?.score ?? "--"}</strong>
            </div>
            <div>
              <span>正常</span>
              <strong>{health?.summary?.ok ?? 0}</strong>
            </div>
            <div>
              <span>待确认</span>
              <strong>{health?.summary?.warn ?? 0}</strong>
            </div>
            <div>
              <span>异常</span>
              <strong>{health?.summary?.fail ?? 0}</strong>
            </div>
          </section>

          <section className="commercial-health-grid">
            {loading && !health ? (
              <article className="commercial-health-empty">正在检查商业闭环...</article>
            ) : (health?.checks || []).map((item) => {
              const meta = LEVEL_META[item.level] || LEVEL_META.warn;
              return (
                <article key={item.label} className={`commercial-health-card ${meta.tone}`}>
                  <div>
                    <i aria-hidden="true" />
                    <span>{meta.label}</span>
                  </div>
                  <h2>{item.label}</h2>
                  <p>{item.detail}</p>
                </article>
              );
            })}
          </section>

          <section className="commercial-health-links">
            <Link href="/admin/model-market">模型广场管理</Link>
            <Link href="/admin/logs">管理员日志</Link>
            <Link href="/admin/recharges">充值审核</Link>
            <Link href="/api/admin/channel-monitor/summary">渠道状态接口</Link>
          </section>
        </main>
        {toast ? <div className="models-toast-v3">{toast}</div> : null}
      </AdminLayout>

      <style jsx>{`
        .commercial-health-page { display: grid; gap: 16px; color: var(--dash-text); }
        .commercial-health-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; }
        .commercial-health-hero span { color: var(--dash-accent); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        .commercial-health-hero h1 { margin: 4px 0 0; font-size: 28px; font-weight: 950; letter-spacing: 0; }
        .commercial-health-hero p { max-width: 760px; margin: 8px 0 0; color: var(--dash-sub); font-size: 13px; line-height: 1.7; }
        .commercial-health-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
        .commercial-health-actions input { min-height: 42px; border: 1px solid var(--dash-border); border-radius: 10px; background: var(--dash-card-bg); color: var(--dash-text); padding: 0 12px; }
        .commercial-health-actions button {
          min-height: 42px; border: 0; border-radius: 10px; padding: 0 16px; color: #fff; font-weight: 900; cursor: pointer;
          background: linear-gradient(135deg,#6366f1,#8b5cf6 56%,#a78bfa); box-shadow: 0 14px 34px rgba(99,102,241,.3);
        }
        .commercial-health-actions button:disabled { opacity: .7; cursor: wait; }
        .commercial-health-score { display: grid; grid-template-columns: 1.3fr repeat(3, 1fr); gap: 10px; }
        .commercial-health-score div, .commercial-health-card, .commercial-health-empty, .commercial-health-links {
          border: 1px solid var(--dash-border); border-radius: 14px; background: var(--dash-card-bg); box-shadow: 0 16px 50px rgba(15,23,42,.06);
        }
        .commercial-health-score div { padding: 16px; }
        .commercial-health-score span { display: block; color: var(--dash-sub); font-size: 12px; font-weight: 800; }
        .commercial-health-score strong { display: block; margin-top: 8px; font-size: 30px; font-weight: 950; }
        .commercial-health-score.ok div:first-child strong { color: #16a34a; }
        .commercial-health-score.warn div:first-child strong { color: #f59e0b; }
        .commercial-health-score.fail div:first-child strong { color: #ef4444; }
        .commercial-health-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .commercial-health-card { padding: 16px; min-height: 136px; }
        .commercial-health-card div { display: flex; align-items: center; gap: 8px; color: var(--dash-sub); font-size: 12px; font-weight: 900; }
        .commercial-health-card i { width: 9px; height: 9px; border-radius: 50%; background: #f59e0b; }
        .commercial-health-card.ok i { background: #16a34a; }
        .commercial-health-card.fail i { background: #ef4444; }
        .commercial-health-card h2 { margin: 12px 0 0; font-size: 16px; font-weight: 950; }
        .commercial-health-card p { margin: 8px 0 0; color: var(--dash-sub); font-size: 12px; line-height: 1.6; }
        .commercial-health-card.ok { border-color: rgba(22,163,74,.2); }
        .commercial-health-card.warn { border-color: rgba(245,158,11,.25); }
        .commercial-health-card.fail { border-color: rgba(239,68,68,.25); }
        .commercial-health-empty { padding: 30px; color: var(--dash-sub); text-align: center; grid-column: 1 / -1; }
        .commercial-health-links { display: flex; gap: 10px; flex-wrap: wrap; padding: 14px; }
        .commercial-health-links a { min-height: 38px; display: inline-flex; align-items: center; border: 1px solid var(--dash-border); border-radius: 10px; padding: 0 12px; color: var(--dash-accent); text-decoration: none; font-size: 12px; font-weight: 900; }
        @media (max-width: 900px) {
          .commercial-health-hero { display: grid; }
          .commercial-health-score, .commercial-health-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
