export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

function LevelBadge({ level }) {
  const map = { high: { label: "高", color: "#ef4444" }, critical: { label: "严重", color: "#dc2626" }, medium: { label: "中", color: "#f59e0b" }, low: { label: "低", color: "#22c55e" } };
  const s = map[level] || map.medium;
  return <span style={{ padding: "3px 10px", borderRadius: 999, background: s.color + "18", color: s.color, fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

export default function AdminSecurity() {
  const [secret, setSecret] = useState("");
  const [blacklist, setBlacklist] = useState([]);
  const [riskRules, setRiskRules] = useState([]);
  const [riskEvents, setRiskEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [blModal, setBlModal] = useState(false);
  const [blForm, setBlForm] = useState({ type: "IP", value: "", reason: "" });
  const [rrModal, setRrModal] = useState(false);
  const [editingRr, setEditingRr] = useState(null);
  const [rrForm, setRrForm] = useState({});
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
      const res = await fetch("/api/admin/security", { headers: { "x-admin-secret": sec } });
      const data = await res.json();
      if (res.ok) {
        setBlacklist(data.blacklist || []);
        setRiskRules(data.riskRules || []);
        setRiskEvents(data.riskEvents || []);
      } else setMsg(data.error || "加载失败");
    } catch { setMsg("网络错误"); }
    setLoading(false);
  }

  async function apiPost(body) {
    const s = secret || localStorage.getItem("flowapi_admin_secret") || "";
    const res = await fetch("/api/admin/security", {
      method: "POST", headers: { "content-type": "application/json", "x-admin-secret": s }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  async function handleAddBlacklist() {
    if (!blForm.value.trim() || !blForm.reason.trim()) return setMsg("请填写完整信息");
    setSaving(true);
    try {
      await apiPost({ action: "addBlacklist", data: blForm });
      await fetchData(secret);
      setBlModal(false);
      setBlForm({ type: "IP", value: "", reason: "" });
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  }

  async function handleRemoveBlacklist(id) {
    try { await apiPost({ action: "removeBlacklist", data: { id } }); await fetchData(secret); } catch (e) { setMsg(e.message); }
  }

  function openRrEdit(r) { setEditingRr(r ? r.id : null); setRrForm(r || { name: "", condition: "", action: "", enabled: true }); setRrModal(true); }
  async function saveRiskRule() {
    setSaving(true);
    try {
      await apiPost({ action: "saveRiskRule", data: { ...rrForm, id: editingRr || undefined } });
      await fetchData(secret);
      setRrModal(false);
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  }
  async function deleteRiskRule(id) {
    if (!confirm("确认删除此规则？")) return;
    try { await apiPost({ action: "deleteRiskRule", data: { id } }); await fetchData(secret); } catch (e) { setMsg(e.message); }
  }

  async function handleToggleEvent(id, handled) {
    try { await apiPost({ action: "updateRiskEvent", data: { id, updates: { handled: !handled } } }); await fetchData(secret); } catch (e) { setMsg(e.message); }
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
      <Head><title>安全风控 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/security">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>安全风控</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理黑名单、风控规则和风险事件处理</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="管理密钥" type="password" style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", width: 140 }} />
              <button onClick={handleSecretSave} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>验证</button>
            </div>
          </header>

          {msg && <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 13, marginBottom: 14, fontWeight: 600 }}>{msg}</div>}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--dash-sub)" }}>加载中...</div>
          ) : (
            <>
              {/* Blacklist */}
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dash-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>黑名单管理</h2>
                  <button onClick={() => setBlModal(true)} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 加入黑名单</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                    <thead><tr style={{ background: "var(--dash-card-hover)" }}><th style={thS}>类型</th><th style={thS}>值</th><th style={thS}>原因</th><th style={thS}>添加时间</th><th style={thS}>操作</th></tr></thead>
                    <tbody>
                      {blacklist.map((b) => (
                        <tr key={b.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                          <td style={tdS}><span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: b.type === "IP" ? "rgba(99,102,241,0.1)" : "rgba(245,158,11,0.1)", color: b.type === "IP" ? "#6366f1" : "#f59e0b" }}>{b.type}</span></td>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{b.value}</td>
                          <td style={tdS}>{b.reason}</td>
                          <td style={{ ...tdS, color: "var(--dash-sub)" }}>{b.addedAt}</td>
                          <td style={tdS}><button onClick={() => handleRemoveBlacklist(b.id)} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>移除</button></td>
                        </tr>
                      ))}
                      {blacklist.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: "var(--dash-sub)" }}>暂无黑名单</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Risk Rules + Events */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>风控规则</h2>
                    <button onClick={() => openRrEdit(null)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 新增</button>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {riskRules.map((r) => (
                      <div key={r.id} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--dash-border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</span>
                          <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: r.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: r.enabled ? "#22c55e" : "var(--dash-sub)" }}>{r.enabled ? "开" : "关"}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--dash-sub)", margin: "4px 0" }}>{r.condition}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "var(--dash-accent)", fontWeight: 600 }}>→ {r.action}</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => openRrEdit(r)} style={btnSmStyle}>编辑</button>
                            <button onClick={() => deleteRiskRule(r.id)} style={{ ...btnSmStyle, color: "#ef4444" }}>删除</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>风险事件</h2>
                  <div style={{ display: "grid", gap: 10 }}>
                    {riskEvents.map((ev) => (
                      <div key={ev.id} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid var(--dash-border)", borderLeft: `3px solid ${ev.level === "critical" ? "#dc2626" : ev.level === "high" ? "#ef4444" : "#f59e0b"}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <LevelBadge level={ev.level} />
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{ev.type}</span>
                          </div>
                          <button onClick={() => handleToggleEvent(ev.id, ev.handled)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, background: ev.handled ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", color: ev.handled ? "#22c55e" : "#f59e0b" }}>
                            {ev.handled ? "已处理" : "待处理"}
                          </button>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--dash-sub)", marginBottom: 3 }}>{ev.user} · {ev.time}</div>
                        <div style={{ fontSize: 12, lineHeight: 1.5 }}>{ev.detail}</div>
                      </div>
                    ))}
                    {riskEvents.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--dash-sub)" }}>暂无风险事件</div>}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Blacklist Modal */}
          {blModal && (
            <Modal title="加入黑名单" onClose={() => setBlModal(false)}>
              <div style={{ display: "grid", gap: 14 }}>
                <Field label="类型" value={blForm.type} onChange={(v) => setBlForm({ ...blForm, type: v })} type="select" options={["IP", "密匙", "用户ID"]} />
                <Field label="值" value={blForm.value} onChange={(v) => setBlForm({ ...blForm, value: v })} />
                <Field label="原因" value={blForm.reason} onChange={(v) => setBlForm({ ...blForm, reason: v })} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button onClick={() => setBlModal(false)} style={btnCancelStyle}>取消</button>
                <button onClick={handleAddBlacklist} disabled={saving} style={btnSaveStyle}>{saving ? "添加中..." : "确认添加"}</button>
              </div>
            </Modal>
          )}

          {/* Risk Rule Modal */}
          {rrModal && (
            <Modal title={editingRr ? "编辑风控规则" : "新增风控规则"} onClose={() => setRrModal(false)}>
              <div style={{ display: "grid", gap: 14 }}>
                <Field label="名称" value={rrForm.name || ""} onChange={(v) => setRrForm({ ...rrForm, name: v })} />
                <Field label="触发条件" value={rrForm.condition || ""} onChange={(v) => setRrForm({ ...rrForm, condition: v })} />
                <Field label="执行动作" value={rrForm.action || ""} onChange={(v) => setRrForm({ ...rrForm, action: v })} />
                <ToggleField label="启用" checked={rrForm.enabled} onChange={(v) => setRrForm({ ...rrForm, enabled: v })} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button onClick={() => setRrModal(false)} style={btnCancelStyle}>取消</button>
                <button onClick={saveRiskRule} disabled={saving} style={btnSaveStyle}>{saving ? "保存中..." : "保存"}</button>
              </div>
            </Modal>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 16px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "12px 16px", fontSize: 13, verticalAlign: "middle" };
const btnSmStyle = { padding: "3px 8px", borderRadius: 5, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnSaveStyle = { padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnCancelStyle = { padding: "10px 20px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-text)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 14, padding: "28px 32px", width: 480, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 20px" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", options }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: "inherit" }}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: "inherit" }} />
      )}
    </div>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--dash-border)" }}>
      <span style={{ fontSize: 13, color: "var(--dash-sub)" }}>{label}</span>
      <button onClick={() => onChange(!checked)} style={{ width: 42, height: 24, borderRadius: 12, border: "none", background: checked ? "#22c55e" : "var(--dash-border)", cursor: "pointer", position: "relative" }}>
        <span style={{ position: "absolute", top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s ease" }} />
      </button>
    </div>
  );
}
