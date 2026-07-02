#!/usr/bin/env node
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { outDir: "", envFile: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--out") {
      args.outDir = argv[++i] || "";
      continue;
    }
    if (value === "--env-file") {
      args.envFile = argv[++i] || "";
      continue;
    }
  }
  return args;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function mask(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 4)}****${text.slice(-4)}`;
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

const args = parseArgs(process.argv);
const defaultOutDir = path.join(repoRoot, "backups", `pre-online-test-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "-")}`);
const outDir = path.resolve(args.outDir || defaultOutDir);
const envFile = args.envFile ? path.resolve(args.envFile) : "";

if (envFile) loadEnvFile(envFile);
loadEnvFile(path.join(repoRoot, ".env.production"));
loadEnvFile(path.join(repoRoot, ".env.local"));

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const useSsl = process.env.DATABASE_SSL === "false" ? false : connectionString.includes("sslmode=require");

if (!connectionString) {
  console.error("DATABASE_URL / POSTGRES_URL 未配置，无法备份数据库。");
  process.exit(1);
}

ensureDir(outDir);
ensureDir(path.join(outDir, "db"));
ensureDir(path.join(outDir, "files"));

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 8000,
  statement_timeout: 20000,
  idleTimeoutMillis: 10000,
  max: 2,
});

const fileCandidates = [
  ".env.production",
  ".env.local",
  ".env.example",
  "data/content-cms.json",
  "data/user-announcement-reads.json",
  "package.json",
  "next.config.mjs",
  "README.md",
  "docs/admin-access.md",
  "docs/new-api-setup.md",
];

try {
  const tablesResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  const tables = tablesResult.rows.map((row) => row.table_name);
  const summary = {
    generatedAt: new Date().toISOString(),
    connection: {
      databaseUrlPreview: mask(process.env.DATABASE_URL || process.env.POSTGRES_URL || ""),
      hasSsl: useSsl,
    },
    tableCount: tables.length,
    tables: [],
    files: [],
  };

  for (const table of tables) {
    const rowsResult = await pool.query(`SELECT * FROM ${quoteIdent(table)}`);
    const rows = rowsResult.rows;
    const fileName = `${table}.json`;
    writeJson(path.join(outDir, "db", fileName), rows);
    summary.tables.push({ table, rows: rows.length, file: path.join("db", fileName) });
  }

  for (const relativePath of fileCandidates) {
    const source = path.join(repoRoot, relativePath);
    if (!fs.existsSync(source)) continue;
    const target = path.join(outDir, "files", relativePath.replaceAll("/", "__"));
    ensureDir(path.dirname(target));
    fs.copyFileSync(source, target);
    summary.files.push({ source: relativePath, target: path.relative(outDir, target) });
  }

  const adminRows = await pool.query(
    `SELECT id, name, email, role, status, balance, total_spend, created_at
     FROM customers
     WHERE role = 'admin' AND deleted_at IS NULL
     ORDER BY created_at ASC`
  );
  writeJson(path.join(outDir, "admin-accounts.json"), adminRows.rows);
  summary.adminAccounts = adminRows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    balance: row.balance,
    totalSpend: row.total_spend,
  }));

  writeJson(path.join(outDir, "backup-manifest.json"), summary);
  console.log(JSON.stringify({
    ok: true,
    outDir,
    tables: tables.length,
    adminAccounts: adminRows.rows.length,
    files: summary.files.length,
  }, null, 2));
} catch (error) {
  console.error("[backup] failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
