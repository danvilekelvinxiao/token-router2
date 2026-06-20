import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";

export default function ImportNewApiTokenPage() {
  const [form, setForm] = useState({
    token: "", name: "", customerId: "", publicModelId: "deepseek-chat",
    actualModelId: "", modelDisplayName: "", modelGroup: "default",
    allowedModels: "", expiresAt: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    fetch("/api/admin/customers")
      .then((r) => r.ok && r.json())
      .then((d) => d?.customers && setCustomers(d.customers))
      .catch(() => setError("用户列表加载失败"));
  }, []);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!form.token.trim() || !form.name.trim() || !form.customerId.trim()) {
      setError("Token、名称、用户 ID 为必填");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/import-newapi-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: form.token.trim(),
          name: form.name.trim(),
          customerId: form.customerId.trim(),
          publicModelId: form.publicModelId.trim() || "deepseek-chat",
          actualModelId: form.actualModelId.trim() || form.publicModelId.trim(),
          modelDisplayName: form.modelDisplayName.trim() || form.publicModelId.trim(),
          modelGroup: form.modelGroup.trim() || "default",
          allowedModels: form.allowedModels.trim(),
          expiresAt: form.expiresAt || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.key);
        setForm({ ...form, token: "", name: "" });
      } else {
        setError(data.error || "导入失败");
      }
    } catch {
      setError("网络异常");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminLayout currentPath="/admin/api-keys/import-newapi-token">
      <div className="admin-page-shell">
        <div className="admin-page-header">
          <h1>导入 New API Token</h1>
          <p className="admin-page-sub">将 New API 后台直接创建的 Token 登记到 FlowAPI 本地 api_keys 表，使其可以通过 FlowAPI 调用并走本地余额账本。</p>
        </div>

        <div className="admin-warning-banner" style={{ background: "var(--page-warning-bg)", color: "var(--page-warning-text)", padding: "12px 16px", borderRadius: 8, marginBottom: 24, fontSize: 13, fontWeight: 600 }}>
          注意：导入后该 Token 将通过 FlowAPI 本地余额扣费，请确认绑定用户有足够余额。
        </div>

        <form onSubmit={handleSubmit} className="admin-section" style={{ marginBottom: 24 }}>
          <h2 className="admin-section-title">Token 信息</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label className="admin-field-label">
              用户
              <select value={form.customerId} onChange={update("customerId")} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)", width: "100%" }}>
                <option value="">选择用户...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.email} ({c.id})</option>
                ))}
              </select>
            </label>
            <label className="admin-field-label">
              Key 名称
              <input value={form.name} onChange={update("name")} placeholder="例如：测试 GPT-5.5" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)", width: "100%" }} />
            </label>
          </div>

          <label className="admin-field-label" style={{ marginBottom: 12, display: "block" }}>
            New API Token（完整 sk-xxx）
            <input value={form.token} onChange={update("token")} placeholder="sk-xxxxxxxx" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)", width: "100%", fontFamily: "SF Mono, Consolas, monospace" }} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label className="admin-field-label">
              公开模型 ID
              <input value={form.publicModelId} onChange={update("publicModelId")} placeholder="deepseek-chat" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)", width: "100%" }} />
            </label>
            <label className="admin-field-label">
              实际模型 ID
              <input value={form.actualModelId} onChange={update("actualModelId")} placeholder="同公开模型 ID" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)", width: "100%" }} />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label className="admin-field-label">
              分组
              <input value={form.modelGroup} onChange={update("modelGroup")} placeholder="default" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)", width: "100%" }} />
            </label>
            <label className="admin-field-label">
              允许模型（逗号分隔）
              <input value={form.allowedModels} onChange={update("allowedModels")} placeholder="deepseek-chat,deepseek-reasoner" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)", width: "100%" }} />
            </label>
            <label className="admin-field-label">
              过期时间
              <input type="date" value={form.expiresAt} onChange={update("expiresAt")} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--page-input-border)", background: "var(--page-input-bg)", color: "var(--page-text)", width: "100%" }} />
            </label>
          </div>

          {error && <p style={{ color: "var(--page-warning-text)", fontSize: 13, marginBottom: 8 }}>{error}</p>}

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "导入中..." : "导入到 FlowAPI 本地 api_keys"}
          </button>
        </form>

        {result && (
          <div className="admin-section" style={{ background: "var(--page-success-bg)", border: "1px solid var(--page-success-text)", padding: 16, borderRadius: 8 }}>
            <h2 className="admin-section-title" style={{ color: "var(--page-success-text)" }}>导入成功</h2>
            <table className="admin-table">
              <tbody>
                <tr><td style={{ fontWeight: 700 }}>ID</td><td><code>{result.id}</code></td></tr>
                <tr><td style={{ fontWeight: 700 }}>名称</td><td>{result.name}</td></tr>
                <tr><td style={{ fontWeight: 700 }}>Token Preview</td><td><code>{result.tokenPreview}</code></td></tr>
                <tr><td style={{ fontWeight: 700 }}>Token Hash</td><td><code style={{ fontSize: 11 }}>{result.tokenHash}</code></td></tr>
                <tr><td style={{ fontWeight: 700 }}>用户</td><td><code>{result.customerId}</code></td></tr>
                <tr><td style={{ fontWeight: 700 }}>模型</td><td><code>{result.publicModelId}</code></td></tr>
                <tr><td style={{ fontWeight: 700 }}>分组</td><td><code>{result.modelGroup}</code></td></tr>
                <tr><td style={{ fontWeight: 700 }}>允许模型</td><td><code>{result.allowedModels.join(", ")}</code></td></tr>
              </tbody>
            </table>
            <p style={{ marginTop: 12, fontSize: 13, color: "var(--page-sub)" }}>
              该 Token 现在可以通过 FlowAPI /v1/chat/completions 调用，走 FlowAPI 本地余额扣费。
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export const dynamic = "force-dynamic";
