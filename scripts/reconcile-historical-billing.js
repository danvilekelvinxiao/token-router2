#!/usr/bin/env node
/*
 * Reconcile one historical FlowAPI billing row. Safe by default: dry-run unless
 * --apply is passed. Prints only IDs, status, token/cost numbers; no secrets.
 */
const fs = require("fs");
const pg = require("pg");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] == null) process.env[key] = value;
  }
}

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function chinaDayKey(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function chinaDayExpiry(dayKey = chinaDayKey()) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000 - 1);
}

function sanitize(value = "") {
  return String(value || "")
    .replace(/postgres:\/\/[^\s]+/gi, "postgres://***")
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-***")
    .slice(0, 700);
}

async function main() {
  loadEnvFile(".env.production");
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const target = getArg("--request-id") || getArg("--id") || "call_1782578167287_4b9764c5";
  const apply = process.argv.includes("--apply");
  const amountOverride = Number(getArg("--amount", "0") || 0);
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  if (!connectionString) throw new Error("DATABASE_URL/POSTGRES_URL missing");

  const useSsl = process.env.DATABASE_SSL === "false" ? false : (connectionString.includes("sslmode=require") || /supabase\.co/i.test(connectionString));
  const pool = new pg.Pool({ connectionString, ssl: useSsl ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 8000, query_timeout: 12000, statement_timeout: 12000, max: 2 });

  const callResult = await pool.query(
    `SELECT id, request_id, customer_id, api_key_id, endpoint, requested_model, public_model_id,
            actual_model_id, upstream_channel, upstream_provider, upstream_status, status,
            input_tokens, output_tokens, total_tokens, cost, is_stream, error_code, error_message,
            delivery_status, billing_status, created_at
       FROM calls
      WHERE id = $1 OR request_id = $1 OR request_id LIKE $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [target, `${target}%`]
  );
  const call = callResult.rows[0];
  if (!call) {
    await pool.end();
    console.log(JSON.stringify({ ok: false, target, found: false }, null, 2));
    return;
  }

  const requestId = call.request_id || target;
  const audit = await pool.query(
    `SELECT request_id, status_code, success, cost, billing_consistent, billing_diff,
            compensation_status, compensation_amount, billing_flow_status
       FROM relay_request_audits WHERE request_id = $1 LIMIT 1`,
    [requestId]
  );
  const finalization = await pool.query(
    `SELECT settlement_key, request_id, status, billing_status, delivery_confirmed_at, settled_at, error_reason
       FROM call_finalizations WHERE request_id = $1 LIMIT 1`,
    [requestId]
  );

  const cost = Number(call.cost || 0);
  const refundAmount = amountOverride > 0 ? amountOverride : cost;
  const needsRefund = cost > 0 && String(call.billing_status || "") !== "billing_refunded";
  const dayKey = chinaDayKey();
  const expiresAt = chinaDayExpiry(dayKey);
  const reason = `refund_credit_${requestId}_incomplete_delivery`.slice(0, 180);
  const description = `响应未完整返回，已自动退回本次消耗额度。关联请求：${requestId}`;

  const summary = {
    ok: true,
    dryRun: !apply,
    target,
    found: true,
    requestId,
    callId: call.id,
    routeSuffix: String(requestId).match(/[ABCDX]$/)?.[0] || "",
    customerId: call.customer_id,
    upstreamChannel: call.upstream_channel,
    upstreamStatus: Number(call.upstream_status || 0),
    status: Number(call.status || 0),
    isStream: Boolean(call.is_stream),
    inputTokens: Number(call.input_tokens || 0),
    outputTokens: Number(call.output_tokens || 0),
    totalTokens: Number(call.total_tokens || 0),
    cost,
    refundAmount: needsRefund ? refundAmount : 0,
    deliveryStatus: call.delivery_status || "",
    billingStatus: call.billing_status || "",
    audit: audit.rows[0] || null,
    finalization: finalization.rows[0] || null,
  };

  if (apply && needsRefund) {
    await pool.query("BEGIN");
    try {
      const inserted = await pool.query(
        `INSERT INTO temporary_credits (id, customer_id, reason, grant_day, amount, remaining, expires_at, source_type, source_name, description, is_temporary)
         VALUES ($1, $2, $3, $4, $5, $5, $6, 'refund_credit', '响应未完整返回自动退回', $7, true)
         ON CONFLICT (customer_id, reason, grant_day) DO NOTHING
         RETURNING id`,
        [makeId("tmp_refund"), call.customer_id, reason, dayKey, refundAmount, expiresAt.toISOString(), description]
      );
      if (inserted.rows[0]) {
        const customer = await pool.query("SELECT email FROM customers WHERE id = $1 LIMIT 1", [call.customer_id]);
        await pool.query(
          `INSERT INTO activity_logs (id, customer_id, email, action, category, detail, amount, source_type, source_name, description, expire_at, is_temporary)
           VALUES ($1, $2, $3, 'refund_credit', 'billing', $4, $5, 'refund_credit', '响应未完整返回自动退回', $4, $6, true)`,
          [makeId("log"), call.customer_id, customer.rows[0]?.email || "", description, refundAmount, expiresAt.toISOString()]
        );
      }
      await pool.query(
        `UPDATE calls
            SET billing_status = 'billing_refunded',
                delivery_status = COALESCE(NULLIF(delivery_status, ''), 'upstream_completed_downstream_failed'),
                related_request_id = $1
          WHERE id = $2`,
        [requestId, call.id]
      );
      await pool.query(
        `UPDATE relay_request_audits
            SET compensation_status = 'applied', compensation_amount = $2, billing_flow_status = 'billing_refunded'
          WHERE request_id = $1`,
        [requestId, refundAmount]
      );
      await pool.query(
        `UPDATE call_finalizations
            SET billing_status = 'billing_refunded', error_reason = $2, updated_at = NOW()
          WHERE request_id = $1`,
        [requestId, description]
      );
      await pool.query("COMMIT");
      summary.applied = true;
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } else {
    summary.applied = false;
    summary.reason = needsRefund ? "dry_run" : "already_refunded_or_zero_cost";
  }

  await pool.end();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: sanitize(error.message) }, null, 2));
  process.exit(1);
});
