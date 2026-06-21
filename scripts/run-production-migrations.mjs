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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	    );
	  `);
	  await exec(`
	    ALTER TABLE upstream_channels ADD COLUMN IF NOT EXISTS provider_key TEXT DEFAULT '';
	    ALTER TABLE upstream_channels ADD COLUMN IF NOT EXISTS channel_type TEXT DEFAULT 'OpenAI Compatible';
	    ALTER TABLE upstream_channels ADD COLUMN IF NOT EXISTS is_user_visible BOOLEAN NOT NULL DEFAULT false;
	    ALTER TABLE upstream_channels ADD COLUMN IF NOT EXISTS requires_admin_review BOOLEAN NOT NULL DEFAULT false;
	    ALTER TABLE upstream_channels DROP COLUMN IF EXISTS profit_protection_hits;
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS upstream_models (
	      id TEXT PRIMARY KEY,
	      provider TEXT NOT NULL DEFAULT '',
	      provider_key TEXT DEFAULT '',
	      upstream_channel TEXT NOT NULL DEFAULT '',
	      channel_id TEXT DEFAULT '',
	      public_model_id TEXT DEFAULT '',
	      actual_model_id TEXT NOT NULL DEFAULT '',
	      display_name TEXT NOT NULL DEFAULT '',
	      raw_model_name TEXT DEFAULT '',
	      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
	      normalized_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
	      input_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
	      output_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
	      currency TEXT NOT NULL DEFAULT 'CNY',
	      is_detected BOOLEAN NOT NULL DEFAULT true,
	      is_available BOOLEAN NOT NULL DEFAULT false,
	      requires_admin_review BOOLEAN NOT NULL DEFAULT true,
	      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	    );
	  `);
	  await exec(`
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS provider_key TEXT DEFAULT '';
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS channel_id TEXT DEFAULT '';
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS public_model_id TEXT DEFAULT '';
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS raw_model_name TEXT DEFAULT '';
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}'::jsonb;
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS normalized_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS input_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0;
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS output_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0;
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CNY';
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT false;
	    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS requires_admin_review BOOLEAN NOT NULL DEFAULT true;
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS model_routes (
	      id TEXT PRIMARY KEY,
	      public_model_id TEXT NOT NULL,
	      display_name TEXT NOT NULL DEFAULT '',
	      display_provider TEXT NOT NULL DEFAULT 'FlowAPI',
	      category TEXT NOT NULL DEFAULT 'general',
	      sell_input_price_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
	      sell_output_price_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
	      is_public BOOLEAN NOT NULL DEFAULT false,
	      is_available BOOLEAN NOT NULL DEFAULT false,
	      requires_admin_review BOOLEAN NOT NULL DEFAULT true,
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	    );
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS route_candidates (
	      id TEXT PRIMARY KEY,
	      public_model_id TEXT NOT NULL,
	      upstream_channel_id TEXT NOT NULL DEFAULT '',
	      actual_model_id TEXT NOT NULL DEFAULT '',
	      provider_key TEXT NOT NULL DEFAULT '',
	      priority INTEGER NOT NULL DEFAULT 90,
	      weight INTEGER NOT NULL DEFAULT 1,
	      is_enabled BOOLEAN NOT NULL DEFAULT false,
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	    );
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS data_sync_logs (
	      id TEXT PRIMARY KEY,
	      provider_key TEXT NOT NULL DEFAULT '',
	      channel_name TEXT NOT NULL DEFAULT '',
	      action TEXT NOT NULL DEFAULT '',
	      status TEXT NOT NULL DEFAULT '',
	      total_items INTEGER NOT NULL DEFAULT 0,
	      added_count INTEGER NOT NULL DEFAULT 0,
	      updated_count INTEGER NOT NULL DEFAULT 0,
	      error_message TEXT DEFAULT '',
	      raw_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
	      created_by TEXT DEFAULT '',
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    CREATE TABLE IF NOT EXISTS relay_request_audits (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      upstream_request_id TEXT DEFAULT '',
      response_id TEXT DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      api_key_fingerprint TEXT DEFAULT '',
      customer_id TEXT DEFAULT '',
      route TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
      usage_raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      prompt_hash TEXT DEFAULT '',
      balance_before NUMERIC(18, 8) NOT NULL DEFAULT 0,
      balance_after NUMERIC(18, 8) NOT NULL DEFAULT 0,
      cost NUMERIC(18, 8) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CNY',
      pricing_version TEXT NOT NULL DEFAULT '2026-06-16.v1',
      billing_source TEXT NOT NULL DEFAULT 'platform_pricing_table',
      billing_consistent BOOLEAN NOT NULL DEFAULT true,
      billing_diff NUMERIC(18, 8) NOT NULL DEFAULT 0,
      billing_alert TEXT DEFAULT '',
      user_message_chars INTEGER NOT NULL DEFAULT 0,
      user_message_count INTEGER NOT NULL DEFAULT 0,
      server_system_chars INTEGER NOT NULL DEFAULT 0,
      tool_schema_chars INTEGER NOT NULL DEFAULT 0,
      messages_before_enrich INTEGER NOT NULL DEFAULT 0,
      messages_after_enrich INTEGER NOT NULL DEFAULT 0,
      enrichment_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
      token_anomaly_flag BOOLEAN NOT NULL DEFAULT false,
      compensation_status TEXT NOT NULL DEFAULT 'none',
      compensation_amount NUMERIC(18, 8) NOT NULL DEFAULT 0,
      status_code INTEGER NOT NULL DEFAULT 0,
      success BOOLEAN NOT NULL DEFAULT false,
      error_code TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      latency_ms INTEGER NOT NULL DEFAULT 0
    );
  `);
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
	  await exec(`
	    CREATE TABLE IF NOT EXISTS teams (
	      id TEXT PRIMARY KEY,
	      name TEXT NOT NULL,
	      code TEXT UNIQUE NOT NULL,
	      description TEXT DEFAULT '',
	      owner_user_id TEXT DEFAULT '',
	      type TEXT DEFAULT '工作室',
	      scenario TEXT DEFAULT '综合使用',
	      team_size TEXT DEFAULT '',
	      monthly_budget_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
	      monthly_token_budget NUMERIC(20, 0) NOT NULL DEFAULT 0,
	      allow_member_personal_balance BOOLEAN NOT NULL DEFAULT false,
	      allow_member_create_keys BOOLEAN NOT NULL DEFAULT true,
	      status TEXT NOT NULL DEFAULT 'active',
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	    );
	  `);
	  await exec(`
	    ALTER TABLE teams ADD COLUMN IF NOT EXISTS type TEXT DEFAULT '工作室';
	    ALTER TABLE teams ADD COLUMN IF NOT EXISTS scenario TEXT DEFAULT '综合使用';
	    ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_size TEXT DEFAULT '';
	    ALTER TABLE teams ADD COLUMN IF NOT EXISTS allow_member_personal_balance BOOLEAN NOT NULL DEFAULT false;
	    ALTER TABLE teams ADD COLUMN IF NOT EXISTS allow_member_create_keys BOOLEAN NOT NULL DEFAULT true;
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS team_members (
	      id TEXT PRIMARY KEY,
	      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	      user_id TEXT NOT NULL,
	      role TEXT NOT NULL DEFAULT 'member',
	      member_name TEXT DEFAULT '',
	      status TEXT NOT NULL DEFAULT 'active',
	      invited_by TEXT DEFAULT '',
	      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	    );
	  `);
	  await exec(`
	    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invited_by TEXT DEFAULT '';
	    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
	    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS member_name TEXT DEFAULT '';
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS team_member_limits (
	      id TEXT PRIMARY KEY,
	      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	      user_id TEXT NOT NULL,
	      limit_type TEXT NOT NULL DEFAULT 'none',
	      limit_unit TEXT NOT NULL DEFAULT 'cny',
	      limit_amount NUMERIC(20, 6) NOT NULL DEFAULT 0,
	      period_start TIMESTAMPTZ,
	      period_end TIMESTAMPTZ,
	      used_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
	      used_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
	      used_requests INTEGER NOT NULL DEFAULT 0,
	      enabled BOOLEAN NOT NULL DEFAULT false,
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      UNIQUE(team_id, user_id)
	    );
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS team_api_keys (
	      id TEXT PRIMARY KEY,
	      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	      user_id TEXT NOT NULL,
	      api_key_id TEXT NOT NULL,
	      scope TEXT NOT NULL DEFAULT 'member',
	      shared BOOLEAN NOT NULL DEFAULT false,
	      status TEXT NOT NULL DEFAULT 'active',
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      UNIQUE(team_id, api_key_id)
	    );
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS team_wallets (
	      id TEXT PRIMARY KEY,
	      team_id TEXT UNIQUE NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	      balance_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
	      gift_balance_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
	      package_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
	      membership_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
	      status TEXT NOT NULL DEFAULT 'active',
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	    );
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS team_wallet_transactions (
	      id TEXT PRIMARY KEY,
	      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
	      user_id TEXT DEFAULT '',
	      type TEXT NOT NULL,
	      amount_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
	      tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
	      description TEXT DEFAULT '',
	      related_order_id TEXT DEFAULT '',
	      request_id TEXT DEFAULT '',
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	    );
	  `);
	  await exec(`
	    CREATE TABLE IF NOT EXISTS team_usage_logs (
	      id TEXT PRIMARY KEY,
	      request_id TEXT NOT NULL,
	      user_id TEXT DEFAULT '',
	      team_id TEXT DEFAULT '',
	      api_key_id TEXT DEFAULT '',
	      token_pool_id TEXT DEFAULT '',
	      token_id TEXT DEFAULT '',
	      provider TEXT DEFAULT '',
	      model TEXT DEFAULT '',
	      model_type TEXT DEFAULT '',
	      purpose TEXT DEFAULT '',
	      request_summary TEXT DEFAULT '',
	      request_hash TEXT DEFAULT '',
	      request_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      client_ip TEXT DEFAULT '',
	      client_name TEXT DEFAULT '',
	      request_params_json TEXT DEFAULT '',
	      cache_hit BOOLEAN NOT NULL DEFAULT false,
	      cache_key TEXT DEFAULT '',
	      input_tokens INTEGER NOT NULL DEFAULT 0,
	      output_tokens INTEGER NOT NULL DEFAULT 0,
	      total_tokens INTEGER NOT NULL DEFAULT 0,
	      official_cost_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
	      actual_cost_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
	      saved_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
	      balance_source TEXT DEFAULT '',
	      success BOOLEAN NOT NULL DEFAULT true,
	      duration_ms INTEGER NOT NULL DEFAULT 0,
	      upstream_request_id TEXT DEFAULT '',
	      error_code TEXT DEFAULT '',
	      error_message TEXT DEFAULT '',
	      rate_limited BOOLEAN NOT NULL DEFAULT false,
	      token_expired BOOLEAN NOT NULL DEFAULT false,
	      balance_insufficient BOOLEAN NOT NULL DEFAULT false,
	      upstream_error BOOLEAN NOT NULL DEFAULT false,
	      fallback_token_used BOOLEAN NOT NULL DEFAULT false,
	      fallback_token_id TEXT DEFAULT '',
	      retry_count INTEGER NOT NULL DEFAULT 0,
	      final_status TEXT DEFAULT 'success',
	      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	    );
	  `);

	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_request_id ON calls(request_id);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_profit_created ON calls(profit_cny, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_first_token_created ON calls(first_token_ms, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relay_request_audits_created_at ON relay_request_audits(created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relay_request_audits_customer_id ON relay_request_audits(customer_id);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relay_request_audits_response_id ON relay_request_audits(response_id);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upstream_channels_model ON upstream_channels(public_model_id, is_enabled, priority);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_request_idempotency_customer ON api_request_idempotency(customer_id, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_route_attempts_request ON route_attempts(request_id, attempt_index);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_route_attempts_customer ON route_attempts(customer_id, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_compare_sessions_user ON model_compare_sessions(user_id, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_compare_results_session ON model_compare_results(session_id, created_at DESC);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whitelist_enabled ON new_api_token_whitelist(enabled);");
  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whitelist_hash ON new_api_token_whitelist(token_hash);");
	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_passthrough_logs_created ON passthrough_logs(created_at DESC);");
	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upstream_channels_provider_key ON upstream_channels(provider_key, is_enabled);");
	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upstream_models_provider ON upstream_models(provider_key, last_synced_at DESC);");
	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_route_candidates_public_model ON route_candidates(public_model_id, is_enabled, priority);");
	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_sync_logs_provider ON data_sync_logs(provider_key, created_at DESC);");
	  await exec("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_team_members_unique_active ON team_members(team_id, user_id);");
	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_limits_team_user ON team_member_limits(team_id, user_id);");
	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_key_links_team ON team_api_keys(team_id, user_id);");
	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_wallet_transactions_team ON team_wallet_transactions(team_id, created_at DESC);");
	  await exec("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_usage_logs_team ON team_usage_logs(team_id, created_at DESC);");

  console.log("[migrate] 商业化账本迁移完成。");
} catch (error) {
  console.error("[migrate] 迁移失败：", error?.message || error);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
