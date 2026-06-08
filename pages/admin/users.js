export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

function StatusBadge({ status }) {
  const map = { active: { label: "正常", color: "#22c55e", bg: "rgba(34,197,94,0.1)" }, blocked: { label: "已封禁", color: "#ef4444", bg: "rgba(239,68,68,0.1)" }, disabled: { label: "已禁用", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" }, deleted: { label: "已删除", color: "#64748b", bg: "rgba(100,116,139,0.14)" } };
  const s = map[status] || map.active;
  return <span style={{ padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

const limitTypeOptions = [
  ["none", "不限额"],
  ["total", "总额度"],
  ["daily", "每日"],
  ["weekly", "每周"],
  ["monthly", "每月"],
  ["custom", "自定义"],
];

function defaultLimitForm(source = null) {
  const limit = source?.quotaLimit || source || {};
  return {
    type: limit.type || "none",
    unit: limit.unit || "cny",
    amount: limit.amount ? String(limit.amount) : "",
    resetIntervalValue: limit.resetIntervalValue ? String(limit.resetIntervalValue) : "24",
    resetIntervalUnit: limit.resetIntervalUnit || "hour",
  };
}

function buildLimitPayload(form = {}) {
  return {
    type: form.type || "none",
    unit: form.unit || "cny",
    amount: form.type === "none" ? 0 : Number(form.amount || 0),
    resetIntervalValue: form.type === "custom" ? Number(form.resetIntervalValue || 0) : 0,
    resetIntervalUnit: form.type === "custom" ? form.resetIntervalUnit || "hour" : "hour",
  };
}

function friendlyAdminError(message = "") {
  const raw = String(message || "");
  if (/expected pattern|Invalid ID/i.test(raw)) return "请求参数格式错误，请刷新页面后重试。";
  if (/Unauthorized/i.test(raw)) return "未登录或登录已过期。";
  if (/Forbidden/i.test(raw)) return "当前账号无权限操作。";
  if (/Validation failed/i.test(raw)) return "请检查表单必填项。";
  if (/Network/i.test(raw)) return "网络异常，请稍后重试。";
  if (/database|SQL|relation|column/i.test(raw)) return "数据库操作失败，请稍后重试。";
  return raw || "操作失败，请稍后重试。";
}

export default function AdminUsers() {
  const [secret, setSecret] = useState(() => (typeof window === "undefined" ? "" : sessionStorage.getItem("flowapi_admin_secret") || ""));
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState("error");
  const [selectedUser, setSelectedUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [keyLimitEdit, setKeyLimitEdit] = useState(null);
  const [keyLimitForm, setKeyLimitForm] = useState(defaultLimitForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = sessionStorage.getItem("flowapi_admin_secret") || "";
    fetchUsers(s);
  }, []);

  async function fetchUsers(sec) {
    setLoading(true);
    let list = [];
    try {
      const res = await fetch("/api/admin/users", { headers: { "x-admin-secret": sec } });
      const data = await res.json();
      if (res.ok) {
        list = data.customers || [];
        setUsers(list);
      } else { setMsgTone("error"); setMsg(data.error || "加载失败"); }
    } catch { setMsgTone("error"); setMsg("网络错误"); }
    setLoading(false);
    return list;
  }

  async function apiPost(body) {
    const s = secret || sessionStorage.getItem("flowapi_admin_secret") || "";
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "content-type": "application/json", "x-admin-secret": s }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(friendlyAdminError(data.error || "请求失败"));
    return data;
  }

  function openEdit(user) {
    setSelectedUser(user);
    setEditForm({ name: user.name || "", email: user.email || "", level: user.level || "Basic", balance: user.balance || 0, status: user.status || "active" });
    setKeyLimitEdit(null);
    setEditMode(true);
  }

  async function handleSaveUser() {
    setSaving(true);
    try {
      await apiPost({ action: "updateCustomer", data: { id: selectedUser.id, updates: editForm } });
      await fetchUsers(secret);
      setEditMode(false);
      setSelectedUser(null);
    } catch (e) { setMsgTone("error"); setMsg(e.message); }
    setSaving(false);
  }

  async function handleBlockUser(user) {
    const isBlocked = user.status === "blocked";
    if (!isBlocked && !confirm(`确认封禁用户 ${user.name || user.email}？`)) return;
    try {
      await apiPost({ action: isBlocked ? "unblockUser" : "blockUser", data: { id: user.id } });
      await fetchUsers(secret);
      if (selectedUser?.id === user.id) setSelectedUser(null);
    } catch (e) { setMsgTone("error"); setMsg(e.message); }
  }

  async function handleDeleteUser(user) {
    if (!user?.id) {
      setMsg("删除失败，请检查用户 ID 或稍后重试。");
      return;
    }
    const label = user.email || user.name || user.id;
    if (!confirm(`确认软删除用户 ${label}？\n\n删除后该用户将无法登录，名下 API Key 会自动禁用，账单和日志会保留用于审计。`)) return;
    try {
      await apiPost({ action: "deleteCustomer", data: { id: user.id } });
      await fetchUsers(secret);
      if (selectedUser?.id === user.id) {
        setSelectedUser(null);
        setEditMode(false);
      }
      setMsgTone("success");
      setMsg("用户已软删除，API Key 已禁用。");
    } catch (e) {
      setMsgTone("error");
      setMsg(friendlyAdminError(e.message || "删除失败，请检查用户 ID 或稍后重试。"));
    }
  }

  function openKeyLimitEdit(key) {
    setKeyLimitEdit(key);
    setKeyLimitForm(defaultLimitForm(key));
  }

  async function saveKeyLimit() {
    if (!keyLimitEdit) return;
    setSaving(true);
    try {
      await apiPost({ action: "updateKeyLimit", data: { keyId: keyLimitEdit.id, limit: buildLimitPayload(keyLimitForm) } });
      const refreshed = await fetchUsers(secret);
      setSelectedUser(refreshed.find((user) => user.id === selectedUser?.id) || selectedUser);
      setKeyLimitEdit(null);
      setMsgTone("success");
      setMsg("API Key 额度已更新");
    } catch (e) {
      setMsgTone("error");
      setMsg(e.message);
    }
    setSaving(false);
  }

  function handleSecretSave() {
    const s = secret.trim();
    if (!s) { setMsgTone("error"); return setMsg("请输入管理密钥"); }
    sessionStorage.setItem("flowapi_admin_secret", s);
    setMsg("");
    fetchUsers(s);
  }

  const formatTokens = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(n);
  };

  const formatLimit = (key) => {
    const limit = key?.quotaLimit || {};
    if (!limit.enabled) return "不限额";
    const unit = limit.unit === "token" ? "Token" : "¥";
    const used = limit.unit === "token" ? formatTokens(limit.used || 0) : Number(limit.used || 0).toFixed(2);
    const amount = limit.unit === "token" ? formatTokens(limit.amount || 0) : Number(limit.amount || 0).toFixed(2);
    return `${used} / ${unit}${amount}`;
  };

  return (
    <>
      <Head><title>用户管理 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/users">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>用户与 Token 权限</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理用户账号、余额、API Key权限和调用限制</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="管理密钥" type="password" style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", width: 140 }} />
              <button onClick={handleSecretSave} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>验证</button>
            </div>
          </header>

          {msg && <div style={{ padding: "10px 16px", borderRadius: 8, background: msgTone === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)", color: msgTone === "success" ? "#16a34a" : "#ef4444", fontSize: 13, marginBottom: 14, fontWeight: 600 }}>{msg}</div>}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--dash-sub)" }}>加载中...</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: editMode ? "1fr 380px" : "1fr", gap: 16 }}>
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: "var(--dash-card-hover)" }}>
                        <th style={thS}>用户</th><th style={thS}>等级</th><th style={thS}>余额</th><th style={thS}>密匙数</th><th style={thS}>今日请求</th><th style={thS}>今日消耗</th><th style={thS}>状态</th><th style={thS}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} style={{ borderTop: "1px solid var(--dash-border)", background: selectedUser?.id === u.id ? "var(--dash-card-hover)" : "transparent" }}>
                          <td style={tdS}><b>{u.name || u.email}</b><div style={{ fontSize: 11, color: "var(--dash-sub)" }}>{u.email}</div></td>
                          <td style={tdS}><span style={{ fontSize: 11, fontWeight: 700, color: "var(--dash-accent)", background: "rgba(99,102,241,0.1)", padding: "2px 8px", borderRadius: 4 }}>{u.level || "Basic"}</span></td>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>¥{Number(u.balance || 0).toFixed(2)}</td>
                          <td style={tdS}>{u.keyCount || 0}</td>
                          <td style={tdS}>{u.todayReqs || 0}</td>
                          <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>
                            {formatTokens(u.todayTokens || 0)} / ¥{Number(u.todaySpend || 0).toFixed(2)}
                          </td>
                          <td style={tdS}><StatusBadge status={u.status || "active"} /></td>
                          <td style={tdS}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => openEdit(u)} style={btnSmStyle}>编辑</button>
                              <button onClick={() => handleBlockUser(u)} style={{ ...btnSmStyle, color: u.status === "blocked" ? "#22c55e" : "#ef4444" }}>{u.status === "blocked" ? "解封" : "封禁"}</button>
                              <button onClick={() => handleDeleteUser(u)} disabled={u.status === "deleted"} style={{ ...btnSmStyle, color: "#ef4444", opacity: u.status === "deleted" ? 0.45 : 1 }}>删除</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>暂无用户</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {editMode && selectedUser && (
                <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{selectedUser.name || selectedUser.email}</h3>
                    <button onClick={() => { setEditMode(false); setSelectedUser(null); }} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "transparent", color: "var(--dash-sub)", cursor: "pointer", fontSize: 18 }}>✕</button>
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <EditField label="用户名" value={editForm.name || ""} onChange={(v) => setEditForm({ ...editForm, name: v })} />
                    <EditField label="邮箱" value={editForm.email || ""} onChange={(v) => setEditForm({ ...editForm, email: v })} />
                    <EditField label="等级" value={editForm.level || ""} onChange={(v) => setEditForm({ ...editForm, level: v })} />
                    <EditField label="余额" value={String(editForm.balance || 0)} onChange={(v) => setEditForm({ ...editForm, balance: Number(v) })} type="number" />
                  </div>

                  <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--dash-border)" }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 900 }}>API Key 额度</h4>
                    <div style={{ display: "grid", gap: 8 }}>
                      {(selectedUser.apiKeys || []).map((key) => (
                        <div key={key.id} style={{ display: "grid", gap: 8, padding: 10, border: "1px solid var(--dash-border)", borderRadius: 8, background: "var(--dash-card-hover)", minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0 }}>
                              <b style={{ display: "block", fontSize: 12, overflowWrap: "anywhere" }}>{key.label || "API Key"}</b>
                              <span style={{ display: "block", marginTop: 3, color: "var(--dash-sub)", fontSize: 11, overflowWrap: "anywhere" }}>{key.maskedKey || key.publicModelId || key.modelDisplayName || key.id}</span>
                            </div>
                            <button type="button" onClick={() => openKeyLimitEdit(key)} style={btnSmStyle}>改额度</button>
                          </div>
                          <span style={{ color: key.quotaLimit?.status === "exceeded" ? "#ef4444" : "var(--dash-sub)", fontSize: 11, fontFamily: "'SF Mono', monospace" }}>{formatLimit(key)}</span>
                        </div>
                      ))}
                      {!(selectedUser.apiKeys || []).length && <p style={{ margin: 0, color: "var(--dash-sub)", fontSize: 12 }}>暂无 API Key</p>}
                    </div>

                    {keyLimitEdit && (
                      <div style={{ display: "grid", gap: 10, marginTop: 12, padding: 12, border: "1px solid var(--dash-accent)", borderRadius: 8, background: "var(--dash-card-bg)" }}>
                        <label style={adminLimitLabelStyle}>限额类型
                          <select value={keyLimitForm.type} onChange={(e) => setKeyLimitForm({ ...keyLimitForm, type: e.target.value })} style={adminLimitInputStyle}>
                            {limitTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        {keyLimitForm.type !== "none" && (
                          <>
                            <label style={adminLimitLabelStyle}>额度上限
                              <input type="number" min="0" value={keyLimitForm.amount} onChange={(e) => setKeyLimitForm({ ...keyLimitForm, amount: e.target.value })} style={adminLimitInputStyle} />
                            </label>
                            <label style={adminLimitLabelStyle}>单位
                              <select value={keyLimitForm.unit} onChange={(e) => setKeyLimitForm({ ...keyLimitForm, unit: e.target.value })} style={adminLimitInputStyle}>
                                <option value="cny">¥ 金额</option>
                                <option value="token">Token</option>
                              </select>
                            </label>
                          </>
                        )}
                        {keyLimitForm.type === "custom" && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <label style={adminLimitLabelStyle}>每隔
                              <input type="number" min={keyLimitForm.resetIntervalUnit === "minute" ? "60" : "1"} value={keyLimitForm.resetIntervalValue} onChange={(e) => setKeyLimitForm({ ...keyLimitForm, resetIntervalValue: e.target.value })} style={adminLimitInputStyle} />
                            </label>
                            <label style={adminLimitLabelStyle}>周期
                              <select value={keyLimitForm.resetIntervalUnit} onChange={(e) => setKeyLimitForm({ ...keyLimitForm, resetIntervalUnit: e.target.value })} style={adminLimitInputStyle}>
                                <option value="minute">分钟</option>
                                <option value="hour">小时</option>
                                <option value="day">天</option>
                              </select>
                            </label>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" onClick={saveKeyLimit} disabled={saving} style={{ ...btnSmStyle, color: "var(--dash-accent)", borderColor: "var(--dash-accent)" }}>{saving ? "保存中" : "保存额度"}</button>
                          <button type="button" onClick={() => setKeyLimitEdit(null)} style={btnSmStyle}>取消</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                    <button onClick={handleSaveUser} disabled={saving} style={{ flex: 1, padding: "9px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>{saving ? "保存中..." : "保存配置"}</button>
                    <button onClick={() => handleBlockUser(selectedUser)} style={{ padding: "9px 14px", borderRadius: 7, border: "none", background: selectedUser.status === "blocked" ? "#22c55e" : "#ef4444", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{selectedUser.status === "blocked" ? "解封用户" : "封禁用户"}</button>
                    <button onClick={() => handleDeleteUser(selectedUser)} disabled={selectedUser.status === "deleted"} style={{ padding: "9px 14px", borderRadius: 7, border: "none", background: "#991b1b", color: "#fff", fontSize: 12, fontWeight: 700, cursor: selectedUser.status === "deleted" ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: selectedUser.status === "deleted" ? 0.55 : 1 }}>软删除</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 14px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "12px 14px", fontSize: 13, verticalAlign: "middle" };
const btnSmStyle = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const adminLimitLabelStyle = { display: "grid", gap: 5, color: "var(--dash-sub)", fontSize: 11, fontWeight: 700 };
const adminLimitInputStyle = { width: "100%", minWidth: 0, padding: "8px 10px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit" };

function EditField({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", marginBottom: 5, textTransform: "uppercase" }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: "inherit" }} />
    </div>
  );
}
