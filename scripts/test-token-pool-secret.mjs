import assert from "assert/strict";
import { decryptTokenSecret, encryptTokenSecret } from "../lib/team-token-pool.js";

const secret = "sk-test-token-pool-secret";
const encrypted = encryptTokenSecret(secret);

assert.ok(encrypted.tokenCiphertext, "ciphertext should exist");
assert.ok(encrypted.tokenIv, "iv should exist");
assert.ok(encrypted.tokenAuthTag, "auth tag should exist");
assert.equal(encrypted.tokenPreview, secret, "preview should keep the plain token for admin checks");

const decryptedFromEncrypted = decryptTokenSecret(encrypted);
const decryptedFromRow = decryptTokenSecret({
  tokenCiphertext: encrypted.tokenCiphertext,
  tokenIv: encrypted.tokenIv,
  tokenAuthTag: encrypted.tokenAuthTag,
});

assert.equal(decryptedFromEncrypted, secret, "encrypted record should decrypt back to the original token");
assert.equal(decryptedFromRow, secret, "database row shape should decrypt back to the original token");

console.log(JSON.stringify({
  ok: true,
  secretLength: secret.length,
  decrypted: decryptedFromRow,
}));
