export const dynamic = "force-dynamic";
import Head from "next/head";
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const MOCK_CHANNELS = [
  { id: "ch_01", name: "DeepSeek 官方", provider: "DeepSeek", type: "OpenAI 兼容", baseUrl: "https://api.deepseek.com", path: "/v1", apiKey: "sk-ds-****", models: ["deepseek-chat", "deepseek-reasoner"], weight: 10, timeout: 30, retry: true, fallback: "ch_03", costInput: 0.5, costOutput: 2.0, priceMultiplier: 2.0, status: "active" },
  { id: "ch_02", name: "聚合路由", provider: "聚合路由", type: "OpenAI 兼容", baseUrl: "https://router.example.com/api", path: "/v1", apiKey: "sk-route-****", models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku"], weight: 8, timeout: 45, retry: true, fallback: "ch_01", costInput: 0.8, costOutput: 3.0, priceMultiplier: 1.5, status: "active" },
  { id: "ch_03", name: "阿里云模型", provider: "Alibaba", type: "OpenAI 兼容", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode", path: "/v1", apiKey: "sk-ali-****", models: ["qwen3-32b", "qwen-max"], weight: 5, timeout: 60, retry: false, fallback: "", costInput: 0.6, costOutput: 2.5, priceMultiplier: 2.2, status: "disabled" },
  { id: "ch_04", name: "Together AI", provider: "Together", type: "OpenAI 兼容", baseUrl: "https://api.together.xyz", path: "/v1", apiKey: "sk-tog-****", models: ["meta-llama/llama-4"], weight: 6, timeout: 25, retry: true, fallback: "ch_02", costInput: 0.4, costOutput: 1.5, priceMultiplier: 2.5, status: "active" },
];

const PROVIDERS = ["DeepSeek", "聚合路由", "Alibaba", "Together", "Anthropic", "OpenAI", "Google", "Moonshot", "Custom"];
const TYPES = ["OpenAI 兼容", "Anthropic 兼容", "Custom HTTP"];

function StatusBadge({ status }) {
  const map = { active: { label: "正常", color: "#22c55e", bg: "rgba(34,197,94,0.1)" }, disabled: { label: "已禁用", color: "#ef4444", bg: "rgba(239,68,68,0.1)" } };
  const s = map[status] || map.active;
  return <span style={{ padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

export default function AdminChannels() {
  const [channels, setChannels] = useState(MOCK_CHANNELS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  function openNew() { setEditing(null); setForm({ name: "", provider: "", type: "OpenAI 兼容", baseUrl: "", path: "/v1", apiKey: "", models: "", weight: 5, timeout: 30, retry: true, fallback: "", costInput: "", costOutput: "", priceMultiplier: 2.0, status: "active" }); setModalOpen(true); }
  function openEdit(ch) { setEditing(ch.id); setForm({ ...ch }); setModalOpen(true); }

  function handleSave() {
    if (editing) {
      setChannels((prev) => prev.map((c) => c.id === editing ? { ...form, id: editing, models: typeof form.models === "string" ? form.models.split(",").map((s) => s.trim()) : form.models } : c));
    } else {
      const newCh = { ...form, id: "ch_" + Date.now(), models: typeof form.models === "string" ? form.models.split(",").map((s) => s.trim()) : form.models };
      setChannels((prev) => [...prev, newCh]);
    }
    setModalOpen(false);
  }

  function handleDelete(id) { setChannels((prev) => prev.filter((c) => c.id !== id)); }

  function handleToggle(id) {
    setChannels((prev) => prev.map((c) => c.id === id ? { ...c, status: c.status === "active" ? "disabled" : "active" } : c));
  }

  return (
    <>
      <Head><title>管理后台 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/channels">
        <div style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>上游渠道管理</h1>
              <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>管理所有上游 API 渠道的接入配置、权重和定价</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={openNew} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 新增渠道</button>
            </div>
          </header>

          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: "var(--dash-card-hover)" }}>
                    <th style={thStyle}>渠道名称</th><th style={thStyle}>供应商</th><th style={thStyle}>类型</th><th style={thStyle}>Base URL</th><th style={thStyle}>权重</th><th style={thStyle}>成本(入/出)</th><th style={thStyle}>售价倍率</th><th style={thStyle}>状态</th><th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((ch) => (
                    <tr key={ch.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                      <td style={tdStyle}><b>{ch.name}</b></td>
                      <td style={tdStyle}>{ch.provider}</td>
                      <td style={tdStyle}>{ch.type}</td>
                      <td style={{ ...tdStyle, fontFamily: "'SF Mono', monospace", fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.baseUrl}</td>
                      <td style={tdStyle}>{ch.weight}</td>
                      <td style={{ ...tdStyle, fontFamily: "'SF Mono', monospace" }}>¥{ch.costInput} / ¥{ch.costOutput}</td>
                      <td style={tdStyle}>x{ch.priceMultiplier}</td>
                      <td style={tdStyle}><StatusBadge status={ch.status} /></td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => openEdit(ch)} style={btnSmStyle}>编辑</button>
                          <button onClick={() => handleToggle(ch.id)} style={{ ...btnSmStyle, color: ch.status === "active" ? "#ef4444" : "#22c55e" }}>{ch.status === "active" ? "禁用" : "启用"}</button>
                          <button onClick={() => handleDelete(ch.id)} style={{ ...btnSmStyle, color: "#ef4444" }}>删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--dash-border)", fontSize: 12, color: "var(--dash-sub)" }}>共 {channels.length} 个渠道</div>
          </div>

          {/* Modal */}
          {modalOpen && (
            <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setModalOpen(false)}>
              <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 14, padding: "28px 32px", width: 640, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 20px" }}>{editing ? "编辑渠道" : "新增渠道"}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Field label="渠道名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                  <Field label="供应商" value={form.provider} onChange={(v) => setForm({ ...form, provider: v })} type="select" options={PROVIDERS} />
                  <Field label="接口类型" value={form.type} onChange={(v) => setForm({ ...form, type: v })} type="select" options={TYPES} />
                  <Field label="Base URL" value={form.baseUrl} onChange={(v) => setForm({ ...form, baseUrl: v })} />
                  <Field label="接口路径" value={form.path} onChange={(v) => setForm({ ...form, path: v })} />
                  <Field label="上游 API 密匙" value={form.apiKey} onChange={(v) => setForm({ ...form, apiKey: v })} type="password" />
                  <Field label="权重" value={String(form.weight)} onChange={(v) => setForm({ ...form, weight: Number(v) })} type="number" />
                  <Field label="超时(秒)" value={String(form.timeout)} onChange={(v) => setForm({ ...form, timeout: Number(v) })} type="number" />
                  <Field label="输入成本(¥/1M)" value={String(form.costInput)} onChange={(v) => setForm({ ...form, costInput: v })} />
                  <Field label="输出成本(¥/1M)" value={String(form.costOutput)} onChange={(v) => setForm({ ...form, costOutput: v })} />
                  <Field label="售价倍率" value={String(form.priceMultiplier)} onChange={(v) => setForm({ ...form, priceMultiplier: Number(v) })} type="number" />
                  <Field label="支持模型(逗号分隔)" value={typeof form.models === "string" ? form.models : form.models?.join(", ")} onChange={(v) => setForm({ ...form, models: v })} />
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                  <button onClick={() => setModalOpen(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-text)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
                  <button onClick={handleSave} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>保存</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

const thStyle = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 14px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdStyle = { padding: "12px 14px", fontSize: 13, verticalAlign: "middle" };
const btnSmStyle = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-border)", background: "transparent", color: "var(--dash-sub)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

function Field({ label, value, onChange, type = "text", options }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: "inherit" }}>
          <option value="">-- 选择 --</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 13, fontFamily: type === "password" || type === "number" ? "'SF Mono', monospace" : "inherit" }} />
      )}
    </div>
  );
}
