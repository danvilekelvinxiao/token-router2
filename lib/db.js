import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const useSsl = process.env.DATABASE_SSL === "false" ? false : connectionString.includes("sslmode=require");
const isProduction = process.env.NODE_ENV === "production";
const configuredProxyToken = String(process.env.PROXY_ACCESS_TOKEN || "").trim();
const initialKey = configuredProxyToken || (!isProduction ? "sk-default" : "");
const shouldSeedAdmin = !isProduction || process.env.FLOWAPI_SEED_ADMIN_IN_PRODUCTION === "true";
const shouldSeedAdminApiKey = shouldSeedAdmin && Boolean(initialKey) && (!isProduction || process.env.FLOWAPI_SEED_ADMIN_API_KEY === "true");

let pool = null;
let initPromise = null;

export function hasDatabase() {
  return Boolean(connectionString);
}

export function getPool() {
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
      query_timeout: 8000,
      statement_timeout: 8000,
      idleTimeoutMillis: 30000,
      max: 10,
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) return null;
  await ensureSchema();
  return activePool.query(text, params);
}

export async function ensureSchema() {
  const activePool = getPool();
  if (!activePool) return;
  if (!initPromise) {
    initPromise = activePool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        company TEXT DEFAULT '',
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        used_invite_code TEXT DEFAULT '',
        invited_by TEXT REFERENCES customers(id) ON DELETE SET NULL,
        my_invite_code TEXT UNIQUE,
        balance NUMERIC(14, 6) NOT NULL DEFAULT 0,
        total_spend NUMERIC(14, 6) NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'user',
        email_verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE customers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_by TEXT DEFAULT '';

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        new_api_token_id TEXT DEFAULT '',
        new_api_sync_status TEXT DEFAULT '',
        new_api_synced_at TIMESTAMPTZ,
        label TEXT NOT NULL DEFAULT 'API Key',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        disabled_at TIMESTAMPTZ
      );

      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS new_api_token_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS new_api_sync_status TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS new_api_synced_at TIMESTAMPTZ;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS model_product_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS public_model_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS actual_model_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS model_display_name TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS model_group TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS allowed_models TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS price_multiplier NUMERIC(8, 4) NOT NULL DEFAULT 1;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS locale_price_multiplier NUMERIC(8, 4) NOT NULL DEFAULT 1;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS limit_enabled BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS limit_type TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS limit_unit TEXT NOT NULL DEFAULT 'cny';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS limit_amount NUMERIC(18, 6) NOT NULL DEFAULT 0;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS reset_interval_value INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS reset_interval_unit TEXT NOT NULL DEFAULT 'hour';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS current_period_used_cny NUMERIC(18, 6) NOT NULL DEFAULT 0;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS current_period_used_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS total_used_cny NUMERIC(18, 6) NOT NULL DEFAULT 0;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS total_used_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_limit_reset_at TIMESTAMPTZ;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS next_limit_reset_at TIMESTAMPTZ;
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS limit_status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS team_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS usage_purpose TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS usage_scope TEXT DEFAULT '';

      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
        request_id TEXT DEFAULT '',
        customer TEXT DEFAULT '',
        endpoint TEXT DEFAULT '',
        requested_model TEXT DEFAULT '',
        routed_model TEXT DEFAULT '',
        public_model_id TEXT DEFAULT '',
        actual_model_id TEXT DEFAULT '',
        provider TEXT DEFAULT '',
        upstream_channel TEXT DEFAULT '',
        upstream_provider TEXT DEFAULT '',
        upstream_status INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        first_token_ms INTEGER DEFAULT 0,
        status INTEGER DEFAULT 0,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        tokens INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        sell_price_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
        user_charge NUMERIC(14, 6) NOT NULL DEFAULT 0,
        upstream_cost_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
        upstream_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        profit_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
        profit NUMERIC(14, 6) NOT NULL DEFAULT 0,
        profit_margin NUMERIC(8, 4) NOT NULL DEFAULT 0,
        billing_mode TEXT DEFAULT 'token_multiplier',
        route_strategy TEXT DEFAULT '',
        route_attempts INTEGER NOT NULL DEFAULT 0,
        is_stream BOOLEAN NOT NULL DEFAULT false,
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE calls ADD COLUMN IF NOT EXISTS request_id TEXT DEFAULT '';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS public_model_id TEXT DEFAULT '';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS actual_model_id TEXT DEFAULT '';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_channel TEXT DEFAULT '';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_provider TEXT DEFAULT '';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_status INTEGER DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS latency_ms INTEGER DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS first_token_ms INTEGER DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS sell_price_cny NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS user_charge NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_cost_cny NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS upstream_cost NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS profit_cny NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS profit NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS profit_margin NUMERIC(8, 4) NOT NULL DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS billing_mode TEXT DEFAULT 'token_multiplier';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS route_strategy TEXT DEFAULT '';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS route_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_stream BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS error_code TEXT DEFAULT '';
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT '';

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
      ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS call_id TEXT DEFAULT '';
      ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS upstream_channel_id TEXT DEFAULT '';
      ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS attempt_order INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '';
      ALTER TABLE route_attempts ADD COLUMN IF NOT EXISTS first_token_ms INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS model_compare_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT '',
        selected_models JSONB NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'running',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

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

      CREATE TABLE IF NOT EXISTS api_request_idempotency (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'started',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(customer_id, request_id)
      );

      CREATE TABLE IF NOT EXISTS call_finalizations (
        settlement_key TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'finalized',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recharge_orders (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        out_trade_no TEXT UNIQUE,
        amount NUMERIC(14, 2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CNY',
        payment_method TEXT NOT NULL DEFAULT 'wechat',
        payment_ref TEXT DEFAULT '',
        provider_trade_no TEXT DEFAULT '',
        gateway_payload TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at TIMESTAMPTZ,
        approved_at TIMESTAMPTZ,
        approved_by TEXT DEFAULT ''
      );

      ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS out_trade_no TEXT UNIQUE;
      ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CNY';
      ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS provider_trade_no TEXT DEFAULT '';
      ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS gateway_payload TEXT DEFAULT '';
      ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS verification_codes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_token ON api_keys(token);
      CREATE INDEX IF NOT EXISTS idx_calls_customer_created ON calls(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_calls_request_id ON calls(request_id);
      CREATE INDEX IF NOT EXISTS idx_calls_profit_created ON calls(profit_cny, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_calls_first_token_created ON calls(first_token_ms, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_upstream_channels_model ON upstream_channels(public_model_id, is_enabled, priority);
      CREATE INDEX IF NOT EXISTS idx_api_request_idempotency_customer ON api_request_idempotency(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_route_attempts_request ON route_attempts(request_id, attempt_index);
      CREATE INDEX IF NOT EXISTS idx_route_attempts_customer ON route_attempts(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_model_compare_sessions_user ON model_compare_sessions(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_model_compare_results_session ON model_compare_results(session_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_customers_invite_code ON customers(my_invite_code);
      CREATE INDEX IF NOT EXISTS idx_recharge_orders_status_created ON recharge_orders(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_recharge_orders_customer_created ON recharge_orders(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_recharge_orders_out_trade_no ON recharge_orders(out_trade_no);
      CREATE INDEX IF NOT EXISTS idx_verification_codes_lookup ON verification_codes(email, purpose, consumed_at, expires_at);

      CREATE TABLE IF NOT EXISTS activation_codes (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        amount NUMERIC(14, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        note TEXT DEFAULT '',
        created_by TEXT DEFAULT '',
        redeemed_by TEXT,
        redeemed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS batch_id TEXT DEFAULT '';
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'balance';
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS amount_cny NUMERIC(14, 2) NOT NULL DEFAULT 0;
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS token_amount NUMERIC(20, 0) NOT NULL DEFAULT 0;
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS package_id TEXT DEFAULT '';
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS service_id TEXT DEFAULT '';
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS max_redemptions INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS price_cny NUMERIC(14, 2) NOT NULL DEFAULT 0;
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'taobao';
      ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      UPDATE activation_codes
      SET amount_cny = COALESCE(NULLIF(amount_cny, 0), amount),
          type = CASE WHEN COALESCE(type, '') = '' THEN 'balance' ELSE type END,
          used_count = CASE WHEN status IN ('redeemed', 'used') AND used_count = 0 THEN 1 ELSE used_count END,
          expires_at = COALESCE(expires_at, NULL),
          enabled = CASE WHEN status = 'disabled' THEN false ELSE enabled END;

      CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
      CREATE INDEX IF NOT EXISTS idx_activation_codes_status ON activation_codes(status);
      CREATE INDEX IF NOT EXISTS idx_activation_codes_batch ON activation_codes(batch_id);

      CREATE TABLE IF NOT EXISTS activation_code_redemptions (
        id TEXT PRIMARY KEY,
        code_id TEXT NOT NULL,
        code TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT DEFAULT '',
        redeemed_amount_cny NUMERIC(14, 2) NOT NULL DEFAULT 0,
        redeemed_token_amount NUMERIC(20, 0) NOT NULL DEFAULT 0,
        redeemed_package_id TEXT DEFAULT '',
        type TEXT NOT NULL DEFAULT 'balance',
        source TEXT DEFAULT '',
        ip TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_activation_redemptions_code ON activation_code_redemptions(code_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activation_redemptions_user ON activation_code_redemptions(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS package_orders (
        id TEXT PRIMARY KEY,
        recharge_order_id TEXT UNIQUE,
        user_id TEXT NOT NULL,
        purchase_type TEXT NOT NULL DEFAULT 'package',
        package_id TEXT NOT NULL DEFAULT '',
        package_name TEXT NOT NULL DEFAULT '',
        quota_text TEXT NOT NULL DEFAULT '',
        quota_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
        daily_quota_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
        valid_days INTEGER NOT NULL DEFAULT 0,
        amount_cny NUMERIC(14, 2) NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        source TEXT NOT NULL DEFAULT 'recharge',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at TIMESTAMPTZ,
        activated_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_package_orders_user ON package_orders(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_package_orders_status ON package_orders(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_package_orders_recharge ON package_orders(recharge_order_id);

      CREATE TABLE IF NOT EXISTS user_packages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        package_order_id TEXT,
        package_id TEXT NOT NULL DEFAULT '',
        package_name TEXT NOT NULL DEFAULT '',
        purchase_type TEXT NOT NULL DEFAULT 'package',
        quota_text TEXT NOT NULL DEFAULT '',
        quota_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
        remaining_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
        daily_quota_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
        valid_days INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_user_packages_user_active ON user_packages(user_id, status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_user_packages_order ON user_packages(package_order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_packages_unique_order ON user_packages(package_order_id) WHERE package_order_id <> '';

      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        email TEXT DEFAULT '',
        action TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        detail TEXT DEFAULT '',
        amount NUMERIC(14, 2),
        ip TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_activity_logs_customer ON activity_logs(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(category, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

      CREATE TABLE IF NOT EXISTS temporary_credits (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        grant_day TEXT NOT NULL,
        amount NUMERIC(14, 6) NOT NULL DEFAULT 0,
        remaining NUMERIC(14, 6) NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(customer_id, reason, grant_day)
      );

      CREATE INDEX IF NOT EXISTS idx_temporary_credits_customer_active ON temporary_credits(customer_id, expires_at, remaining);

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

      CREATE INDEX IF NOT EXISTS idx_whitelist_enabled ON new_api_token_whitelist(enabled);
      CREATE INDEX IF NOT EXISTS idx_whitelist_hash ON new_api_token_whitelist(token_hash);

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

      CREATE INDEX IF NOT EXISTS idx_passthrough_logs_created ON passthrough_logs(created_at DESC);

      CREATE TABLE IF NOT EXISTS referral_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        invite_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

      CREATE TABLE IF NOT EXISTS referral_relations (
        id TEXT PRIMARY KEY,
        referrer_user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        referred_user_id TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
        referral_code TEXT NOT NULL DEFAULT '',
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        first_recharge_order_id TEXT DEFAULT '',
        first_recharge_at TIMESTAMPTZ,
        first_bonus_granted BOOLEAN NOT NULL DEFAULT false,
        status TEXT NOT NULL DEFAULT 'pending',
        ip TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        source TEXT DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_referral_relations_referrer ON referral_relations(referrer_user_id, registered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_referral_relations_referred ON referral_relations(referred_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_relations_status ON referral_relations(status);

      CREATE TABLE IF NOT EXISTS referral_rewards (
        id TEXT PRIMARY KEY,
        referrer_user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        referred_user_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        order_id TEXT DEFAULT '',
        paid_amount_cny NUMERIC(14, 2) NOT NULL DEFAULT 0,
        level TEXT NOT NULL DEFAULT '普通邀请',
        commission_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
        commission_amount_cny NUMERIC(14, 2) NOT NULL DEFAULT 0,
        credit_bonus_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
        credit_bonus_cny NUMERIC(14, 2) NOT NULL DEFAULT 0,
        friend_bonus_cny NUMERIC(14, 2) NOT NULL DEFAULT 0,
        reward_type TEXT NOT NULL DEFAULT 'recharge_commission',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        settled_at TIMESTAMPTZ
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_order ON referral_rewards(order_id) WHERE order_id <> '';
      CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);

      CREATE TABLE IF NOT EXISTS referral_withdrawals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount_cny NUMERIC(14, 2) NOT NULL,
        withdraw_method TEXT NOT NULL DEFAULT 'alipay',
        account TEXT NOT NULL DEFAULT '',
        real_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        remark TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        reviewed_by TEXT DEFAULT '',
        paid_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_user ON referral_withdrawals(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_status ON referral_withdrawals(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS commission_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        amount_cny NUMERIC(14, 2) NOT NULL DEFAULT 0,
        before_amount_cny NUMERIC(14, 2) NOT NULL DEFAULT 0,
        after_amount_cny NUMERIC(14, 2) NOT NULL DEFAULT 0,
        related_id TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_commission_transactions_user ON commission_transactions(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS model_products_config (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_group_configs (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS upstream_models (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT '',
        upstream_channel TEXT NOT NULL DEFAULT '',
        actual_model_id TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL DEFAULT '',
        is_detected BOOLEAN NOT NULL DEFAULT true,
        last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_upstream_models_actual ON upstream_models(actual_model_id);
      CREATE INDEX IF NOT EXISTS idx_upstream_models_provider ON upstream_models(provider);

      CREATE TABLE IF NOT EXISTS title_rules (
        id SERIAL PRIMARY KEY,
        rule_key TEXT NOT NULL UNIQUE,
        name_template TEXT NOT NULL,
        description_template TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_type TEXT NOT NULL DEFAULT 'count',
        rank_enabled BOOLEAN NOT NULL DEFAULT true,
        percentile_enabled BOOLEAN NOT NULL DEFAULT true,
        top_rank_limit INTEGER NOT NULL DEFAULT 10,
        percentile_thresholds JSONB NOT NULL DEFAULT '[1,5,10]'::jsonb,
        level TEXT NOT NULL DEFAULT 'platinum',
        icon TEXT DEFAULT '',
        color TEXT DEFAULT '',
        animation_enabled BOOLEAN NOT NULL DEFAULT true,
        highlight_enabled BOOLEAN NOT NULL DEFAULT true,
        category TEXT NOT NULL DEFAULT 'asset',
        enabled BOOLEAN NOT NULL DEFAULT true,
        sort_priority INTEGER NOT NULL DEFAULT 50,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_titles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        title_key TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        level TEXT NOT NULL,
        description TEXT DEFAULT '',
        rank INTEGER,
        percentile INTEGER,
        metric_key TEXT NOT NULL,
        metric_value NUMERIC(20, 6) NOT NULL DEFAULT 0,
        metric_unit TEXT NOT NULL DEFAULT '次',
        category TEXT NOT NULL DEFAULT 'asset',
        animated BOOLEAN NOT NULL DEFAULT false,
        highlight BOOLEAN NOT NULL DEFAULT false,
        display_priority INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, title_key)
      );

      CREATE TABLE IF NOT EXISTS title_metric_snapshots (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_title_state (
        user_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
        stale BOOLEAN NOT NULL DEFAULT true,
        stale_reason TEXT DEFAULT '',
        recalculated_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_title_rules_metric ON title_rules(metric_key, enabled);
      CREATE INDEX IF NOT EXISTS idx_user_titles_user_priority ON user_titles(user_id, display_priority DESC);
      CREATE INDEX IF NOT EXISTS idx_title_metric_snapshots_user_created ON title_metric_snapshots(user_id, created_at DESC);

      ${shouldSeedAdmin ? `
      INSERT INTO customers
        (id, name, phone, company, email, password_hash, my_invite_code, balance, total_spend, role, email_verified)
      VALUES
        ('cus_admin', 'xiaoyijie', '', 'FlowAPI', 'xiaoyijie@flowapi.fun', '$2b$12$1QEMn00KY..kutbvO3MFtOyo3uaxEldqBV4bx1g9S3p4Y9H/uBCxa', '0001', 9999, 0, 'admin', true)
      ON CONFLICT (id) DO NOTHING;

      UPDATE customers
      SET role = 'admin'
      WHERE id = 'cus_admin' OR lower(email) = 'xiaoyijie@flowapi.fun';
      ` : ""}

      ${shouldSeedAdminApiKey ? `
      INSERT INTO api_keys
        (id, customer_id, token, label)
      VALUES
        ('key_admin', 'cus_admin', '${initialKey.startsWith("sk-") ? initialKey : `sk-admin-${Date.now().toString(36)}`}', '管理员 API Key')
      ON CONFLICT (id) DO NOTHING;
      ` : ""}
    `);
  }
  await initPromise;
}
