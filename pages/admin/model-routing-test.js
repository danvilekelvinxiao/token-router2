import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_SCENARIO = "primary_429_secondary_503";

export default function AdminModelRoutingTestPage() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [supportedTargets, setSupportedTargets] = useState([DEFAULT_MODEL, "opus4.8", "opus4.7", "opus4.6"]);
  const [snapshot, setSnapshot] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [lookup, setLookup] = useState(null);
  const [live, setLive] = useState(null);
  const [requestId, setRequestId] = useState("");
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [statusChain, setStatusChain] = useState("429,503,200");
  const [liveApi, setLiveApi] = useState("chat");
  const [liveStream, setLiveStream] = useState(false);
  const [liveTools, setLiveTools] = useState(false);
  const [liveApiKey, setLiveApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState("");

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || data?.error || data?.code || "请求失败");
    return data;
  }

  function applyPayload(data) {
    setSupportedTargets(Array.isArray(data?.supportedTargets) && data.supportedTargets.length ? data.supportedTargets : [DEFAULT_MODEL, "opus4.8", "opus4.7", "opus4.6"]);
    setSnapshot(data || null);
    if (data?.requestLookup) setLookup(data.requestLookup);
  }

  async function loadPreview(nextModel = model) {
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson(`/api/admin/model-routing-test?model=${encodeURIComponent(nextModel)}`);
      applyPayload(data);
    } catch (error) {
      setMessage(error.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => loadPreview(DEFAULT_MODEL));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runMode(mode, extra = {}) {
    setRunning(mode);
    setMessage("");
    try {
      const data = await requestJson("/api/admin/model-routing-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, model, ...extra }),
      });
      applyPayload(data);
      if (mode === "simulate") setSimulation(data.simulation || null);
      if (mode === "lookup") setLookup(data.requestLookup || null);
      if (mode === "live") setLive(data.live || null);
      if (mode === "preview") {
        setSimulation(null);
        setLive(null);
      }
    } catch (error) {
      setMessage(error.message || `${mode} 执行失败`);
    } finally {
      setRunning("");
    }
  }

  const routeChain = useMemo(() => {
    return snapshot?.routePreview?.fallbackChain || snapshot?.routeCandidates || [];
  }, [snapshot]);

  return (
    <>
      <Head><title>模型路由测试 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/model-routing-test">
        <main style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 950 }}>模型路由测试</h1>
              <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>
                直接查看 gpt-5.5 fallback 链、Opus 4.8 / 4.7 / 4.6 映射、request_id 证据链，以及 live 探针的 X-Flow-* 调试头。
              </p>
            </div>
            <button onClick={() => loadPreview(model)} style={primaryButton} disabled={loading || Boolean(running)}>
              {loading ? "加载中..." : "刷新快照"}
            </button>
          </header>

          {message && <div style={noticeStyle}>{message}</div>}

          <section style={{ ...panelStyle, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr .9fr .9fr .9fr", gap: 12, alignItems: "end" }}>
              <label style={fieldStyle}>
                测试模型
                <select value={model} onChange={(event) => setModel(event.target.value)} style={inputStyle}>
                  {supportedTargets.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <button onClick={() => runMode("preview")} style={ghostButton} disabled={Boolean(running)}>
                {running === "preview" ? "读取中..." : "Preview"}
              </button>
              <button onClick={() => runMode("simulate", { scenario, statusChain })} style={ghostButton} disabled={Boolean(running)}>
                {running === "simulate" ? "模拟中..." : "Simulate"}
              </button>
              <button onClick={() => runMode("live", { api: liveApi, stream: liveStream, useTools: liveTools, apiKey: liveApiKey })} style={ghostButton} disabled={Boolean(running)}>
                {running === "live" ? "探测中..." : "Live"}
              </button>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 16, alignItems: "start" }}>
            <article style={panelStyle}>
              <h2 style={sectionTitle}>模型解析</h2>
              <p style={sectionSub}>对外展示和请求使用无品牌前缀的模型名；内部 product / mapping 仍会保留兼容别名。</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
                <MetricCard label="请求模型" value={snapshot?.requestModelId || "-"} />
                <MetricCard label="实际模型" value={snapshot?.actualModelId || "-"} />
                <MetricCard label="产品模型" value={snapshot?.productPublicModelId || "-"} />
                <MetricCard label="显示名称" value={snapshot?.modelProduct?.displayName || "-"} />
              </div>
            </article>

            <article style={panelStyle}>
              <h2 style={sectionTitle}>Fallback 规则</h2>
              <p style={sectionSub}>哪些状态会切下一跳，哪些只记录错误。</p>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                <RuleRow label="继续 fallback" value={(snapshot?.fallbackRules?.shouldFallbackStatusCodes || []).join(" / ")} />
                <RuleRow label="只记录错误" value={(snapshot?.fallbackRules?.shouldRecordOnlyStatusCodes || []).join(" / ")} />
                <RuleRow label="账号异常" value={(snapshot?.fallbackRules?.accountAbnormalStatusCodes || []).join(" / ")} />
                <RuleRow label="候选冷却" value={(snapshot?.fallbackRules?.cooldownCandidateStatusCodes || []).join(" / ")} />
              </div>
            </article>
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <h2 style={sectionTitle}>Route Chain</h2>
                <p style={sectionSub}>A / B / C / D / X 候选、来源、endpoint 与主机名。</p>
              </div>
              <span style={pillStyle}>{routeChain.length} 条候选</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {routeChain.map((candidate) => (
                <article key={`${candidate.id}-${candidate.routeCode}-${candidate.endpointType}`} style={routeCardStyle}>
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1.4fr 1fr 1fr 1fr", gap: 10, alignItems: "center" }}>
                    <div>
                      <div style={mutedBlock}>线路</div>
                      <strong style={{ fontSize: 22 }}>{candidate.routeCode || candidate.line || "-"}</strong>
                    </div>
                    <div>
                      <div style={mutedBlock}>渠道</div>
                      <strong>{candidate.channelName || candidate.name || "-"}</strong>
                      <span style={mutedBlock}>{candidate.providerName || "-"}</span>
                    </div>
                    <div>
                      <div style={mutedBlock}>模型</div>
                      <strong>{candidate.requestModelId || candidate.publicModelId || "-"}</strong>
                      <span style={mutedBlock}>{candidate.actualModelId || "未配置 actual model"}</span>
                    </div>
                    <div>
                      <div style={mutedBlock}>来源 / 接口</div>
                      <strong>{candidate.source || "-"}</strong>
                      <span style={mutedBlock}>{candidate.endpointType || "chat"}</span>
                    </div>
                    <div>
                      <div style={mutedBlock}>Host / 状态</div>
                      <strong>{candidate.baseUrlHost || "-"}</strong>
                      <span style={mutedBlock}>{candidate.isEnabled ? "启用" : "禁用"} · 优先级 {candidate.priority ?? 0}</span>
                    </div>
                  </div>
                </article>
              ))}
              {!routeChain.length && <Empty text="暂无候选链路" />}
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16, alignItems: "start" }}>
            <article style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h2 style={sectionTitle}>Simulate</h2>
                  <p style={sectionSub}>用状态码链验证理论 fallback 深度。</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
                <label style={fieldStyle}>
                  场景
                  <select value={scenario} onChange={(event) => setScenario(event.target.value)} style={inputStyle}>
                    <option value="primary_429">A=429 → B 成功</option>
                    <option value="primary_401">A=401 → B 成功</option>
                    <option value="primary_403">A=403 → B 成功</option>
                    <option value="primary_429_secondary_503">A=429 → B=503 → C 成功</option>
                    <option value="primary_timeout">A=408 → B 成功</option>
                    <option value="all_failed">全部失败</option>
                    <option value="custom">自定义</option>
                  </select>
                </label>
                <label style={fieldStyle}>
                  自定义状态链
                  <input value={statusChain} onChange={(event) => setStatusChain(event.target.value)} style={inputStyle} placeholder="429,503,200" />
                </label>
                <button onClick={() => runMode("simulate", { scenario, statusChain })} style={primaryButton} disabled={Boolean(running)}>
                  {running === "simulate" ? "模拟中..." : "运行"}
                </button>
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                {(simulation?.attempts || []).map((attempt) => (
                  <div key={`${attempt.attemptIndex}-${attempt.statusCode}`} style={failureRowStyle}>
                    <span><strong>#{attempt.attemptIndex + 1}</strong></span>
                    <span>{attempt.candidate?.routeCode || "-"}</span>
                    <span>{attempt.candidate?.channelName || attempt.candidate?.name || "-"}</span>
                    <span>{attempt.statusCode}</span>
                    <span style={{ color: "var(--dash-sub)" }}>{attempt.fallbackReason}</span>
                  </div>
                ))}
                {!simulation?.attempts?.length && <Empty text="先运行一次 simulate" />}
              </div>
            </article>

            <article style={panelStyle}>
              <h2 style={sectionTitle}>Lookup</h2>
              <p style={sectionSub}>按 request_id 汇总 route_attempts、provider_request_logs、relay_audit、calls。</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
                <label style={fieldStyle}>
                  Request ID
                  <input value={requestId} onChange={(event) => setRequestId(event.target.value)} style={inputStyle} placeholder="req_xxx 或 msg_xxx" />
                </label>
                <button onClick={() => runMode("lookup", { requestId })} style={primaryButton} disabled={Boolean(running)}>
                  {running === "lookup" ? "查询中..." : "查询"}
                </button>
              </div>
              <EvidenceSummary lookup={lookup} />
            </article>
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Live Probe</h2>
            <p style={sectionSub}>临时测试 Key 仅用于本次请求，不保存；返回的是脱敏 X-Flow-* 摘要和落库证据。</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr .8fr .6fr .6fr 1.1fr auto", gap: 10, alignItems: "end", marginTop: 14 }}>
              <label style={fieldStyle}>
                API 形态
                <select value={liveApi} onChange={(event) => setLiveApi(event.target.value)} style={inputStyle}>
                  <option value="chat">/v1/chat/completions</option>
                  <option value="responses">/v1/responses</option>
                </select>
              </label>
              <label style={checkFieldStyle}>
                <input type="checkbox" checked={liveStream} onChange={(event) => setLiveStream(event.target.checked)} />
                开启 stream
              </label>
              <label style={checkFieldStyle}>
                <input type="checkbox" checked={liveTools} onChange={(event) => setLiveTools(event.target.checked)} />
                最小 tools probe
              </label>
              <div />
              <label style={fieldStyle}>
                临时测试 Key
                <input type="password" value={liveApiKey} onChange={(event) => setLiveApiKey(event.target.value)} style={inputStyle} placeholder="本地已配置的测试 Key" />
              </label>
              <button onClick={() => runMode("live", { api: liveApi, stream: liveStream, useTools: liveTools, apiKey: liveApiKey })} style={primaryButton} disabled={Boolean(running)}>
                {running === "live" ? "探测中..." : "开始探测"}
              </button>
            </div>
            <LiveSummary live={live} />
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16, alignItems: "start" }}>
            <article style={panelStyle}>
              <h2 style={sectionTitle}>Recent Attempts</h2>
              <p style={sectionSub}>最近 route_attempts 证据。</p>
              <AttemptList attempts={snapshot?.recentAttempts || []} />
            </article>
            <article style={panelStyle}>
              <h2 style={sectionTitle}>Recent Calls</h2>
              <p style={sectionSub}>最近 calls 汇总，方便核对最终命中线路与 billing 状态。</p>
              <CallList calls={snapshot?.recentCalls || []} />
            </article>
          </section>
        </main>
      </AdminLayout>
    </>
  );
}

