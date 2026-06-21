export const DEFAULT_ROUTE_POLICY = {
  enabled: true,
  fallbackOrder: ["sub2api", "newApi", "backup", "uniapi", "openrouter"],
  tierEnabled: {
    sub2api: true,
    newApi: true,
    backup: true,
    uniapi: true,
    openrouter: true,
  },
  tierLabels: {
    sub2api: "Sub2API 自有号池",
    newApi: "New API 正式实例",
    backup: "其他商业中转站",
    uniapi: "UniAPI",
    openrouter: "OpenRouter",
  },
};
