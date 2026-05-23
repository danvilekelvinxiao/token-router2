/* Proxy to new-api admin panel. Only accessible to admin users. */
import { requireAdmin } from "@/lib/admin-auth";

const NEW_API_BASE = process.env.NEW_API_BASE_URL || "http://localhost:3001";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  const { path } = req.query;
  const targetPath = Array.isArray(path) ? path.join("/") : path || "";

  // construct upstream URL
  const upstreamUrl = `${NEW_API_BASE}/${targetPath}${req.url.includes("?") ? "?" + req.url.split("?")[1] : ""}`;

  // forward headers, preserving content-type
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (["host", "connection", "content-length"].includes(k.toLowerCase())) continue;
    headers[k] = v;
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
    });

    const contentType = upstreamRes.headers.get("content-type") || "";
    const text = await upstreamRes.text();

    res.status(upstreamRes.status);
    if (contentType.includes("json")) {
      res.setHeader("Content-Type", "application/json");
    } else if (contentType.includes("text/html")) {
      res.setHeader("Content-Type", "text/html");
    }
    return res.send(text);
  } catch (error) {
    return res.status(502).json({ error: "Admin proxy error" });
  }
}
