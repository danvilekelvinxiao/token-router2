import bcrypt from "bcryptjs";

const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$"];
const BCRYPT_ROUNDS = Number(process.env.PASSWORD_HASH_ROUNDS || 12);

export function isBcryptHash(value = "") {
  return BCRYPT_PREFIXES.some((prefix) => String(value || "").startsWith(prefix));
}

export async function hashPassword(password = "") {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

export async function verifyPassword(password = "", stored = "") {
  const saved = String(stored || "");
  if (!saved) return { ok: false, needsRehash: false };
  if (isBcryptHash(saved)) {
    return { ok: await bcrypt.compare(String(password), saved), needsRehash: false };
  }
  return { ok: saved === String(password), needsRehash: saved === String(password) };
}
