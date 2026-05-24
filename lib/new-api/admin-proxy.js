const NEW_API_BASE = process.env.NEW_API_BASE_URL || "http://localhost:3001";

function buildQuery(req) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value != null) {
      params.append(key, value);
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function buildBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.body == null || req.body === "") return undefined;
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) return req.body;
  return JSON.stringify(req.body);
}

export async function proxyNewApiAdmin(req, res, resource) {
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : "";
  const suffix = path ? `/${path}` : "";
  const target = `${NEW_API_BASE.replace(/\/+$/, "")}/api/${resource}${suffix}${buildQuery(req)}`;

  const headers = {};
  for (const name of ["authorization", "content-type", "cookie", "x-requested-with"]) {
    const value = req.headers[name];
    if (value) headers[name] = value;
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: buildBody(req),
    });

    const contentType = upstream.headers.get("content-type") || "";
    res.status(upstream.status);
    if (contentType) res.setHeader("Content-Type", contentType);

    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) res.setHeader("Set-Cookie", setCookie);

    const location = upstream.headers.get("location");
    if (location) res.setHeader("Location", location);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    return res.status(502).json({
      error: "New API 管理接口暂时不可用",
      detail: error?.message || String(error),
    });
  }
}
