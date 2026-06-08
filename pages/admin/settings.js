export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

export default function AdminSettings() {
  const [secret, setSecret] = useState(() => (typeof window === "undefined" ? "" : sessionStorage.getItem("flowapi_admin_secret") || ""));
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const s = sessionStorage.getItem("flowapi_admin_secret") || "";
    fetchSettings(s);
  }, []);

  async function fetchSettings(sec) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", { headers: { "x-admin-secret": sec } });
      const data = await res.json();
      if (res.ok) setSettings(data.settings || {});
      else setMsg(data.error || "加载失败");
    } catch { setMsg("网络错误"); }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    const s = secret || sessionStorage.getItem("flowapi_admin_secret") || "";
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST", headers: { "content-type": "application/json", "x-admin-secret": s }, body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok) setMsg("设置已保存");
      else setMsg(data.error || "保存失败");
    } catch { setMsg("网络错误"); }
    setSaving(false);
  }

  function update(key, value) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleArrayItem(key, item) {
    setSettings((prev) => {
      if (!prev) return prev;
      const arr = prev[key] || [];
      if (arr.includes(item)) return { ...prev, [key]: arr.filter((x) => x !== item) };
      return { ...prev, [key]: [...arr, item] };
    });
  }

  function handleSecretSave() {
    const s = secret.trim();
    if (!s) return setMsg("请输入管理密钥");
    sessionStorage.setItem("flowapi_admin_secret", s);
    setMsg("");
    fetchSettings(s);
  }

  return (
    <>
      <Head><title>系统设置 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/settings">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>系统设置</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理 FlowAPI 平台的全局配置参数</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="管理密钥" type="password" style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", width: 140 }} />
              <button onClick={handleSecretSave} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>验证</button>
            </div>
          </header>

          {msg && <div style={{ padding: "10px 16px", borderRadius: 8, background: msg === "设置已保存" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: msg === "设置已保存" ? "#22c55e" : "#ef4444", fontSize: 13, marginBottom: 14, fontWeight: 600 }}>{msg}</div>}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--dash-sub)" }}>加载中...</div>
          ) : settings ? (
            <div style={{ display: "grid", gap: 16, maxWidth: 800 }}>
              <Section title="站点信息">
                <EditField label="站点名称" value={settings.siteName || ""} onChange={(v) => update("siteName", v)} />
                <EditField label="站点域名" value={settings.siteDomain || ""} onChange={(v) => update("siteDomain", v)} />
                <EditField label="API Base URL" value={settings.apiBaseUrl || ""} onChange={(v) => update("apiBaseUrl", v)} mono />
                <EditField label="管理员邮箱" value={settings.adminEmail || ""} onChange={(v) => update("adminEmail", v)} />
              </Section>

              <Section title="注册与用户">
                <ToggleEditField label="开放注册" checked={!!settings.openRegistration} onChange={(v) => update("openRegistration", v)} />
                <EditField label="注册即送额度" value={String(settings.registerBonus || 0)} onChange={(v) => update("registerBonus", Number(v))} type="number" prefix="¥" />
                <EditField label="默认用户等级" value={settings.defaultLevel || ""} onChange={(v) => update("defaultLevel", v)} />
                <EditField label="最低充值金额" value={String(settings.minRecharge || 0)} onChange={(v) => update("minRecharge", Number(v))} type="number" prefix="¥" />
              </Section>

              <Section title="支付渠道">
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {["微信支付", "支付宝", "淘宝激活码"].map((ch) => {
                    const active = (settings.paymentChannels || []).includes(ch);
                    return (
                      <button key={ch} onClick={() => toggleArrayItem("paymentChannels", ch)} style={{
                        padding: "8px 16px", borderRadius: 8, border: active ? "1px solid #22c55e" : "1px solid var(--dash-border)",
                        fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        background: active ? "rgba(34,197,94,0.1)" : "var(--dash-card-hover)", color: active ? "#22c55e" : "var(--dash-sub)",
                      }}>{active ? "✓ " : ""}{ch}</button>
                    );
                  })}
                </div>
              </Section>

              <Section title="预警通知">
                <EditField label="低余额提醒阈值" value={String(settings.lowBalanceAlert || 0)} onChange={(v) => update("lowBalanceAlert", Number(v))} type="number" prefix="¥" />
                <ToggleEditField label="低余额邮件通知" checked={!!settings.lowBalanceAlertEmail} onChange={(v) => update("lowBalanceAlertEmail", v)} />
                <ToggleEditField label="异常调用通知" checked={!!settings.abnormalCallAlert} onChange={(v) => update("abnormalCallAlert", v)} />
                <ToggleEditField label="上游异常通知" checked={!!settings.upstreamErrorAlert} onChange={(v) => update("upstreamErrorAlert", v)} />
              </Section>

              <Section title="系统参数">
                <EditField label="日志留存天数" value={String(settings.logRetentionDays || 90)} onChange={(v) => update("logRetentionDays", Number(v))} type="number" suffix="天" />
                <EditField label="时区" value={settings.timezone || ""} onChange={(v) => update("timezone", v)} />
              </Section>

              <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
                <button onClick={handleSave} disabled={saving} style={{ padding: "12px 32px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>{saving ? "保存中..." : "保存设置"}</button>
                <button onClick={() => fetchSettings(secret)} style={{ padding: "12px 22px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>恢复默认</button>
              </div>
            </div>
          ) : null}
        </div>
      </AdminLayout>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>{title}</h2>
      <div style={{ display: "grid", gap: 0 }}>{children}</div>
    </div>
  );
}

function EditField({ label, value, onChange, mono, type = "text", prefix, suffix }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--dash-border)", gap: 12 }}>
      <span style={{ fontSize: 13, color: "var(--dash-sub)", flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {prefix && <span style={{ fontSize: 13, fontWeight: 600 }}>{prefix}</span>}
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: mono ? 240 : 180, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: mono ? "'SF Mono', monospace" : "inherit", textAlign: "right", fontWeight: 600 }} />
        {suffix && <span style={{ fontSize: 13, fontWeight: 600 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleEditField({ label, checked, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--dash-border)" }}>
      <span style={{ fontSize: 13, color: "var(--dash-sub)" }}>{label}</span>
      <button onClick={() => onChange(!checked)} style={{ width: 42, height: 24, borderRadius: 12, border: "none", background: checked ? "#22c55e" : "var(--dash-border)", cursor: "pointer", position: "relative" }}>
        <span style={{ position: "absolute", top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s ease" }} />
      </button>
    </div>
  );
}
