import type { Page } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const text = await response.text();
  const requestId = response.headers.get('X-Request-Id') ?? undefined;
  let data: T & { message?: string | string[] };
  try {
    data = text
      ? (JSON.parse(text) as T & { message?: string | string[] })
      : ({} as T & { message?: string | string[] });
  } catch {
    throw new ApiError(response.statusText || 'Response was not JSON', response.status, requestId);
  }
  if (!response.ok) {
    const message = Array.isArray((data as { message?: string | string[] }).message)
      ? (data as { message: string[] }).message.join(', ')
      : (data as { message?: string }).message || response.statusText;
    // Only server faults get the ID on screen: it is what an admin searches the logs for.
    const shown = response.status >= 500 && requestId ? `${message} (Request ID: ${requestId})` : message;
    throw new ApiError(shown, response.status, requestId);
  }
  return data;
}

/** The API caps a page at 200 rows; follow nextPageToken so a list is never cut short. */
export async function apiAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  let token = '';
  do {
    const page = await api<Page<T>>(
      `${path}${sep}pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`,
    );
    items.push(...page.items);
    token = page.nextPageToken;
  } while (token);
  return items;
}

export function apiOrigin(): string {
  const url =
    typeof window === 'undefined'
      ? process.env.API_INTERNAL_URL
      : process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      'API_INTERNAL_URL and NEXT_PUBLIC_API_URL must be set in apps/web/.env',
    );
  }
  return url;
}
