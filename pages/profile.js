import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";

export default function ProfilePage() {
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refreshProfile = useCallback(async (c) => {
    if (!c) {
      const stored = localStorage.getItem("flowapi_customer");
      if (!stored) return;
      try { c = JSON.parse(stored); } catch { return; }
    }
    // always use localStorage as fallback so the page doesn't get stuck
    queueMicrotask(() => {
      setCustomer(c);
      setName(c.name || "");
    });

    try {
      const res = await fetch(`/api/profile?customerId=${c.id}`);
      if (res.ok) {
        const data = await res.json();
        setCustomer(data);
        setName(data.name || "");
        localStorage.setItem("flowapi_customer", JSON.stringify(data));
      }
    } catch { /* keep localStorage fallback */ }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("flowapi_customer");
    if (!stored) { router.push("/login"); return; }
    let c;
    try { c = JSON.parse(stored); } catch { router.push("/login"); return; }
    queueMicrotask(() => refreshProfile(c));
  }, [refreshProfile, router]);

  async function handleSave(e) {
    e.preventDefault();
    if (!customer) return;
    setSaving(true);
    setSaved(false);

    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id, name: name.trim() }),
    });

    if (res.ok) {
      const data = await res.json();
      setCustomer(data);
      localStorage.setItem("flowapi_customer", JSON.stringify(data));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (!customer) {
    return (
      <main className="landing-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--page-sub)" }}>加载中...</p>
      </main>
    );
  }

  const apiKeys = customer.apiKeys || [];
  const calls = customer.calls || [];
  const inviteCount = customer.inviteCount || 0;
  const joinDate = customer.createdAt
    ? new Date(customer.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
    : "-";

  return (
    <>
      <Head>
        <title>个人资料 - FlowAPI</title>
      </Head>

      <ConsoleLayout customer={customer} currentPath="/profile">

        {/* ===== Profile Header ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 30, fontWeight: 900, flex: "none",
          }}>
            {(customer.name || customer.email || "U")[0].toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "var(--page-heading)", margin: 0, letterSpacing: "-0.03em" }}>
              {customer.name || customer.email?.split("@")[0]}
            </h1>
            <p style={{ color: "var(--page-sub)", fontSize: 14, margin: "4px 0 0" }}>{customer.email}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--page-subtle)", fontWeight: 600 }}>注册于 {joinDate}</span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "var(--page-success-bg)", color: "var(--page-success-text)",
                padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--page-success-text)" }} />
                已验证
              </span>
            </div>
          </div>
        </div>

        {/* ===== Two-column layout ===== */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20, marginBottom: 32 }}>

          {/* ---- Left ---- */}
          <div style={{ display: "grid", gap: 20, alignContent: "start" }}>

            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {[
                { label: "账户余额", value: `¥ ${Number(customer.balance).toFixed(2)}`, accent: "#6366f1" },
                { label: "累计消耗", value: `¥ ${Number(customer.totalSpend).toFixed(2)}`, accent: "#8b5cf6" },
                { label: "调用次数", value: `${calls.length} 次`, accent: "#059669" },
                { label: "API 密匙", value: `${apiKeys.length} 个`, accent: "var(--page-heading)" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 14, padding: "18px 20px",
                }}>
                  <div style={{ fontSize: 12, color: "var(--page-subtle)", fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: s.accent, marginTop: 6, letterSpacing: "-0.02em" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Edit Form */}
            <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: "24px" }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--page-accent)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  编辑资料
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--page-heading)", margin: "4px 0 0", letterSpacing: "-0.02em" }}>
                  个人信息
                </h3>
              </div>

              <form onSubmit={handleSave}>
                <div className="form-field">
                  <label>邮箱</label>
                  <input type="email" value={customer.email || ""} disabled style={{ background: "var(--page-soft-bg)", color: "var(--page-sub)", cursor: "not-allowed" }} />
                  <span style={{ fontSize: 11, color: "var(--page-subtle)", marginTop: 3, display: "block" }}>邮箱不可修改</span>
                </div>
                <div className="form-field">
                  <label>姓名</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="你的姓名" />
                </div>
                {saved && <p style={{ color: "var(--page-success-text)", fontSize: 13, fontWeight: 600, margin: "8px 0" }}>保存成功</p>}
                <button type="submit" disabled={saving} className="btn-primary" style={{ width: "100%", marginTop: 20, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "保存中..." : "保存修改"}
                </button>
              </form>
            </div>

          </div>

          {/* ---- Right ---- */}
          <div style={{ display: "grid", gap: 20, alignContent: "start" }}>

            {/* Invite Card */}
            {customer.myInviteCode && (
              <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: "24px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--page-accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  邀请好友
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                  我的邀请码
                </h3>

                {/* Big code display */}
                <div style={{
                  background: "var(--page-accent-soft)",
                  border: "1px solid var(--page-accent-border)", borderRadius: 14,
                  padding: "18px 12px", marginTop: 12,
                }}>
                  <code style={{
                    fontSize: 38, fontWeight: 900, color: "var(--page-heading)",
                    letterSpacing: "0.14em",
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                  }}>
                    {customer.myInviteCode}
                  </code>
                </div>

                <div style={{ marginTop: 14 }}>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(customer.myInviteCode);
                      setSaved(true);
                      setTimeout(() => setSaved(false), 1500);
                    }}
                    className="btn-primary"
                    style={{ width: "100%", fontSize: 14 }}
                  >
                    {saved ? "已复制" : "复制邀请码"}
                  </button>
                </div>

                {/* Invite count */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
                  marginTop: 16, padding: "14px 0",
                  borderTop: "1px solid var(--page-card-border)",
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "var(--page-accent)" }}>{inviteCount}</div>
                    <div style={{ fontSize: 11, color: "var(--page-subtle)", fontWeight: 600, marginTop: 2 }}>已邀请</div>
                  </div>
                </div>

                {/* Reward notice */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 14px",
                  background: "var(--page-warning-bg)",
                  borderRadius: 10, border: "1px solid var(--page-warning-bg)",
                }}>
                  <span style={{ fontSize: 20 }}>🎁</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--page-warning-text)" }}>邀请成功送 ¥20 额度</div>
                    <div style={{ fontSize: 11, color: "var(--page-warning-sub)", marginTop: 1 }}>每成功邀请一位新用户，邀请人获得 ¥20</div>
                  </div>
                </div>
              </div>
            )}

            {/* Account Info */}
            <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: "24px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--page-accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                账户信息
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 16px", letterSpacing: "-0.02em" }}>
                详细资料
              </h3>
              <div style={{ display: "grid", gap: 0 }}>
                {[
                  { label: "邮箱", value: customer.email },
                  { label: "注册日期", value: joinDate },
                  { label: "邀请人数", value: `${inviteCount} 人` },
                ].map((item, i, arr) => (
                  <div key={item.label} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "11px 0",
                    borderBottom: i < arr.length - 1 ? "1px solid var(--page-row-divider)" : "none",
                  }}>
                    <span style={{ fontSize: 12, color: "var(--page-subtle)", fontWeight: 500 }}>{item.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--page-text)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ConsoleLayout>
    </>
  );
}
