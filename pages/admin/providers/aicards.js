import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const emptyReview = {
  id: "",
  actualModelId: "",
  publicModelId: "",
  displayName: "",
  modelType: "text",
  inputCostPerMillion: "",
  outputCostPerMillion: "",
  sellInputPricePerMillion: "",
  sellOutputPricePerMillion: "",
  minProfitMargin: 0.2,
  priority: 90,
  enable: false,
  publish: false,
};

function money(value) {
  const n = Number(value || 0);
  return n > 0 ? `¥${n.toFixed(3)}` : "待配置";
}

function makeReviewDraft(model = {}) {
  const inputCost = Number(model.inputCostPerMillion || 0);
  const outputCost = Number(model.outputCostPerMillion || 0);
  const minProfitMargin = Number(model.minProfitMargin || 0.2);
  return {
    ...emptyReview,
    id: model.id || "",
    actualModelId: model.actualModelId || "",
    publicModelId: model.publicModelId || "",
    displayName: model.displayName || model.rawModelName || "",
    inputCostPerMillion: inputCost || "",
    outputCostPerMillion: outputCost || "",
    sellInputPricePerMillion: Number(model.sellInputPricePerMillion || 0) || (inputCost ? Number((inputCost * (1 + minProfitMargin)).toFixed(4)) : ""),
    sellOutputPricePerMillion: Number(model.sellOutputPricePerMillion || 0) || (outputCost ? Number((outputCost * (1 + minProfitMargin)).toFixed(4)) : ""),
    minProfitMargin,
    priority: Number(model.priority || 90),
    enable: Boolean(model.channelEnabled),
    publish: Boolean(model.isPublic),
  };
}

function getModelStage(model = {}) {
  if (model.channelLastError) return "有错误";
  if (model.isPublic) return "已发布";
  if (model.channelEnabled) return "备用已启用";
  if (!model.inputCostPerMillion || !model.outputCostPerMillion || !model.sellInputPricePerMillion || !model.sellOutputPricePerMillion) return "待定价";
  if (Number(model.channelSuccessRate || 0) <= 0) return "待检测";
  return "可发布";
}

function marginPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function calcProfit(cost, sell) {
  const costValue = Number(cost || 0);
  const sellValue = Number(sell || 0);
  if (!costValue || !sellValue) return null;
  const profit = sellValue - costValue;
  return {
    profit,
    margin: sellValue > 0 ? profit / sellValue : 0,
    safe: sellValue >= costValue * (1 + Number(emptyReview.minProfitMargin || 0.2)),
  };
}

function getSessionAdminSecret() {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem("flowapi_admin_secret") || "";
  } catch {
    return "";
  }
}

function rememberSessionAdminSecret(secret = "") {
  if (typeof window === "undefined") return;
  try {
    if (secret) window.sessionStorage.setItem("flowapi_admin_secret", secret);
    else window.sessionStorage.removeItem("flowapi_admin_secret");
  } catch {
    // Session storage is optional; the server-side admin session still works.
  }
}

