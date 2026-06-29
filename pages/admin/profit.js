export const dynamic = "force-dynamic";
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

function money(value) {
  return `$ API ${Number(value || 0).toFixed(2)}`;
}

function numberText(value) {
  return Number(value || 0).toLocaleString();
}

function marginText(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function buildBossVerdict(summary = {}) {
  const profit = Number(summary.profitCny || 0);
  const margin = Number(summary.profitMargin || 0);
  const missing = Number(summary.costMissingRequests || 0);
  if (missing > 0) {
    return {
      tone: "warn",
      title: "成本待确认",
      text: `有 ${missing} 个成功扣费请求没有上游成本，当前毛利只能参考，不能作为定价依据。`,
      action: "先到模型价格配置补齐成本价，再判断是否要涨价或切换渠道。",
    };
  }
  if (profit < 0) {
    return {
      tone: "bad",
      title: "正在亏钱",
      text: "最近调用的上游成本高于用户售价，继续放量会扩大亏损。",
      action: "立即暂停亏损模型，或提高售价、切换更便宜的上游渠道。",
    };
  }
  if (margin < 20 && Number(summary.revenueCny || 0) > 0) {
    return {
      tone: "warn",
      title: "毛利偏低",
      text: "当前毛利率低于 20%，抗波动能力不足，上游涨价或失败重试都会吃掉利润。",
      action: "优先提高售价、限制低毛利模型免费试用，或把主路由切到更便宜渠道。",
    };
  }
  return {
    tone: "good",
    title: "毛利健康",
    text: "当前售价和成本差价处于可控区间，可以继续观察真实调用量。",
    action: "保持成本监控，等调用量稳定后再做阶梯套餐和团队包。",
  };
}

function MetricCard({ label, value, hint, tone = "neutral" }) {
  const color = tone === "good" ? "#16a34a" : tone === "bad" ? "#dc2626" : "var(--dash-text)";
  return (
    <article style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dash-sub)", marginBottom: 8 }}>{label}</div>
      <strong style={{ display: "block", fontSize: 28, color, lineHeight: 1.1, fontFamily: "'SF Mono', monospace" }}>{value}</strong>
      {hint && <span style={{ display: "block", marginTop: 8, fontSize: 12, color: "var(--dash-sub)", lineHeight: 1.5 }}>{hint}</span>}
    </article>
  );
}