function MetricCard({ label, value }) {
  return (
    <article style={{ border: "1px solid var(--dash-border)", borderRadius: 10, padding: 12, background: "var(--dash-card-hover)" }}>
      <div style={{ color: "var(--dash-sub)", fontSize: 11, fontWeight: 800 }}>{label}</div>
      <strong style={{ display: "block", marginTop: 6, fontSize: 15, wordBreak: "break-word" }}>{value}</strong>
    </article>
  );
}

function RuleRow({ label, value }) {
  return (
    <div style={{ border: "1px solid var(--dash-border)", borderRadius: 10, padding: "10px 12px", background: "var(--dash-card-hover)" }}>
      <div style={{ color: "var(--dash-sub)", fontSize: 11, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13 }}>{value || "-"}</div>
    </div>
  );
}

function EvidenceSummary({ lookup }) {
  const summary = lookup?.evidenceSummary;
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <MetricCard label="attempts" value={summary?.routeAttemptsCount ?? 0} />
        <MetricCard label="provider logs" value={summary?.providerLogsCount ?? 0} />
        <MetricCard label="calls" value={summary?.callsCount ?? 0} />
      </div>
      {lookup?.requestId ? <code style={codeStyle}>{lookup.requestId}</code> : <Empty text="输入 request_id 后查询" />}
      <AttemptList attempts={lookup?.attempts || []} compact />
    </div>
  );
}

