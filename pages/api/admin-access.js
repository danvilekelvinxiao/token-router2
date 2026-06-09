import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  return res.status(200).json({
    ok: true,
    customer: {
      id: admin.customer?.id || "",
      email: admin.customer?.email || "",
      role: admin.customer?.role || "admin",
      isAdmin: true,
    },
  });
}
