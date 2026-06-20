require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { loadConfig } = require("./config");
const { createSensitiveProxy } = require("./proxy");

function buildApp(config = loadConfig()) {
  const app = express();
  app.set("trust proxy", true);

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan("tiny"));

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/readyz", (_req, res) => {
    res.status(200).json({
      ok: true,
      upstream: config.upstreamBaseUrl,
      filterEnabled: Boolean(config.sensitiveFilterEnabled),
    });
  });

  app.get("/__upstream_health", async (_req, res) => {
    try {
      const target = `${config.upstreamBaseUrl.replace(/\/+$/, "")}${config.upstreamHealthPath.startsWith("/") ? config.upstreamHealthPath : `/${config.upstreamHealthPath}`}`;
      const upstream = await fetch(target, { method: "GET", headers: { accept: "application/json" } });
      res.status(upstream.ok ? 200 : 502).json({
        ok: upstream.ok,
        upstream: config.upstreamBaseUrl,
        status: upstream.status,
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        upstream: config.upstreamBaseUrl,
        error: error.message,
      });
    }
  });

  app.use(createSensitiveProxy(config));

  app.use((req, res) => {
    res.status(404).json({ error: "Not Found", path: req.path });
  });

  return app;
}

function startServer(config = loadConfig()) {
  const app = buildApp(config);
  const port = Number(config.port || 8787);
  return app.listen(port, () => {
    console.log(`[sensitive-proxy] listening on ${port}, upstream=${config.upstreamBaseUrl}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { buildApp, startServer };
