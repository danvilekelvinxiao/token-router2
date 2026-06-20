import { listApiGroups, publicApiGroup } from "@/lib/api-groups";
import { listModelProductsWithConfig } from "@/lib/model-products-server";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const [groupsResult, models] = await Promise.all([
      listApiGroups({ includeUnavailable: false }).catch(() => []),
      listModelProductsWithConfig({ includeUnavailable: true }).catch(() => []),
    ]);
    const groups = Array.isArray(groupsResult) ? groupsResult : [];
    return res.status(200).json({
      ok: true,
      groups: groups.map((group) => publicApiGroup(group, models)),
    });
  } catch (error) {
    console.error("[api/groups/available]", error);
    return res.status(200).json({ ok: true, groups: [] });
  }
}
