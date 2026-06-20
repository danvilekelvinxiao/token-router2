import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const steps = ["线路", "连接", "拉模型", "选模型", "定价", "发布"];

const upstreamTypes = [
  "OpenAI Compatible",
  "主线路",
  "备用线路",
  "低价线路",
  "官方线路",
  "图片线路",
  "代码模型线路",
  "自定义兼容线路",
];

const protocols = ["/v1/chat/completions", "/v1/models", "/v1/images/generations", "/v1/responses", "自定义"];

const initialUpstream = {
  name: "",
  type: "OpenAI Compatible",
  baseUrl: "",
  apiKey: "",
  protocol: "/v1/models",
  enabled: true,
  remark: "",
};

const initialPrice = {
  billingMode: "token_multiplier",
  multiplier: 1.5,
  inputCostPerMTokens: 2,
  outputCostPerMTokens: 8,
  cachedInputCostPerMTokens: 0,
  imageCostPerImageCny: 0.12,
  imageFixedProfitPerImageCny: 0.08,
  imageCount: 1,
};

function money(value) {
  return `￥${Number(value || 0).toFixed(2)}`;
}

function compactId(value = "") {
  const text = String(value || "");
  return text.length > 34 ? `${text.slice(0, 18)}...${text.slice(-12)}` : text;
}

function stablePublicHash(value = "") {
  let hash = 0;
  const text = String(value || "model");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(6, "0").slice(0, 8);
}

function flowApiFamily(modelId = "") {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("claude")) return "claude";
  if (id.includes("codex") || id.includes("code")) return "codex";
  if (id.includes("gemini")) return "gemini";
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("qwen")) return "qwen";
  if (id.includes("grok")) return "grok";
  if (id.includes("image") || id.includes("imagen") || id.includes("flux") || id.includes("sdxl") || id.includes("seedream") || id.includes("recraft") || id.includes("ideogram")) return "image";
  if (id.includes("gpt") || id.includes("openai") || /\bo[134]\b/.test(id)) return "chatgpt";
  return "model";
}

function defaultPublicModelId(modelId = "") {
  return `flowapi-${flowApiFamily(modelId)}-${stablePublicHash(modelId)}`;
}

