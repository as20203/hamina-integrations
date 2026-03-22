import { getMistConfig } from "./config.js";

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const withQuery = (path: string, query?: Record<string, string | undefined>) => {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const q = params.toString();
  return q ? `${path}?${q}` : path;
};

const mistFetch = async <T>(
  path: string,
  query?: Record<string, string | undefined>,
  attempt = 1
): Promise<T> => {
  const { apiKey, baseUrl } = getMistConfig();
  const url = `${baseUrl}${withQuery(path, query)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (response.ok) {
    return (await response.json()) as T;
  }

  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await sleep(250 * attempt);
    return mistFetch<T>(path, query, attempt + 1);
  }

  const body = await response.text().catch(() => "");
  throw new Error(`Mist API request failed (${response.status}): ${body || response.statusText}`);
};

export { mistFetch };
