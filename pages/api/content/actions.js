import { sendContentResponse } from "@/lib/content-api-response";

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return sendContentResponse(req, res, "actions", "actions");
}
