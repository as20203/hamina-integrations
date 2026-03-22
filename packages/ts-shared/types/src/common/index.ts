// Common utility types
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  meta?: PaginationMeta;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

// Generic utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Function return type utilities
export type AsyncReturnType<T extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<T>>;
export type SyncReturnType<T extends (...args: never[]) => unknown> = ReturnType<T>;