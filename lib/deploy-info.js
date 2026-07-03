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

function envFileValue(keys = []) {
  const envPaths = [".env.production", ".env.local", ".env"];
  for (const envPath of envPaths) {
    const content = safeRead(path.join(process.cwd(), envPath));
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    for (const key of keys) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith(`${key}=`)) continue;
        let value = trimmed.slice(key.length + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (value) return value;
      }
    }
  }
  return "";
}

export function getDeployInfo() {
  const buildId = safeRead(path.join(process.cwd(), ".next", "BUILD_ID"));
  const gitCommit = gitValue(["rev-parse", "HEAD"]);
  const gitBranch = gitValue(["branch", "--show-current"]);
  const commit =
    gitCommit ||
    envFileValue(["FLOWAPI_DEPLOY_COMMIT", "VERCEL_GIT_COMMIT_SHA", "GITHUB_SHA"]) ||
    process.env.FLOWAPI_DEPLOY_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    "";
  const branch =
    gitBranch ||
    envFileValue(["FLOWAPI_DEPLOY_BRANCH", "VERCEL_GIT_COMMIT_REF"]) ||
    process.env.FLOWAPI_DEPLOY_BRANCH ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    "";
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
      newApiAdminToken: Boolean(
        process.env.NEW_API_ADMIN_TOKEN ||
        process.env.NEW_API_ADMIN_ACCOUNT ||
        process.env.NEW_API_ADMIN_USERNAME ||
        process.env.NEW_API_ADMIN_EMAIL
      ),
      aicardsBaseUrl: Boolean(process.env.AICARDS_API_BASE_URL || process.env.AICARDS_BASE_URL),
      aicardsApiKey: Boolean(process.env.AICARDS_API_KEY),
      openrouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    },
    time: new Date().toISOString(),
  };
}
