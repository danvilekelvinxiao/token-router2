export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const STRATEGIES = ["固定渠道", "按权重分配", "最低成本优先", "最低延迟优先", "失败自动切换", "智能自动选择"];

const STRATEGY_INFO = {
  "固定渠道": { icon: "📌", desc: "所有请求固定发往指定上游", useCase: "单一可用渠道或特定供应商需求" },
  "按权重分配": { icon: "⚖️", desc: "按配置权重比例随机分配请求", useCase: "多渠道负载均衡，分摊压力" },
  "最低成本优先": { icon: "💰", desc: "优先选择成本最低的上游渠道", useCase: "成本敏感场景，最大化性价比" },
  "最低延迟优先": { icon: "⚡", desc: "实时检测延迟，选择响应最快的上游", useCase: "对响应速度要求较高的实时应用" },
  "失败自动切换": { icon: "🔄", desc: "按顺序尝试，失败后自动切换下一个", useCase: "高可用保障，确保服务不中断" },
  "智能自动选择": { icon: "🧠", desc: "综合评分：可用性 + 延迟 + 成本 + 模型匹配", useCase: "全自动最优路由，日常推荐使用" },
};

export default function AdminRouting() {
  const [secret, setSecret] = useState(() => (typeof window === "undefined" ? "" : sessionStorage.getItem("flowapi_admin_secret") || ""));
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Simulation state
  const [simOpen, setSimOpen] = useState(false);
  const [simPrompt, setSimPrompt] = useState("");
  const [simModel, setSimModel] = useState("");
  const [simResult, setSimResult] = useState(null);
  const [simRunning, setSimRunning] = useState(false);

  useEffect(() => {
    const s = sessionStorage.getItem("flowapi_admin_secret") || "";
    fetchData(s);
  }, []);

  async function fetchData(sec) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/routing", { headers: { "x-admin-secret": sec } });
      const data = await res.json();
      if (res.ok) setRules(data.rules || []);
      else setMsg(data.error || "加载失败");
    } catch { setMsg("网络错误"); }
    setLoading(false);
  }

  async function apiCall(method, body) {
    const s = secret || sessionStorage.getItem("flowapi_admin_secret") || "";
    const res = await fetch("/api/admin/routing", {
      method, headers: { "content-type": "application/json", "x-admin-secret": s }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  function openNew() { setEditing(null); setForm({ path: "/v1/chat/completions", strategy: "智能自动选择", defaultModel: "auto", timeout: 30, enabled: true }); setModalOpen(true); }
  function openEdit(rule) { setEditing(rule.id); setForm({ ...rule }); setModalOpen(true); }

  async function handleSave() {
    setSaving(true);
    try {
      await apiCall("POST", { ...form, id: editing || undefined });
      await fetchData(secret);
      setModalOpen(false);
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm("确认删除此规则？")) return;
    try { await apiCall("DELETE", { id }); await fetchData(secret); } catch (e) { setMsg(e.message); }
  }

  async function handleToggle(rule) {
    try {
      await apiCall("POST", { ...rule, enabled: !rule.enabled });
      await fetchData(secret);
    } catch (e) { setMsg(e.message); }
  }

  function handleSecretSave() {
    const s = secret.trim();
    if (!s) return setMsg("请输入管理密钥");
    sessionStorage.setItem("flowapi_admin_secret", s);
    setMsg("");
    fetchData(s);
  }

  async function runSimulation() {
    setSimRunning(true);
    setSimResult(null);
    const s = secret || sessionStorage.getItem("flowapi_admin_secret") || "";
    try {
      const res = await fetch("/api/admin/smart-routing", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-secret": s },
        body: JSON.stringify({ action: "simulate", data: { prompt: simPrompt, model: simModel || null } }),
      });
      const data = await res.json();
      if (res.ok) setSimResult(data);
      else setMsg(data.error || "模拟失败");
    } catch { setMsg("模拟请求失败"); }
    setSimRunning(false);
  }

  return (
    <>
      <Head><title>智能路由 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/routing">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>智能路由管理</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理 OpenAI 兼容路径、路由策略，实时模拟测试路由决策</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="管理密钥" type="password" style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", width: 140 }} />
              <button onClick={handleSecretSave} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>验证</button>
              <button onClick={() => setSimOpen(true)} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🧪 模拟测试</button>
              <button onClick={openNew} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 新增规则</button>
            </div>
          </header>

          {msg && <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 13, marginBottom: 14, fontWeight: 600 }}>{msg}</div>}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--dash-sub)" }}>加载中...</div>
          ) : (
            <>
              {/* Strategy Reference */}
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px", marginBottom: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>路由策略说明</h2>
                <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "0 0 16px" }}>选择合适的策略来控制 API 请求如何分配到上游渠道</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {Object.entries(STRATEGY_INFO).map(([name, info]) => (
                    <div key={name} style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)" }}>
                      <div style={{ fontSize: 18, marginBottom: 6 }}>{info.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{name}</div>
                      <div style={{ fontSize: 11, color: "var(--dash-sub)", lineHeight: 1.5, marginBottom: 4 }}>{info.desc}</div>
                      <div style={{ fontSize: 10, color: "var(--dash-accent)", fontStyle: "italic" }}>适用: {info.useCase}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* OpenAI Compat Paths */}
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dash-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>OpenAI 兼容路径</h2>
                    <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "2px 0 0" }}>支持标准 OpenAI SDK 直接调用，无痛迁移</p>
                  </div>
                  <span style={{ padding: "5px 14px", borderRadius: 999, background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: 12, fontWeight: 700 }}>已启用</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, padding: "16px 24px" }}>
                  {["/v1/models", "/v1/chat/completions", "/v1/completions", "/v1/embeddings"].map((p) => (
                    <div key={p} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--dash-border)", fontFamily: "'SF Mono', monospace", fontSize: 12, fontWeight: 600 }}>{p}</div>
                  ))}
                </div>
              </div>

              {/* Route Rules Table */}
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dash-border)" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>路由规则配置</h2>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                    <thead>
                      <tr style={{ background: "var(--dash-card-hover)" }}>
                        <th style={thS}>路径</th><th style={thS}>路由策略</th><th style={thS}>默认模型</th><th style={thS}>超时(s)</th><th style={thS}>状态</th><th style={thS}>说明</th><th style={thS}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((r) => (
                        <tr key={r.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", fontWeight: 600 }}>{r.path}</td>
                          <td style={tdS}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dash-accent)" }}>
                              {STRATEGY_INFO[r.strategy]?.icon} {r.strategy}
                            </span>
                          </td>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", fontStyle: r.defaultModel === "auto" ? "italic" : "normal" }}>{r.defaultModel || "auto"}</td>
                          <td style={tdS}>{r.timeout}s</td>
                          <td style={tdS}><span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: r.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: r.enabled ? "#22c55e" : "var(--dash-sub)" }}>{r.enabled ? "启用" : "禁用"}</span></td>
                          <td style={{ ...tdS, fontSize: 11, color: "var(--dash-sub)", maxWidth: 160 }}>{STRATEGY_INFO[r.strategy]?.desc || ""}</td>
                          <td style={tdS}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => openEdit(r)} style={btnSmStyle}>编辑</button>
                              <button onClick={() => handleToggle(r)} style={{ ...btnSmStyle, color: r.enabled ? "#ef4444" : "#22c55e" }}>{r.enabled ? "禁用" : "启用"}</button>
                              <button onClick={() => handleDelete(r.id)} style={{ ...btnSmStyle, color: "#ef4444" }}>删除</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {rules.length === 0 && (
                        <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>暂无规则，点击“+ 新增规则”创建第一条路由规则</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "12px 16px", borderTop: "1px solid var(--dash-border)", fontSize: 12, color: "var(--dash-sub)" }}>共 {rules.length} 条规则 · 默认使用“智能自动选择”策略</div>
              </div>

              {/* Smart Routing Flow */}
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px", marginTop: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>智能路由决策流程</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
                  <FlowStep label="用户请求" color="#6366f1" />
                  <FlowArrow />
                  <FlowStep label="模型选择" sub="关键词匹配 + 任务检测 + 成本评估" color="#8b5cf6" />
                  <FlowArrow />
                  <FlowStep label="策略匹配" sub="读取管理员路由规则" color="#3b82f6" />
                  <FlowArrow />
                  <FlowStep label="健康检查" sub="实时探测上游可用性" color="#059669" />
                  <FlowArrow />
                  <FlowStep label="渠道选择" sub="评分排序：延迟/成本/匹配度" color="#f59e0b" />
                  <FlowArrow />
                  <FlowStep label="请求转发" sub="发送到最优上游" color="#22c55e" />
                  <FlowArrow />
                  <FlowStep label="故障转移" sub="失败自动切换备用上游" color="#ef4444" />
                </div>
              </div>
            </>
          )}

          {/* Rule Edit Modal */}
          {modalOpen && (
            <ModalWrapper onClose={() => setModalOpen(false)}>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 20px" }}>{editing ? "编辑路由规则" : "新增路由规则"}</h2>
              <div style={{ display: "grid", gap: 14 }}>
                <Field label="路径" value={form.path || ""} onChange={(v) => setForm({ ...form, path: v })} placeholder="/v1/chat/completions" />
                <Field label="路由策略" value={form.strategy || ""} onChange={(v) => setForm({ ...form, strategy: v })} type="select" options={STRATEGIES} />
                {form.strategy && STRATEGY_INFO[form.strategy] && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--dash-card-hover)", border: "1px solid var(--dash-border)" }}>
                    <div style={{ fontSize: 16 }}>{STRATEGY_INFO[form.strategy].icon}</div>
                    <div style={{ fontSize: 12, color: "var(--dash-sub)", marginTop: 4 }}>{STRATEGY_INFO[form.strategy].desc}</div>
                  </div>
                )}
                <Field label="默认模型 (auto = 智能选择)" value={form.defaultModel || ""} onChange={(v) => setForm({ ...form, defaultModel: v })} placeholder="auto" />
                <Field label="超时(秒)" value={String(form.timeout || 30)} onChange={(v) => setForm({ ...form, timeout: Number(v) })} type="number" />
                <ToggleRow label="启用状态" checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button onClick={() => setModalOpen(false)} style={btnCancelStyle}>取消</button>
                <button onClick={handleSave} disabled={saving} style={btnSaveStyle}>{saving ? "保存中..." : "保存"}</button>
              </div>
            </ModalWrapper>
          )}

          {/* Simulation Modal */}
          {simOpen && (
            <ModalWrapper onClose={() => { setSimOpen(false); setSimResult(null); }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px" }}>路由决策模拟</h2>
              <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "0 0 18px" }}>输入提示词和可选的模型名，查看智能路由的实际决策结果</p>

              <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
                <div>
                  <label style={labelS}>提示词内容</label>
                  <textarea value={simPrompt} onChange={(e) => setSimPrompt(e.target.value)} placeholder="例如：帮我写一篇关于人工智能的小红书文案..." rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
                </div>
                <Field label="指定模型 (留空=auto)" value={simModel} onChange={setSimModel} placeholder="留空表示自动选择" />
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                <button onClick={runSimulation} disabled={simRunning} style={btnSaveStyle}>{simRunning ? "模拟中..." : "运行模拟"}</button>
                <button onClick={() => { setSimPrompt(""); setSimModel(""); setSimResult(null); }} style={btnCancelStyle}>清空</button>
              </div>

              {simResult && !simResult.error && (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", textTransform: "uppercase", marginBottom: 8 }}>决策结果</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <ResultItem label="选中模型" value={simResult.model?.name || "-"} />
                      <ResultItem label="模型 ID" value={simResult.model?.modelId || "-"} mono />
                      <ResultItem label="路由策略" value={simResult.strategy || "-"} />
                      <ResultItem label="上游渠道" value={simResult.upstream?.label || "-"} />
                      <ResultItem label="任务检测" value={simResult.detectedTask || "-"} />
                      <ResultItem label="耗时" value={`${simResult.simulationMs || 0}ms`} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--dash-accent)", marginTop: 8, fontWeight: 600 }}>{simResult.reason}</div>
                  </div>

                  {simResult.candidateModels && simResult.candidateModels.length > 0 && (
                    <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", textTransform: "uppercase", marginBottom: 8 }}>模型成本排序 (由低到高)</div>
                      <div style={{ display: "grid", gap: 4 }}>
                        {simResult.candidateModels.slice(0, 5).map((m, i) => (
                          <div key={m.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 8px", borderRadius: 4, background: i === 0 ? "rgba(34,197,94,0.08)" : "transparent" }}>
                            <span style={{ fontWeight: 600 }}>{m.name}</span>
                            <span style={{ fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>≈¥{m.estimatedCost.toFixed(4)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {simResult?.error && (
                <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 13, fontWeight: 600 }}>
                  错误: {simResult.error}
                </div>
              )}
            </ModalWrapper>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 16px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "12px 16px", fontSize: 13, verticalAlign: "middle" };
const btnSmStyle = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnSaveStyle = { padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnCancelStyle = { padding: "10px 20px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-text)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const labelS = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" };

function FlowStep({ label, sub, color }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${color}33`, background: `${color}11`, textAlign: "center", minWidth: 90 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--dash-sub)", marginTop: 3, lineHeight: 1.3 }}>{sub}</div>}
    </div>
  );
}

function FlowArrow() {
  return <span style={{ fontSize: 16, color: "var(--dash-sub)", fontWeight: 300 }}>→</span>;
}

function ResultItem({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--dash-sub)", fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: mono ? "'SF Mono', monospace" : "inherit" }}>{value}</div>
    </div>
  );
}

function ModalWrapper({ children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 14, padding: "28px 32px", width: 600, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", options, placeholder }) {
  return (
    <div>
      <label style={labelS}>{label}</label>
      {type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: "inherit" }}>
          <option value="">-- 选择 --</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: "inherit" }} />
      )}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--dash-border)" }}>
      <span style={{ fontSize: 13, color: "var(--dash-sub)" }}>{label}</span>
      <button onClick={() => onChange(!checked)} style={{ width: 42, height: 24, borderRadius: 12, border: "none", background: checked ? "#22c55e" : "var(--dash-border)", cursor: "pointer", position: "relative" }}>
        <span style={{ position: "absolute", top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s ease" }} />
      </button>
    </div>
  );
}
