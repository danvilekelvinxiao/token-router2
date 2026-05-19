export const dynamic = "force-dynamic";
import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";

const MOCK_ROUTES = [
  { id: "rt_1", path: "/v1/chat/completions", strategy: "按权重分配", defaultModel: "deepseek-chat", timeout: 30, enabled: true },
  { id: "rt_2", path: "/v1/models", strategy: "固定渠道(DeepSeek)", defaultModel: "-", timeout: 10, enabled: true },
  { id: "rt_3", path: "/v1/completions", strategy: "最低成本优先", defaultModel: "gpt-4o-mini", timeout: 30, enabled: true },
  { id: "rt_4", path: "/v1/embeddings", strategy: "固定渠道(Together)", defaultModel: "text-embedding-3", timeout: 15, enabled: false },
];

const STRATEGIES = ["固定渠道", "按权重分配", "最低成本优先", "最低延迟优先", "失败自动切换"];

const MOCK_RATE_LIMITS = [
  { rule: "全站 RPM", value: 1000, enabled: true },
  { rule: "全站 TPM", value: "2M", enabled: true },
  { rule: "单 IP 最大并发", value: 10, enabled: true },
  { rule: "单 API 密匙 RPM 上限", value: 60, enabled: false },
];

export default function AdminRouting() {
  return (
    <>
      <Head><title>管理后台 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/routing">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>全局转发规则</h1>
            <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理 OpenAI 兼容路径、路由策略和全局限流</p>
          </header>

          {/* OpenAI Compat */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>OpenAI 兼容模式</h2>
                <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "2px 0 0" }}>启用后支持标准 OpenAI SDK 直接调用</p>
              </div>
              <span style={{ padding: "5px 14px", borderRadius: 999, background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: 12, fontWeight: 700 }}>已启用</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              {["/v1/models", "/v1/chat/completions", "/v1/completions", "/v1/embeddings"].map((p) => (
                <div key={p} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--dash-border)", fontFamily: "'SF Mono', monospace", fontSize: 12, fontWeight: 600 }}>{p}</div>
              ))}
            </div>
          </div>

          {/* Route Rules */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dash-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>模型路由规则</h2>
              <button style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 新增规则</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                <thead>
                  <tr style={{ background: "var(--dash-card-hover)" }}>
                    <th style={thS}>路径</th><th style={thS}>路由策略</th><th style={thS}>默认模型</th><th style={thS}>超时(s)</th><th style={thS}>状态</th><th style={thS}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_ROUTES.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", fontWeight: 600 }}>{r.path}</td>
                      <td style={tdS}>{r.strategy}</td>
                      <td style={tdS}>{r.defaultModel}</td>
                      <td style={tdS}>{r.timeout}</td>
                      <td style={tdS}><span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: r.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: r.enabled ? "#22c55e" : "var(--dash-sub)" }}>{r.enabled ? "启用" : "禁用"}</span></td>
                      <td style={tdS}>
                        <button style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>编辑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rate Limits */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "22px 24px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>全局限流规则</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {MOCK_RATE_LIMITS.map((rl, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--dash-border)" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{rl.rule}</div>
                    <div style={{ fontSize: 13, fontFamily: "'SF Mono', monospace", color: "var(--dash-accent)", marginTop: 2 }}>{rl.value}</div>
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: rl.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: rl.enabled ? "#22c55e" : "var(--dash-sub)" }}>{rl.enabled ? "已启用" : "已禁用"}</span>
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