export default function AdminAicardsProviderPage() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [health, setHealth] = useState(null);
  const [review, setReview] = useState(emptyReview);
  const [secret, setSecret] = useState(getSessionAdminSecret);
  const [statusFilter, setStatusFilter] = useState("全部");
  const [bulkResult, setBulkResult] = useState(null);

  function adminHeaders() {
    return {
      "Content-Type": "application/json",
      ...(secret ? { "x-admin-secret": secret } : {}),
    };
  }

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/providers/aicards/sync-models", {
        headers: secret ? { "x-admin-secret": secret } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "读取备用线路候选失败");
      setModels(data.models || []);
    } catch (error) {
      setMessage(error.message || "读取备用线路候选失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => ({
    total: models.length,
    enabled: models.filter((item) => item.channelEnabled).length,
    publicCount: models.filter((item) => item.isPublic).length,
    healthOk: models.filter((item) => Number(item.channelSuccessRate || 0) > 0).length,
  }), [models]);

  async function syncModels() {
    setBusy("sync");
    setMessage("");
    try {
      rememberSessionAdminSecret(secret);
      const res = await fetch("/api/admin/providers/aicards/sync-models", {
        method: "POST",
        headers: adminHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "同步失败");
      setMessage(`同步完成：候选 ${data.total || 0} 个，新增 ${data.added || 0} 个，更新 ${data.updated || 0} 个。`);
      await load();
    } catch (error) {
      setMessage(error.message || "同步失败");
    } finally {
      setBusy("");
    }
  }

  async function runHealthCheck(modelId = "") {
    setBusy(`health:${modelId || "all"}`);
    setMessage("");
    try {
      rememberSessionAdminSecret(secret);
      const res = await fetch("/api/admin/providers/aicards/health-check", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json().catch(() => ({}));
      setHealth(data);
      if (!res.ok || !data.ok) throw new Error(data.error || data.lastError || "健康检查失败");
      setMessage(`健康检查通过：${modelId ? "当前模型" : "模型列表"}可用，候选 ${data.modelCount || 0} 个，耗时 ${data.modelsLatencyMs || 0}ms。`);
      await load();
    } catch (error) {
      setMessage(error.message || "健康检查失败");
    } finally {
      setBusy("");
    }
  }

  async function bulkPublishReadyModels() {
    setBusy("bulk-publish");
    setMessage("");
    setBulkResult(null);
    try {
      rememberSessionAdminSecret(secret);
      const res = await fetch("/api/admin/providers/aicards/bulk-publish", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          modelIds: models
            .filter((model) => getModelStage(model) === "可发布" || model.channelEnabled)
            .map((model) => model.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      setBulkResult(data);
      if (!res.ok || !data.ok) throw new Error(data.error || data.message || "批量发布失败");
      setMessage(data.message || `已发布 ${data.publishedCount || 0} 个 FlowAPI 模型。`);
      await load();
    } catch (error) {
      setMessage(error.message || "批量发布失败");
    } finally {
      setBusy("");
    }
  }

  const filteredModels = useMemo(() => {
    if (statusFilter === "全部") return models;
    return models.filter((model) => getModelStage(model) === statusFilter);
  }, [models, statusFilter]);

  const inputProfit = calcProfit(review.inputCostPerMillion, review.sellInputPricePerMillion);
  const outputProfit = calcProfit(review.outputCostPerMillion, review.sellOutputPricePerMillion);

  async function saveReview(event) {
    event.preventDefault();
    setBusy("review");
    setMessage("");
    try {
      rememberSessionAdminSecret(secret);
      const res = await fetch("/api/admin/providers/aicards/review", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(review),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "审核保存失败");
      setMessage(data.message || "审核配置已保存");
      await load();
    } catch (error) {
      setMessage(error.message || "审核保存失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <Head><title>备用线路审核 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/providers/aicards">
        <main style={{ color: "var(--dash-text)" }}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 950 }}>备用线路审核</h1>
              <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>
                这里管理备用供货方候选模型。同步后默认不公开，必须先健康检查、填成本和售价，再决定是否发布为 FlowAPI 模型。
              </p>
            </div>
            <button onClick={load} style={primaryButton}>刷新</button>
          </header>

          {message && <div style={noticeStyle}>{message}</div>}

          <section style={panelStyle}>
            <div style={stepsStyle}>
              {["1 同步候选", "2 单模型检测", "3 填成本售价", "4 看毛利", "5 启用或发布"].map((step) => (
                <span key={step}>{step}</span>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              {[
                ["候选模型", stats.total],
                ["已启用备用", stats.enabled],
                ["已发布前台", stats.publicCount],
                ["健康通过", stats.healthOk],
              ].map(([label, value]) => (
                <article key={label} style={metricStyle}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <input
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="管理员密钥（如当前登录态已生效，可留空）"
                style={inputStyle}
              />
              <button onClick={syncModels} disabled={busy === "sync"} style={primaryButton}>
                {busy === "sync" ? "同步中..." : "同步候选模型"}
              </button>
              <button onClick={() => runHealthCheck(review.actualModelId)} disabled={busy.startsWith("health:")} style={ghostButton}>
                {busy.startsWith("health:") ? "检查中..." : "健康检查"}
              </button>
              <button onClick={bulkPublishReadyModels} disabled={busy === "bulk-publish"} style={ghostButton}>
                {busy === "bulk-publish" ? "发布中..." : "批量发布达标模型"}
              </button>
            </div>
            {health && (
              <p style={{ margin: "12px 0 0", color: health.ok ? "#22c55e" : "#f97316", fontSize: 12, fontWeight: 800 }}>
                最近检查：{health.ok ? "可用" : "失败"}，模型数 {health.modelCount || 0}，HTTP {health.modelsStatusCode || 0}，耗时 {health.modelsLatencyMs || 0}ms。
              </p>
            )}
            {bulkResult?.skipped?.length ? (
              <div style={{ marginTop: 12, color: "var(--dash-sub)", fontSize: 12, lineHeight: 1.7 }}>
                <strong style={{ color: "var(--dash-text)" }}>跳过 {bulkResult.skipped.length} 个未达标候选：</strong>
                {bulkResult.skipped.slice(0, 5).map((item) => (
                  <span key={`${item.id}:${item.reason}`} style={mutedBlock}>
                    {item.publicModelId || item.displayName || item.id}：{item.reason}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(360px, .7fr)", gap: 16, marginTop: 16 }}>
            <div style={panelStyle}>
              <h2 style={sectionTitle}>待审核候选</h2>
              <p style={sectionSub}>用户端不会看到备用线路名称、上游地址或真实模型 ID。</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {["全部", "待检测", "待定价", "可发布", "备用已启用", "已发布", "有错误"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setStatusFilter(item)}
                    style={statusFilter === item ? primaryMiniButton : ghostMiniButton}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {loading ? (
                <div style={emptyStyle}>正在读取候选模型...</div>
              ) : filteredModels.length === 0 ? (
                <div style={emptyStyle}>还没有候选模型。先点击“同步候选模型”。</div>
              ) : (
                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                    <thead>
                      <tr>
                        {["FlowAPI 模型", "真实模型", "成本/售价", "健康", "状态", "操作"].map((item) => <th key={item} style={thStyle}>{item}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModels.map((model) => (
                        <tr key={model.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                          <td style={tdStyle}>
                            <strong>{model.displayName || "待命名"}</strong>
                            <span style={mutedBlock}>{model.publicModelId || "待填写 public_model_id"}</span>
                          </td>
                          <td style={tdStyle}>
                            <code style={{ fontSize: 11 }}>{model.actualModelId}</code>
                          </td>
                          <td style={tdStyle}>
                            <span>成本 {money(model.inputCostPerMillion)} / {money(model.outputCostPerMillion)}</span>
                            <span style={mutedBlock}>售价 {money(model.sellInputPricePerMillion)} / {money(model.sellOutputPricePerMillion)}</span>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ ...pillStyle, color: model.channelSuccessRate > 0 ? "#22c55e" : "#f97316" }}>
                              {model.channelSuccessRate > 0 ? "通过" : "未检查"}
                            </span>
                            <span style={mutedBlock}>{model.channelLastHealthCheckAt || model.channelLastError || "等待健康检查"}</span>
                          </td>
                          <td style={tdStyle}>
                            <span style={mutedBlock}>{model.channelEnabled ? "备用已启用" : "备用未启用"}</span>
                            <span style={mutedBlock}>{model.isPublic ? "已发布前台" : "未发布前台"}</span>
                            <span style={mutedBlock}>阶段：{getModelStage(model)}</span>
                          </td>
                          <td style={tdStyle}>
                            <button onClick={() => setReview(makeReviewDraft(model))} style={ghostButton}>审核</button>
                            <button
                              onClick={() => runHealthCheck(model.actualModelId)}
                              disabled={busy === `health:${model.actualModelId}`}
                              style={{ ...ghostButton, marginLeft: 6 }}
                            >
                              {busy === `health:${model.actualModelId}` ? "检测中" : "检测"}
                            </button>
                            {model.channelLastError ? (
                              <button onClick={() => setMessage(`错误原因：${model.channelLastError}`)} style={{ ...ghostButton, marginLeft: 6 }}>错误</button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <form onSubmit={saveReview} style={panelStyle}>
              <h2 style={sectionTitle}>审核发布</h2>
              <p style={sectionSub}>启用前必须成本、售价、毛利、健康检查全部达标。</p>
              <Field label="用户看到的模型名" value={review.displayName} onChange={(v) => setReview({ ...review, displayName: v })} />
              <Field label="FlowAPI Model ID" value={review.publicModelId} onChange={(v) => setReview({ ...review, publicModelId: v })} />
              <Field label="真实模型 ID（仅后台）" value={review.actualModelId} onChange={(v) => setReview({ ...review, actualModelId: v })} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="输入成本/1M" value={review.inputCostPerMillion} onChange={(v) => setReview({ ...review, inputCostPerMillion: v })} type="number" />
                <Field label="输出成本/1M" value={review.outputCostPerMillion} onChange={(v) => setReview({ ...review, outputCostPerMillion: v })} type="number" />
                <Field label="输入售价/1M" value={review.sellInputPricePerMillion} onChange={(v) => setReview({ ...review, sellInputPricePerMillion: v })} type="number" />
                <Field label="输出售价/1M" value={review.sellOutputPricePerMillion} onChange={(v) => setReview({ ...review, sellOutputPricePerMillion: v })} type="number" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label={`最低毛利率（当前 ${marginPercent(review.minProfitMargin)}）`} value={review.minProfitMargin} onChange={(v) => setReview({ ...review, minProfitMargin: v })} type="number" />
                <Field label="备用优先级" value={review.priority} onChange={(v) => setReview({ ...review, priority: v })} type="number" />
              </div>
              <div style={profitBoxStyle}>
                <strong>毛利预览</strong>
                <span>输入：{inputProfit ? `每 1M 赚 ¥${inputProfit.profit.toFixed(3)}，毛利率 ${marginPercent(inputProfit.margin)}` : "填完成本和售价后自动计算"}</span>
                <span>输出：{outputProfit ? `每 1M 赚 ¥${outputProfit.profit.toFixed(3)}，毛利率 ${marginPercent(outputProfit.margin)}` : "填完成本和售价后自动计算"}</span>
                <em>低于最低毛利率时，后端会拒绝启用或发布，避免亏钱兜底。</em>
              </div>
              <label style={checkStyle}>
                <input type="checkbox" checked={review.enable} onChange={(event) => setReview({ ...review, enable: event.target.checked })} />
                启用为备用线路
              </label>
              <label style={checkStyle}>
                <input type="checkbox" checked={review.publish} onChange={(event) => setReview({ ...review, publish: event.target.checked })} />
                发布到 FlowAPI 模型广场 / API Key 创建
              </label>
              <button type="submit" disabled={busy === "review"} style={{ ...primaryButton, width: "100%", minHeight: 46 }}>
                {busy === "review" ? "保存中..." : "保存审核结果"}
              </button>
            </form>
          </section>
        </main>
      </AdminLayout>
    </>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label style={{ display: "grid", gap: 6, marginBottom: 10, color: "var(--dash-sub)", fontSize: 12, fontWeight: 800 }}>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
    </label>
  );
}

const panelStyle = {
  background: "var(--dash-card-bg)",
  border: "1px solid var(--dash-border)",
  borderRadius: 12,
  padding: 16,
  boxShadow: "var(--dash-shadow)",
};
const metricStyle = {
  border: "1px solid var(--dash-border)",
  borderRadius: 10,
  padding: 12,
  background: "var(--dash-card-hover)",
  display: "grid",
  gap: 6,
};
const stepsStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 14,
};
const sectionTitle = { margin: 0, fontSize: 18, fontWeight: 950 };
const sectionSub = { margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 12, lineHeight: 1.6 };
const primaryButton = {
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  background: "linear-gradient(135deg, #6366f1, #8b5cf6 55%, #a78bfa)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
const ghostButton = {
  border: "1px solid var(--dash-border)",
  borderRadius: 10,
  padding: "9px 12px",
  background: "var(--dash-card-hover)",
  color: "var(--dash-text)",
  fontWeight: 800,
  cursor: "pointer",
};
const primaryMiniButton = {
  ...primaryButton,
  padding: "6px 10px",
  minHeight: 30,
  fontSize: 12,
};
const ghostMiniButton = {
  ...ghostButton,
  padding: "6px 10px",
  minHeight: 30,
  fontSize: 12,
};
const profitBoxStyle = {
  display: "grid",
  gap: 6,
  margin: "10px 0 12px",
  padding: 12,
  border: "1px solid var(--dash-border)",
  borderRadius: 10,
  background: "var(--dash-card-hover)",
  color: "var(--dash-text)",
  fontSize: 12,
};
const noticeStyle = {
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--dash-border)",
  background: "var(--dash-card-hover)",
  color: "var(--dash-text)",
  fontSize: 13,
  fontWeight: 800,
};
const inputStyle = {
  minHeight: 38,
  border: "1px solid var(--dash-border)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "var(--dash-card-bg)",
  color: "var(--dash-text)",
  outline: "none",
  minWidth: 0,
};
const thStyle = { textAlign: "left", padding: "9px 8px", fontSize: 11, color: "var(--dash-sub)", whiteSpace: "nowrap" };
const tdStyle = { padding: "11px 8px", fontSize: 12, verticalAlign: "top" };
const mutedBlock = { display: "block", marginTop: 4, color: "var(--dash-sub)", fontSize: 11, wordBreak: "break-all" };
const emptyStyle = { padding: 32, textAlign: "center", color: "var(--dash-sub)", fontSize: 13 };
const pillStyle = { display: "inline-flex", padding: "3px 8px", borderRadius: 999, background: "var(--dash-card-hover)", fontSize: 11, fontWeight: 900 };
const checkStyle = { display: "flex", alignItems: "center", gap: 8, margin: "10px 0", color: "var(--dash-text)", fontSize: 13, fontWeight: 800 };
