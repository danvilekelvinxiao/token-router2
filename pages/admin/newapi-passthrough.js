import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";

export default function AdminPassthroughPage() {
  const [tokens, setTokens] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ totalCalls: 0, totalTokens: 0 });
  const [form, setForm] = useState({ name: "", token: "", notes: "" });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [tRes, lRes, sRes] = await Promise.all([
        fetch("/api/admin/newapi-passthrough/list"),
        fetch("/api/admin/newapi-passthrough/logs"),
        fetch("/api/admin/newapi-passthrough/stats"),
      ]);
      const [tData, lData, sData] = await Promise.all([
        tRes.json(), lRes.json(), sRes.json(),
      ]);
      if (tData.success) setTokens(tData.tokens);
      if (lData.success) setLogs(lData.logs);
      if (sData.success) setStats(sData.stats);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.name.trim() || !form.token.trim()) {
      setError("名称和 Token 不能为空");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/admin/newapi-passthrough/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("已添加");
        setForm({ name: "", token: "", notes: "" });
        load();
      } else {
        setError(data.error || "添加失败");
      }
    } catch {
      setError("网络异常");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id, enabled) {
    await fetch("/api/admin/newapi-passthrough/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    load();
  }

  async function handleDelete(id) {
    if (!confirm("确认删除？")) return;
    await fetch("/api/admin/newapi-passthrough/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <AdminLayout currentPath="/admin/newapi-passthrough">
      <div className="admin-page-shell">
        <div className="admin-page-header">
          <h1>New API Token 直通白名单</h1>
          <p className="admin-page-sub">管理员调试专用。白名单 Token 走 New API 直通，不参与 FlowAPI 余额账本。</p>
        </div>

        <div className="admin-warning-banner" style={{ background: "var(--page-warning-bg)", color: "var(--page-warning-text)", padding: "12px 16px", borderRadius: 8, marginBottom: 24, fontSize: 13, fontWeight: 600 }}>
          New API Token 直通仅用于管理员调试，不参与 FlowAPI 用户余额账本，生产环境请谨慎开启。
        </div>

        {/* Stats */}
        <div className="admin-stat-grid" style={{ marginBottom: 24 }}>
          <div className="admin-stat-card">
            <div className="admin-stat-label">白名单 Token</div>
            <div className="admin-stat-value">{tokens.length} 个</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">直通调用次数</div>
            <div className="admin-stat-value">{stats.totalCalls}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">直通累计 Token</div>
            <div className="admin-stat-value">{stats.totalTokens.toLocaleString()}</div>
          </div>
        </div>

        {/* Add form */}
        <div className="admin-section" style={{ marginBottom: 24 }}>
          <h2 className="admin-section-title">添加白名单 Token</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600, color: "var(--page-text)" }}>
              名称
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：测试 GPT-5.5"
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600, color: "var(--page-text)" }}>
              备注
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="可选"
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)" }}
              />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600, color: "var(--page-text)", marginBottom: 12 }}>
            New API Token（完整 sk-xxx）
            <input
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              placeholder="sk-xxxxxxxx"
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)" }}
            />
          </label>
          {error && <p style={{ color: "var(--page-warning-text)", fontSize: 13, marginBottom: 8 }}>{error}</p>}
          {message && <p style={{ color: "var(--page-success-text)", fontSize: 13, marginBottom: 8 }}>{message}</p>}
          <button className="btn-primary" onClick={handleAdd} disabled={adding}>
            {adding ? "添加中..." : "添加到白名单"}
          </button>
        </div>

        {/* Whitelist table */}
        <div className="admin-section" style={{ marginBottom: 24 }}>
          <h2 className="admin-section-title">白名单列表</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>Token</th>
                <th>备注</th>
                <th>状态</th>
                <th>最后使用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--page-sub)" }}>暂无白名单 Token</td></tr>
              ) : tokens.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 700 }}>{t.name}</td>
                  <td><code>{t.token_preview}</code></td>
                  <td style={{ color: "var(--page-sub)", fontSize: 13 }}>{t.notes || "—"}</td>
                  <td>
                    <span style={{ color: t.enabled ? "var(--page-success-text)" : "var(--page-warning-text)", fontWeight: 700 }}>
                      {t.enabled ? "启用" : "已禁用"}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: "var(--page-sub)" }}>
                    {t.last_used_at ? new Date(t.last_used_at).toLocaleString("zh-CN") : "从未"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-small" onClick={() => handleToggle(t.id, !t.enabled)}>
                        {t.enabled ? "禁用" : "启用"}
                      </button>
                      <button className="btn-small" style={{ color: "#ef4444" }} onClick={() => handleDelete(t.id)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent passthrough logs */}
        <div className="admin-section">
          <h2 className="admin-section-title">最近直通调用日志</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>模型</th>
                <th>状态</th>
                <th>输入Token</th>
                <th>输出Token</th>
                <th>耗时</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--page-sub)" }}>暂无直通调用记录</td></tr>
              ) : logs.map((l) => (
                <tr key={l.id}>
                  <td><code>{l.token_preview}</code></td>
                  <td>{l.model || "—"}</td>
                  <td>
                    <span style={{ color: l.status === 1 ? "var(--page-success-text)" : "var(--page-warning-text)", fontWeight: 700 }}>
                      {l.status === 1 ? "成功" : "失败"}
                    </span>
                  </td>
                  <td>{l.input_tokens || 0}</td>
                  <td>{l.output_tokens || 0}</td>
                  <td>{l.latency_ms || 0}ms</td>
                  <td style={{ fontSize: 13, color: "var(--page-sub)" }}>
                    {l.created_at ? new Date(l.created_at).toLocaleString("zh-CN") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export const dynamic = "force-dynamic";
