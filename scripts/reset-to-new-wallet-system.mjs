#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { confirm: "", dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--confirm") {
      args.confirm = argv[++i] || "";
      continue;
    }
    if (value === "--dry-run") {
      args.dryRun = true;
      continue;
    }
  }
  return args;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function main() {
  const args = parseArgs(process.argv);
  loadEnvFile(path.join(repoRoot, ".env.production"));
  loadEnvFile(path.join(repoRoot, ".env.local"));

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  const useSsl = process.env.DATABASE_SSL === "false" ? false : connectionString.includes("sslmode=require");
  if (!connectionString) {
    console.error("DATABASE_URL / POSTGRES_URL 未配置。");
    process.exit(1);
  }

  if (args.confirm !== "WIPE_OLD_WALLET_SYSTEM") {
    console.log("dry-run: 需要显式传入 --confirm WIPE_OLD_WALLET_SYSTEM 才会执行。");
    console.log("本操作会删除所有非管理员用户数据、旧钱包表，并把 legacy customer.balance / total_spend 清零。");
    process.exit(0);
  }

  const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000,
    statement_timeout: 30000,
    idleTimeoutMillis: 10000,
    max: 2,
  });

  const client = await pool.connect();
  const tx = async (sql, params = []) => client.query(sql, params);

  const adminRows = await tx(
    `SELECT id, email
     FROM customers
     WHERE COALESCE(role, 'user') = 'admin'
        OR id = 'cus_admin'
        OR LOWER(COALESCE(email, '')) = 'xiaoyijie@flowapi.fun'
     ORDER BY created_at ASC`
  );
  const adminIds = adminRows.rows.map((row) => row.id).filter(Boolean);
  const adminIdList = adminIds.length ? adminIds : ["cus_admin"];

  const nonAdminRows = await tx(
    `SELECT id
     FROM customers
     WHERE COALESCE(role, 'user') <> 'admin'
       AND LOWER(COALESCE(email, '')) <> 'xiaoyijie@flowapi.fun'
       AND id <> 'cus_admin'`
  );
  const nonAdminIds = nonAdminRows.rows.map((row) => row.id).filter(Boolean);

  console.log(JSON.stringify({
    dryRun: args.dryRun,
    adminCount: adminIds.length,
    nonAdminCount: nonAdminIds.length,
    adminIds,
  }, null, 2));
  if (args.dryRun) {
    client.release();
    await pool.end();
    return;
  }

  const tablesToClear = [
    "wallet_transactions",
    "recharge_orders",
    "temporary_credits",
    "api_request_idempotency",
    "call_finalizations",
    "relay_request_audits",
    "route_attempts",
    "package_orders",
    "user_packages",
    "activation_code_redemptions",
    "referral_rewards",
    "referral_relations",
    "referral_withdrawals",
    "commission_transactions",
    "team_usage_logs",
    "team_wallet_transactions",
    "team_member_limits",
    "team_members",
    "team_invites",
    "team_wallets",
    "team_daily_reports",
    "team_alerts",
    "team_budget_rules",
    "alert_events",
    "token_pool_status",
    "token_pool_usage",
    "token_pool_check_logs",
    "token_pool_test_logs",
    "rate_limit_rules",
    "request_cache_entries",
    "user_title_state",
    "user_titles",
    "title_metric_snapshots",
    "model_compare_results",
    "model_compare_sessions",
    "activity_logs",
    "calls",
    "api_keys",
  ];

  await tx("BEGIN");
  try {
    for (const table of tablesToClear) {
      await tx(`DELETE FROM ${quoteIdent(table)}`);
    }

    if (nonAdminIds.length) {
      const customerDeleteTables = [
        ["customers", "id"],
        ["referral_codes", "user_id"],
        ["teams", "owner_user_id"],
      ];
      for (const [table, column] of customerDeleteTables) {
        await tx(`DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} = ANY($1::text[])`, [nonAdminIds]);
      }
    }

    await tx(
      `UPDATE customers
       SET balance = 0,
           total_spend = 0`
    );

    await tx(
      `INSERT INTO wallets (id, user_id, api_balance, frozen_api_balance, total_recharged_rmb, total_granted_api, total_consumed_api, status)
       SELECT
         'wallet_' || id,
         id,
         0,
         0,
         0,
         0,
         0,
         'active'
       FROM customers
       WHERE id = ANY($1::text[])
       ON CONFLICT (user_id) DO UPDATE SET
         api_balance = 0,
         frozen_api_balance = 0,
         total_recharged_rmb = 0,
         total_granted_api = 0,
         total_consumed_api = 0,
         status = 'active',
         updated_at = NOW()`,
      [adminIdList]
    );

    await tx(
      `INSERT INTO wallet_configs (id, key, value, description)
       VALUES
         ('cfg_recharge_rate', 'recharge_rate', '5', '人民币与 $ API 的充值比例'),
         ('cfg_min_recharge', 'min_recharge_amount_rmb', '1', '最低充值金额'),
         ('cfg_max_recharge', 'max_recharge_amount_rmb', '100000', '单次最高充值金额'),
         ('cfg_recharge_enabled', 'recharge_enabled', 'true', '是否开启充值'),
         ('cfg_manual_review', 'manual_review_enabled', 'true', '是否开启人工审核'),
         ('cfg_new_user_bonus', 'new_user_bonus_api', '0', '新用户赠送 $ API'),
         ('cfg_low_balance', 'low_balance_threshold_api', '1', '低余额提醒阈值')
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         description = EXCLUDED.description,
         updated_at = NOW()`
    );

    await tx("COMMIT");
    console.log(JSON.stringify({
      ok: true,
      removedUsers: nonAdminIds.length,
      resetCustomers: adminIdList.length,
      clearedLegacyWalletTables: tablesToClear.length,
      time: new Date().toISOString(),
    }, null, 2));
  } catch (error) {
    await tx("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[reset-wallet-system] failed:", error.message);
  process.exitCode = 1;
});
