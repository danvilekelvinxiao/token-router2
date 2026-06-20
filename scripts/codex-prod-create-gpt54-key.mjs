import fs from 'node:fs';
function loadEnv(file) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv('.env.production');
const email = `codex-prod-${Date.now()}@flowapi.fun`;
const password = 'FlowapiSmoke123!';
const { registerCustomer, verifyCustomerEmail, createApiKey } = await import('../lib/customer-store.js');
const { listModelProductsWithConfig } = await import('../lib/model-products-server.js');
const reg = await registerCustomer({ email, password });
if (reg.error) throw new Error(reg.error);
const verified = await verifyCustomerEmail(email);
const models = await listModelProductsWithConfig({ includeUnavailable: true });
const model = models.find((m) => m.publicModelId === 'flowapi-gpt54' || m.id === 'flowapi-gpt54');
if (!model) throw new Error('gpt54 model not found');
const key = await createApiKey(verified.id, `Smoke ${model.publicModelId}`, null, model, { usagePurpose: 'smoke-test' });
console.log(JSON.stringify({ email, customerId: verified.id, model: { id: model.id, publicModelId: model.publicModelId, displayName: model.displayName, actualModelId: model.actualModelId }, apiKey: key.token }, null, 2));
