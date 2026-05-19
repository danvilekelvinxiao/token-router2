export const dynamic = "force-dynamic";
import Head from "next/head";
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const MOCK_USERS = [
  { id: "cus_001", name: "Zhang Wei", email: "zhang@example.com", level: "Pro", balance: 156.50, keyCount: 3, todayReqs: 142, todayTokens: "320K", todaySpend: 0.64, concurrency: 5, status: "active", registered: "2026-04-12" },
  { id: "cus_002", name: "Li Ming", email: "liming@demo.com", level: "Basic", balance: 8.20, keyCount: 1, todayReqs: 28, todayTokens: "45K", todaySpend: 0.09, concurrency: 1, status: "active", registered: "2026-05-01" },
  { id: "cus_003", name: "Test Bot", email: "bot@suspect.com", level: "Basic", balance: 0.03, keyCount: 5, todayReqs: 2840, todayTokens: "12.4M", todaySpend: 24.80, concurrency: 50, status: "blocked", registered: "2026-05-14" },
];

const MOCK_KEY_PERMISSIONS = {
  enabled: true, expireAt: "2027-05-18", dailyReqLimit: 10000, dailyTokenLimit: "5M", rpm: 60, tpm: 100000, maxConcurrency: 3, maxContext: 128000, costMultiplier: 1.0, allowedModels: ["deepseek-chat", "gpt-4o-mini", "claude-3.5-haiku"], ipWhitelist: ["47.238.81.210"],
};

function StatusBadge({ status }) {
  const map = { active: { label: "正常", color: "#22c55e", bg: "rgba(34,197,94,0.1)" }, blocked: { label: "已封禁", color: "#ef4444", bg: "rgba(239,68,68,0.1)" }, disabled: { label: "已禁用", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" } };
  const s = map[status] || map.active;
  return <span style={{ padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

export default function AdminUsers() {
  const [selectedUser, setSelectedUser] = useState(null);
  const [keyPerms, setKeyPerms] = useState(MOCK_KEY_PERMISSIONS);

  return (
    <>
      <Head><title>管理后台 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/users">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>用户与 Token 权限</h1>
            <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理用户账号、余额、API 密匙权限和调用限制</p>
          </header>

          <div style={{ display: "grid", gridTemplateColumns: selectedUser ? "1fr 380px" : "1fr", gap: 16 }}>
            {/* User Table */}
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                  <thead>
                    <tr style={{ background: "var(--dash-card-hover)" }}>
                      <th style={thS}>用户</th><th style={thS}>等级</th><th style={thS}>余额</th><th style={thS}>密匙数</th><th style={thS}>今日请求</th><th style={thS}>今日消耗</th><th style={thS}>并发</th><th style={thS}>状态</th><th style={thS}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_USERS.map((u) => (
                      <tr key={u.id} style={{ borderTop: "1px solid var(--dash-border)", background: selectedUser?.id === u.id ? "var(--dash-card-hover)" : "transparent" }}>
                        <td style={tdS}><b>{u.name}</b><div style={{ fontSize: 11, color: "var(--dash-sub)" }}>{u.email}</div></td>
                        <td style={tdS}><span style={{ fontSize: 11, fontWeight: 700, color: "var(--dash-accent)", background: "rgba(99,102,241,0.1)", padding: "2px 8px", borderRadius: 4 }}>{u.level}</span></td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>¥{u.balance.toFixed(2)}</td>
                        <td style={tdS}>{u.keyCount}</td>
                        <td style={tdS}>{u.todayReqs}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>¥{u.todaySpend.toFixed(2)}</td>
                        <td style={tdS}>{u.concurrency}</td>
                        <td style={tdS}><StatusBadge status={u.status} /></td>
                        <td style={tdS}>
                          <button onClick={() => setSelectedUser(u)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>详情</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* User Detail Panel */}
            {selectedUser && (
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{selectedUser.name}</h3>
                  <button onClick={() => setSelectedUser(null)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "transparent", color: "var(--dash-sub)", cursor: "pointer", fontSize: 18 }}>✕</button>
                </div>

                <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
                  <DetailRow label="用户 ID" value={selectedUser.id} />
                  <DetailRow label="邮箱" value={selectedUser.email} />
                  <DetailRow label="等级" value={selectedUser.level} />
                  <DetailRow label="余额" value={`¥${selectedUser.balance.toFixed(2)}`} />
                  <DetailRow label="注册时间" value={selectedUser.registered} />
                  <DetailRow label="状态" value={<StatusBadge status={selectedUser.status} />} />
                </div>

                <h4 style={{ fontSize: 13, fontWeight: 800, margin: "0 0 12px", color: "var(--dash-accent)", textTransform: "uppercase", letterSpacing: "0.04em" }}>API 密匙权限配置</h4>
                <div style={{ display: "grid", gap: 10 }}>
                  <ToggleRow label="启用" checked={keyPerms.enabled} onChange={(v) => setKeyPerms({ ...keyPerms, enabled: v })} />
                  <DetailRow label="过期时间" value={keyPerms.expireAt} />
                  <DetailRow label="每日请求上限" value={keyPerms.dailyReqLimit.toLocaleString()} />
                  <DetailRow label="每日 Token 上限" value={keyPerms.dailyTokenLimit} />
                  <DetailRow label="RPM" value={keyPerms.rpm} />
                  <DetailRow label="TPM" value={keyPerms.tpm.toLocaleString()} />
                  <DetailRow label="最大并发" value={keyPerms.maxConcurrency} />
                  <DetailRow label="最大上下文" value={`${(keyPerms.maxContext / 1000).toFixed(0)}K`} />
                  <DetailRow label="消耗倍率" value={`x${keyPerms.costMultiplier}`} />
                  <DetailRow label="允许模型" value={keyPerms.allowedModels.join(", ")} />
                  <DetailRow label="IP 白名单" value={keyPerms.ipWhitelist.join(", ")} />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button style={{ flex: 1, padding: "9px 14px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-text)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>保存配置</button>
                  <button style={{ padding: "9px 14px", borderRadius: 7, border: "none", background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>封禁用户</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </AdminLayout>
    </>
  );
}

const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 14px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "12px 14px", fontSize: 13, verticalAlign: "middle" };

function DetailRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--dash-sub)" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "var(--dash-sub)" }}>{label}</span>
      <button onClick={() => onChange(!checked)} style={{ width: 42, height: 24, borderRadius: 12, border: "none", background: checked ? "#22c55e" : "var(--dash-border)", cursor: "pointer", position: "relative", transition: "background 0.2s ease" }}>
        <span style={{ position: "absolute", top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s ease" }} />
      </button>
    </div>
  );
}
