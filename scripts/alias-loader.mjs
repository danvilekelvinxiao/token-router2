import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveLocalAlias(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const target = specifier.slice(2);
  const candidates = [
    path.join(repoRoot, target),
    path.join(repoRoot, `${target}.js`),
    path.join(repoRoot, `${target}.mjs`),
    path.join(repoRoot, `${target}.cjs`),
    path.join(repoRoot, target, "index.js"),
    path.join(repoRoot, target, "index.mjs"),
    path.join(repoRoot, target, "index.cjs"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const resolved = resolveLocalAlias(specifier);
  if (resolved) {
    return { url: resolved, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
