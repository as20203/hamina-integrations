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

type MistFetchMetaResult<T> = { data: T; headers: Headers };

const mistFetchWithMeta = async <T>(
  path: string,
  query?: Record<string, string | undefined>,
  attempt = 1
): Promise<MistFetchMetaResult<T>> => {
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
    const data = (await response.json()) as T;
    return { data, headers: response.headers };
  }

  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await sleep(250 * attempt);
    return mistFetchWithMeta<T>(path, query, attempt + 1);
  }

  const body = await response.text().catch(() => "");
  throw new Error(`Mist API request failed (${response.status}): ${body || response.statusText}`);
};

const readPaginationMeta = (headers: Headers, page: number, limit: number): { total: number; page: number; limit: number } => {
  const read = (names: string[]): number => {
    for (const name of names) {
      const raw = headers.get(name) ?? headers.get(name.toLowerCase());
      if (raw != null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          return n;
        }
      }
    }
    return NaN;
  };

  const total = read(["X-Page-Total", "X-Total-Count"]);
  const headerPage = read(["X-Page-Page"]);
  const headerLimit = read(["X-Page-Limit"]);

  return {
    total: Number.isFinite(total) ? total : 0,
    page: Number.isFinite(headerPage) ? headerPage : page,
    limit: Number.isFinite(headerLimit) ? headerLimit : limit,
  };
};

export { mistFetch, mistFetchWithMeta, readPaginationMeta };
export type { MistFetchMetaResult };
