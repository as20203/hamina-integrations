const getRequiredEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getMistConfig = () => {
  return {
    apiKey: getRequiredEnv("MIST_API_KEY"),
    baseUrl: (process.env.MIST_API_BASE_URL || "https://api.mist.com").replace(/\/$/, ""),
    orgId: getRequiredEnv("MIST_ORG_ID"),
    siteId: getRequiredEnv("MIST_SITE_ID"),
  };
};

export { getMistConfig };