function StatusPill({ ok, children }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "5px 9px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 800,
      color: ok ? "#16a34a" : "#f59e0b",
      background: ok ? "rgba(22,163,74,.1)" : "rgba(245,158,11,.12)",
      border: `1px solid ${ok ? "rgba(22,163,74,.22)" : "rgba(245,158,11,.25)"}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "#16a34a" : "#f59e0b" }} />
      {children}
    </span>
  );
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--dash-text)" }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 11, color: "var(--dash-sub)", lineHeight: 1.5 }}>{hint}</span> : null}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  minHeight: 42,
  borderRadius: 9,
  border: "1px solid var(--dash-border)",
  background: "var(--dash-card-bg)",
  color: "var(--dash-text)",
  padding: "9px 11px",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const buttonBase = {
  border: "1px solid var(--dash-border)",
  borderRadius: 9,
  minHeight: 38,
  padding: "8px 13px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

export default function BossWizardPage() {
  const [step, setStep] = useState(0);
  const [upstream, setUpstream] = useState(initialUpstream);
  const [savedUpstream, setSavedUpstream] = useState(null);
  const [connection, setConnection] = useState(null);
  const [importedModels, setImportedModels] = useState([]);
  const [selected, setSelected] = useState({});
  const [settings, setSettings] = useState({});
  const [priceDraft, setPriceDraft] = useState(initialPrice);
  const [calculated, setCalculated] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    calculatePrice(priceDraft);
      }, []);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  const selectedModels = useMemo(
    () => importedModels.filter((model) => selected[model.id]),
    [importedModels, selected]
  );

  function adminHeaders(extra = {}) {
    return {
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async function saveUpstream() {
    setBusy("upstream");
    try {
      const response = await fetch("/api/admin/upstreams", {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify(upstream),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "保存失败");
      setSavedUpstream(data.upstream);
      setStep(1);
      showToast("线路已保存，下一步测试连接");
    } catch (error) {
      showToast(error.message);
    }
    setBusy("");
  }

  async function testConnection() {
    if (!savedUpstream?.id) return showToast("请先保存线路");
    setBusy("test");
    try {
      const response = await fetch(`/api/admin/upstreams/${savedUpstream.id}/test`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      const data = await response.json();
      setConnection(data);
      if (!data.ok) throw new Error(data.error || data.message || "连接失败");
      setStep(2);
      showToast(data.message || "连接成功");
    } catch (error) {
      showToast(error.message);
    }
    setBusy("");
  }

  async function syncModels() {
    if (!savedUpstream?.id) return showToast("请先保存线路");
    setBusy("sync");
    try {
      const response = await fetch(`/api/admin/upstreams/${savedUpstream.id}/sync-models`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "拉取失败");
      setImportedModels(data.models || []);
      setStep(3);
      showToast(`已拉取 ${data.total || 0} 个模型`);
    } catch (error) {
      showToast(error.message);
    }
    setBusy("");
  }

  async function calculatePrice(draft = priceDraft) {
    try {
      const response = await fetch("/api/admin/model-pricing/calculate", {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (data.ok) setCalculated(data.pricing);
    } catch {}
  }

  async function saveDraft() {
    setBusy("draft");
    try {
      await fetch("/api/admin/boss-wizard/save-draft", {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify({ upstream, savedUpstream, selected, settings, priceDraft }),
      });
      showToast("草稿已保存");
    } catch {
      showToast("草稿保存失败");
    }
    setBusy("");
  }

  async function publish() {
    if (!selectedModels.length) return showToast("请至少选择一个模型");
    setBusy("publish");
    try {
      const modelSettings = {};
      const pricing = {};
      selectedModels.forEach((model, index) => {
        const modelType = settings[model.id]?.modelType || model.modelType;
        const publicModelId = settings[model.id]?.publicModelId || defaultPublicModelId(model.modelId);
        modelSettings[model.id] = {
          publicModelId,
          displayName: settings[model.id]?.displayName || model.displayName,
          modelType,
          description: settings[model.id]?.description || "",
          tags: settings[model.id]?.tags || "",
          sortOrder: 400 + index,
          recommended: index === 0,
          hot: index < 3,
          showInModelSquare: true,
          showInApiKeyCreate: modelType === "text" || modelType === "vision" || modelType === "coding",
          showInImageGeneration: modelType === "image" || modelType === "image-edit",
        };
        pricing[model.id] = {
          ...priceDraft,
          modelId: publicModelId,
          displayName: settings[model.id]?.displayName || model.displayName,
          provider: "FlowAPI",
          modelType,
          billingMode: modelType === "image" || modelType === "image-edit" ? "per_image_fixed_profit" : "token_multiplier",
        };
      });
      const response = await fetch("/api/admin/boss-wizard/publish", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          importedModelIds: selectedModels.map((model) => model.id),
          modelSettings,
          pricing,
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "发布失败");
      setSyncResult(data.syncResult);
      setStep(5);
      showToast("已成功发布到模型广场");
    } catch (error) {
      showToast(error.message);
    }
    setBusy("");
  }

  function updatePrice(key, value) {
    const next = { ...priceDraft, [key]: value };
    setPriceDraft(next);
    calculatePrice(next);
  }

  const primaryButton = {
    ...buttonBase,
    color: "#fff",
    border: "0",
    background: "linear-gradient(135deg,#6366f1,#8b5cf6 55%,#a78bfa)",
    boxShadow: "0 14px 32px rgba(99,102,241,.28)",
  };

  return (
    <>
      <Head><title>老板后台向导 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/boss-wizard">
        <main style={{ color: "var(--dash-text)", display: "grid", gap: 18 }}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 950, letterSpacing: "-.02em" }}>老板后台向导</h1>
              <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13, lineHeight: 1.7, maxWidth: 760 }}>
                通过向导快速接入新的模型线路、同步模型、设置售价，并发布到 FlowAPI 模型广场。
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" style={{ ...buttonBase, background: "var(--dash-card-bg)", color: "var(--dash-text)" }} onClick={saveDraft}>
                {busy === "draft" ? "保存中..." : "保存草稿"}
              </button>
            </div>
          </header>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {steps.map((name, index) => (
              <button
                key={name}
                type="button"
                onClick={() => setStep(index)}
                style={{
                  border: "1px solid var(--dash-border)",
                  borderRadius: 10,
                  padding: "12px 10px",
                  background: index === step ? "rgba(99,102,241,.13)" : "var(--dash-card-bg)",
                  color: index === step ? "var(--dash-accent)" : "var(--dash-sub)",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "block", fontSize: 10, opacity: .75 }}>Step {index + 1}</span>
                {name}
              </button>
            ))}
          </section>

          <section style={{
            border: "1px solid var(--dash-border)",
            borderRadius: 14,
            background: "var(--dash-card-bg)",
            padding: 22,
            boxShadow: "0 20px 60px rgba(15,23,42,.08)",
          }}>
            {step === 0 && (
              <div style={{ display: "grid", gap: 18 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>新增模型线路</h2>
                  <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>把可用模型来源先接进后台，Key 会加密保存，前端不会展示完整 Key。</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Field label="线路名称"><input style={inputStyle} value={upstream.name} onChange={(e) => setUpstream({ ...upstream, name: e.target.value })} placeholder="例如：新加坡低价兼容池" /></Field>
                  <Field label="线路类型">
                    <select style={inputStyle} value={upstream.type} onChange={(e) => setUpstream({ ...upstream, type: e.target.value })}>
                      {upstreamTypes.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="接口地址" hint="建议填写根地址，例如 https://example.com，不要以 /v1 结尾。">
                    <input style={inputStyle} value={upstream.baseUrl} onChange={(e) => setUpstream({ ...upstream, baseUrl: e.target.value })} placeholder="https://api.example.com" />
                  </Field>
                  <Field label="线路密钥" hint="保存后只显示掩码，不能再次查看完整 Key。">
                    <input style={inputStyle} value={upstream.apiKey} onChange={(e) => setUpstream({ ...upstream, apiKey: e.target.value })} placeholder="sk-..." type="password" />
                  </Field>
                  <Field label="兼容协议">
                    <select style={inputStyle} value={upstream.protocol} onChange={(e) => setUpstream({ ...upstream, protocol: e.target.value })}>
                      {protocols.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="备注">
                    <input style={inputStyle} value={upstream.remark} onChange={(e) => setUpstream({ ...upstream, remark: e.target.value })} placeholder="采购价、渠道负责人、风控备注" />
                  </Field>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" style={primaryButton} onClick={saveUpstream}>{busy === "upstream" ? "保存中..." : "开始配置"}</button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div style={{ display: "grid", gap: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>测试连接</h2>
                    <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>自动检查接口地址、线路密钥、模型列表、延迟和模型数量。</p>
                  </div>
                  {savedUpstream ? <StatusPill ok>{savedUpstream.name}</StatusPill> : <StatusPill>未保存</StatusPill>}
                </div>
                {connection && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                    {[
                      ["状态", connection.ok ? "可连接" : "失败"],
                      ["延迟", `${connection.latencyMs || 0}ms`],
                      ["模型数量", `${connection.modelCount || 0}`],
                      ["HTTP", connection.statusCode || "-"],
                    ].map(([label, value]) => (
                      <article key={label} style={{ border: "1px solid var(--dash-border)", borderRadius: 12, padding: 14 }}>
                        <div style={{ color: "var(--dash-sub)", fontSize: 11, fontWeight: 800 }}>{label}</div>
                        <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>{value}</div>
                      </article>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button type="button" style={{ ...buttonBase, background: "transparent", color: "var(--dash-sub)" }} onClick={() => setStep(0)}>上一步</button>
                  <button type="button" style={primaryButton} onClick={testConnection}>{busy === "test" ? "测试中..." : "测试连接"}</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "grid", gap: 18 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>自动拉取模型</h2>
                  <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>系统会识别模型名称、类型、能力标签，并写入待上架模型池。</p>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button type="button" style={{ ...buttonBase, background: "transparent", color: "var(--dash-sub)" }} onClick={() => setStep(1)}>上一步</button>
                  <button type="button" style={primaryButton} onClick={syncModels}>{busy === "sync" ? "拉取中..." : "自动拉取模型"}</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div style={{ display: "grid", gap: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>选择模型上架</h2>
                    <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>勾选后可设置展示名、标签和是否进入图片生成页。</p>
                  </div>
                  <StatusPill ok={selectedModels.length > 0}>已选 {selectedModels.length} 个</StatusPill>
                </div>
                <div style={{ overflow: "auto", border: "1px solid var(--dash-border)", borderRadius: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                    <thead>
                      <tr style={{ color: "var(--dash-sub)", fontSize: 11 }}>
                        <th style={{ padding: 11, textAlign: "left" }}>选择</th>
                        <th style={{ padding: 11, textAlign: "left" }}>FlowAPI 模型 ID</th>
                        <th style={{ padding: 11, textAlign: "left" }}>展示名称</th>
                        <th style={{ padding: 11, textAlign: "left" }}>品牌</th>
                        <th style={{ padding: 11, textAlign: "left" }}>类型</th>
                        <th style={{ padding: 11, textAlign: "left" }}>能力</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importedModels.map((model) => (
                        <tr key={model.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                          <td style={{ padding: 11 }}><input type="checkbox" checked={Boolean(selected[model.id])} onChange={(e) => setSelected({ ...selected, [model.id]: e.target.checked })} /></td>
                          <td style={{ padding: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                            <input
                              style={{ ...inputStyle, minHeight: 34, padding: "6px 9px" }}
                              value={settings[model.id]?.publicModelId ?? defaultPublicModelId(model.modelId)}
                              onChange={(e) => setSettings({ ...settings, [model.id]: { ...(settings[model.id] || {}), publicModelId: e.target.value } })}
                            />
                            <div style={{ marginTop: 4, color: "var(--dash-sub)", fontSize: 11 }}>真实线路已隐藏，仅管理员日志可查</div>
                          </td>
                          <td style={{ padding: 11 }}>
                            <input
                              style={{ ...inputStyle, minHeight: 34, padding: "6px 9px" }}
                              value={settings[model.id]?.displayName ?? model.displayName}
                              onChange={(e) => setSettings({ ...settings, [model.id]: { ...(settings[model.id] || {}), displayName: e.target.value } })}
                            />
                          </td>
                          <td style={{ padding: 11 }}>FlowAPI</td>
                          <td style={{ padding: 11 }}>
                            <select
                              style={{ ...inputStyle, minHeight: 34, padding: "6px 9px" }}
                              value={settings[model.id]?.modelType ?? model.modelType}
                              onChange={(e) => setSettings({ ...settings, [model.id]: { ...(settings[model.id] || {}), modelType: e.target.value } })}
                            >
                              {["text", "image", "image-edit", "vision", "embedding", "audio", "video", "coding", "agent"].map((item) => <option key={item}>{item}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: 11, color: "var(--dash-sub)", fontSize: 12 }}>{Object.entries(model.capabilities || {}).filter(([, v]) => v).map(([k]) => k).join(" / ") || "-"}</td>
                        </tr>
                      ))}
                      {importedModels.length === 0 && (
                        <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--dash-sub)" }}>还没有拉取模型</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button type="button" style={{ ...buttonBase, background: "transparent", color: "var(--dash-sub)" }} onClick={() => setStep(2)}>上一步</button>
                  <button type="button" style={primaryButton} onClick={() => setStep(4)}>下一步：配置成本价</button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div style={{ display: "grid", gap: 18 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>设置倍率与利润率</h2>
                  <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>文本模型按 Token 倍率，图片模型按每张图成本 + 固定利润。</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <section style={{ display: "grid", gap: 12 }}>
                    <Field label="文本输入成本 / 1M Token"><input type="number" style={inputStyle} value={priceDraft.inputCostPerMTokens} onChange={(e) => updatePrice("inputCostPerMTokens", e.target.value)} /></Field>
                    <Field label="文本输出成本 / 1M Token"><input type="number" style={inputStyle} value={priceDraft.outputCostPerMTokens} onChange={(e) => updatePrice("outputCostPerMTokens", e.target.value)} /></Field>
                    <Field label="售卖倍率"><input type="number" step="0.1" style={inputStyle} value={priceDraft.multiplier} onChange={(e) => updatePrice("multiplier", e.target.value)} /></Field>
                  </section>
                  <section style={{ display: "grid", gap: 12 }}>
                    <Field label="每张图成本"><input type="number" step="0.01" style={inputStyle} value={priceDraft.imageCostPerImageCny} onChange={(e) => updatePrice("imageCostPerImageCny", e.target.value)} /></Field>
                    <Field label="每张图固定利润"><input type="number" step="0.01" style={inputStyle} value={priceDraft.imageFixedProfitPerImageCny} onChange={(e) => updatePrice("imageFixedProfitPerImageCny", e.target.value)} /></Field>
                    <Field label="批量张数预览"><input type="number" min="1" max="4" style={inputStyle} value={priceDraft.imageCount} onChange={(e) => updatePrice("imageCount", e.target.value)} /></Field>
                  </section>
                </div>
                {calculated && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                    {[
                      ["文本售价 / 1M", money(calculated.textSellPricePerMTokens)],
                      ["文本利润率", `${calculated.textProfitMargin}%`],
                      ["图片单张售价", money(calculated.imageSellPricePerImageCny)],
                      [`${calculated.imageCount} 张总利润`, money(calculated.imageTotalProfitCny)],
                    ].map(([label, value]) => (
                      <article key={label} style={{ border: "1px solid var(--dash-border)", borderRadius: 12, padding: 14, background: "rgba(99,102,241,.06)" }}>
                        <div style={{ color: "var(--dash-sub)", fontSize: 11, fontWeight: 800 }}>{label}</div>
                        <div style={{ marginTop: 7, fontSize: 22, fontWeight: 950 }}>{value}</div>
                      </article>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button type="button" style={{ ...buttonBase, background: "transparent", color: "var(--dash-sub)" }} onClick={() => setStep(3)}>上一步</button>
                  <button type="button" style={primaryButton} onClick={publish}>{busy === "publish" ? "发布中..." : "一键发布"}</button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div style={{ display: "grid", gap: 18 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>发布总览</h2>
                  <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>发布后会同步模型广场、API Key 创建、生成图片、数据面板和管理员模型管理。</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  <article style={{ border: "1px solid var(--dash-border)", borderRadius: 12, padding: 16 }}><b>已选模型</b><div style={{ fontSize: 28, fontWeight: 950, marginTop: 8 }}>{selectedModels.length}</div></article>
                  <article style={{ border: "1px solid var(--dash-border)", borderRadius: 12, padding: 16 }}><b>同步检查</b><div style={{ fontSize: 28, fontWeight: 950, marginTop: 8, color: syncResult?.ok ? "#16a34a" : "#f59e0b" }}>{syncResult?.ok ? "通过" : "待确认"}</div></article>
                  <article style={{ border: "1px solid var(--dash-border)", borderRadius: 12, padding: 16 }}><b>图片单张售价</b><div style={{ fontSize: 28, fontWeight: 950, marginTop: 8 }}>{money(calculated?.imageSellPricePerImageCny)}</div></article>
                </div>
                {syncResult?.issues?.length ? (
                  <div style={{ border: "1px solid rgba(245,158,11,.25)", borderRadius: 12, padding: 14, color: "#f59e0b", background: "rgba(245,158,11,.08)" }}>
                    {syncResult.issues.map((issue, index) => <div key={index}>{issue.item ? `${issue.item}：` : ""}{issue.message}</div>)}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/models" style={{ ...primaryButton, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>查看模型广场</Link>
                  <button type="button" style={{ ...buttonBase, background: "var(--dash-card-bg)", color: "var(--dash-text)" }} onClick={() => { setStep(0); setSelected({}); }}>继续添加线路</button>
                  <Link href="/admin/models" style={{ ...buttonBase, background: "var(--dash-card-bg)", color: "var(--dash-text)", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>查看价格配置</Link>
                </div>
              </div>
            )}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 14 }}>
            <article style={{ border: "1px solid var(--dash-border)", borderRadius: 14, background: "var(--dash-card-bg)", padding: 18 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 950 }}>老板视角风险提醒</h3>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--dash-sub)", fontSize: 13, lineHeight: 1.8 }}>
                <li>新线路先小额压测，不要直接全量开放。</li>
                <li>图片模型必须填每张成本和每张利润，避免按 Token 误扣。</li>
                <li>发布、改价、下架都会写审计日志，方便以后查账。</li>
              </ul>
            </article>
            <article style={{ border: "1px solid var(--dash-border)", borderRadius: 14, background: "var(--dash-card-bg)", padding: 18 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 950 }}>同步范围</h3>
              <p style={{ margin: "10px 0 0", color: "var(--dash-sub)", fontSize: 13, lineHeight: 1.8 }}>
                模型广场、API Key 创建、生成图片、数据面板、使用日志、账单流水、管理员模型管理。
              </p>
            </article>
          </section>

          {toast ? (
            <div style={{
              position: "fixed",
              top: 86,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#0f172a",
              color: "#fff",
              borderRadius: 999,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 800,
              zIndex: 300,
              boxShadow: "0 18px 45px rgba(15,23,42,.25)",
            }}>{toast}</div>
          ) : null}
        </main>
      </AdminLayout>
    </>
  );
}
