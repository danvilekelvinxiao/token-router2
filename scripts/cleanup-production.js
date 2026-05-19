#!/usr/bin/env node
const fs = require("fs");
const pg = require("pg");

const { Pool } = pg;

const envPath = process.argv[2] || ".env.production";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(envPath);

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.log("[cleanup] DATABASE_URL is not configured, skipping database cleanup");
  process.exit(0);
}

const retentionDays = Number(process.env.CALL_LOG_RETENTION_DAYS || 30);
const maxCallRows = Number(process.env.CALL_LOG_MAX_ROWS || 50000);

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const before = await pool.query("SELECT COUNT(*)::int AS count FROM calls");

  const byAge = await pool.query(
    "DELETE FROM calls WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')",
    [retentionDays]
  );

  const byCap = await pool.query(
    `DELETE FROM calls
     WHERE id IN (
       SELECT id
       FROM calls
       ORDER BY created_at DESC
       OFFSET $1
     )`,
    [maxCallRows]
  );

  const processedRechargeOrders = await pool.query(
    `DELETE FROM recharge_orders
     WHERE status <> 'pending'
       AND created_at < NOW() - INTERVAL '180 days'`
  );

  await pool.query("VACUUM (ANALYZE) calls");
  const after = await pool.query("SELECT COUNT(*)::int AS count FROM calls");

  console.log(JSON.stringify({
    ok: true,
    callsBefore: before.rows[0].count,
    deletedByAge: byAge.rowCount,
    deletedByCap: byCap.rowCount,
    callsAfter: after.rows[0].count,
    deletedProcessedRechargeOrders: processedRechargeOrders.rowCount,
    retentionDays,
    maxCallRows,
    time: new Date().toISOString(),
  }));
}

main()
  .catch((error) => {
    console.error("[cleanup] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
