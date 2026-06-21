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

loadEnvFileIfExists("/Users/danvilekelvinxiao/Documents/Codex/token-router2/.env.local");

const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").replace("postgresql://", "postgres://");
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const useSsl = process.env.DATABASE_SSL !== "false";
const canUsePg = Boolean(connectionString);
const canUseSupabaseRest = Boolean(supabaseUrl && supabaseKey);

if (!canUsePg && !canUseSupabaseRest) {
  console.error("缺少 DATABASE_URL / POSTGRES_URL，且未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，无法执行钱包审计。");
  process.exit(1);
}

const pool = canUsePg
  ? new Pool({
      connectionString,
      family: 4,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
      statement_timeout: 10000,
      idleTimeoutMillis: 30000,
      max: 5,
    })
  : null;

async function fetchJson(path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase REST ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function runPgQuery(query, params = []) {
  const result = await pool.query(query, params);
  return result.rows;
}

async function runRestQuery() {
  const [wallets, txRows, callRows, rechargePairs, duplicateReferrals] = await Promise.all([
    fetchJson("user_wallets?select=*&order=updated_at.desc&limit=500"),
    fetchJson("wallet_transactions?select=user_id,type,currency,amount,related_order_id&order=created_at.asc&limit=20000"),
    fetchJson("calls?select=customer_id,user_charge_usd_token,package_deduct_amount,wallet_deduct_amount,total_tokens&order=created_at.asc&limit=20000"),
    Promise.resolve([]),
    Promise.resolve([]),
  ]);

  return { wallets, txRows, callRows, rechargePairs, duplicateReferrals };
}

async function main() {
  let wallets;
  let txTotals;
  let callTotals;
  let rechargePairs;
  let duplicateReferrals;

  if (canUsePg) {
    wallets = await runPgQuery("SELECT * FROM user_wallets ORDER BY updated_at DESC LIMIT 500");
    txTotals = await runPgQuery(`
      SELECT
        user_id,
        COALESCE(SUM(CASE WHEN currency = 'USD_TOKEN' AND type IN ('exchange_to_usd_token', 'referral_bonus_inviter', 'referral_bonus_invitee', 'admin_adjustment') THEN amount ELSE 0 END), 0) AS token_in,
        COALESCE(SUM(CASE WHEN currency = 'USD_TOKEN' AND type = 'usage_wallet_deduct' THEN amount ELSE 0 END), 0) AS token_out,
        COALESCE(SUM(CASE WHEN currency = 'USD_TOKEN' AND type = 'usage_package_deduct' THEN amount ELSE 0 END), 0) AS package_out,
        COALESCE(SUM(CASE WHEN currency = 'CNY' AND type = 'cny_recharge' THEN amount ELSE 0 END), 0) AS cny_in,
        COALESCE(SUM(CASE WHEN currency = 'CNY' AND type = 'cny_refund' THEN amount ELSE 0 END), 0) AS cny_out,
        COUNT(*)::int AS tx_count
      FROM wallet_transactions
      GROUP BY user_id
    `);
    callTotals = await runPgQuery(`
      SELECT
        customer_id AS user_id,
        COALESCE(SUM(user_charge_usd_token), 0) AS charge_usd_token,
        COALESCE(SUM(package_deduct_amount), 0) AS package_deduct_amount,
        COALESCE(SUM(wallet_deduct_amount), 0) AS wallet_deduct_amount,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COUNT(*)::int AS call_count
      FROM calls
      GROUP BY customer_id
    `);
    rechargePairs = await runPgQuery(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE c.type = 'cny_recharge' AND t.type = 'exchange_to_usd_token')::int AS paired
      FROM wallet_transactions c
      LEFT JOIN wallet_transactions t
        ON t.user_id = c.user_id
       AND t.related_order_id = c.related_order_id
       AND t.type = 'exchange_to_usd_token'
      WHERE c.type = 'cny_recharge'
    `);
    duplicateReferrals = await runPgQuery(`
      SELECT user_id, related_order_id, type, COUNT(*)::int AS count
      FROM wallet_transactions
      WHERE type IN ('referral_bonus_inviter', 'referral_bonus_invitee')
      GROUP BY user_id, related_order_id, type
      HAVING COUNT(*) > 1
      LIMIT 20
    `);
  } else {
    const rest = await runRestQuery();
    wallets = rest.wallets;
    const txMap = new Map();
    const rechargeRows = [];
    const duplicateRefMap = new Map();
    for (const row of rest.txRows) {
      const next = txMap.get(row.user_id) || { token_in: 0, token_out: 0, package_out: 0, cny_in: 0, cny_out: 0, tx_count: 0 };
      next.tx_count += 1;
      if (row.currency === "USD_TOKEN" && ["exchange_to_usd_token", "referral_bonus_inviter", "referral_bonus_invitee", "admin_adjustment"].includes(row.type)) next.token_in += Number(row.amount || 0);
      if (row.currency === "USD_TOKEN" && row.type === "usage_wallet_deduct") next.token_out += Number(row.amount || 0);
      if (row.currency === "USD_TOKEN" && row.type === "usage_package_deduct") next.package_out += Number(row.amount || 0);
      if (row.currency === "CNY" && row.type === "cny_recharge") next.cny_in += Number(row.amount || 0);
      if (row.currency === "CNY" && row.type === "cny_refund") next.cny_out += Number(row.amount || 0);
      txMap.set(row.user_id, next);

      if (row.type === "cny_recharge") rechargeRows.push(row);
      if (row.type === "referral_bonus_inviter" || row.type === "referral_bonus_invitee") {
        const key = `${row.user_id}::${row.related_order_id || ""}::${row.type}`;
        duplicateRefMap.set(key, (duplicateRefMap.get(key) || 0) + 1);
      }
    }
    txTotals = Array.from(txMap.entries()).map(([user_id, values]) => ({ user_id, ...values }));

    const callMap = new Map();
    for (const row of rest.callRows) {
      const next = callMap.get(row.customer_id) || { user_id: row.customer_id, charge_usd_token: 0, package_deduct_amount: 0, wallet_deduct_amount: 0, total_tokens: 0, call_count: 0 };
      next.charge_usd_token += Number(row.user_charge_usd_token || 0);
      next.package_deduct_amount += Number(row.package_deduct_amount || 0);
      next.wallet_deduct_amount += Number(row.wallet_deduct_amount || 0);
      next.total_tokens += Number(row.total_tokens || 0);
      next.call_count += 1;
      callMap.set(row.customer_id, next);
    }
    callTotals = Array.from(callMap.values());
    const rechargePairCount = rechargeRows.reduce((count, row) => {
      const exchangeMatch = rest.txRows.some((tx) =>
        tx.user_id === row.user_id &&
        tx.related_order_id === row.related_order_id &&
        tx.type === "exchange_to_usd_token"
      );
      return count + (exchangeMatch ? 1 : 0);
    }, 0);
    rechargePairs = [{ total: rechargeRows.length, paired: rechargePairCount }];
    duplicateReferrals = Array.from(duplicateRefMap.entries())
      .filter(([, count]) => count > 1)
      .map(([key, count]) => {
        const [user_id, related_order_id, type] = key.split("::");
        return { user_id, related_order_id, type, count };
      });
  }

  const txRows = Array.isArray(txTotals) ? txTotals : (txTotals?.rows || []);
  const callRows = Array.isArray(callTotals) ? callTotals : (callTotals?.rows || []);
  const walletRows = Array.isArray(wallets) ? wallets : (wallets?.rows || []);
  const txMap = new Map(txRows.map((row) => [row.user_id, row]));
  const callMap = new Map(callRows.map((row) => [row.user_id, row]));
  const issues = [];

  for (const row of walletRows) {
    const tx = txMap.get(row.user_id) || { token_in: 0, token_out: 0, package_out: 0, cny_in: 0, cny_out: 0, tx_count: 0 };
    const call = callMap.get(row.user_id) || { charge_usd_token: 0, package_deduct_amount: 0, wallet_deduct_amount: 0, total_tokens: 0, call_count: 0 };
    const expectedTokenBalance = Number((Number(tx.token_in || 0) - Number(tx.token_out || 0)).toFixed(6));
    const actualTokenBalance = Number(Number(row.usd_token_balance || 0).toFixed(6));
    const expectedTokenObtained = Number(Number(tx.token_in || 0).toFixed(6));
    const actualTokenObtained = Number(Number(row.usd_token_total_obtained || 0).toFixed(6));
    const expectedTokenUsed = Number(Number(tx.token_out || 0).toFixed(6));
    const actualTokenUsed = Number(Number(row.usd_token_total_used || 0).toFixed(6));
    const expectedCnyPaid = Number((Number(tx.cny_in || 0)).toFixed(6));
    const expectedCnyRefund = Number((Number(tx.cny_out || 0)).toFixed(6));
    const actualCnyPaid = Number(Number(row.cny_paid_total || 0).toFixed(6));
    const actualCnyRefund = Number(Number(row.cny_refund_total || 0).toFixed(6));
    const expectedCnyNet = Number((expectedCnyPaid - expectedCnyRefund).toFixed(6));
    const storedCnyNet = Number((Number(row.cny_paid_total || 0) - Number(row.cny_refund_total || 0)).toFixed(6));

    if (Math.abs(expectedTokenBalance - actualTokenBalance) > 0.0001) {
      issues.push({
        userId: row.user_id,
        field: "usd_token_balance",
        expected: expectedTokenBalance,
        actual: actualTokenBalance,
      });
    }
    if (Math.abs(expectedTokenObtained - actualTokenObtained) > 0.0001) {
      issues.push({
        userId: row.user_id,
        field: "usd_token_total_obtained",
        expected: expectedTokenObtained,
        actual: actualTokenObtained,
      });
    }
    if (Math.abs(expectedTokenUsed - actualTokenUsed) > 0.0001) {
      issues.push({
        userId: row.user_id,
        field: "usd_token_total_used",
        expected: expectedTokenUsed,
        actual: actualTokenUsed,
      });
    }
    if (Math.abs(expectedCnyPaid - actualCnyPaid) > 0.0001) {
      issues.push({
        userId: row.user_id,
        field: "cny_paid_total",
        expected: expectedCnyPaid,
        actual: actualCnyPaid,
      });
    }
    if (Math.abs(expectedCnyRefund - actualCnyRefund) > 0.0001) {
      issues.push({
        userId: row.user_id,
        field: "cny_refund_total",
        expected: expectedCnyRefund,
        actual: actualCnyRefund,
      });
    }
    if (Math.abs(expectedCnyNet - storedCnyNet) > 0.0001) {
      issues.push({
        userId: row.user_id,
        field: "cny_net",
        expected: expectedCnyNet,
        actual: storedCnyNet,
      });
    }
    if (Math.abs(Number(tx.package_out || 0) - Number(call.package_deduct_amount || 0)) > 0.0001) {
      issues.push({
        userId: row.user_id,
        field: "package_deduct_amount",
        expected: Number(tx.package_out || 0),
        actual: Number(call.package_deduct_amount || 0),
      });
    }
    if (Math.abs(Number(tx.token_out || 0) - Number(call.wallet_deduct_amount || 0)) > 0.0001) {
      issues.push({
        userId: row.user_id,
        field: "wallet_deduct_amount",
        expected: Number(tx.token_out || 0),
        actual: Number(call.wallet_deduct_amount || 0),
      });
    }
    if (Math.abs(Number(call.charge_usd_token || 0) - Number(call.package_deduct_amount || 0) - Number(call.wallet_deduct_amount || 0)) > 0.0001) {
      issues.push({
        userId: row.user_id,
        field: "call_charge_split",
        expected: Number(call.package_deduct_amount || 0) + Number(call.wallet_deduct_amount || 0),
        actual: Number(call.charge_usd_token || 0),
      });
    }
  }

  (duplicateReferrals.rows || duplicateReferrals).forEach((row) => {
    issues.push({
      userId: row.user_id,
      field: "duplicate_referral_bonus",
      expected: 1,
      actual: row.count,
      relatedOrderId: row.related_order_id,
      transactionType: row.type,
    });
  });

  const summary = {
    wallets: wallets.rowCount ?? wallets.length ?? 0,
    transactions: txTotals.rowCount ?? txTotals.length ?? 0,
    calls: callTotals.rowCount ?? callTotals.length ?? 0,
    rechargePairs: rechargePairs.rows?.[0] || rechargePairs?.[0] || {},
    duplicateReferrals: duplicateReferrals.rowCount ?? duplicateReferrals.length ?? 0,
    issues: issues.length,
  };

  console.log(JSON.stringify({ ok: issues.length === 0, summary, issues }, null, 2));
  if (issues.length > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  })
  .finally(() => pool?.end?.().catch(() => {}));
