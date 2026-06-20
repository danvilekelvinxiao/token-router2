#!/usr/bin/env node

const path = require("node:path");
const fs = require("node:fs");
const dns = require("node:dns");

const shimPath = path.resolve(__dirname, "./semver-default-shim.cjs");
const nodeOptions = process.env.NODE_OPTIONS || "";
if (!nodeOptions.includes(shimPath)) {
  process.env.NODE_OPTIONS = `${nodeOptions} --require=${shimPath}`.trim();
}

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    if (!key) continue;
    if (process.env[key] !== undefined && String(process.env[key]).trim() !== "") continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, "../.env.production"));
loadEnvFile(path.resolve(__dirname, "../.env.local"));

process.on("unhandledRejection", (reason) => {
  console.error(reason && reason.stack ? reason.stack : reason);
});
process.on("uncaughtException", (error) => {
  console.error(error && error.stack ? error.stack : error);
});

require("./semver-default-shim.cjs");

const nextBin = path.resolve(__dirname, "../node_modules/next/dist/bin/next");
process.argv[1] = nextBin;
require(nextBin);
