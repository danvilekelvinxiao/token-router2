export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
  });
}
