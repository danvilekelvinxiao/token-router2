import fs from 'node:fs';
import { findCustomerByToken, getCustomer } from '../lib/customer-store.js';

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

const token = process.argv[2];
loadEnv('.env.production');
const match = await findCustomerByToken(token);
const customer = match?.customer ? await getCustomer(match.customer.id) : null;
console.log(JSON.stringify({ found: !!match, keyId: match?.apiKey?.id, customerId: match?.customer?.id, email: match?.customer?.email, customerKeys: customer?.apiKeys?.length || 0, apiKeyModel: match?.apiKey?.publicModelId, apiKeyLabel: match?.apiKey?.label }, null, 2));
