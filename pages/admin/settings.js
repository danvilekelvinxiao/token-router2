export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setSettings(data.settings || {});
      else setMsg(data.error || "加载失败");
    } catch { setMsg("网络错误"); }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(settings),
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
            <div style={{ display: "flex", gap: 8 }} />
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
                  {["微信支付", "支付宝", "XPay 收款码", "淘宝激活码"].map((ch) => {
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

              <Section title="订单与支付 / GMWallet">
                <ToggleEditField
                  label="启用 GMWallet 自动收银台"
                  checked={!!settings.gmwalletEnabled}
                  onChange={(v) => update("gmwalletEnabled", v)}
                />
                <EditField label="支付模式" value={settings.gmwalletMode || "gmpay"} onChange={(v) => update("gmwalletMode", v)} />
                <EditField label="Base URL" value={settings.gmwalletBaseUrl || ""} onChange={(v) => update("gmwalletBaseUrl", v)} mono />
                <EditField label="商户 PID" value={settings.gmwalletPid || ""} onChange={(v) => update("gmwalletPid", v)} mono />
                <EditField label="Secret Key" value={settings.gmwalletSecretKey || ""} onChange={(v) => update("gmwalletSecretKey", v)} mono />
                <EditField label="默认币种" value={settings.gmwalletCurrency || "cny"} onChange={(v) => update("gmwalletCurrency", v)} />
                <EditField label="默认收款代币" value={settings.gmwalletToken || "usdt"} onChange={(v) => update("gmwalletToken", v)} />
                <EditField label="默认收款网络" value={settings.gmwalletNetwork || "tron"} onChange={(v) => update("gmwalletNetwork", v)} />
                <EditField label="回调地址" value={settings.gmwalletNotifyUrl || ""} onChange={(v) => update("gmwalletNotifyUrl", v)} mono />
                <EditField label="跳转地址" value={settings.gmwalletReturnUrl || ""} onChange={(v) => update("gmwalletReturnUrl", v)} mono />
                <ToggleEditField
                  label="直接跳转收银台"
                  checked={settings.gmwalletDirectCheckout !== false}
                  onChange={(v) => update("gmwalletDirectCheckout", v)}
                />
                <HelpBlock
                  title="GMWallet 配置说明"
                  lines={[
                    "缺少 Base URL、PID、Secret Key、回调地址时，前端会返回精确字段提示。",
                    "默认币种、代币和网络建议保持 cny / usdt / tron。",
                    "支付成功后会直接跳转 payment_url，不再显示自定义 USDT 收款窗。",
                    "仍兼容旧的 EPUSDT_* 环境变量，便于服务器侧平滑过渡。",
                  ]}
                />
              </Section>

              <Section title="XPay 收款码">
                <ToggleEditField
                  label="启用 XPay 收款码"
                  checked={!!settings.xpayEnabled}
                  onChange={(v) => update("xpayEnabled", v)}
                />
                <HelpBlock
                  title="XPay 映射说明"
                  lines={[
                    "查询接口建议直接填写真实状态接口，例如 /pay/state/{orderId}",
                    "查询成功值默认支持 1 / 3 / paid / success / completed",
                    "回调字段可按真实 notify JSON 填写，支持点号路径",
                    "签名不确定时可先留空，确认后再启用",
                  ]}
                />
                <EditField
                  label="通道名称"
                  value={settings.xpayProviderName || "XPay"}
                  onChange={(v) => update("xpayProviderName", v)}
                />
                <EditField
                  label="收款码内容"
                  value={settings.xpayQrContent || ""}
                  onChange={(v) => update("xpayQrContent", v)}
                  mono
                />
                <ImageUploadField
                  label="收款码图片"
                  value={settings.xpayQrImage || ""}
                  onChange={(v) => update("xpayQrImage", v)}
                />
                <EditField
                  label="付款备注前缀"
                  value={settings.xpayPaymentNotePrefix || "XPAY"}
                  onChange={(v) => update("xpayPaymentNotePrefix", v)}
                />
                <EditField
                  label="查询接口 URL"
                  value={settings.xpayQueryUrl || ""}
                  onChange={(v) => update("xpayQueryUrl", v)}
                  mono
                />
                <EditField
                  label="查询方式"
                  value={settings.xpayQueryMethod || "GET"}
                  onChange={(v) => update("xpayQueryMethod", v)}
                />
                <EditField
                  label="查询订单字段"
                  value={settings.xpayQueryOrderParam || "orderId"}
                  onChange={(v) => update("xpayQueryOrderParam", v)}
                />
                <EditField
                  label="查询状态字段"
                  value={settings.xpayQueryStatusField || "result"}
                  onChange={(v) => update("xpayQueryStatusField", v)}
                />
                <EditField
                  label="查询成功值"
                  value={settings.xpayQueryPaidValues || "1,3,paid,success,succeeded,completed,ok,true"}
                  onChange={(v) => update("xpayQueryPaidValues", v)}
                />
                <EditField
                  label="回调订单字段"
                  value={settings.xpayNotifyOrderField || ""}
                  onChange={(v) => update("xpayNotifyOrderField", v)}
                />
                <EditField
                  label="回调流水字段"
                  value={settings.xpayNotifyTradeField || ""}
                  onChange={(v) => update("xpayNotifyTradeField", v)}
                />
                <EditField
                  label="回调金额字段"
                  value={settings.xpayNotifyAmountField || ""}
                  onChange={(v) => update("xpayNotifyAmountField", v)}
                />
                <EditField
                  label="回调状态字段"
                  value={settings.xpayNotifyStatusField || ""}
                  onChange={(v) => update("xpayNotifyStatusField", v)}
                />
                <EditField
                  label="回调成功值"
                  value={settings.xpayNotifyPaidValues || "1,3,paid,success,succeeded,completed,ok,true"}
                  onChange={(v) => update("xpayNotifyPaidValues", v)}
                />
                <EditField
                  label="签名头"
                  value={settings.xpaySignatureHeader || "x-xpay-signature"}
                  onChange={(v) => update("xpaySignatureHeader", v)}
                />
                <EditField
                  label="签名字段"
                  value={settings.xpaySignatureField || "signature"}
                  onChange={(v) => update("xpaySignatureField", v)}
                />
                <EditField
                  label="签名算法"
                  value={settings.xpaySignatureAlgorithm || "sha256"}
                  onChange={(v) => update("xpaySignatureAlgorithm", v)}
                />
                <EditField
                  label="回调签名密钥"
                  value={settings.xpayNotifySecret || ""}
                  onChange={(v) => update("xpayNotifySecret", v)}
                  mono
                />
                <ToggleEditField
                  label="人工确认模式"
                  checked={settings.xpayManualConfirm !== false}
                  onChange={(v) => update("xpayManualConfirm", v)}
                />
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
                <button onClick={() => fetchSettings()} style={{ padding: "12px 22px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>恢复默认</button>
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

function ImageUploadField({ label, value, onChange }) {
  const hasImage = Boolean(value);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--dash-border)", gap: 12 }}>
      <span style={{ fontSize: 13, color: "var(--dash-sub)", flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {hasImage ? <img src={value} alt="XPay 收款码预览" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: "1px solid var(--dash-border)" }} /> : null}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)", color: "var(--dash-text)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          上传图片
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            style={{ display: "none" }}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => onChange(String(reader.result || ""));
              reader.readAsDataURL(file);
              event.target.value = "";
            }}
          />
        </label>
        {hasImage ? <button type="button" onClick={() => onChange("")} style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>清除</button> : null}
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

function HelpBlock({ title, lines }) {
  return (
    <div style={{ padding: "12px 14px", margin: "8px 0 6px", borderRadius: 8, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dash-text)", marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 16, color: "var(--dash-sub)", fontSize: 12, lineHeight: 1.7 }}>
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}
