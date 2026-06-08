export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

export default function AdminBillingRules() {
  const [secret, setSecret] = useState(() => (typeof window === "undefined" ? "" : sessionStorage.getItem("flowapi_admin_secret") || ""));
  const [config, setConfig] = useState(null);
  const [prices, setPrices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [editingPrice, setEditingPrice] = useState(null);
  const [priceForm, setPriceForm] = useState({});
  const [alertModal, setAlertModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);
  const [alertForm, setAlertForm] = useState({});
  const [configModal, setConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = sessionStorage.getItem("flowapi_admin_secret") || "";
    fetchData(s);
  }, []);

  async function fetchData(sec) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing", { headers: { "x-admin-secret": sec } });
      const data = await res.json();
      if (res.ok) {
        setConfig(data.config || {});
        setPrices(data.prices || []);
        setAlerts(data.alerts || []);
      } else setMsg(data.error || "加载失败");
    } catch { setMsg("网络错误"); }
    setLoading(false);
  }

  async function apiPost(body) {
    const s = secret || sessionStorage.getItem("flowapi_admin_secret") || "";
    const res = await fetch("/api/admin/billing", {
      method: "POST", headers: { "content-type": "application/json", "x-admin-secret": s }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  function openPriceEdit(p) { setEditingPrice(p ? prices.findIndex((x) => x.model === p.model) : null); setPriceForm(p || { model: "", inputPrice: "", outputPrice: "", costInput: "", costOutput: "", multiplier: "" }); }
  async function savePrice() {
    setSaving(true);
    try {
      const newPrices = [...prices];
      const p = { ...priceForm, inputPrice: Number(priceForm.inputPrice), outputPrice: Number(priceForm.outputPrice), costInput: Number(priceForm.costInput), costOutput: Number(priceForm.costOutput), multiplier: Number(priceForm.multiplier) };
      if (editingPrice !== null) newPrices[editingPrice] = p;
      else newPrices.push(p);
      await apiPost({ action: "savePrices", data: newPrices });
      await fetchData(secret);
      setEditingPrice(null);
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  }
  async function deletePrice(idx) {
    if (!confirm("确认删除此价格项？")) return;
    try {
      const newPrices = prices.filter((_, i) => i !== idx);
      await apiPost({ action: "savePrices", data: newPrices });
      await fetchData(secret);
    } catch (e) { setMsg(e.message); }
  }

  function openAlertEdit(a) { setEditingAlert(a ? a.id : null); setAlertForm(a || { name: "", condition: "", action: "", enabled: true }); setAlertModal(true); }
  async function saveAlert() {
    setSaving(true);
    try {
      await apiPost({ action: "saveAlert", data: { ...alertForm, id: editingAlert || undefined } });
      await fetchData(secret);
      setAlertModal(false);
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  }
  async function deleteAlert(id) {
    if (!confirm("确认删除此预警规则？")) return;
    try { await apiPost({ action: "deleteAlert", data: { id } }); await fetchData(secret); } catch (e) { setMsg(e.message); }
  }

  function openConfigEdit() { setConfigForm({ ...config }); setConfigModal(true); }
  async function saveConfig() {
    setSaving(true);
    try {
      await apiPost({ action: "saveConfig", data: configForm });
      await fetchData(secret);
      setConfigModal(false);
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  }

  function handleSecretSave() {
    const s = secret.trim();
    if (!s) return setMsg("请输入管理密钥");
    sessionStorage.setItem("flowapi_admin_secret", s);
    setMsg("");
    fetchData(s);
  }

  const formatMoney = (v) => { const n = Number(v); return isNaN(n) ? "-" : `¥${n.toFixed(2)}`; };

  return (
    <>
      <Head><title>计费规则 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/billing-rules">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>计费规则</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理模型定价、计费单位和余额预警规则</p>
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
              {/* Billing Config */}
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>计费配置</h2>
                  <button onClick={openConfigEdit} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>编辑</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                  {config && Object.entries(config).map(([k, v]) => (
                    <ConfigCard key={k} label={k} value={typeof v === "boolean" ? (v ? "是" : "否") : String(v)} />
                  ))}
                </div>
              </div>

              {/* Model Prices */}
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dash-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>模型价格表</h2>
                    <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "2px 0 0" }}>价格单位：¥ / 1M Token</p>
                  </div>
                  <button onClick={() => openPriceEdit(null)} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 新增价格</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: "var(--dash-card-hover)" }}>
                        <th style={thS}>模型</th><th style={thS}>输入售价</th><th style={thS}>输出售价</th><th style={thS}>输入成本</th><th style={thS}>输出成本</th><th style={thS}>倍率</th><th style={thS}>毛利</th><th style={thS}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prices.map((p, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--dash-border)" }}>
                          <td style={tdS}><b>{p.model}</b></td>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{formatMoney(p.inputPrice)}</td>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{formatMoney(p.outputPrice)}</td>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>{formatMoney(p.costInput)}</td>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>{formatMoney(p.costOutput)}</td>
                          <td style={tdS}>x{Number(p.multiplier || 0).toFixed(1)}</td>
                          <td style={{ ...tdS, color: "#22c55e", fontFamily: "'SF Mono', monospace", fontWeight: 700 }}>{formatMoney((Number(p.inputPrice) - Number(p.costInput) + Number(p.outputPrice) - Number(p.costOutput)).toFixed(2))}</td>
                          <td style={tdS}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => openPriceEdit(p)} style={btnSmStyle}>编辑</button>
                              <button onClick={() => deletePrice(i)} style={{ ...btnSmStyle, color: "#ef4444" }}>删除</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {prices.length === 0 && (
                        <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>暂无价格配置</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Alert Rules */}
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>余额预警规则</h2>
                  <button onClick={() => openAlertEdit(null)} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 新增规则</button>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {alerts.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</div>
                        <div style={{ fontSize: 12, color: "var(--dash-sub)", marginTop: 3 }}>{r.condition} → {r.action}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: r.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: r.enabled ? "#22c55e" : "var(--dash-sub)" }}>{r.enabled ? "已启用" : "已禁用"}</span>
                        <button onClick={() => openAlertEdit(r)} style={btnSmStyle}>编辑</button>
                        <button onClick={() => deleteAlert(r.id)} style={{ ...btnSmStyle, color: "#ef4444" }}>删除</button>
                      </div>
                    </div>
                  ))}
                  {alerts.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--dash-sub)" }}>暂无预警规则</div>}
                </div>
              </div>
            </>
          )}

          {/* Price Edit Modal */}
          {editingPrice !== null && (
            <Modal title={priceForm.model ? "编辑价格" : "新增价格"} onClose={() => setEditingPrice(null)}>
              <div style={{ display: "grid", gap: 14 }}>
                <Field label="模型" value={priceForm.model || ""} onChange={(v) => setPriceForm({ ...priceForm, model: v })} />
                <Field label="输入售价" value={String(priceForm.inputPrice || "")} onChange={(v) => setPriceForm({ ...priceForm, inputPrice: v })} type="number" />
                <Field label="输出售价" value={String(priceForm.outputPrice || "")} onChange={(v) => setPriceForm({ ...priceForm, outputPrice: v })} type="number" />
                <Field label="输入成本" value={String(priceForm.costInput || "")} onChange={(v) => setPriceForm({ ...priceForm, costInput: v })} type="number" />
                <Field label="输出成本" value={String(priceForm.costOutput || "")} onChange={(v) => setPriceForm({ ...priceForm, costOutput: v })} type="number" />
                <Field label="倍率" value={String(priceForm.multiplier || "")} onChange={(v) => setPriceForm({ ...priceForm, multiplier: v })} type="number" />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button onClick={() => setEditingPrice(null)} style={btnCancelStyle}>取消</button>
                <button onClick={savePrice} disabled={saving} style={btnSaveStyle}>{saving ? "保存中..." : "保存"}</button>
              </div>
            </Modal>
          )}

          {/* Alert Modal */}
          {alertModal && (
            <Modal title={editingAlert ? "编辑预警规则" : "新增预警规则"} onClose={() => setAlertModal(false)}>
              <div style={{ display: "grid", gap: 14 }}>
                <Field label="规则名称" value={alertForm.name || ""} onChange={(v) => setAlertForm({ ...alertForm, name: v })} />
                <Field label="触发条件" value={alertForm.condition || ""} onChange={(v) => setAlertForm({ ...alertForm, condition: v })} />
                <Field label="执行动作" value={alertForm.action || ""} onChange={(v) => setAlertForm({ ...alertForm, action: v })} />
                <ToggleField label="启用" checked={alertForm.enabled} onChange={(v) => setAlertForm({ ...alertForm, enabled: v })} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button onClick={() => setAlertModal(false)} style={btnCancelStyle}>取消</button>
                <button onClick={saveAlert} disabled={saving} style={btnSaveStyle}>{saving ? "保存中..." : "保存"}</button>
              </div>
            </Modal>
          )}

          {/* Config Modal */}
          {configModal && (
            <Modal title="编辑计费配置" onClose={() => setConfigModal(false)}>
              <div style={{ display: "grid", gap: 14 }}>
                {configForm && Object.entries(configForm).map(([k, v]) => (
                  <Field key={k} label={k} value={typeof v === "boolean" ? "" : String(v)} onChange={(val) => setConfigForm({ ...configForm, [k]: typeof v === "number" ? Number(val) : val })} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button onClick={() => setConfigModal(false)} style={btnCancelStyle}>取消</button>
                <button onClick={saveConfig} disabled={saving} style={btnSaveStyle}>{saving ? "保存中..." : "保存"}</button>
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
const btnSmStyle = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnSaveStyle = { padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnCancelStyle = { padding: "10px 20px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-text)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

function ConfigCard({ label, value }) {
  return (
    <div style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid var(--dash-border)" }}>
      <div style={{ fontSize: 11, color: "var(--dash-sub)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'SF Mono', monospace" }}>{value}</div>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 14, padding: "28px 32px", width: 520, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
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
