export const dynamic = "force-dynamic";
import Head from "next/head";
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const MOCK_LOGS = Array.from({ length: 15 }, (_, i) => ({
  id: `log_${String(i + 1).padStart(4, "0")}`,
  time: `2026-05-18 ${String(10 + Math.floor(i / 4)).padStart(2, "0")}:${String((i * 7 + 12) % 60).padStart(2, "0")}:${String((i * 13 + 3) % 60).padStart(2, "0")}`,
  user: ["Zhang Wei", "Li Ming", "Xiao", "Test Bot"][i % 4],
  apiKey: `sk-${["ds1", "or2", "us3", "tk4"][i % 4]}****`,
  model: ["deepseek-chat", "gpt-4o-mini", "claude-3.5-haiku", "qwen3-32b", "gemini-2.0-flash"][i % 5],
  channel: ["DeepSeek 官方", "聚合路由", "Together AI", "阿里云模型"][i % 4],
  inputTokens: Math.floor(Math.random() * 5000) + 200,
  outputTokens: Math.floor(Math.random() * 3000) + 100,
  cost: +(Math.random() * 0.05).toFixed(4),
  channelCost: +(Math.random() * 0.025).toFixed(4),
  latency: Math.floor(Math.random() * 2000) + 100,
  statusCode: [200, 200, 200, 200, 200, 429, 500, 200, 200, 400][i % 10],
  status: [200, 200, 200, 200, 200, 429, 500, 200, 200, 400][i % 10] === 200 ? "success" : "error",
}));

export default function AdminLogs() {
  const [logs] = useState(MOCK_LOGS);
  const [filters, setFilters] = useState({ user: "", model: "", status: "", channel: "" });

  const filtered = logs.filter((l) => {
    if (filters.user && !l.user.includes(filters.user)) return false;
    if (filters.model && !l.model.includes(filters.model)) return false;
    if (filters.status === "success" && l.status !== "success") return false;
    if (filters.status === "error" && l.status === "success") return false;
    if (filters.channel && !l.channel.includes(filters.channel)) return false;
    return true;
  });

  return (
    <>
      <Head><title>管理后台 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/logs">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>调用日志</h1>
            <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>查看每一次 API 调用的详细记录，支持多维度筛选</p>
          </header>

          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input placeholder="用户" value={filters.user} onChange={(e) => setFilters({ ...filters, user: e.target.value })} style={inputS} />
            <input placeholder="模型" value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })} style={inputS} />
            <input placeholder="渠道" value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })} style={inputS} />
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ ...inputS, minWidth: 100 }}>
              <option value="">全部状态</option>
              <option value="success">成功</option>
              <option value="error">失败</option>
            </select>
            <button onClick={() => setFilters({ user: "", model: "", status: "", channel: "" })} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>重置</button>
          </div>

          {/* Table */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
                <thead>
                  <tr style={{ background: "var(--dash-card-hover)" }}>
                    <th style={thS}>时间</th><th style={thS}>用户</th><th style={thS}>API 密匙</th><th style={thS}>模型</th><th style={thS}>渠道</th><th style={thS}>输入 Token</th><th style={thS}>输出 Token</th><th style={thS}>扣费</th><th style={thS}>成本</th><th style={thS}>毛利</th><th style={thS}>耗时</th><th style={thS}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const profit = +(l.cost - l.channelCost).toFixed(4);
                    return (
                      <tr key={l.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                        <td style={{ ...tdS, fontSize: 11, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>{l.time}</td>
                        <td style={tdS}>{l.user}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", fontSize: 11 }}>{l.apiKey}</td>
                        <td style={tdS}>{l.model}</td>
                        <td style={tdS}>{l.channel}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{l.inputTokens.toLocaleString()}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{l.outputTokens.toLocaleString()}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", fontWeight: 600 }}>¥{l.cost.toFixed(4)}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>¥{l.channelCost.toFixed(4)}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", color: profit >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>¥{profit.toFixed(4)}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{l.latency}ms</td>
                        <td style={tdS}>
                          {l.status === "success" ? (
                            <span style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: 11, fontWeight: 700 }}>200</span>
                          ) : (
                            <span style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 11, fontWeight: 700 }}>{l.statusCode}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--dash-border)", fontSize: 12, color: "var(--dash-sub)", display: "flex", justifyContent: "space-between" }}>
              <span>共 {filtered.length} 条记录</span>
              <span>第 1 页</span>
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}

const inputS = { padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", outline: "none", minWidth: 120 };
const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 14px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "11px 14px", fontSize: 13, verticalAlign: "middle" };
