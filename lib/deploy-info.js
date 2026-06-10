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

export function getDeployInfo() {
  const buildId = safeRead(path.join(process.cwd(), ".next", "BUILD_ID"));
  const commit =
    process.env.FLOWAPI_DEPLOY_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    gitValue(["rev-parse", "HEAD"]);
  const branch =
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
      aicardsBaseUrl: Boolean(process.env.AICARDS_API_BASE_URL || process.env.AICARDS_BASE_URL),
      aicardsApiKey: Boolean(process.env.AICARDS_API_KEY),
      openrouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    },
    time: new Date().toISOString(),
  };
}

export function getPublicDeployInfo() {
  const info = getDeployInfo();
  return {
    shortCommit: info.shortCommit,
    buildId: info.buildId,
    nodeEnv: info.nodeEnv,
    time: info.time,
  };
}
