export const dynamic = "force-dynamic";
import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";

const MOCK_SETTINGS = {
  siteName: "FlowAPI",
  siteDomain: "flowapi.fun",
  apiBaseUrl: "https://flowapi.fun/v1",
  adminEmail: "admin@flowapi.fun",
  openRegistration: true,
  registerBonus: 5.00,
  defaultLevel: "Basic",
  minRecharge: 10,
  paymentChannels: ["微信支付", "支付宝", "淘宝激活码"],
  lowBalanceAlert: 5.00,
  lowBalanceAlertEmail: true,
  abnormalCallAlert: true,
  upstreamErrorAlert: true,
  logRetentionDays: 90,
  timezone: "Asia/Shanghai (UTC+8)",
};

export default function AdminSettings() {
  return (
    <>
      <Head><title>管理后台 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/settings">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>系统设置</h1>
            <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理 FlowAPI 平台的全局配置参数</p>
          </header>

          <div style={{ display: "grid", gap: 16, maxWidth: 800 }}>
            {/* Site Info */}
            <Section title="站点信息">
              <FieldRow label="站点名称" value={MOCK_SETTINGS.siteName} />
              <FieldRow label="站点域名" value={MOCK_SETTINGS.siteDomain} />
              <FieldRow label="API Base URL" value={MOCK_SETTINGS.apiBaseUrl} mono />
              <FieldRow label="管理员邮箱" value={MOCK_SETTINGS.adminEmail} />
            </Section>

            {/* Registration */}
            <Section title="注册与用户">
              <ToggleField label="开放注册" checked={MOCK_SETTINGS.openRegistration} />
              <FieldRow label="注册即送额度" value={`¥ ${MOCK_SETTINGS.registerBonus.toFixed(2)}`} />
              <FieldRow label="默认用户等级" value={MOCK_SETTINGS.defaultLevel} />
              <FieldRow label="最低充值金额" value={`¥ ${MOCK_SETTINGS.minRecharge}`} />
            </Section>

            {/* Payment */}
            <Section title="支付渠道">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {MOCK_SETTINGS.paymentChannels.map((ch) => (
                  <span key={ch} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--dash-border)", fontSize: 13, fontWeight: 600, background: "var(--dash-card-hover)" }}>{ch}</span>
                ))}
              </div>
            </Section>

            {/* Alerts */}
            <Section title="预警通知">
              <FieldRow label="低余额提醒阈值" value={`¥ ${MOCK_SETTINGS.lowBalanceAlert.toFixed(2)}`} />
              <ToggleField label="低余额邮件通知" checked={MOCK_SETTINGS.lowBalanceAlertEmail} />
              <ToggleField label="异常调用通知" checked={MOCK_SETTINGS.abnormalCallAlert} />
              <ToggleField label="上游异常通知" checked={MOCK_SETTINGS.upstreamErrorAlert} />
            </Section>

            {/* System */}
            <Section title="系统参数">
              <FieldRow label="日志留存天数" value={`${MOCK_SETTINGS.logRetentionDays} 天`} />
              <FieldRow label="时区" value={MOCK_SETTINGS.timezone} />
            </Section>

            {/* Save */}
            <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
              <button style={{ padding: "12px 32px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>保存设置</button>
              <button style={{ padding: "12px 22px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>恢复默认</button>
            </div>
          </div>
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

function FieldRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--dash-border)" }}>
      <span style={{ fontSize: 13, color: "var(--dash-sub)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: mono ? "'SF Mono', monospace" : "inherit" }}>{value}</span>
    </div>
  );
}

function ToggleField({ label, checked }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--dash-border)" }}>
      <span style={{ fontSize: 13, color: "var(--dash-sub)" }}>{label}</span>
      <span style={{ width: 42, height: 24, borderRadius: 12, background: checked ? "#22c55e" : "var(--dash-border)", display: "inline-block", position: "relative" }}>
        <span style={{ position: "absolute", top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s ease" }} />
      </span>
    </div>
  );
}
