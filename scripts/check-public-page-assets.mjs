#!/usr/bin/env node

const [, , baseArg = "https://flowapi.fun", ...pageArgs] = process.argv;

const baseUrl = String(baseArg).replace(/\/+$/, "");
const pagePaths = pageArgs.length ? pageArgs : ["/admin/model-market"];

function absoluteUrl(path) {
  if (!path) return baseUrl;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function request(url, method = "GET") {
  return fetch(url, {
    method,
    redirect: "follow",
    headers: {
      "user-agent": "flowapi-asset-check/1.0",
    },
  }).then(async (response) => ({
    ok: response.ok,
    status: response.status,
    body: method === "HEAD" ? "" : await response.text(),
    headers: Object.fromEntries(response.headers.entries()),
    url,
  }));
}

function extractAssets(html) {
  return [...String(html || "").matchAll(/<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => value.includes("/_next/"))
    .map(absoluteUrl);
}

async function checkPage(pagePath) {
  const pageUrl = absoluteUrl(pagePath);
  const page = await request(pageUrl, "GET");
  if (!page.ok) {
    return {
      pagePath,
      ok: false,
      reason: `页面返回 ${page.status}`,
      failures: [{ url: pageUrl, status: page.status }],
    };
  }

  const assets = extractAssets(page.body);
  const failures = [];
  for (const assetUrl of assets) {
    const asset = await request(assetUrl, "GET");
    if (!asset.ok) failures.push({ url: assetUrl, status: asset.status });
  }

  return {
    pagePath,
    ok: failures.length === 0,
    reason: failures.length === 0 ? `检查通过，共 ${assets.length} 个静态资源可访问` : `${failures.length} 个静态资源无法访问`,
    failures,
  };
}

let failed = false;
for (const pagePath of pagePaths) {
  const result = await checkPage(pagePath);
  if (!result.ok) failed = true;
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.pagePath} ${result.reason}`);
  for (const failure of result.failures) {
    console.log(`  - ${failure.status} ${failure.url}`);
  }
}

if (failed) process.exit(1);
