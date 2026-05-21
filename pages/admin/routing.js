export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const STRATEGIES = ["固定渠道", "按权重分配", "最低成本优先", "最低延迟优先", "失败自动切换"];

export default function AdminRouting() {
  const [secret, setSecret] = useState("");
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem("flowapi_admin_secret") || "";
    setSecret(s);
    if (s) fetchData(s);
    else setLoading(false);
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
    const s = secret || localStorage.getItem("flowapi_admin_secret") || "";
    const res = await fetch("/api/admin/routing", {
      method, headers: { "content-type": "application/json", "x-admin-secret": s }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  function openNew() { setEditing(null); setForm({ path: "", strategy: "按权重分配", defaultModel: "", timeout: 30, enabled: true }); setModalOpen(true); }
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
    localStorage.setItem("flowapi_admin_secret", s);
    setMsg("");
    fetchData(s);
  }

  return (
    <>
      <Head><title>全局转发规则 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/routing">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>全局转发规则</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理 OpenAI 兼容路径、路由策略和全局限流</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="管理密钥" type="password" style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", width: 140 }} />
              <button onClick={handleSecretSave} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>验证</button>
              <button onClick={openNew} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 新增规则</button>
            </div>
          </header>

          {msg && <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 13, marginBottom: 14, fontWeight: 600 }}>{msg}</div>}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--dash-sub)" }}>加载中...</div>
          ) : (
            <>
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dash-border)" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>OpenAI 兼容路径</h2>
                  <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "2px 0 0" }}>启用后支持标准 OpenAI SDK 直接调用</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, padding: "16px 24px" }}>
                  {["/v1/models", "/v1/chat/completions", "/v1/completions", "/v1/embeddings"].map((p) => (
                    <div key={p} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--dash-border)", fontFamily: "'SF Mono', monospace", fontSize: 12, fontWeight: 600 }}>{p}</div>
                  ))}
                </div>
              </div>

              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dash-border)" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>路由规则</h2>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                    <thead>
                      <tr style={{ background: "var(--dash-card-hover)" }}>
                        <th style={thS}>路径</th><th style={thS}>路由策略</th><th style={thS}>默认模型</th><th style={thS}>超时(s)</th><th style={thS}>状态</th><th style={thS}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((r) => (
                        <tr key={r.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", fontWeight: 600 }}>{r.path}</td>
                          <td style={tdS}>{r.strategy}</td>
                          <td style={tdS}>{r.defaultModel}</td>
                          <td style={tdS}>{r.timeout}</td>
                          <td style={tdS}><span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: r.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: r.enabled ? "#22c55e" : "var(--dash-sub)" }}>{r.enabled ? "启用" : "禁用"}</span></td>
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
                        <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>暂无规则，点击"+ 新增规则"添加</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "12px 16px", borderTop: "1px solid var(--dash-border)", fontSize: 12, color: "var(--dash-sub)" }}>共 {rules.length} 条规则</div>
              </div>
            </>
          )}

          {modalOpen && (
            <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setModalOpen(false)}>
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 14, padding: "28px 32px", width: 520, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 20px" }}>{editing ? "编辑规则" : "新增规则"}</h2>
                <div style={{ display: "grid", gap: 14 }}>
                  <Field label="路径" value={form.path || ""} onChange={(v) => setForm({ ...form, path: v })} placeholder="/v1/chat/completions" />
                  <Field label="路由策略" value={form.strategy || ""} onChange={(v) => setForm({ ...form, strategy: v })} type="select" options={STRATEGIES} />
                  <Field label="默认模型" value={form.defaultModel || ""} onChange={(v) => setForm({ ...form, defaultModel: v })} />
                  <Field label="超时(秒)" value={String(form.timeout || 30)} onChange={(v) => setForm({ ...form, timeout: Number(v) })} type="number" />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--dash-border)" }}>
                    <span style={{ fontSize: 13, color: "var(--dash-sub)" }}>启用状态</span>
                    <button onClick={() => setForm({ ...form, enabled: !form.enabled })} style={{ width: 42, height: 24, borderRadius: 12, border: "none", background: form.enabled ? "#22c55e" : "var(--dash-border)", cursor: "pointer", position: "relative" }}>
                      <span style={{ position: "absolute", top: 2, left: form.enabled ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s ease" }} />
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                  <button onClick={() => setModalOpen(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-text)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
                  <button onClick={handleSave} disabled={saving} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>{saving ? "保存中..." : "保存"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 16px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "12px 16px", fontSize: 13, verticalAlign: "middle" };
const btnSmStyle = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

function Field({ label, value, onChange, type = "text", options, placeholder }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
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
