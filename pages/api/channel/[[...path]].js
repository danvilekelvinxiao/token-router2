import { proxyNewApiAdmin } from "@/lib/new-api/admin-proxy";

export default function handler(req, res) {
  return proxyNewApiAdmin(req, res, "channel");
}
