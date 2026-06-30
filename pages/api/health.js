import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { hasDatabase, query } from "@/lib/db";
import { checkUpstreamHealth } from "@/lib/upstream";

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

function getRuntimeDeployInfo() {
  const buildId = safeRead(path.join(process.cwd(), ".next", "BUILD_ID"));
  const nodeEnv = process.env.NODE_ENV || "";
  const gitCommit = gitValue(["rev-parse", "HEAD"]);
  const gitBranch = gitValue(["branch", "--show-current"]);
  const preferEnvFiles = nodeEnv === "production" && !gitCommit;
  const fileCommit = preferEnvFiles ? envFileValue(["FLOWAPI_DEPLOY_COMMIT", "VERCEL_GIT_COMMIT_SHA", "GITHUB_SHA"]) : "";
  const fileBranch = preferEnvFiles ? envFileValue(["FLOWAPI_DEPLOY_BRANCH", "VERCEL_GIT_COMMIT_REF"]) : "";
  const commit =
    gitCommit ||
    fileCommit ||
    process.env.FLOWAPI_DEPLOY_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    "";
  const branch =
    gitBranch ||
    fileBranch ||
    process.env.FLOWAPI_DEPLOY_BRANCH ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    "";

  return {
    commit,
    shortCommit: commit ? commit.slice(0, 12) : "",
    branch,
    buildId,
    nodeEnv,
  };
}

export default async function handler(req, res) {
  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requireDatabase = process.env.FLOWAPI_REQUIRE_DATABASE === "false"
    ? false
    : process.env.FLOWAPI_REQUIRE_DATABASE === "true" || process.env.NODE_ENV === "production";
  let database = "disabled";

  if (hasDatabase()) {
    try {
      await query("SELECT 1");
      database = "ok";
    } catch {
      database = "error";
    }
  } else if (requireDatabase) {
    database = "required_missing";
  }

  const upstream = await checkUpstreamHealth({ timeoutMs: 4000 });

  const ok = database === "ok" || (!requireDatabase && database === "disabled")
    ? upstream.ok
    : false;

  const deploy = getRuntimeDeployInfo();
  return res.status(ok ? 200 : 500).json({
    ok,
    service: "flowapi",
    database,
    upstream: upstream.ok ? "ok" : "degraded",
    deploy: {
      shortCommit: deploy.shortCommit,
      buildId: deploy.buildId,
    },
    time: new Date().toISOString(),
  });
}