function LiveSummary({ live }) {
  if (!live) return <div style={{ marginTop: 14 }}><Empty text="先运行一次 live probe" /></div>;
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <MetricCard label="状态" value={`${live.status} ${live.ok ? "OK" : "FAIL"}`} />
        <MetricCard label="请求 API" value={`${live.requestedApi}${live.stream ? " · stream" : ""}${live.usedTools ? " · tools" : ""}`} />
        <MetricCard label="request_id" value={live.requestId || "未返回"} />
        <MetricCard label="fallback" value={live.crossCandidateFallback ? `跨候选 ${live.fallbackCount} 次` : (live.sameCandidateResponsesToChatFallback ? "同候选 responses→chat" : "未触发")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <article style={{ border: "1px solid var(--dash-border)", borderRadius: 10, padding: 12, background: "var(--dash-card-hover)" }}>
          <div style={{ color: "var(--dash-sub)", fontSize: 11, fontWeight: 800 }}>X-Flow 调试头</div>
          <pre style={preStyle}>{JSON.stringify(live.debugHeaders || {}, null, 2)}</pre>
        </article>
        <article style={{ border: "1px solid var(--dash-border)", borderRadius: 10, padding: 12, background: "var(--dash-card-hover)" }}>
          <div style={{ color: "var(--dash-sub)", fontSize: 11, fontWeight: 800 }}>文本 / 工具摘要</div>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>
            <div><strong>文本预览：</strong>{live.textPreview || "-"}</div>
            <div><strong>tool calls：</strong>{live.toolCallCount || 0}</div>
            <div><strong>错误摘要：</strong>{live.upstreamError?.code || "-"} {live.upstreamError?.message || ""}</div>
          </div>
        </article>
      </div>
      <EvidenceSummary lookup={{ requestId: live.requestId, attempts: live.attempts, evidenceSummary: live.evidenceSummary }} />
    </div>
  );
}

