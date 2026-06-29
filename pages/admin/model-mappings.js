export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const emptyForm = {
  publicModelName: "",
  upstreamProviderId: "",
  upstreamModelName: "",
  enabled: true,
  inputPricePer1M: "",
  outputPricePer1M: "",
  cachedInputPricePer1M: "",
  displayName: "",
  description: "",
};

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "请求失败");
  return data;
}

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontFamily: "inherit", fontSize: 13 };
const buttonStyle = { border: "1px solid var(--dash-border)", borderRadius: 10, background: "var(--dash-card-bg)", color: "var(--dash-text)", padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const th = { textAlign: "left", padding: "11px 12px", fontWeight: 900, color: "var(--dash-sub)", whiteSpace: "nowrap", fontSize: 11 };
const td = { padding: "12px", verticalAlign: "top", fontSize: 12 };

function Field({ label, children }) {
  return <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800, color: "var(--dash-sub)" }}>{label}{children}</label>;
}

export default function AdminModelMappingsPage() {
  const [providers, setProviders] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);

  async function loadAll() {
    setLoading(true);
    try {
      const [providerData, mappingData] = await Promise.all([
        readJson(await fetch("/api/admin/providers", { credentials: "same-origin" })),
        readJson(await fetch("/api/admin/model-mappings?includeDisabled=true", { credentials: "same-origin" })),
      ]);
      setProviders(providerData.providers || providerData.data?.providers || []);
      setMappings(mappingData.mappings || mappingData.data?.mappings || []);
    } catch (err) {
      setMessage(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadAll();
    });
  }, []);

  function edit(mapping) {
    setEditingId(mapping.id);
    setForm({ ...emptyForm, ...mapping });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const payload = { ...form, id: editingId || undefined };
      const url = editingId ? `/api/admin/model-mappings/${encodeURIComponent(editingId)}` : "/api/admin/model-mappings";
      const method = editingId ? "PUT" : "POST";
      await readJson(await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
      setForm(emptyForm);
      setEditingId("");
      setMessage("模型映射保存成功，下一次 API 调用会使用新的上游真实模型名。");
      await loadAll();
    } catch (err) {
      setMessage(err.message || "模型映射保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function action(id, actionName) {
    try {
      const url = actionName === "delete" ? `/api/admin/model-mappings/${encodeURIComponent(id)}` : `/api/admin/model-mappings/${encodeURIComponent(id)}/${actionName}`;
      const method = actionName === "delete" ? "DELETE" : "POST";
      await readJson(await fetch(url, { method, credentials: "same-origin" }));
      setMessage(actionName === "delete" ? "模型映射已删除" : "操作成功");
      await loadAll();
    } catch (err) {
      setMessage(err.message || "操作失败");
    }
  }

  return (
    <>
      <Head><title>模型映射 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/model-mappings">
        <div style={{ display: "grid", gap: 18, color: "var(--dash-text)" }}>
          <header>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 950 }}>模型映射</h1>
            <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>把用户请求的公开模型名映射到指定 Provider 的真实上游模型名；用户端不会看到 Provider、Base URL 或上游 Key。</p>
          </header>

          {message && <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: message.includes("失败") || message.includes("错误") ? "#ef4444" : "#22c55e", fontWeight: 800, fontSize: 13 }}>{message}</div>}

          <section style={{ display: "grid", gridTemplateColumns: "minmax(360px, 0.85fr) minmax(560px, 1.4fr)", gap: 18, alignItems: "start" }}>
            <div style={{ border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", borderRadius: 16, padding: 18 }}>
              <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>{editingId ? "编辑映射" : "新增映射"}</h2>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="对外模型名 publicModelName"><input style={inputStyle} value={form.publicModelName} onChange={(e) => setForm({ ...form, publicModelName: e.target.value })} placeholder="gpt-5.5" /></Field>
                <Field label="上游 Provider"><select style={inputStyle} value={form.upstreamProviderId} onChange={(e) => setForm({ ...form, upstreamProviderId: e.target.value })}><option value="">选择 Provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} ({provider.type})</option>)}</select></Field>
                <Field label="上游真实模型名"><input style={inputStyle} value={form.upstreamModelName} onChange={(e) => setForm({ ...form, upstreamModelName: e.target.value })} placeholder="chatgpt5.5 / claude-sonnet-4-20250514" /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  <Field label="输入价/1M"><input style={inputStyle} value={form.inputPricePer1M ?? ""} onChange={(e) => setForm({ ...form, inputPricePer1M: e.target.value })} /></Field>
                  <Field label="输出价/1M"><input style={inputStyle} value={form.outputPricePer1M ?? ""} onChange={(e) => setForm({ ...form, outputPricePer1M: e.target.value })} /></Field>
                  <Field label="缓存价/1M"><input style={inputStyle} value={form.cachedInputPricePer1M ?? ""} onChange={(e) => setForm({ ...form, cachedInputPricePer1M: e.target.value })} /></Field>
                </div>
                <Field label="展示名"><input style={inputStyle} value={form.displayName || ""} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
                <Field label="说明"><textarea style={{ ...inputStyle, minHeight: 70 }} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--dash-sub)", fontWeight: 800 }}><input type="checkbox" checked={Boolean(form.enabled)} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />启用映射</label>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button style={buttonStyle} onClick={() => { setEditingId(""); setForm(emptyForm); }}>重置</button>
                  <button style={{ ...buttonStyle, background: "linear-gradient(135deg,#10b981,#22c55e)", color: "#fff" }} onClick={save} disabled={saving}>{saving ? "保存中..." : "保存映射"}</button>
                </div>
              </div>
            </div>

            <div style={{ border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", borderRadius: 16, overflow: "hidden" }}>
              {loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>加载映射中...</div> : <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead><tr style={{ background: "var(--dash-card-hover)" }}><th style={th}>对外模型</th><th style={th}>Provider</th><th style={th}>上游模型</th><th style={th}>价格</th><th style={th}>状态</th><th style={th}>操作</th></tr></thead>
                <tbody>{mappings.map((mapping) => {
                  const provider = providerMap.get(mapping.upstreamProviderId);
                  return <tr key={mapping.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                    <td style={td}><b>{mapping.publicModelName}</b><br /><span style={{ color: "var(--dash-sub)" }}>{mapping.displayName || "-"}</span></td>
                    <td style={td}>{provider?.name || mapping.upstreamProviderId}<br /><span style={{ color: "var(--dash-sub)", fontSize: 11 }}>{provider?.type || ""}</span></td>
                    <td style={{ ...td, fontFamily: "SF Mono, monospace" }}>{mapping.upstreamModelName}</td>
                    <td style={td}>入 {mapping.inputPricePer1M ?? "-"} / 出 {mapping.outputPricePer1M ?? "-"}</td>
                    <td style={td}><span style={{ color: mapping.enabled ? "#22c55e" : "#ef4444", fontWeight: 900 }}>{mapping.enabled ? "启用" : "禁用"}</span></td>
                    <td style={td}><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button style={buttonStyle} onClick={() => edit(mapping)}>编辑</button>
                      <button style={buttonStyle} onClick={() => action(mapping.id, mapping.enabled ? "disable" : "enable")}>{mapping.enabled ? "禁用" : "启用"}</button>
                      <button style={{ ...buttonStyle, color: "#ef4444" }} onClick={() => window.confirm("确认删除模型映射？") && action(mapping.id, "delete")}>删除</button>
                    </div></td>
                  </tr>;
                })}{!mappings.length && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--dash-sub)" }}>暂无模型映射</td></tr>}</tbody>
              </table>}
            </div>
          </section>
        </div>
      </AdminLayout>
    </>
  );
}
