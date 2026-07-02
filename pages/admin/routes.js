import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const STRATEGIES = [
  { value: "balanced", label: "综合平衡" },
  { value: "cost_first", label: "成本优先" },
  { value: "latency_first", label: "首字优先" },
  { value: "quality_first", label: "质量优先" },
  { value: "stability_first", label: "稳定优先" },
];

export default function AdminRoutesPage() {
  const [routes, setRoutes] = useState([]);
  const [failures, setFailures] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [savingId, setSavingId] = useState("");
  const [form, setForm] = useState({
    publicModelId: "",
    actualModelId: "",
    providerName: "New API",
    channelName: "New API 主通道",
    baseUrl: "",
    inputCostPerMillion: "",
    outputCostPerMillion: "",
    priority: 10,
    qualityScore: 80,
    routeStrategy: "balanced",
  });

  async function load(publicModelId = selectedModel) {
    setLoading(true);
    setMessage("");
    try {
      const query = publicModelId ? `?publicModelId=${encodeURIComponent(publicModelId)}` : "";
      const res = await fetch(`/api/admin/routes${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setRoutes(data.routes || []);
      setFailures(data.failures || []);
      setPerformance(data.performance || null);
    } catch (error) {
      setMessage(error.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => load(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeRows = useMemo(() => {
    return selectedModel ? routes.filter((item) => item.publicModelId === selectedModel) : routes;
  }, [routes, selectedModel]);

  async function updateChannel(candidate, updates) {
    setSavingId(candidate.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-channel", id: candidate.id, ...updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      await load(selectedModel);
      setMessage("已同步到路由配置，下一次调用会按新策略选择上游。");
    } catch (error) {
      setMessage(error.message || "保存失败");
    } finally {
      setSavingId("");
    }
  }

  async function seedChannel(event) {
    event.preventDefault();
    setMessage("");
    try {
      const res = await fetch("/api/admin/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed", ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "添加失败");
      setForm({ ...form, publicModelId: "", actualModelId: "", baseUrl: "" });
      await load(selectedModel);
      setMessage("候选上游已保存。");
    } catch (error) {
      setMessage(error.message || "添加失败");
    }
  }

  return (
    <>
      <Head><title>智能路由渠道 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/routes">
        <main style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 950 }}>智能路由渠道</h1>
              <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>
                每个 FlowAPI 模型背后的上游候选、首字速度、成功率、成本和收益情况都在这里看。
              </p>
            </div>
            <button onClick={() => load(selectedModel)} style={primaryButton}>刷新</button>
          </header>

          {message && <div style={noticeStyle}>{message}</div>}

          <section style={{ ...panelStyle, marginBottom: 16 }}>
            <h2 style={sectionTitle}>性能监控</h2>
            <p style={sectionSub}>最近 24 小时真实调用数据。缓存命中率来自本服务实例的 CacheManager。</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
              {[
                ["平均首字", `${performance?.avgFirstTokenMs || 0}ms`],
                ["P95 首字", `${performance?.p95FirstTokenMs || 0}ms`],
                ["平均总耗时", `${performance?.avgLatencyMs || 0}ms`],
                ["缓存命中率", `${Math.round(Number(performance?.cacheHitRate || 0) * 100)}%`],
                ["路由切换", `${performance?.routeSwitchCount || 0} 次`],
                ["上游失败率", `${Math.round(Number(performance?.upstreamFailureRate || 0) * 100)}%`],
                ["上游 429", `${performance?.upstream429Count || 0} 次`],
                ["上游 402", `${performance?.upstream402Count || 0} 次`],
                ["最快模型数", `${performance?.fastestByModel?.length || 0}`],
                ["最稳模型数", `${performance?.stableByModel?.length || 0}`],
              ].map(([label, value]) => (
                <article key={label} style={{ border: "1px solid var(--dash-border)", borderRadius: 10, padding: 12, background: "var(--dash-card-hover)" }}>
                  <div style={{ color: "var(--dash-sub)", fontSize: 11, fontWeight: 800 }}>{label}</div>
                  <strong style={{ display: "block", marginTop: 6, fontSize: 18 }}>{value}</strong>
                </article>
              ))}
            </div>
          </section>

          <section style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={sectionTitle}>路由总览</h2>
                <p style={sectionSub}>评分公式：45% 成本 + 30% 首字/延迟 + 15% 成功率 + 10% 人工质量分。</p>
              </div>
              <select value={selectedModel} onChange={(event) => { setSelectedModel(event.target.value); load(event.target.value); }} style={selectStyle}>
                <option value="">全部模型</option>
                {routes.map((route) => <option key={route.publicModelId} value={route.publicModelId}>{route.displayName}</option>)}
              </select>
            </div>

            {loading ? (
              <div style={{ padding: 36, color: "var(--dash-sub)", textAlign: "center" }}>正在读取真实路由数据...</div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {activeRows.map((route) => (
                  <article key={route.publicModelId} style={routeCardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 12, color: "var(--dash-sub)", fontWeight: 800 }}>Public Model</div>
                        <h3 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 950 }}>{route.displayName}</h3>
                        <code style={{ display: "block", marginTop: 6, color: "var(--dash-accent)", fontSize: 12 }}>{route.publicModelId}</code>
                        <div style={{ marginTop: 8, fontSize: 12, color: "var(--dash-text)", fontWeight: 700 }}>
                          {route.displayName} → {route.selectedChannel || "未命中"} → {route.actualModelId || "未配置"} → {route.routeStrategy}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, color: "var(--dash-sub)" }}>当前选择</div>
                        <strong style={{ display: "block", marginTop: 4 }}>{route.selectedChannel || "未命中"}</strong>
                        <span style={{ display: "block", marginTop: 5, color: "var(--dash-sub)", fontSize: 12 }}>{route.selectedReason}</span>
                      </div>
                    </div>

                    <div style={{ overflowX: "auto", marginTop: 16 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                        <thead>
                          <tr>
                            {["渠道", "成本/1M", "首字", "总耗时", "成功率", "质量分", "最近状态", "最近 402", "评分", "操作"].map((item) => (
                              <th key={item} style={thStyle}>{item}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(route.candidates || []).map((candidate) => (
                            <tr key={`${route.publicModelId}-${candidate.id}`} style={{ borderTop: "1px solid var(--dash-border)" }}>
                              <td style={tdStyle}>
                                <strong>{candidate.channelName}</strong>
                                <span style={mutedBlock}>{candidate.providerName}</span>
                                <span style={mutedBlock}>{candidate.latestUpstreamUrl || candidate.latestApiKeyPreview ? `${candidate.latestUpstreamUrl || "-"} · ${candidate.latestApiKeyPreview || "-"}` : ""}</span>
                              </td>
                              <td style={tdStyle}>
                                <span>入 ¥{Number(candidate.inputCostPerMillion || 0).toFixed(3)}</span>
                                <span style={mutedBlock}>出 ¥{Number(candidate.outputCostPerMillion || 0).toFixed(3)}</span>
                              </td>
                              <td style={tdStyle}>{Number(candidate.avgFirstTokenMs || 0)}ms</td>
                              <td style={tdStyle}>{Number(candidate.avgLatencyMs || 0)}ms</td>
                              <td style={tdStyle}>{Math.round(Number(candidate.successRate || 0) * 100)}%</td>
                              <td style={tdStyle}>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  defaultValue={candidate.qualityScore || 80}
                                  onBlur={(event) => updateChannel(candidate, { qualityScore: Number(event.target.value || 80) })}
                                  style={numberInputStyle}
                                />
                              </td>
                              <td style={tdStyle}>
                                <div style={{ display: "grid", gap: 2 }}>
                                  <span>
                                    {candidate.paymentCooldownActive
                                      ? "余额不足（冷却中）"
                                      : candidate.latestPaymentRequired
                                        ? "余额不足"
                                        : (candidate.latestStatusCode || "-")}
                                  </span>
                                  <span style={mutedBlock}>{candidate.latestErrorKind || candidate.latestErrorCode || "暂无"}</span>
                                </div>
                              </td>
                              <td style={tdStyle}>
                                <div style={{ display: "grid", gap: 2 }}>
                                  <span>{candidate.last402At ? new Date(candidate.last402At).toISOString().replace("T", " ").slice(0, 19) : "-"}</span>
                                  <span style={mutedBlock}>{candidate.last402RequestId || "-"}</span>
                                  <span style={mutedBlock}>{candidate.paymentCooldownActive ? `冷却 ${Math.max(1, Math.ceil(Number(candidate.paymentCooldownRemainingMs || 0) / 60000))} 分钟` : "可立即重试"}</span>
                                </div>
                              </td>
                              <td style={tdStyle}><strong>{Number(candidate.score || 0).toFixed(1)}</strong></td>
                              <td style={tdStyle}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <button
                                    disabled={savingId === candidate.id}
                                    onClick={() => updateChannel(candidate, { isEnabled: !candidate.isEnabled })}
                                    style={ghostButton}
                                  >
                                    {candidate.isEnabled ? "禁用" : "启用"}
                                  </button>
                                  <select
                                    defaultValue={candidate.routeStrategy || route.routeStrategy || "balanced"}
                                    onChange={(event) => updateChannel(candidate, { routeStrategy: event.target.value })}
                                    style={smallSelectStyle}
                                  >
                                    {STRATEGIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                  </select>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>手动增加候选上游</h2>
            <p style={sectionSub}>适合你接入 AHEAPI、UniAPI、官方 API 或 New API 分组后，为某个前台模型补一条候选线路。</p>
            <form onSubmit={seedChannel} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 14 }}>
              <Field label="Public Model ID" value={form.publicModelId} onChange={(v) => setForm({ ...form, publicModelId: v })} />
              <Field label="Actual Model ID" value={form.actualModelId} onChange={(v) => setForm({ ...form, actualModelId: v })} />
              <Field label="渠道名称" value={form.channelName} onChange={(v) => setForm({ ...form, channelName: v })} />
              <Field label="供应商" value={form.providerName} onChange={(v) => setForm({ ...form, providerName: v })} />
              <Field label="Base URL" value={form.baseUrl} onChange={(v) => setForm({ ...form, baseUrl: v })} />
              <Field label="输入成本/1M" value={form.inputCostPerMillion} onChange={(v) => setForm({ ...form, inputCostPerMillion: v })} />
              <Field label="输出成本/1M" value={form.outputCostPerMillion} onChange={(v) => setForm({ ...form, outputCostPerMillion: v })} />
              <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--dash-sub)" }}>
                策略
                <select value={form.routeStrategy} onChange={(event) => setForm({ ...form, routeStrategy: event.target.value })} style={selectStyle}>
                  {STRATEGIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <button type="submit" style={{ ...primaryButton, gridColumn: "span 4", minHeight: 44 }}>保存候选上游</button>
            </form>
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>最近失败链路</h2>
            <p style={sectionSub}>用户拿着 request_id 找客服时，先看这里的失败尝试链路。</p>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {failures.map((item) => (
                <div key={`${item.requestId}-${item.attemptIndex}-${item.createdAt}`} style={failureRowStyle}>
                  <code>{item.requestId}</code>
                  <span>{item.requestedModelName || item.publicModelId}</span>
                  <span>{item.upstreamProvider || item.upstreamChannel}</span>
                  <span>{item.upstreamUrl || "-"}</span>
                  <span>{item.statusCode || item.errorCode}</span>
                  <span style={{ color: "var(--dash-sub)" }}>{item.errorKind || item.errorMessage || "失败，无扣费"}</span>
                </div>
              ))}
              {!failures.length && <div style={{ color: "var(--dash-sub)", padding: 14 }}>暂无失败链路。</div>}
            </div>
          </section>
        </main>
      </AdminLayout>
    </>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--dash-sub)" }}>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
    </label>
  );
}

const panelStyle = { background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 12, padding: 20 };
const routeCardStyle = { border: "1px solid var(--dash-border)", borderRadius: 12, padding: 16, background: "var(--dash-card-hover)" };
const sectionTitle = { margin: 0, fontSize: 16, fontWeight: 900 };
const sectionSub = { margin: "4px 0 0", color: "var(--dash-sub)", fontSize: 12, lineHeight: 1.6 };
const thStyle = { textAlign: "left", padding: "10px 8px", color: "var(--dash-sub)", fontSize: 11, fontWeight: 900 };
const tdStyle = { padding: "12px 8px", fontSize: 12, verticalAlign: "middle" };
const mutedBlock = { display: "block", marginTop: 4, color: "var(--dash-sub)", fontSize: 11 };
const pillStyle = { display: "inline-flex", padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800 };
const primaryButton = { border: "none", borderRadius: 10, padding: "10px 16px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 850, cursor: "pointer" };
const ghostButton = { border: "1px solid var(--dash-border)", borderRadius: 8, padding: "7px 10px", background: "transparent", color: "var(--dash-text)", fontWeight: 800, cursor: "pointer" };
const inputStyle = { minHeight: 38, borderRadius: 9, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)", color: "var(--dash-text)", padding: "0 10px", outline: "none" };
const selectStyle = { ...inputStyle, minWidth: 180 };
const smallSelectStyle = { ...inputStyle, minWidth: 96, minHeight: 32, fontSize: 12 };
const numberInputStyle = { ...inputStyle, width: 70, minHeight: 32 };
const noticeStyle = { marginBottom: 14, borderRadius: 10, padding: "10px 14px", background: "rgba(99,102,241,.12)", color: "var(--dash-accent)", fontSize: 13, fontWeight: 750 };
const failureRowStyle = { display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1.6fr .6fr 1.7fr", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid var(--dash-border)", borderRadius: 10, fontSize: 12 };
