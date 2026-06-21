import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const exts = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findIndexedFile(dirPath) {
  for (const ext of exts) {
    const candidate = path.join(dirPath, `index${ext}`);
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

function resolveLocalCandidate(basePath) {
  if (fileExists(basePath)) return basePath;
  if (path.extname(basePath)) return null;
  for (const ext of exts) {
    const candidate = `${basePath}${ext}`;
    if (fileExists(candidate)) return candidate;
  }
  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    return findIndexedFile(basePath);
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const candidate = resolveLocalCandidate(path.join(repoRoot, specifier.slice(2)));
    if (candidate) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }

  if (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
    const parentPath = context.parentURL?.startsWith("file:")
      ? new URL(context.parentURL).pathname
      : repoRoot;
    const basePath = specifier.startsWith("/")
      ? specifier
      : path.resolve(path.dirname(parentPath), specifier);
    const candidate = resolveLocalCandidate(basePath);
    if (candidate) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
