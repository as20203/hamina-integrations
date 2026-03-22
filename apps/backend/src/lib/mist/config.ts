const getRequiredEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getMistConfig = () => {
  const siteId = process.env.MIST_SITE_ID?.trim();
  return {
    apiKey: getRequiredEnv("MIST_API_KEY"),
    baseUrl: (process.env.MIST_API_BASE_URL || "https://api.mist.com").replace(/\/$/, ""),
    orgId: getRequiredEnv("MIST_ORG_ID"),
    /** Optional dev default; production site-scoped calls use `siteId` from the request path. */
    siteId: siteId && siteId.length > 0 ? siteId : undefined,
  };
};

/**
 * WebSocket base for Mist streaming API.
 * Juniper docs: REST is `api.mist.com`, WebSocket is `api-ws.mist.com` (regional hosts follow the same pattern).
 * Override with `MIST_WS_BASE_URL` (e.g. `wss://api-ws.eu.mist.com`) if your org uses another region.
 */
const getMistWsBaseUrl = (): string => {
  const override = process.env.MIST_WS_BASE_URL?.trim();
  if (override) {
    return override.replace(/\/$/, "");
  }
  const { baseUrl } = getMistConfig();
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return baseUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  }
  const wsHost = /^api\./i.test(host) ? host.replace(/^api\./i, "api-ws.") : host;
  const proto = baseUrl.startsWith("https") ? "wss:" : "ws:";
  return `${proto}//${wsHost}`;
};

export { getMistConfig, getMistWsBaseUrl };
