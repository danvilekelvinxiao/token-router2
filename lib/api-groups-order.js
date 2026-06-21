export function getApiGroupTier(group = {}) {
  const id = String(group.id || group.name || "").trim().toLowerCase();
  const name = String(group.name || group.displayName || "").trim().toLowerCase();
  const strategy = String(group.channelStrategy || "").trim().toLowerCase();
  const newApiGroup = String(group.newApiGroup || "").trim().toLowerCase();
  const baseUrl = String(group.baseUrl || group.base_url || "").trim().toLowerCase();
  const haystack = `${id} ${name} ${strategy} ${newApiGroup} ${baseUrl}`;

  const isDefault =
    id === "default" ||
    id === "sub2api" ||
    strategy === "sub2api" ||
    newApiGroup === "default" ||
    newApiGroup === "sub2api" ||
    haystack.includes("sub2api");
  if (isDefault) return 0;

  const isAicards =
    id === "official" ||
    id === "aicards" ||
    strategy === "backup_1" ||
    strategy === "backup_2" ||
    newApiGroup === "aicards" ||
    newApiGroup === "backup-2" ||
    haystack.includes("aicards.shop") ||
    haystack.includes("aheapi") ||
    haystack.includes("备用1") ||
    haystack.includes("备用2");
  if (isAicards) return 1;

  const isUniApi =
    id === "uniapi" ||
    strategy === "uniapi" ||
    newApiGroup === "uniapi" ||
    haystack.includes("uniapi") ||
    haystack.includes("uni api") ||
    haystack.includes("uni-api");
  if (isUniApi) return 2;

  const isOpenRouter =
    id === "bridge" ||
    id === "openrouter" ||
    strategy === "backup_3" ||
    newApiGroup === "openrouter" ||
    haystack.includes("openrouter") ||
    haystack.includes("备用3");
  if (isOpenRouter) return 3;

  return 2;
}

export function compareApiGroups(a = {}, b = {}) {
  const tierA = getApiGroupTier(a);
  const tierB = getApiGroupTier(b);
  if (tierA !== tierB) return tierA - tierB;
  if (Number(a.sortOrder || 0) !== Number(b.sortOrder || 0)) return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  if (Boolean(a.recommended) !== Boolean(b.recommended)) return a.recommended ? -1 : 1;
  if (Boolean(a.available) !== Boolean(b.available)) return a.available ? -1 : 1;
  return String(a.displayName || a.name || "").localeCompare(String(b.displayName || b.name || ""), "zh-CN");
}

export function sortApiGroups(groups = []) {
  return [...groups].sort(compareApiGroups);
}
