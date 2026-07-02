#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const pg = require("pg");

const { Pool } = pg;

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
  const args = { envFile: "", confirm: "", dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--env-file") {
      args.envFile = argv[++i] || "";
      continue;
    }
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

function mask(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 4)}****${text.slice(-4)}`;
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function printTable(rows, headers) {
  const widths = headers.map((header) => header.length);
  for (const row of rows) {
    headers.forEach((header, index) => {
      widths[index] = Math.max(widths[index], String(row[index] ?? "").length);
    });
  }
  console.log(headers.map((header, index) => header.padEnd(widths[index])).join("  "));
  for (const row of rows) {
    console.log(row.map((value, index) => String(value ?? "").padEnd(widths[index])).join("  "));
  }
}

async function main() {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv);

  if (args.envFile) loadEnvFile(path.resolve(args.envFile));
  loadEnvFile(path.join(repoRoot, ".env.production"));
  loadEnvFile(path.join(repoRoot, ".env.local"));

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  const useSsl = process.env.DATABASE_SSL === "false" ? false : connectionString.includes("sslmode=require");
  if (!connectionString) {
    console.error("DATABASE_URL / POSTGRES_URL 未配置。");
    process.exit(1);
  }

  if (args.confirm !== "KEEP_ADMIN_ONLY") {
    console.log("dry-run: 需要显式传入 --confirm KEEP_ADMIN_ONLY 才会执行清库。");
    console.log("将保留：role=admin 的 customers、系统配置、模型价格、上游渠道、管理员必要日志。");
    console.log("将删除：普通用户、普通用户 API Key、钱包流水、调用日志、账单、测试会话、测试 token、测试团队数据。");
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

  const counts = {};
  const nonAdminRows = await tx(
    `SELECT id, email, role, status
     FROM customers
     WHERE COALESCE(role, 'user') <> 'admin'
       AND deleted_at IS NULL
     ORDER BY created_at ASC`
  );
  const adminRows = await tx(
    `SELECT id, email, role, status
     FROM customers
     WHERE COALESCE(role, 'user') = 'admin'
       AND deleted_at IS NULL
     ORDER BY created_at ASC`
  );

  const nonAdminIds = nonAdminRows.rows.map((row) => row.id).filter(Boolean);
  const adminIds = adminRows.rows.map((row) => row.id).filter(Boolean);

  console.log(`管理员账号数: ${adminRows.rows.length}`);
  console.log(`待清理普通用户数: ${nonAdminRows.rows.length}`);
  if (adminRows.rows.length) {
    printTable(adminRows.rows.map((row) => [row.id, row.email, row.role, row.status]), ["id", "email", "role", "status"]);
  }

  if (!nonAdminIds.length) {
    console.log("没有可清理的普通用户。");
    client.release();
    await pool.end();
    return;
  }

  const fileTargets = [
    path.join(repoRoot, "data", "user-announcement-reads.json"),
  ];
  const beforeFileStates = {};
  for (const filePath of fileTargets) {
    beforeFileStates[filePath] = readJsonFile(filePath);
  }

  const nonAdminParam = [nonAdminIds];
  const apiKeyIdRows = await tx("SELECT id FROM api_keys WHERE customer_id = ANY($1::text[])", nonAdminParam);
  const apiKeyIds = apiKeyIdRows.rows.map((row) => row.id).filter(Boolean);
  const compareSessionRows = await tx("SELECT id FROM model_compare_sessions WHERE user_id = ANY($1::text[])", nonAdminParam);
  const compareSessionIds = compareSessionRows.rows.map((row) => row.id).filter(Boolean);

  await client.query("BEGIN");
  try {
    const teamRows = await tx(
      `SELECT id
       FROM teams
       WHERE owner_user_id = ANY($1::text[])`,
      nonAdminParam
    );
    const teamIds = teamRows.rows.map((row) => row.id).filter(Boolean);

    const tokenRows = teamIds.length
      ? await tx(
        `SELECT id
         FROM token_pool
         WHERE team_id = ANY($1::text[])`,
        [teamIds]
      )
      : { rows: [] };
    const tokenIds = tokenRows.rows.map((row) => row.id).filter(Boolean);

    const deleteStatements = [
      ["api_keys", "customer_id", nonAdminIds],
      ["calls", "customer_id", nonAdminIds],
      ["recharge_orders", "customer_id", nonAdminIds],
      ["temporary_credits", "customer_id", nonAdminIds],
      ["activity_logs", "customer_id", nonAdminIds],
      ["relay_request_audits", "customer_id", nonAdminIds],
      ["route_attempts", "customer_id", nonAdminIds],
      ["api_request_idempotency", "customer_id", nonAdminIds],
      ["call_finalizations", "customer_id", nonAdminIds],
      ["model_compare_sessions", "user_id", nonAdminIds],
      ["activation_code_redemptions", "user_id", nonAdminIds],
      ["package_orders", "user_id", nonAdminIds],
      ["user_packages", "user_id", nonAdminIds],
      ["referral_codes", "user_id", nonAdminIds],
      ["referral_relations", "referrer_user_id", nonAdminIds],
      ["referral_relations", "referred_user_id", nonAdminIds],
      ["referral_rewards", "referrer_user_id", nonAdminIds],
      ["referral_rewards", "referred_user_id", nonAdminIds],
      ["referral_withdrawals", "user_id", nonAdminIds],
      ["commission_transactions", "user_id", nonAdminIds],
      ["user_titles", "user_id", nonAdminIds],
      ["title_metric_snapshots", "user_id", nonAdminIds],
      ["user_title_state", "user_id", nonAdminIds],
      ["request_cache_entries", "user_id", nonAdminIds],
      ["request_cache_entries", "team_id", teamIds],
      ["team_members", "user_id", nonAdminIds],
      ["team_members", "team_id", teamIds],
      ["team_invites", "team_id", teamIds],
      ["team_wallets", "team_id", teamIds],
      ["team_member_limits", "user_id", nonAdminIds],
      ["team_member_limits", "team_id", teamIds],
      ["team_api_keys", "user_id", nonAdminIds],
      ["team_api_keys", "team_id", teamIds],
      ["team_wallet_transactions", "user_id", nonAdminIds],
      ["team_wallet_transactions", "team_id", teamIds],
      ["team_usage_logs", "user_id", nonAdminIds],
      ["team_usage_logs", "team_id", teamIds],
      ["team_daily_reports", "team_id", teamIds],
      ["team_alerts", "team_id", teamIds],
      ["team_budget_rules", "team_id", teamIds],
      ["alert_events", "team_id", teamIds],
      ["token_pool_status", "token_id", tokenIds],
      ["token_pool_usage", "token_id", tokenIds],
      ["token_pool_check_logs", "token_pool_id", tokenIds],
      ["token_pool_test_logs", "token_pool_id", tokenIds],
      ["rate_limit_rules", "team_id", teamIds],
      ["rate_limit_rules", "api_key_id", apiKeyIds],
    ];

    for (const [table, column, ids] of deleteStatements) {
      if (!ids.length) continue;
      const countResult = await tx(
        `SELECT COUNT(*)::int AS count
         FROM ${quoteIdent(table)}
         WHERE ${quoteIdent(column)} = ANY($1::text[])`,
        [ids]
      );
      counts[`${table}.${column}`] = Number(countResult.rows[0]?.count || 0);
      await tx(
        `DELETE FROM ${quoteIdent(table)}
         WHERE ${quoteIdent(column)} = ANY($1::text[])`,
        [ids]
      );
    }

    if (tokenIds.length) {
      const tokenCount = await tx("SELECT COUNT(*)::int AS count FROM token_pool WHERE id = ANY($1::text[])", [tokenIds]);
      counts.token_pool = Number(tokenCount.rows[0]?.count || 0);
      await tx("DELETE FROM token_pool WHERE id = ANY($1::text[])", [tokenIds]);
    }

    if (compareSessionIds.length) {
      const compareResultCount = await tx("SELECT COUNT(*)::int AS count FROM model_compare_results WHERE session_id = ANY($1::text[])", [compareSessionIds]);
      counts["model_compare_results.session_id"] = Number(compareResultCount.rows[0]?.count || 0);
      await tx("DELETE FROM model_compare_results WHERE session_id = ANY($1::text[])", [compareSessionIds]);
    }

    if (teamIds.length) {
      const teamCount = await tx("SELECT COUNT(*)::int AS count FROM teams WHERE id = ANY($1::text[])", [teamIds]);
      counts.teams = Number(teamCount.rows[0]?.count || 0);
      await tx("DELETE FROM teams WHERE id = ANY($1::text[])", [teamIds]);
    }

    const customerCount = await tx("SELECT COUNT(*)::int AS count FROM customers WHERE id = ANY($1::text[])", [nonAdminIds]);
    counts.customers = Number(customerCount.rows[0]?.count || 0);
    await tx("DELETE FROM customers WHERE id = ANY($1::text[])", [nonAdminIds]);

    await tx("COMMIT");
  } catch (error) {
    await tx("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  for (const filePath of fileTargets) {
    if (!fs.existsSync(filePath)) continue;
    const payload = readJsonFile(filePath);
    if (!Array.isArray(payload)) continue;
    const filtered = payload.filter((item) => !item || !nonAdminIds.includes(item.userId || item.user_id));
    writeJsonFile(filePath, filtered);
    counts[path.relative(repoRoot, filePath)] = payload.length - filtered.length;
  }

  console.log(JSON.stringify({
    ok: true,
    confirmed: true,
    keptAdminIds: adminIds,
    removedUserIds: nonAdminIds.length,
    counts,
    time: new Date().toISOString(),
  }, null, 2));

  await pool.end();
}

main().catch(async (error) => {
  console.error("[reset-test-data] failed:", error.message);
  process.exitCode = 1;
});
