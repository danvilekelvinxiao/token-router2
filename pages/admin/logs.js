export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "¥0.000000";
  return `¥${n.toFixed(6)}`;
}

function pct(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(2)}%`;
}

function formulaLine(label, count, price, multiplier, total) {
  return `${label} ${Number(count || 0).toLocaleString()} × $${Number(price || 0).toFixed(6)} × ${Number(multiplier || 1).toFixed(1)} = ${money(total)}`;
}

export default function AdminLogs() {
  const [secret, setSecret] = useState(() => (typeof window === "undefined" ? "" : sessionStorage.getItem("flowapi_admin_secret") || ""));
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [filters, setFilters] = useState({ user: "", model: "", status: "", channel: "" });
  const [appliedFilters, setAppliedFilters] = useState({ user: "", model: "", status: "", channel: "" });
  const [page, setPage] = useState(0);
  const [openRowId, setOpenRowId] = useState("");
  const [auditMap, setAuditMap] = useState({});
  const [loadingAudit, setLoadingAudit] = useState("");
  const pageSize = 50;

  const totalPages = Math.ceil(total / pageSize);

  async function fetchLogs(sec, filt, pg) {
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
      const res = await fetch(`/api/admin/logs?${params.toString()}`, { headers: { "x-admin-secret": sec } });
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        if (data.audit?.request_id) {
          setAuditMap((current) => ({ ...current, [data.audit.request_id]: data.audit }));
        }
      } else {
        setMsg(data.error || "加载失败");
      }
    } catch {
      setMsg("网络错误");
    }
    setLoading(false);
  }

  function loadAudit(sec, requestId) {
    if (!requestId || auditMap[requestId] || loadingAudit === requestId) return;
    setLoadingAudit(requestId);
    fetch(`/api/admin/logs?requestId=${encodeURIComponent(requestId)}&limit=1&offset=0`, {
      headers: { "x-admin-secret": sec },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.audit?.request_id) {
          setAuditMap((current) => ({ ...current, [data.audit.request_id]: data.audit }));
        }
      })
      .catch(() => null)
      .finally(() => setLoadingAudit(""));
  }

  function handleSearch() {
    const s = secret.trim();
    if (!s) return setMsg("请输入管理密钥");
    sessionStorage.setItem("flowapi_admin_secret", s);
    setAppliedFilters({ ...filters });
    setPage(0);
    fetchLogs(s, filters, 0);
  }

  function handlePageChange(newPage) {
    const s = secret || sessionStorage.getItem("flowapi_admin_secret") || "";
    setPage(newPage);
    fetchLogs(s, appliedFilters, newPage);
  }

  function handleSecretSave() {
    const s = secret.trim();
    if (!s) return setMsg("请输入管理密钥");
    sessionStorage.setItem("flowapi_admin_secret", s);
    setMsg("");
    setAppliedFilters({ user: "", model: "", status: "", channel: "" });
    setPage(0);
    fetchLogs(s, { user: "", model: "", status: "", channel: "" }, 0);
  }

  const visibleLogs = useMemo(() => logs.map((row) => {
    const inputTokens = Number(row.inputTokens || row.promptTokens || 0);
    const outputTokens = Number(row.outputTokens || row.completionTokens || 0);
    const cacheReadTokens = Number(row.cacheReadTokens || 0);
    const totalVisible = inputTokens + outputTokens + cacheReadTokens;
    return {
      ...row,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      inputRatio: totalVisible > 0 ? Number(((inputTokens / totalVisible) * 100).toFixed(2)) : 0,
      outputRatio: totalVisible > 0 ? Number(((outputTokens / totalVisible) * 100).toFixed(2)) : 0,
      cacheRatio: totalVisible > 0 ? Number(((cacheReadTokens / totalVisible) * 100).toFixed(2)) : 0,
    };
  }), [logs]);

  useEffect(() => {
    const s = secret || sessionStorage.getItem("flowapi_admin_secret") || "";
    if (s) fetchLogs(s, appliedFilters, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openRowId) return;
    const current = visibleLogs.find((row) => row.id === openRowId);
    if (current) loadAudit(secret || sessionStorage.getItem("flowapi_admin_secret") || "", current.requestId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRowId]);

  return (
    <>
      <Head><title>调用日志 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/logs">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>调用日志</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>列表只显示输入、输出、缓存读取数量和比例，展开后查看完整计费公式与请求详情。</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="管理密钥" type="password" style={{ padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", width: 140 }} />
              <button onClick={handleSecretSave} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>验证</button>
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
                      <th style={thS}>时间</th><th style={thS}>用户</th><th style={thS}>模型</th><th style={thS}>状态</th><th style={thS}>输入</th><th style={thS}>输出</th><th style={thS}>缓存读取</th><th style={thS}>比例</th><th style={thS}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLogs.map((l) => {
                      const isOpen = openRowId === l.id;
                      const audit = auditMap[l.requestId] || null;
                      return (
                        <>
                          <tr key={l.id} style={{ borderTop: "1px solid var(--dash-border)", cursor: "pointer" }} onClick={() => setOpenRowId(isOpen ? "" : l.id)}>
                            <td style={{ ...tdS, fontSize: 11, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>{l.time}</td>
                            <td style={tdS}>{l.user}</td>
                            <td style={tdS}>{l.model || l.publicModelId || "-"}</td>
                            <td style={tdS}>
                              <span style={{ padding: "3px 10px", borderRadius: 999, background: l.status === "success" ? "rgba(34,197,94,0.1)" : l.status === "timeout" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.1)", color: l.status === "success" ? "#22c55e" : l.status === "timeout" ? "#f59e0b" : "#ef4444", fontSize: 11, fontWeight: 700 }}>
                                {l.statusCode || (l.status === "success" ? 200 : "err")}
                              </span>
                            </td>
                            <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{l.inputTokens.toLocaleString()}</td>
                            <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{l.outputTokens.toLocaleString()}</td>
                            <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{l.cacheReadTokens.toLocaleString()}</td>
                            <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", color: "var(--dash-sub)" }}>{pct(l.inputRatio)} / {pct(l.outputRatio)} / {pct(l.cacheRatio)}</td>
                            <td style={tdS}>
                              <button onClick={(e) => { e.stopPropagation(); setOpenRowId(isOpen ? "" : l.id); loadAudit(secret || sessionStorage.getItem("flowapi_admin_secret") || "", l.requestId); }} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-text)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                {isOpen ? "收起" : "详情"}
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${l.id}-detail`}>
                              <td colSpan={9} style={{ padding: 0, borderTop: "1px solid var(--dash-border)" }}>
                                <div style={{ padding: 16, background: "var(--dash-card-hover)" }}>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
                                    <InfoBox label="request_id" value={l.requestId || "-"} />
                                    <InfoBox label="实际请求状态" value={`${l.status || "-"} / ${l.statusCode || "-"}`} />
                                    <InfoBox label="响应 / 并发" value={`${Number(l.latency || 0)}ms / ${Number(l.concurrency || 1)}`} />
                                    <InfoBox label="请求时间" value={l.time || "-"} />
                                    <InfoBox label="路由次数" value={String(l.routeAttempts || 0)} />
                                    <InfoBox label="计费模式" value={l.billingMode || "-"} />
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
                                    <InfoBox label="模型名" value={l.model || l.publicModelId || "-"} />
                                    <InfoBox label="用量细则" value={`输入 ${l.inputTokens.toLocaleString()} · 输出 ${l.outputTokens.toLocaleString()} · 缓存读取 ${l.cacheReadTokens.toLocaleString()}`} />
                                    <InfoBox label="比例" value={`输入 ${pct(l.inputRatio)} / 输出 ${pct(l.outputRatio)} / 缓存 ${pct(l.cacheRatio)}`} />
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
                                    <InfoBox label="输入价格 $ / 1M tokens" value={`${Number(l.originalInputPricePerM || 0).toFixed(6)} → ${Number(l.finalInputPricePerM || 0).toFixed(6)}`} />
                                    <InfoBox label="补全价格 $ / 1M tokens" value={`${Number(l.originalOutputPricePerM || 0).toFixed(6)} → ${Number(l.finalOutputPricePerM || 0).toFixed(6)}`} />
                                    <InfoBox label="缓存读取价格 $ / 1M tokens" value={Number(l.cacheReadPricePerM || 0).toFixed(6)} />
                                    <InfoBox label="基础价格倍率 / 综合价格倍率" value={`${Number(l.priceMultiplier || 1).toFixed(1)} / ${Number(l.compositeMultiplier || 1).toFixed(1)}`} />
                                  </div>
                                  <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                                    <FormulaRow label="输入" text={formulaLine("输入", l.inputTokens, l.originalInputPricePerM || 0, l.compositeMultiplier || 1, (l.inputTokens / 1_000_000) * Number(l.originalInputPricePerM || 0) * Number(l.compositeMultiplier || 1))} />
                                    <FormulaRow label="输出" text={formulaLine("输出", l.outputTokens, l.originalOutputPricePerM || 0, l.compositeMultiplier || 1, (l.outputTokens / 1_000_000) * Number(l.originalOutputPricePerM || 0) * Number(l.compositeMultiplier || 1))} />
                                    <FormulaRow label="缓存" text={formulaLine("缓存", l.cacheReadTokens, l.cacheReadPricePerM || 0, l.compositeMultiplier || 1, (l.cacheReadTokens / 1_000_000) * Number(l.cacheReadPricePerM || 0) * Number(l.compositeMultiplier || 1))} />
                                    <FormulaRow label="总计" text={`总计 ${money(l.actualCostCny ?? l.cost ?? 0)}`} strong />
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
                                    <InfoBox label="原始计费" value={money(l.originalCostCny)} />
                                    <InfoBox label="实际计费" value={money(l.actualCostCny)} />
                                    <InfoBox label="扣费状态" value={l.deductionDirection || "package_balance -> usd_token_balance"} />
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
                                    <InfoBox label="上游 / 渠道" value={`${l.upstreamProvider || l.provider || "-"} · ${l.upstreamChannel || "-"}`} />
                                    <InfoBox label="实际模型" value={l.actualModelId || "-"} />
                                    <InfoBox label="request_id 追踪" value={audit?.request_id || l.requestId || "-"} />
                                  </div>
                                  <div style={{ fontSize: 12, color: "var(--dash-sub)", lineHeight: 1.6 }}>
                                    {audit?.billing_alert ? `计费提醒：${audit.billing_alert}` : "计费过程已按平台账本记录。"}
                                  </div>
                                  {loadingAudit === l.requestId && (
                                    <div style={{ marginTop: 8, color: "var(--dash-sub)", fontSize: 12 }}>正在拉取审计详情...</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                    {visibleLogs.length === 0 && (
                      <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>暂无日志记录</td></tr>
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

function InfoBox({ label, value }) {
  return (
    <div style={{ border: "1px solid var(--dash-border)", borderRadius: 10, padding: 12, background: "var(--dash-card-bg)" }}>
      <div style={{ fontSize: 11, color: "var(--dash-sub)", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--dash-text)", fontWeight: 700, wordBreak: "break-word", lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function FormulaRow({ label, text, strong = false }) {
  return (
    <div style={{ border: "1px solid var(--dash-border)", borderRadius: 10, padding: 12, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ fontSize: 11, color: "var(--dash-sub)", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: strong ? 14 : 13, color: strong ? "var(--dash-accent)" : "var(--dash-text)", fontFamily: "'SF Mono', monospace", wordBreak: "break-all", lineHeight: 1.6, fontWeight: strong ? 900 : 600 }}>{text}</div>
    </div>
  );
}

const inputS = { padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", outline: "none", minWidth: 120 };
const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 14px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "11px 14px", fontSize: 13, verticalAlign: "middle" };
const pageBtnS = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
