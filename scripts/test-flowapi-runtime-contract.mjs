import { promises as fs } from "fs";
import path from "path";
import assert from "assert/strict";

const baseUrl = process.env.FLOWAPI_PUBLIC_BASE_URL || process.env.INTERNAL_FLOWAPI_BASE_URL || "http://127.0.0.1:3000";
const appDir = process.cwd();

async function getText(url) {
  const res = await fetch(url);
  const text = await res.text();
  return { res, text };
}

async function main() {
  const dashboard = await getText(`${baseUrl}/dashboard`);
  assert.equal(dashboard.res.status, 200, "dashboard should respond 200");
  assert.match(dashboard.text, /模型使用可视化看板/, "dashboard should include model usage dashboard");
  assert.match(dashboard.text, /AI Token 资产总览/, "dashboard should still include the existing asset overview");

  const profile = await getText(`${baseUrl}/profile`);
  assert.equal(profile.res.status, 200, "profile should respond 200");
  assert.match(profile.text, /加载中/, "profile should render its loading shell before client hydration");
  const profileSource = await fs.readFile(path.join(appDir, "pages", "profile.js"), "utf8");
  assert.match(profileSource, /profile-model-usage-shell/, "profile source should contain the model usage mount point");
  assert.match(profileSource, /title="我的模型使用画像"/, "profile source should include the personal model usage title");
  assert.match(profileSource, /subtitle="Personal Model Profile"/, "profile source should include the personal model usage subtitle");

  const tmpDir = path.join(appDir, "public", "generated-images");
  await fs.mkdir(tmpDir, { recursive: true });
  const tempFile = path.join(tmpDir, "__codex_runtime_contract.png");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+g5kAAAAASUVORK5CYII=",
    "base64"
  );
  await fs.writeFile(tempFile, png);

  try {
    const head = await fetch(`${baseUrl}/api/images/generated/__codex_runtime_contract.png`, { method: "HEAD" });
    assert.equal(head.status, 200, "generated image HEAD should respond 200");
    assert.match(head.headers.get("cache-control") || "", /max-age=300/, "generated image cache should be short-lived");

    const image = await fetch(`${baseUrl}/api/images/generated/__codex_runtime_contract.png`);
    assert.equal(image.status, 200, "generated image GET should respond 200");
    assert.equal(image.headers.get("content-type"), "image/png", "generated image content type should be image/png");

    const bad = await fetch(`${baseUrl}/api/images/generated/__codex_runtime_contract.png`, { method: "POST" });
    assert.equal(bad.status, 405, "generated image POST should be rejected");
    assert.equal(bad.headers.get("allow"), "GET, HEAD", "generated image route should advertise GET and HEAD only");
  } finally {
    await fs.rm(tempFile, { force: true });
  }

  const deployScript = await fs.readFile(path.join(appDir, "scripts", "deploy-production-prebuilt.sh"), "utf8");
  assert.match(deployScript, /pm2 start npm --name flowapi --cwd "\$APP_DIR" -- start -- -p 3000/, "prebuilt deploy should use npm start");

  const verifyScript = await fs.readFile(path.join(appDir, "scripts", "workbench-aicards-production-verify.sh"), "utf8");
  assert.match(verifyScript, /pm2 start npm --name flowapi --cwd "\$APP_DIR" -- start -- -p "\$PORT"/, "verify script should use npm start");

  console.log("flowapi runtime contract ok");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
