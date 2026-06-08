import { getDashboard } from "@/lib/customer-store";
import { hasDatabase, query } from "@/lib/db";
import { requireCustomerSession } from "@/lib/session";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";

function makeId(prefix = "cmp") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return typeof body === "object" ? body : {};
}

function textFromResponse(payload = {}) {
  return (payload.choices || []).map((choice) => {
    const content = choice?.message?.content ?? choice?.text ?? "";
    if (typeof content === "string") return content;
    return content ? JSON.stringify(content) : "";
  }).filter(Boolean).join("\n").trim();
}

function findKeyForModel(customer = {}, modelId = "") {
  const wanted = String(modelId || "").trim().toLowerCase();
  const keys = Array.isArray(customer.apiKeys) ? customer.apiKeys : [];
  const active = keys.filter((key) => key.token && !key.disabledAt && !key.deletedAt);
  return active.find((key) => {
    const aliases = [
      key.publicModelId,
	      key.modelProductId,
      key.modelDisplayName,
      ...(key.allowedModels || []),
    ].filter(Boolean).map((item) => String(item).trim().toLowerCase());
    return aliases.includes(wanted);
	  }) || active.find((key) => !key.publicModelId) || null;
}

function getInternalOrigin(req) {
  const configured = String(process.env.INTERNAL_FLOWAPI_BASE_URL || process.env.FLOWAPI_INTERNAL_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const localPort = Number(req.socket?.localPort || process.env.PORT || 3000);
  return `http://127.0.0.1:${Number.isFinite(localPort) && localPort > 0 ? localPort : 3000}`;
}

async function insertSession({ id, userId, prompt, models, status }) {
  if (!hasDatabase()) {
    if (!globalThis.__FLOWAPI_MODEL_COMPARE__) globalThis.__FLOWAPI_MODEL_COMPARE__ = { sessions: [], results: [] };
    globalThis.__FLOWAPI_MODEL_COMPARE__.sessions.unshift({ id, userId, prompt, selectedModels: models, status, createdAt: new Date().toISOString() });
    return;
  }
  await query(
    `INSERT INTO model_compare_sessions (id, user_id, prompt, selected_models, status)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, userId, prompt, JSON.stringify(models), status]
  );
}

async function insertResult(result) {
  if (!hasDatabase()) {
    if (!globalThis.__FLOWAPI_MODEL_COMPARE__) globalThis.__FLOWAPI_MODEL_COMPARE__ = { sessions: [], results: [] };
    globalThis.__FLOWAPI_MODEL_COMPARE__.results.unshift({ ...result, createdAt: new Date().toISOString() });
    return;
  }
  await query(
    `INSERT INTO model_compare_results (
       id, session_id, public_model_id, response_text,
       input_tokens, output_tokens, latency_ms, first_token_ms, cost, status, error_message
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      result.id,
      result.sessionId,
      result.publicModelId,
      result.responseText,
      result.inputTokens,
      result.outputTokens,
      result.latencyMs,
      result.firstTokenMs,
      result.cost,
      result.status,
      result.errorMessage,
    ]
  );
}

async function markBest({ userId, sessionId, resultId }) {
  if (!hasDatabase()) {
    const store = globalThis.__FLOWAPI_MODEL_COMPARE__;
    if (!store) return false;
    const session = store.sessions.find((item) => item.id === sessionId && item.userId === userId);
    if (!session) return false;
    store.results.forEach((item) => {
      if (item.sessionId === sessionId) item.isBest = item.id === resultId;
    });
    return true;
  }
  const owned = await query("SELECT id FROM model_compare_sessions WHERE id = $1 AND user_id = $2 LIMIT 1", [sessionId, userId]);
  if (!owned.rows[0]) return false;
  await query("UPDATE model_compare_results SET is_best = false WHERE session_id = $1", [sessionId]);
  await query("UPDATE model_compare_results SET is_best = true WHERE id = $1 AND session_id = $2", [resultId, sessionId]);
  return true;
}

export default async function handler(req, res) {
  const session = requireCustomerSession(req, res);
  if (!session) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = parseBody(req.body);
  if (body.action === "mark_best") {
    const ok = await markBest({
      userId: session.customerId,
      sessionId: body.sessionId,
      resultId: body.resultId,
    });
    return res.status(ok ? 200 : 404).json({ ok });
  }

  const prompt = String(body.prompt || "").trim();
  const models = Array.from(new Set((body.models || []).map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 4);
  if (!prompt) return res.status(400).json({ ok: false, error: "请输入要对比的问题" });
  if (models.length < 2) return res.status(400).json({ ok: false, error: "请至少选择 2 个模型进行对比" });

  const customer = await getDashboard(session.customerId);
  if (!customer) return res.status(404).json({ ok: false, error: "用户不存在" });

  const sessionId = makeId("cmp_sess");
  await insertSession({ id: sessionId, userId: session.customerId, prompt, models, status: "running" });
  const origin = getInternalOrigin(req);

  const results = await Promise.all(models.map(async (modelId) => {
    const start = Date.now();
    const key = findKeyForModel(customer, modelId);
    const result = {
      id: makeId("cmp_res"),
      sessionId,
      publicModelId: modelId,
      responseText: "",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      firstTokenMs: 0,
      cost: 0,
      status: "failed",
      errorMessage: "",
    };

    if (!key) {
      result.latencyMs = Date.now() - start;
      result.errorMessage = "没有找到可调用该模型的 API Key，请先在 API 管理页为该模型创建 Key。";
      await insertResult(result);
      return result;
    }

    try {
      const upstreamRes = await fetch(`${origin}/api/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.token}`,
          "x-request-id": `${sessionId}_${modelId}`.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 110),
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          max_tokens: Number(body.maxTokens || 512),
        }),
      });
      const payload = await upstreamRes.json().catch(() => ({}));
      const usage = payload.usage || {};
      const router = payload.token_router || {};
      result.latencyMs = Date.now() - start;
      result.status = upstreamRes.ok ? "success" : "failed";
      result.responseText = upstreamRes.ok ? textFromResponse(payload) : "";
      result.inputTokens = Number(usage.prompt_tokens || 0);
      result.outputTokens = Number(usage.completion_tokens || 0);
      result.cost = Number(router.estimated_cost_cny || 0);
      result.errorMessage = upstreamRes.ok ? "" : sanitizeSecretText(payload.error?.message || payload.error || payload.suggestion || "模型对比调用失败");
    } catch (error) {
      result.latencyMs = Date.now() - start;
      result.errorMessage = sanitizeSecretText(error.message || "模型对比调用失败");
    }

    await insertResult(result);
    return result;
  }));

  const status = results.some((item) => item.status === "success") ? "completed" : "failed";
  if (hasDatabase()) {
    await query("UPDATE model_compare_sessions SET status = $2 WHERE id = $1", [sessionId, status]).catch(() => {});
  } else if (globalThis.__FLOWAPI_MODEL_COMPARE__) {
    const stored = globalThis.__FLOWAPI_MODEL_COMPARE__.sessions.find((item) => item.id === sessionId);
    if (stored) stored.status = status;
  }

  return res.status(200).json({
    ok: true,
    sessionId,
    status,
    results,
	  });
	}
