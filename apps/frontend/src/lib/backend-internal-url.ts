/**
 * Base URL for server-side BFF → Express calls.
 * - In Docker: set `BACKEND_INTERNAL_URL=http://backend:4000`
 * - Local dev (no Docker): defaults to localhost so `fetch` from Next.js Node process works
 */
export const getBackendInternalBaseUrl = (): string => {
  return (
    process.env.BACKEND_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://127.0.0.1:4000"
  );
};
