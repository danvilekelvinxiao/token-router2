export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const PROVIDER_TYPES = ["sub2api", "new-api", "openai-compatible", "responses-compatible", "custom"];

const emptyForm = {
  name: "",
  type: "sub2api",
  baseUrl: "",
  apiKey: "",
  enabled: true,
  priority: 100,
  weight: 1,
  models: "",
  timeoutMs: 120000,
  maxRetries: 2,
  supportsStream: true,
  supportsResponsesApi: false,
  supportsChatCompletionsApi: true,
  healthCheckPath: "/models",
};

function statusColor(status) {
  if (status === "healthy") return "#22c55e";
  if (status === "unhealthy") return "#ef4444";
  return "#f59e0b";
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "请求失败");
  return data;
}

function Field({ label, children }) {
  return <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800, color: "var(--dash-sub)" }}>{label}{children}</label>;
}

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontFamily: "inherit", fontSize: 13 };
const buttonStyle = { border: "1px solid var(--dash-border)", borderRadius: 10, background: "var(--dash-card-bg)", color: "var(--dash-text)", padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" };

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState([]);
  const [logProvider, setLogProvider] = useState("");

  const sortedProviders = useMemo(() => [...providers].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)), [providers]);

  async function loadProviders() {
    setLoading(true);
    try {
      const data = await readJson(await fetch("/api/admin/providers", { credentials: "same-origin" }));
      setProviders(data.providers || data.data?.providers || []);
    } catch (err) {
      setMessage(err.message || "渠道加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadProviders();
    });
  }, []);

  function editProvider(provider) {
    setEditingId(provider.id);
    setForm({
      ...emptyForm,
      ...provider,
      apiKey: "",
      models: Array.isArray(provider.models) ? provider.models.join("\n") : provider.models || "",
    });
    setMessage("编辑时留空 API Key 表示保留原密钥，不会回显完整上游 Key。");
  }

  async function saveProvider() {
    setSaving(true);
    setMessage("");
    try {
      const payload = { ...form, id: editingId || undefined };
      const url = editingId ? `/api/admin/providers/${encodeURIComponent(editingId)}` : "/api/admin/providers";
      const method = editingId ? "PUT" : "POST";
      await readJson(await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
      setForm(emptyForm);
      setEditingId("");
      setMessage("渠道保存成功，服务端路由会在下一次请求读取最新配置。");
      await loadProviders();
    } catch (err) {
      setMessage(err.message || "保存失败，请检查内容后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function action(id, actionName) {
    try {
      const url = actionName === "delete" ? `/api/admin/providers/${encodeURIComponent(id)}` : `/api/admin/providers/${encodeURIComponent(id)}/${actionName}`;
      const method = actionName === "delete" ? "DELETE" : "POST";
      await readJson(await fetch(url, { method, credentials: "same-origin" }));
      setMessage(actionName === "delete" ? "渠道已删除" : "操作成功");
      await loadProviders();
    } catch (err) {
      setMessage(err.message || "操作失败");
    }
  }

  async function syncModels(id) {
    try {
      const data = await readJson(await fetch(`/api/admin/providers/${encodeURIComponent(id)}/sync-models`, { method: "POST", credentials: "same-origin" }));
      setMessage(data.message || "模型同步成功");
      await loadProviders();
    } catch (err) {
      setMessage(err.message || "模型同步失败");
    }
  }

  async function showLogs(id) {
    try {
      const data = await readJson(await fetch(`/api/admin/providers/${encodeURIComponent(id)}/logs`, { credentials: "same-origin" }));
      setLogs(data.logs || data.data?.logs || []);
      setLogProvider(id);
    } catch (err) {
      setMessage(err.message || "日志读取失败");
    }
  }

  return (
    <>
      <Head><title>上游渠道 / Providers - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/providers">
        <div style={{ display: "grid", gap: 18, color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 950 }}>上游渠道 / Providers</h1>
              <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>只在管理员后台配置 sub2api、new-api 和 OpenAI-Compatible 上游；用户侧永远只看到 FlowAPI 统一入口。</p>
            </div>
            <button style={{ ...buttonStyle, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff" }} onClick={() => { setEditingId(""); setForm(emptyForm); }}>新增渠道</button>
          </header>

          {message && <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: message.includes("失败") || message.includes("错误") ? "#ef4444" : "#22c55e", fontWeight: 800, fontSize: 13 }}>{message}</div>}

          <section style={{ display: "grid", gridTemplateColumns: "minmax(360px, 0.9fr) minmax(520px, 1.4fr)", gap: 18, alignItems: "start" }}>
            <div style={{ border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", borderRadius: 16, padding: 18 }}>
              <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>{editingId ? "编辑渠道" : "新增渠道"}</h2>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="渠道名称"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="sub2api-pool-1 / upstream-new-api-1" /></Field>
                <Field label="渠道类型"><select style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{PROVIDER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
                <Field label="Base URL"><input style={inputStyle} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://example.com/v1" /></Field>
                <Field label="上游 API Key（加密保存，编辑留空保留原值）"><input style={inputStyle} type="password" value={form.apiKey || ""} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="不会回显完整 Key" /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  <Field label="优先级"><input style={inputStyle} type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
                  <Field label="权重"><input style={inputStyle} type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} /></Field>
                  <Field label="超时 ms"><input style={inputStyle} type="number" value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })} /></Field>
                </div>
                <Field label="模型列表（逗号或换行分隔，可同步 /v1/models）"><textarea style={{ ...inputStyle, minHeight: 92 }} value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} placeholder="gpt-5.5\nclaude-sonnet-4" /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 12, color: "var(--dash-sub)" }}>
                  {["enabled", "supportsStream", "supportsResponsesApi", "supportsChatCompletionsApi"].map((key) => <label key={key} style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={Boolean(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />{key}</label>)}
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button style={buttonStyle} onClick={() => { setEditingId(""); setForm(emptyForm); }}>重置</button>
                  <button style={{ ...buttonStyle, background: "linear-gradient(135deg,#10b981,#22c55e)", color: "#fff" }} onClick={saveProvider} disabled={saving}>{saving ? "保存中..." : "保存渠道"}</button>
                </div>
              </div>
            </div>

            <div style={{ border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", borderRadius: 16, overflow: "hidden" }}>
              {loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>加载渠道中...</div> : <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
                <thead><tr style={{ background: "var(--dash-card-hover)", color: "var(--dash-sub)", fontSize: 11 }}><th style={th}>名称</th><th style={th}>类型</th><th style={th}>Base URL</th><th style={th}>模型</th><th style={th}>优先/权重</th><th style={th}>健康</th><th style={th}>操作</th></tr></thead>
                <tbody>{sortedProviders.map((provider) => <tr key={provider.id} style={{ borderTop: "1px solid var(--dash-border)", fontSize: 12 }}>
                  <td style={td}><b>{provider.name}</b><br /><span style={{ color: "var(--dash-sub)", fontSize: 11 }}>{provider.apiKeyPreview || "未配置 Key"}</span></td>
                  <td style={td}>{provider.type}</td>
                  <td style={{ ...td, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "SF Mono, monospace" }}>{provider.baseUrl}</td>
                  <td style={td}>{(provider.models || []).length}</td>
                  <td style={td}>{provider.priority} / {provider.weight}</td>
                  <td style={td}><span style={{ color: statusColor(provider.lastHealthStatus), fontWeight: 900 }}>{provider.lastHealthStatus || "unknown"}</span><br /><span style={{ color: "var(--dash-sub)", fontSize: 10 }}>{provider.lastErrorMessage || "-"}</span></td>
                  <td style={td}><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button style={buttonStyle} onClick={() => editProvider(provider)}>编辑</button>
                    <button style={buttonStyle} onClick={() => action(provider.id, "test")}>测试</button>
                    <button style={buttonStyle} onClick={() => action(provider.id, provider.enabled ? "disable" : "enable")}>{provider.enabled ? "禁用" : "启用"}</button>
                    <button style={buttonStyle} onClick={() => syncModels(provider.id)}>同步模型</button>
                    <button style={buttonStyle} onClick={() => showLogs(provider.id)}>日志</button>
                    <button style={{ ...buttonStyle, color: "#ef4444" }} onClick={() => window.confirm("确认删除渠道？有关联模型映射时系统会拒绝删除。") && action(provider.id, "delete")}>删除</button>
                  </div></td>
                </tr>)}{!sortedProviders.length && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>暂无渠道</td></tr>}</tbody>
              </table>}
            </div>
          </section>

          {logProvider && <section style={{ border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", borderRadius: 16, padding: 18 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>渠道日志：{logProvider}</h2>
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}><thead><tr><th style={th}>时间</th><th style={th}>请求</th><th style={th}>模型</th><th style={th}>状态</th><th style={th}>HTTP</th><th style={th}>延迟</th><th style={th}>错误</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} style={{ borderTop: "1px solid var(--dash-border)" }}><td style={td}>{log.createdAt}</td><td style={td}>{log.requestId}</td><td style={td}>{log.publicModelName} → {log.upstreamModelName}</td><td style={td}>{log.status}</td><td style={td}>{log.httpStatus || "-"}</td><td style={td}>{log.latencyMs}ms</td><td style={td}>{log.errorCode || log.errorMessage || "-"}</td></tr>)}</tbody></table></div>
          </section>}
        </div>
      </AdminLayout>
    </>
  );
}

const th = { textAlign: "left", padding: "11px 12px", fontWeight: 900, whiteSpace: "nowrap" };
const td = { padding: "12px", verticalAlign: "top" };
