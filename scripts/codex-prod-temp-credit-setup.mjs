import fs from "node:fs";

function loadEnv(file) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(".env.production");

const { registerCustomer, verifyCustomerEmail, createApiKey, grantTemporaryCredit } = await import("../lib/customer-store.js");
const { listModelProductsWithConfig } = await import("../lib/model-products-server.js");
const { query } = await import("../lib/db.js");

const email = `codex-temp-http-${Date.now()}@flowapi.fun`;
const password = "FlowapiSmoke123!";
const reg = await registerCustomer({ email, password });
if (reg.error) throw new Error(reg.error);
const verified = await verifyCustomerEmail(email);
if (!verified?.id) throw new Error("verify failed");

await query("UPDATE customers SET balance = 10 WHERE id = $1", [verified.id]);
await query("DELETE FROM temporary_credits WHERE customer_id = $1", [verified.id]);
await query("DELETE FROM wallet_transactions WHERE user_id = $1", [verified.id]);
await query("DELETE FROM calls WHERE customer_id = $1", [verified.id]);

const tempGrant = await grantTemporaryCredit(verified.id, {
  amount: 0.1,
  reason: "codex_smoke_temp_credit",
  detail: "Codex smoke temp credit",
});

const models = await listModelProductsWithConfig({ includeUnavailable: false });
const model = models.find((item) => item.publicModelId === "gpt-5.5") || models.find((item) => item.publicModelId === "gpt-4o-mini") || models.find((item) => item.publicModelId === "deepseek-chat") || models[0];
if (!model) throw new Error("no available model");

const key = await createApiKey(verified.id, "Temp HTTP Smoke Key", null, model, { usagePurpose: "smoke-test" });
const before = await query("SELECT COUNT(*)::int AS c FROM wallet_transactions WHERE user_id = $1", [verified.id]);

console.log(JSON.stringify({
  email,
  customerId: verified.id,
  balance: (await query("SELECT balance FROM customers WHERE id = $1 LIMIT 1", [verified.id])).rows[0]?.balance,
  tempGrant,
  model: {
    id: model.id,
    displayName: model.displayName,
    publicModelId: model.publicModelId,
    actualModelId: model.actualModelId,
  },
  apiKey: key.token,
  before: before.rows[0]?.c,
}, null, 2));
