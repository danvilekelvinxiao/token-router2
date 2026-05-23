export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

function StatusBadge({ status }) {
  const map = { active: { label: "正常", color: "#22c55e", bg: "rgba(34,197,94,0.1)" }, blocked: { label: "已封禁", color: "#ef4444", bg: "rgba(239,68,68,0.1)" }, disabled: { label: "已禁用", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" } };
  const s = map[status] || map.active;
  return <span style={{ padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

export default function AdminUsers() {
  const [secret, setSecret] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem("flowapi_admin_secret") || ""));
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem("flowapi_admin_secret") || "";
    fetchUsers(s);
  }, []);

  async function fetchUsers(sec) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: { "x-admin-secret": sec } });
      const data = await res.json();
      if (res.ok) setUsers(data.customers || []);
      else setMsg(data.error || "加载失败");
    } catch { setMsg("网络错误"); }
    setLoading(false);
  }

  async function apiPost(body) {
    const s = secret || localStorage.getItem("flowapi_admin_secret") || "";
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "content-type": "application/json", "x-admin-secret": s }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  function openEdit(user) {
    setSelectedUser(user);
    setEditForm({ name: user.name || "", email: user.email || "", level: user.level || "Basic", balance: user.balance || 0, status: user.status || "active" });
    setEditMode(true);
  }

  async function handleSaveUser() {
    setSaving(true);
    try {
      await apiPost({ action: "updateCustomer", data: { id: selectedUser.id, updates: editForm } });
      await fetchUsers(secret);
      setEditMode(false);
      setSelectedUser(null);
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  }

  async function handleBlockUser(user) {
    const isBlocked = user.status === "blocked";
    if (!isBlocked && !confirm(`确认封禁用户 ${user.name || user.email}？`)) return;
    try {
      await apiPost({ action: isBlocked ? "unblockUser" : "blockUser", data: { id: user.id } });
      await fetchUsers(secret);
      if (selectedUser?.id === user.id) setSelectedUser(null);
    } catch (e) { setMsg(e.message); }
  }

  function handleSecretSave() {
    const s = secret.trim();
    if (!s) return setMsg("请输入管理密钥");
    localStorage.setItem("flowapi_admin_secret", s);
    setMsg("");
    fetchUsers(s);
  }

  const formatTokens = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(n);
  };

  return (
    <>
      <Head><title>用户管理 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/users">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>用户与 Token 权限</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理用户账号、余额、API 密匙权限和调用限制</p>
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

                  <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                    <button onClick={handleSaveUser} disabled={saving} style={{ flex: 1, padding: "9px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>{saving ? "保存中..." : "保存配置"}</button>
                    <button onClick={() => handleBlockUser(selectedUser)} style={{ padding: "9px 14px", borderRadius: 7, border: "none", background: selectedUser.status === "blocked" ? "#22c55e" : "#ef4444", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{selectedUser.status === "blocked" ? "解封用户" : "封禁用户"}</button>
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

function EditField({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", marginBottom: 5, textTransform: "uppercase" }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: "inherit" }} />
    </div>
  );
}
