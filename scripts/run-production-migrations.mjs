import pg from "pg";
import fs from "fs";

const { Pool } = pg;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) return;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

loadEnvFile(".env.production");
loadEnvFile(".env.local");

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const requireDatabase = process.env.FLOWAPI_REQUIRE_DATABASE === "true" || process.env.NODE_ENV === "production";

if (!connectionString) {
  const message = "[migrate] DATABASE_URL / POSTGRES_URL 未配置，跳过数据库迁移。";
  if (requireDatabase) {
    console.error(`${message} 生产商业闭环必须配置数据库。`);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
  statement_timeout: 30000,
  idleTimeoutMillis: 10000,
  max: 2,
});

async function exec(sql) {
  const label = sql.split("\n").map((line) => line.trim()).find(Boolean) || "SQL";
  process.stdout.write(`[migrate] ${label.slice(0, 96)} ... `);
  await pool.query(sql);
  console.log("ok");
}

try {
  const coreTables = await pool.query(`
    SELECT
      to_regclass('public.customers') AS customers,
      to_regclass('public.api_keys') AS api_keys,
      to_regclass('public.calls') AS calls
  `);
  const missingTables = ["customers", "api_keys", "calls"].filter((name) => !coreTables.rows[0]?.[name]);
  if (missingTables.length) {
    throw new Error(`核心商业表缺失：${missingTables.join(", ")}。请先在维护窗口初始化数据库 schema，再进行正式部署。`);
  }

  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS request_id TEXT DEFAULT '';
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS public_model_id TEXT DEFAULT '';
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS actual_model_id TEXT DEFAULT '';
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_channel TEXT DEFAULT '';
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_provider TEXT DEFAULT '';
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_status INTEGER DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS latency_ms INTEGER DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS first_token_ms INTEGER DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS sell_price_cny NUMERIC(14, 6) NOT NULL DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS user_charge NUMERIC(14, 6) NOT NULL DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_cost_cny NUMERIC(14, 6) NOT NULL DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_cost NUMERIC(14, 6) NOT NULL DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS profit_cny NUMERIC(14, 6) NOT NULL DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS profit NUMERIC(14, 6) NOT NULL DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS profit_margin NUMERIC(8, 4) NOT NULL DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS billing_mode TEXT DEFAULT 'token_multiplier';
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS route_strategy TEXT DEFAULT '';
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS route_attempts INTEGER NOT NULL DEFAULT 0;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_stream BOOLEAN NOT NULL DEFAULT false;
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS error_code TEXT DEFAULT '';
  `);
  await exec(`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT '';
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS upstream_channels (
      id TEXT PRIMARY KEY,
      provider_name TEXT NOT NULL DEFAULT '',
      channel_name TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      actual_model_id TEXT NOT NULL DEFAULT '',
      public_model_id TEXT NOT NULL DEFAULT '',
      group_name TEXT NOT NULL DEFAULT '',
      input_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
      output_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CNY',
      priority INTEGER NOT NULL DEFAULT 10,
      quality_score INTEGER NOT NULL DEFAULT 80,
      route_strategy TEXT NOT NULL DEFAULT 'balanced',
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      last_health_check_at TIMESTAMPTZ,
      last_error TEXT NOT NULL DEFAULT '',
      success_rate NUMERIC(8, 4) NOT NULL DEFAULT 0,
      avg_latency_ms INTEGER NOT NULL DEFAULT 0,
      avg_first_token_ms INTEGER NOT NULL DEFAULT 0,
      p95_latency_ms INTEGER NOT NULL DEFAULT 0,
      profit_protection_hits INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS route_attempts (
      id TEXT PRIMARY KEY,
      call_id TEXT DEFAULT '',
      request_id TEXT NOT NULL,
      customer_id TEXT DEFAULT '',
      api_key_id TEXT DEFAULT '',
      public_model_id TEXT DEFAULT '',
      actual_model_id TEXT DEFAULT '',
      upstream_channel_id TEXT DEFAULT '',
      upstream_channel TEXT DEFAULT '',
      upstream_provider TEXT DEFAULT '',
      attempt_index INTEGER NOT NULL DEFAULT 0,
      attempt_order INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT '',
      status_code INTEGER NOT NULL DEFAULT 0,
      ok BOOLEAN NOT NULL DEFAULT false,
      first_token_ms INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error_code TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await exec(`ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS call_id TEXT DEFAULT '';`);
  await exec(`ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS upstream_channel_id TEXT DEFAULT '';`);
  await exec(`ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS attempt_order INTEGER NOT NULL DEFAULT 0;`);
  await exec(`ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '';`);
  await exec(`ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS first_token_ms INTEGER NOT NULL DEFAULT 0;`);
  await exec(`
    CREATE TABLE IF NOT EXISTS model_compare_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      selected_models JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'running',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS model_compare_results (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      public_model_id TEXT NOT NULL DEFAULT '',
      actual_model_id TEXT NOT NULL DEFAULT '',
      upstream_channel TEXT NOT NULL DEFAULT '',
      response_text TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      first_token_ms INTEGER NOT NULL DEFAULT 0,
      cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      is_best BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS api_request_idempotency (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'started',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(customer_id, request_id)
    );
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS call_finalizations (
      settlement_key TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'finalized',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS new_api_token_whitelist (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL UNIQUE,
      token_preview TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_by_admin_id TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    );
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS passthrough_logs (
      id SERIAL PRIMARY KEY,
      token_preview TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      endpoint TEXT NOT NULL DEFAULT '/v1/chat/completions',
      status SMALLINT NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error_message TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_request_id ON calls(request_id);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_profit_created ON calls(profit_cny, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_first_token_created ON calls(first_token_ms, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upstream_channels_model ON upstream_channels(public_model_id, is_enabled, priority);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_request_idempotency_customer ON api_request_idempotency(customer_id, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_route_attempts_request ON route_attempts(request_id, attempt_index);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_route_attempts_customer ON route_attempts(customer_id, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_compare_sessions_user ON model_compare_sessions(user_id, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_compare_results_session ON model_compare_results(session_id, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whitelist_enabled ON new_api_token_whitelist(enabled);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whitelist_hash ON new_api_token_whitelist(token_hash);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_passthrough_logs_created ON passthrough_logs(created_at DESC);");

  console.log("[migrate] 商业化账本迁移完成。");
} catch (error) {
  console.error("[migrate] 迁移失败：", error?.message || error);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
