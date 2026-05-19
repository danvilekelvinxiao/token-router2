export const dynamic = "force-dynamic";
import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";

const MOCK_PRICES = [
  { model: "DeepSeek V3 (deepseek-chat)", inputPrice: 1.0, outputPrice: 2.0, costInput: 0.5, costOutput: 1.0, multiplier: 2.0 },
  { model: "DeepSeek V4 (deepseek-reasoner)", inputPrice: 3.0, outputPrice: 8.0, costInput: 1.5, costOutput: 4.0, multiplier: 2.0 },
  { model: "GPT-4o Mini (gpt-4o-mini)", inputPrice: 1.08, outputPrice: 4.32, costInput: 0.8, costOutput: 2.88, multiplier: 1.5 },
  { model: "Claude Haiku (claude-3.5-haiku)", inputPrice: 5.76, outputPrice: 28.8, costInput: 3.84, costOutput: 19.2, multiplier: 1.5 },
  { model: "Gemini Flash (gemini-2.0-flash)", inputPrice: 0.72, outputPrice: 2.88, costInput: 0.4, costOutput: 1.5, multiplier: 1.8 },
  { model: "Qwen3 32B (qwen3-32b)", inputPrice: 2.16, outputPrice: 6.48, costInput: 1.2, costOutput: 4.0, multiplier: 1.8 },
  { model: "Kimi K2 (kimi-k2)", inputPrice: 3.60, outputPrice: 14.4, costInput: 2.0, costOutput: 8.0, multiplier: 1.8 },
];

const MOCK_ALERT_RULES = [
  { id: "ar_1", name: "余额不足提醒", condition: "余额 < ¥10", action: "发送邮件 + 站内通知", enabled: true },
  { id: "ar_2", name: "大额消耗预警", condition: "单日消耗 > ¥100", action: "发送邮件", enabled: true },
  { id: "ar_3", name: "异常消耗检测", condition: "1小时内消耗 > 日均3倍", action: "暂停调用 + 通知管理员", enabled: false },
];

export default function AdminBillingRules() {
  return (
    <>
      <Head><title>管理后台 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/billing-rules">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>计费规则</h1>
            <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理模型定价、计费单位和余额预警规则</p>
          </header>

          {/* Pricing Config */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px", marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>计费配置</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 16 }}>
              <ConfigCard label="计费单位" value="每 1M Token" />
              <ConfigCard label="最低扣费金额" value="¥ 0.0001" />
              <ConfigCard label="失败请求扣费" value="否" />
              <ConfigCard label="账单生成周期" value="每日 00:00 (UTC+8)" />
              <ConfigCard label="默认售价倍率" value="x 2.0" />
              <ConfigCard label="计费精度" value="小数点后 4 位" />
            </div>
          </div>

          {/* Model Price Table */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dash-border)" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>模型价格表</h2>
              <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "2px 0 0" }}>价格单位：¥ / 1M Token</p>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "var(--dash-card-hover)" }}>
                    <th style={thS}>模型</th><th style={thS}>输入售价</th><th style={thS}>输出售价</th><th style={thS}>输入成本</th><th style={thS}>输出成本</th><th style={thS}>倍率</th><th style={thS}>毛利</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_PRICES.map((p, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--dash-border)" }}>
                      <td style={tdS}><b>{p.model}</b></td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>¥{p.inputPrice.toFixed(2)}</td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>¥{p.outputPrice.toFixed(2)}</td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>¥{p.costInput.toFixed(2)}</td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>¥{p.costOutput.toFixed(2)}</td>
                      <td style={tdS}>x{p.multiplier.toFixed(1)}</td>
                      <td style={{ ...tdS, color: "#22c55e", fontFamily: "'SF Mono', monospace", fontWeight: 700 }}>¥{(p.inputPrice - p.costInput + p.outputPrice - p.costOutput).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alert Rules */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>余额预警规则</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {MOCK_ALERT_RULES.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "var(--dash-card-hover)" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "var(--dash-sub)", marginTop: 3 }}>{r.condition} → {r.action}</div>
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: r.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: r.enabled ? "#22c55e" : "var(--dash-sub)" }}>{r.enabled ? "已启用" : "已禁用"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}

const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 16px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "12px 16px", fontSize: 13, verticalAlign: "middle" };

function ConfigCard({ label, value }) {
  return (
    <div style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid var(--dash-border)" }}>
      <div style={{ fontSize: 11, color: "var(--dash-sub)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'SF Mono', monospace" }}>{value}</div>
    </div>
  );
}
