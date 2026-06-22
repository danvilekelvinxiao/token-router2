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
    sub2api: "sub2api",
    newApi: "New API",
    backup: "备用通道",
    uniapi: "UniAPI",
    openrouter: "OpenRouter",
  },
};

