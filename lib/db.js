import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const useSsl = process.env.DATABASE_SSL === "false" ? false : connectionString.includes("sslmode=require");
const initialKey = process.env.PROXY_ACCESS_TOKEN || "sk-default";

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

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        new_api_token_id TEXT DEFAULT '',
        new_api_sync_status TEXT DEFAULT '',
        new_api_synced_at TIMESTAMPTZ,
        label TEXT NOT NULL DEFAULT 'API 密匙',
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

      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
        customer TEXT DEFAULT '',
        endpoint TEXT DEFAULT '',
        requested_model TEXT DEFAULT '',
        routed_model TEXT DEFAULT '',
        provider TEXT DEFAULT '',
        status INTEGER DEFAULT 0,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        tokens INTEGER DEFAULT 0,
        cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

      CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
      CREATE INDEX IF NOT EXISTS idx_activation_codes_status ON activation_codes(status);

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

      INSERT INTO customers
        (id, name, phone, company, email, password_hash, my_invite_code, balance, total_spend, role, email_verified)
      VALUES
        ('cus_admin', 'xiaoyijie', '', 'FlowAPI', 'xiaoyijie@flowapi.fun', '$2b$12$1QEMn00KY..kutbvO3MFtOyo3uaxEldqBV4bx1g9S3p4Y9H/uBCxa', '0001', 9999, 0, 'admin', true)
      ON CONFLICT (id) DO NOTHING;

      UPDATE customers
      SET role = 'admin'
      WHERE id = 'cus_admin' OR lower(email) = 'xiaoyijie@flowapi.fun';

      INSERT INTO api_keys
        (id, customer_id, token, label)
      VALUES
        ('key_admin', 'cus_admin', '${initialKey.startsWith("sk-") ? initialKey : `sk-admin-${Date.now().toString(36)}`}', '管理员 API 密匙')
      ON CONFLICT (id) DO NOTHING;
    `);
  }
  await initPromise;
}
