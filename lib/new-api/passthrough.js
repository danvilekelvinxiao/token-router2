/**
 * New API Token passthrough whitelist.
 * Allows admin-whitelisted New API tokens to bypass FlowAPI's local balance
 * system while still going through New API routing. Default: disabled.
 */
import crypto from "crypto";
import { hasDatabase, query } from "../db";

const PASSTHROUGH_ENABLED =
  process.env.ALLOW_NEW_API_TOKEN_PASSTHROUGH === "true";

function hashToken(token) {
  return crypto
    .createHmac("sha256", process.env.VERIFY_SECRET || "flowapi-verify-secret-2024")
    .update(String(token).trim())
    .digest("hex");
}

function tokenValue(token) {
  return String(token || "").trim();
}

export function isPassthroughEnabled() {
  return PASSTHROUGH_ENABLED;
}

export async function isTokenWhitelisted(token) {
  if (!PASSTHROUGH_ENABLED) return false;

  // Commercial safety rule:
  // unknown New API tokens must never bypass FlowAPI's local api_keys ledger.
  // The env flag only enables this whitelist feature; it does not mean
  // "allow every unknown token". A matching DB whitelist row is mandatory.
  if (!hasDatabase()) return false;

  const h = hashToken(token);
  try {
    const result = await query(
      `SELECT id, enabled FROM new_api_token_whitelist WHERE token_hash = $1 LIMIT 1`,
      [h],
    );
    const row = result.rows[0];
    if (row && row.enabled) {
      await query(
        `UPDATE new_api_token_whitelist SET last_used_at = NOW() WHERE id = $1`,
        [row.id],
      );
      return true;
    }
  } catch {
    // Table may not exist. Fail closed so New API tokens cannot bypass
    // FlowAPI billing and call records.
    return false;
  }

  return false;
}

export async function addWhitelistToken(params) {
  if (!hasDatabase()) throw new Error("数据库未配置");

  const { name, token, notes, adminId } = params;
  const h = hashToken(token);
  const preview = tokenValue(token);

  const result = await query(
    `INSERT INTO new_api_token_whitelist (name, token_hash, token_preview, notes, created_by_admin_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (token_hash) DO UPDATE SET enabled = true, updated_at = NOW()
     RETURNING id, name, token_preview, enabled, notes, created_at`,
    [name, h, preview, notes || "", adminId || ""],
  );
  return result.rows[0];
}

export async function listWhitelistTokens() {
  if (!hasDatabase()) return [];
  const result = await query(
    `SELECT id, name, token_preview, enabled, notes, created_by_admin_id,
            created_at, updated_at, last_used_at
     FROM new_api_token_whitelist ORDER BY created_at DESC`,
  );
  return result.rows;
}

export async function toggleWhitelistToken(id, enabled) {
  if (!hasDatabase()) throw new Error("数据库未配置");
  const result = await query(
    `UPDATE new_api_token_whitelist SET enabled = $2, updated_at = NOW() WHERE id = $1 RETURNING id, enabled`,
    [id, enabled],
  );
  if (result.rows.length === 0) throw new Error("记录不存在");
  return result.rows[0];
}

export async function deleteWhitelistToken(id) {
  if (!hasDatabase()) throw new Error("数据库未配置");
  await query(`DELETE FROM new_api_token_whitelist WHERE id = $1`, [id]);
  return { success: true };
}

export async function logPassthroughCall(params) {
  if (!hasDatabase()) return;
  const { token, model, status, inputTokens, outputTokens, totalTokens, latencyMs, errorMsg } = params;
  await query(
    `INSERT INTO passthrough_logs (token_preview, model, endpoint, status, input_tokens, output_tokens, total_tokens, latency_ms, error_message)
     VALUES ($1, $2, '/v1/chat/completions', $3, $4, $5, $6, $7, $8)`,
    [
      tokenValue(token),
      model || "",
      status || 0,
      inputTokens || 0,
      outputTokens || 0,
      totalTokens || 0,
      latencyMs || 0,
      errorMsg || "",
    ],
  );
}

export async function getPassthroughLogs(limit = 50) {
  if (!hasDatabase()) return [];
  const result = await query(
    `SELECT * FROM passthrough_logs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows;
}

export async function getPassthroughStats() {
  if (!hasDatabase()) return { totalCalls: 0, totalTokens: 0 };
  const result = await query(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(total_tokens), 0) AS tokens
     FROM passthrough_logs WHERE status = 1`,
  );
  const row = result.rows[0] || { calls: 0, tokens: 0 };
  return {
    totalCalls: Number(row.calls),
    totalTokens: Number(row.tokens),
  };
}