export default function AdminProfitPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchProfit = useCallback(async (selectedDays = days) => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/profit-overview?days=${selectedDays}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setData(null);
        setMessage(json?.error || "毛利数据读取失败");
        return;
      }
      setData(json);
    } catch {
      setData(null);
      setMessage("无法连接毛利审计接口");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) fetchProfit(days);
    });
    return () => {
      active = false;
    };
  }, [days, fetchProfit]);

  const summary = data?.summary || {};
  const today = data?.today || {};
  const marginTone = Number(summary.profitMargin || 0) >= 20 ? "good" : Number(summary.profitMargin || 0) < 0 ? "bad" : "neutral";
  const verdict = buildBossVerdict(summary);
  const verdictColor = verdict.tone === "good" ? "#16a34a" : verdict.tone === "bad" ? "#dc2626" : "#d97706";

  return (
    <>
      <Head><title>毛利审计 - FlowAPI 管理后台</title></Head>
      <AdminLayout currentPath="/admin/profit">
        <main style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: 0 }}>毛利审计</h1>
              <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13, lineHeight: 1.6 }}>
                看真实销售额、上游成本、毛利和亏损请求，确认中转站差价是否健康。
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <select value={days} onChange={(event) => setDays(Number(event.target.value))} style={{ height: 36, borderRadius: 8, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", padding: "0 10px", fontWeight: 700 }}>
                <option value={1}>近 1 天</option>
                <option value={7}>近 7 天</option>
                <option value={30}>近 30 天</option>
                <option value={90}>近 90 天</option>
              </select>
              <button type="button" onClick={() => fetchProfit(days)} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid var(--dash-accent)", color: "var(--dash-accent)", background: "transparent", fontWeight: 800, cursor: "pointer" }}>
                刷新
              </button>
            </div>
          </header>

          {loading ? (
            <div style={{ padding: 36, textAlign: "center", color: "var(--dash-sub)" }}>正在读取毛利数据...</div>
          ) : message ? (
            <div style={{ padding: 18, borderRadius: 12, border: "1px solid rgba(239,68,68,0.24)", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontWeight: 800 }}>{message}</div>
          ) : (
            <>
              <section style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                <article style={{ border: `1px solid ${verdict.tone === "good" ? "rgba(22,163,74,0.25)" : verdict.tone === "bad" ? "rgba(220,38,38,0.25)" : "rgba(217,119,6,0.25)"}`, background: verdict.tone === "good" ? "rgba(22,163,74,0.08)" : verdict.tone === "bad" ? "rgba(220,38,38,0.08)" : "rgba(217,119,6,0.08)", borderRadius: 12, padding: "15px 18px" }}>
                  <strong style={{ display: "block", color: verdictColor, fontSize: 15, fontWeight: 900 }}>{verdict.title}</strong>
                  <span style={{ display: "block", marginTop: 6, color: "var(--dash-text)", fontSize: 13, lineHeight: 1.6 }}>{verdict.text}</span>
                  <span style={{ display: "block", marginTop: 5, color: "var(--dash-sub)", fontSize: 12, lineHeight: 1.6 }}>建议：{verdict.action}</span>
                </article>
                {(data?.warnings || []).map((warning) => (
                  <div key={warning} style={{ border: "1px solid rgba(217,119,6,0.24)", background: "rgba(217,119,6,0.08)", borderRadius: 10, padding: "10px 12px", color: "#d97706", fontSize: 12, fontWeight: 800, lineHeight: 1.5 }}>
                    {warning}
                  </div>
                ))}
              </section>

              <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
                <MetricCard label="销售额" value={money(summary.revenueCny)} hint={`今日 ${money(today.revenueCny)}`} />
                <MetricCard label="上游成本" value={money(summary.upstreamCostCny)} hint={`今日 ${money(today.upstreamCostCny)}`} />
                <MetricCard label="毛利" value={money(summary.profitCny)} hint={`今日 ${money(today.profitCny)}`} tone={Number(summary.profitCny || 0) >= 0 ? "good" : "bad"} />
                <MetricCard label="毛利率" value={marginText(summary.profitMargin)} hint={`${numberText(summary.lossRequests)} 个亏损请求 · 成本覆盖 ${marginText(summary.costCoverageRate ?? 100)}`} tone={marginTone} />
              </section>

              <section style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16 }}>
                <article style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 12, padding: "20px 22px" }}>
                  <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 900 }}>模型毛利排行</h2>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                      <thead>
                        <tr>
                          {["模型", "请求", "销售额", "成本", "毛利", "毛利率"].map((head) => (
                            <th key={head} style={{ textAlign: head === "模型" ? "left" : "right", padding: "0 0 10px", color: "var(--dash-sub)", fontSize: 11 }}>{head}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.models || []).map((item) => (
                          <tr key={item.model} style={{ borderTop: "1px solid var(--dash-border)" }}>
                            <td style={{ padding: "11px 0", fontSize: 13, fontWeight: 800 }}>{item.model}</td>
                            <td style={{ padding: "11px 0", textAlign: "right", fontFamily: "'SF Mono', monospace" }}>{numberText(item.requests)}</td>
                            <td style={{ padding: "11px 0", textAlign: "right", fontFamily: "'SF Mono', monospace" }}>{money(item.revenueCny)}</td>
                            <td style={{ padding: "11px 0", textAlign: "right", fontFamily: "'SF Mono', monospace" }}>{money(item.upstreamCostCny)}</td>
                            <td style={{ padding: "11px 0", textAlign: "right", fontFamily: "'SF Mono', monospace", color: Number(item.profitCny) >= 0 ? "#16a34a" : "#dc2626", fontWeight: 900 }}>{money(item.profitCny)}</td>
                            <td style={{ padding: "11px 0", textAlign: "right", fontFamily: "'SF Mono', monospace", color: Number(item.costMissingRequests || 0) > 0 ? "#d97706" : "var(--dash-text)" }}>
                              {marginText(item.profitMargin)}
                              {Number(item.costMissingRequests || 0) > 0 ? ` / 缺成本 ${item.costMissingRequests}` : ""}
                            </td>
                          </tr>
                        ))}
                        {!(data?.models || []).length && (
                          <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--dash-sub)" }}>暂无调用数据</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 12, padding: "20px 22px" }}>
                  <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 900 }}>最近亏损请求</h2>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(data?.losses || []).map((item) => (
                      <div key={item.id} style={{ border: "1px solid rgba(239,68,68,0.22)", background: "rgba(239,68,68,0.06)", borderRadius: 10, padding: 12 }}>
                        <strong style={{ display: "block", fontSize: 13, overflowWrap: "anywhere" }}>{item.model}</strong>
                        <span style={{ display: "block", marginTop: 5, color: "var(--dash-sub)", fontSize: 12 }}>收入 {money(item.revenueCny)} / 成本 {money(item.upstreamCostCny)} / 毛利 {money(item.profitCny)}</span>
                        <code style={{ display: "block", marginTop: 7, fontSize: 11, color: "var(--dash-sub)", overflowWrap: "anywhere" }}>{item.requestId || item.id}</code>
                      </div>
                    ))}
                    {!(data?.losses || []).length && (
                      <div style={{ padding: 18, borderRadius: 10, border: "1px solid var(--dash-border)", color: "var(--dash-sub)", fontSize: 13 }}>
                        暂无亏损请求。继续保持模型售价高于上游成本。
                      </div>
                    )}
                  </div>
                </article>
              </section>
            </>
          )}
        </main>
      </AdminLayout>
    </>
  );
}
