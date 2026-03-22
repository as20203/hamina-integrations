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

export { getMistConfig };
