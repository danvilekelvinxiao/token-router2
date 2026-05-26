/**
 * POST /api/admin/deploy
 * Triggers git pull + npm install + npm build + pm2 restart
 * Requires admin secret in header or body.
 */
import { execSync } from "child_process";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "flowapi-admin-2024";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token =
    req.headers["x-admin-secret"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.body?.secret ||
    "";

  if (token !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Invalid admin secret" });
  }

  const logs = [];

  try {
    logs.push("[1/4] git pull...");
    const gitOut = execSync("git fetch origin feat/new-api && git reset --hard origin/feat/new-api", {
      cwd: "/var/www/flowapi",
      timeout: 30000,
      encoding: "utf8",
    });
    logs.push(gitOut.trim());

    logs.push("[2/4] npm install...");
    execSync("npm install --omit=dev", {
      cwd: "/var/www/flowapi",
      timeout: 60000,
      encoding: "utf8",
    });

    logs.push("[3/4] npm build...");
    execSync("npm run build", {
      cwd: "/var/www/flowapi",
      timeout: 180000,
      encoding: "utf8",
    });

    logs.push("[4/4] pm2 restart...");
    execSync("pm2 restart flowapi --update-env", {
      timeout: 15000,
      encoding: "utf8",
    });

    return res.status(200).json({
      ok: true,
      message: "Deploy completed successfully",
      branch: "feat/new-api",
      logs: logs.join("\n"),
    });
  } catch (e) {
    logs.push(`ERROR: ${e.message}`);
    return res.status(500).json({
      ok: false,
      error: e.message,
      logs: logs.join("\n"),
    });
  }
}
