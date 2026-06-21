#!/usr/bin/env node

const fs = require("fs");
const { Pool } = require("pg");
require("./ipv4-first.cjs");

function loadEnvFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function toNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function asFixed(value) {
  return Number(toNumber(value).toFixed(6));
}

loadEnvFileIfExists("/Users/danvilekelvinxiao/Documents/Codex/token-router2/.env.local");

const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").replace("postgresql://", "postgres://");
const useSsl = process.env.DATABASE_SSL !== "false";
const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
const targetUserId = (() => {
  const arg = process.argv.find((value) => value.startsWith("--user-id="));
  return arg ? arg.slice("--user-id=".length).trim() : "";
})();
const limit = (() => {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  const parsed = Number(arg ? arg.slice("--limit=".length) : 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
})();

if (!connectionString) {
  console.error("缺少 DATABASE_URL / POSTGRES_URL，无法执行对账。");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  family: 4,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
  statement_timeout: 10000,
  idleTimeoutMillis: 30000,
  max: 5,
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function main() {
  const params = [];
  const where = targetUserId ? "WHERE user_id = $1" : "";
  if (targetUserId) params.push(targetUserId);

  const walletRows = await query(
    `SELECT *
     FROM user_wallets
     ${where}
     ORDER BY updated_at DESC
     ${limit ? `LIMIT ${limit}` : ""}`,
    params,
  );

  const results = [];
  for (const row of walletRows.rows) {
    const tx = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN currency = 'USD_TOKEN' AND type IN ('exchange_to_usd_token', 'referral_bonus_inviter', 'referral_bonus_invitee', 'admin_adjustment') THEN amount ELSE 0 END), 0) AS token_in,
         COALESCE(SUM(CASE WHEN currency = 'USD_TOKEN' AND type = 'usage_wallet_deduct' THEN amount ELSE 0 END), 0) AS token_out,
         COALESCE(SUM(CASE WHEN currency = 'CNY' AND type = 'cny_recharge' THEN amount ELSE 0 END), 0) AS cny_in,
         COALESCE(SUM(CASE WHEN currency = 'CNY' AND type = 'cny_refund' THEN amount ELSE 0 END), 0) AS cny_out
       FROM wallet_transactions
       WHERE user_id = $1`,
      [row.user_id],
    );
    const stats = tx.rows[0] || {};
    const expected = {
      cnyRechargeTotal: asFixed(stats.cny_in),
      cnyPaidTotal: asFixed(stats.cny_in),
      cnyRefundTotal: asFixed(stats.cny_out),
      usdTokenBalance: asFixed(stats.token_in - stats.token_out),
      usdTokenTotalObtained: asFixed(stats.token_in),
      usdTokenTotalUsed: asFixed(stats.token_out),
    };

    const current = {
      cnyRechargeTotal: asFixed(row.cny_recharge_total),
      cnyPaidTotal: asFixed(row.cny_paid_total),
      cnyRefundTotal: asFixed(row.cny_refund_total),
      usdTokenBalance: asFixed(row.usd_token_balance),
      usdTokenTotalObtained: asFixed(row.usd_token_total_obtained),
      usdTokenTotalUsed: asFixed(row.usd_token_total_used),
    };

    const changed = Object.keys(expected).some((key) => expected[key] !== current[key]);
    if (!changed) continue;

    results.push({
      userId: row.user_id,
      current,
      expected,
    });

    if (!dryRun) {
      await query(
        `UPDATE user_wallets
         SET cny_recharge_total = $2,
             cny_paid_total = $3,
             cny_refund_total = $4,
             usd_token_balance = $5,
             usd_token_total_obtained = $6,
             usd_token_total_used = $7,
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          row.user_id,
          expected.cnyRechargeTotal,
          expected.cnyPaidTotal,
          expected.cnyRefundTotal,
          expected.usdTokenBalance,
          expected.usdTokenTotalObtained,
          expected.usdTokenTotalUsed,
        ],
      );
    }
  }

  console.log(JSON.stringify({
    dryRun,
    targetUserId: targetUserId || "",
    changedCount: results.length,
    changes: results,
  }, null, 2));
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end().catch(() => {});
    process.exit(1);
  });