function AttemptList({ attempts, compact = false }) {
  if (!attempts.length) return <Empty text="暂无 attempts 记录" />;
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
      {attempts.map((item) => (
        <div key={`${item.requestId}-${item.attemptIndex}-${item.createdAt || item.statusCode}`} style={compact ? failureRowStyle : attemptRowStyle}>
          <code style={{ wordBreak: "break-all" }}>{item.requestId || "-"}</code>
          <span>{item.line || "-"}</span>
          <span>{item.upstreamProvider || item.upstreamChannel || "-"}</span>
          <span>{item.statusCode || "-"}</span>
          <span style={{ color: "var(--dash-sub)" }}>{item.errorMessage || (item.ok ? "success" : "-")}</span>
        </div>
      ))}
    </div>
  );
}

function CallList({ calls }) {
  if (!calls.length) return <Empty text="暂无 calls 记录" />;
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
      {calls.map((item) => (
        <div key={`${item.id}-${item.requestId}`} style={attemptRowStyle}>
          <code style={{ wordBreak: "break-all" }}>{item.requestId || item.id}</code>
          <span>{item.publicModelId || item.requestedModel || "-"}</span>
          <span>{item.upstreamChannel || item.upstreamProvider || "-"}</span>
          <span>{item.upstreamStatus || item.status || "-"}</span>
          <span style={{ color: "var(--dash-sub)" }}>{item.billingStatus || item.deliveryStatus || "-"}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ color: "var(--dash-sub)", padding: 14, border: "1px dashed var(--dash-border)", borderRadius: 10 }}>{text}</div>;
}

const panelStyle = { background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 12, padding: 20 };
const routeCardStyle = { border: "1px solid var(--dash-border)", borderRadius: 12, padding: 16, background: "var(--dash-card-hover)" };
const sectionTitle = { margin: 0, fontSize: 16, fontWeight: 900 };
const sectionSub = { margin: "4px 0 0", color: "var(--dash-sub)", fontSize: 12, lineHeight: 1.6 };
const primaryButton = { border: "none", borderRadius: 10, padding: "10px 16px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 850, cursor: "pointer" };
const ghostButton = { border: "1px solid var(--dash-border)", borderRadius: 10, padding: "10px 16px", background: "transparent", color: "var(--dash-text)", fontWeight: 850, cursor: "pointer" };
const fieldStyle = { display: "grid", gap: 6, fontSize: 12, color: "var(--dash-sub)" };
const checkFieldStyle = { display: "inline-flex", gap: 8, alignItems: "center", minHeight: 40, fontSize: 12, color: "var(--dash-sub)" };
const inputStyle = { minHeight: 38, borderRadius: 9, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)", color: "var(--dash-text)", padding: "0 10px", outline: "none" };
const noticeStyle = { marginBottom: 14, borderRadius: 10, padding: "10px 14px", background: "rgba(99,102,241,.12)", color: "var(--dash-accent)", fontSize: 13, fontWeight: 750 };
const mutedBlock = { display: "block", marginTop: 4, color: "var(--dash-sub)", fontSize: 11 };
const pillStyle = { display: "inline-flex", padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: "rgba(99,102,241,.12)", color: "var(--dash-accent)" };
const attemptRowStyle = { display: "grid", gridTemplateColumns: "1.4fr .45fr 1fr .45fr 1.8fr", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid var(--dash-border)", borderRadius: 10, fontSize: 12 };
const failureRowStyle = { display: "grid", gridTemplateColumns: ".4fr .4fr 1fr .45fr 1.5fr", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid var(--dash-border)", borderRadius: 10, fontSize: 12 };
const codeStyle = { display: "block", padding: "10px 12px", background: "var(--dash-card-hover)", border: "1px solid var(--dash-border)", borderRadius: 10, fontSize: 12, overflowX: "auto" };
const preStyle = { margin: "8px 0 0", padding: 0, background: "transparent", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, lineHeight: 1.6 };
