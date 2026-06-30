#!/usr/bin/env node
/**
 * 校验 FlowAPI 当前运行的部署信息是否与期望 commit / branch 一致。
 *
 * 用法:
 *   node scripts/verify-flowapi-deploy.mjs [expectedCommit] [expectedBranch] [localBaseUrl] [publicBaseUrl]
 */
import { execFileSync } from "child_process";

const [
  ,
  ,
  commitArg = process.env.FLOWAPI_EXPECT_COMMIT || "",
  branchArg = process.env.FLOWAPI_EXPECT_BRANCH || "",
  localBaseArg = process.env.FLOWAPI_LOCAL_BASE_URL || "http://127.0.0.1:3000",
  publicBaseArg = process.env.FLOWAPI_PUBLIC_BASE_URL || "https://flowapi.fun",
] = process.argv;

const maxAttempts = Number(process.env.FLOWAPI_DEPLOY_VERIFY_ATTEMPTS || 12);
const retryDelayMs = Number(process.env.FLOWAPI_DEPLOY_VERIFY_DELAY_MS || 1000);

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

function normalizeBaseUrl(value, fallback) {
  return String(value || fallback).replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 200)}`);
  }
  return { response, payload };
}

function deployMismatch(payload, expectedCommit, expectedBranch) {
  const deploy = payload?.deploy || {};
  if (!payload?.ok) return `payload.ok is not true`;
  if (deploy.commit !== expectedCommit) {
    return `commit mismatch: expected ${expectedCommit}, got ${deploy.commit || "(empty)"}`;
  }
  if (expectedBranch && deploy.branch !== expectedBranch) {
    return `branch mismatch: expected ${expectedBranch}, got ${deploy.branch || "(empty)"}`;
  }
  return "";
}

function healthMismatch(payload, expectedShortCommit) {
  if (!payload?.ok) return `payload.ok is not true`;
  if (payload.database !== "ok") {
    return `database is ${payload.database || "(empty)"}`;
  }
  if (payload.upstream !== "ok") {
    return `upstream is ${payload.upstream || "(empty)"}`;
  }
  if ((payload?.deploy?.shortCommit || "") !== expectedShortCommit) {
    return `shortCommit mismatch: expected ${expectedShortCommit}, got ${payload?.deploy?.shortCommit || "(empty)"}`;
  }
  return "";
}

async function waitForPayload(label, url, validate) {
  let lastError = new Error(`${label} did not pass validation`);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { response, payload } = await fetchJson(url);
      const mismatch = validate(payload, response);
      if (!mismatch) {
        return payload;
      }
      lastError = new Error(`${label} attempt ${attempt}/${maxAttempts}: ${mismatch}`);
    } catch (error) {
      lastError = new Error(`${label} attempt ${attempt}/${maxAttempts}: ${error.message}`);
    }

    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}

const expectedCommit = String(commitArg || gitValue(["rev-parse", "HEAD"]))
  .trim();
const expectedBranch = String(branchArg || gitValue(["branch", "--show-current"]))
  .trim();
const expectedShortCommit = expectedCommit ? expectedCommit.slice(0, 12) : "";
const localBase = normalizeBaseUrl(localBaseArg, "http://127.0.0.1:3000");
const publicBase = normalizeBaseUrl(publicBaseArg, "https://flowapi.fun");

if (!expectedCommit) {
  console.error("缺少 expected commit。请传入 commit 参数或设置 FLOWAPI_EXPECT_COMMIT。");
  process.exit(1);
}

const localDeploy = await waitForPayload(
  "local deploy-info",
  `${localBase}/api/deploy-info`,
  (payload) => deployMismatch(payload, expectedCommit, expectedBranch),
);
const publicDeploy = await waitForPayload(
  "public deploy-info",
  `${publicBase}/api/deploy-info`,
  (payload) => deployMismatch(payload, expectedCommit, expectedBranch),
);
const publicHealth = await waitForPayload(
  "public health",
  `${publicBase}/api/health`,
  (payload) => healthMismatch(payload, expectedShortCommit),
);

console.log("== local deploy-info ==");
console.log(JSON.stringify(localDeploy));
console.log();
console.log("== public deploy-info ==");
console.log(JSON.stringify(publicDeploy));
console.log();
console.log("== public health ==");
console.log(JSON.stringify(publicHealth));
