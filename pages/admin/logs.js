export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { formatApiMoneyPrecise } from "@/lib/format/number-format";

export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [filters, setFilters] = useState({ user: "", model: "", status: "", channel: "" });
  const [appliedFilters, setAppliedFilters] = useState({ user: "", model: "", status: "", channel: "" });
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    fetchLogs(appliedFilters, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchLogs(filt, pg) {
    setLoading(true);
    setMsg("");
    const params = new URLSearchParams();
    if (filt.user) params.set("user", filt.user);
    if (filt.model) params.set("model", filt.model);
    if (filt.status) params.set("status", filt.status);
    if (filt.channel) params.set("channel", filt.channel);
    params.set("limit", String(pageSize));
    params.set("offset", String(pg * pageSize));

    try {
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      } else setMsg(data.error || "加载失败");
    } catch { setMsg("网络错误"); }
    setLoading(false);
  }

  function handleSearch() {
    setAppliedFilters({ ...filters });
    setPage(0);
    fetchLogs(filters, 0);
  }

  function handlePageChange(newPage) {
    setPage(newPage);
    fetchLogs(appliedFilters, newPage);
  }

  function handleRefresh() {
    const emptyFilters = { user: "", model: "", status: "", channel: "" };
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(0);
    fetchLogs(emptyFilters, 0);
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <Head><title>调用日志 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/logs">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>调用日志</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>查看每一次 API 调用的详细记录，支持多维度筛选</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleRefresh} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>刷新</button>
            </div>
          </header>

          {msg && <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 13, marginBottom: 14, fontWeight: 600 }}>{msg}</div>}

          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="用户" value={filters.user} onChange={(e) => setFilters({ ...filters, user: e.target.value })} style={inputS} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
            <input placeholder="模型" value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })} style={inputS} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
            <input placeholder="渠道" value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })} style={inputS} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ ...inputS, minWidth: 100 }}>
              <option value="">全部状态</option>
              <option value="success">成功</option>
              <option value="error">失败</option>
            </select>
            <button onClick={handleSearch} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>查询</button>
            <button onClick={() => { setFilters({ user: "", model: "", status: "", channel: "" }); }} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>重置</button>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--dash-sub)" }}>加载中...</div>
          ) : (
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
                  <thead>
                    <tr style={{ background: "var(--dash-card-hover)" }}>
                      <th style={thS}>时间</th><th style={thS}>用户</th><th style={thS}>模型</th><th style={thS}>渠道</th><th style={thS}>输入 Token</th><th style={thS}>输出 Token</th><th style={thS}>扣费</th><th style={thS}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                        <td style={{ ...tdS, fontSize: 11, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>{l.time}</td>
                        <td style={tdS}>{l.user}</td>
                        <td style={tdS}>{l.model}</td>
                        <td style={tdS}>{l.channel}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{(l.inputTokens || 0).toLocaleString()}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{(l.outputTokens || 0).toLocaleString()}</td>
                        <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", fontWeight: 600 }}>{formatApiMoneyPrecise(l.cost || 0)}</td>
                        <td style={tdS}>
                          {l.status === "success" ? (
                            <span style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: 11, fontWeight: 700 }}>{l.statusCode || 200}</span>
                          ) : (
                            <span style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 11, fontWeight: 700 }}>{l.statusCode || "err"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>暂无日志记录</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--dash-border)", fontSize: 12, color: "var(--dash-sub)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>共 {total} 条记录</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => handlePageChange(page - 1)} disabled={page === 0} style={{ ...pageBtnS, opacity: page === 0 ? 0.4 : 1 }}>上一页</button>
                  <span>第 {page + 1} / {Math.max(totalPages, 1)} 页</span>
                  <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages - 1} style={{ ...pageBtnS, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>下一页</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

const inputS = { padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", outline: "none", minWidth: 120 };
const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 14px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "11px 14px", fontSize: 13, verticalAlign: "middle" };
const pageBtnS = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
