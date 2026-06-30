import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

function safeRead(filePath = "") {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function parseEnvFile(filePath = "") {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const content = safeRead(filePath);
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key) return;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  });
  return env;
}

function envFileValue(keys = []) {
  const envFiles = [
    ".env.production.local",
    ".env.local",
    ".env.production",
    ".env",
  ];

  for (const envFile of envFiles) {
    const values = parseEnvFile(path.join(process.cwd(), envFile));
    for (const key of keys) {
      if (values[key]) {
        return values[key];
      }
    }
  }

  return "";
}

function gitValue(args = []) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1200,
    }).trim();
  } catch {
    return "";
  }
}

export function getDeployInfo() {
  const buildId = safeRead(path.join(process.cwd(), ".next", "BUILD_ID"));
  const preferEnvFiles = (process.env.NODE_ENV || "") === "production";
  const fileCommit = preferEnvFiles ? envFileValue(["FLOWAPI_DEPLOY_COMMIT", "VERCEL_GIT_COMMIT_SHA", "GITHUB_SHA"]) : "";
  const fileBranch = preferEnvFiles ? envFileValue(["FLOWAPI_DEPLOY_BRANCH", "VERCEL_GIT_COMMIT_REF"]) : "";
  const commit =
    fileCommit ||
    process.env.FLOWAPI_DEPLOY_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    gitValue(["rev-parse", "HEAD"]);
  const branch =
    fileBranch ||
    process.env.FLOWAPI_DEPLOY_BRANCH ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    gitValue(["branch", "--show-current"]);
  const shortCommit = commit ? commit.slice(0, 12) : "";

  return {
    commit,
    shortCommit,
    branch,
    buildId,
    nodeEnv: process.env.NODE_ENV || "",
    configured: {
      database: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL),
      newApiBaseUrl: Boolean(process.env.NEW_API_BASE_URL),
      newApiRuntimeKey: Boolean(process.env.NEW_API_KEY || process.env.NEW_API_KEY_ALL_MODELS),
      newApiAdminToken: Boolean(process.env.NEW_API_ADMIN_TOKEN),
      aicardsBaseUrl: Boolean(process.env.AICARDS_API_BASE_URL || process.env.AICARDS_BASE_URL || process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL),
      aicardsApiKey: Boolean(process.env.AICARDS_API_KEY || process.env.SUB2API_API_KEY),
      openrouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    },
    time: new Date().toISOString(),
  };
}
