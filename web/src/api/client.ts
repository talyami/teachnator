import { ApiErrorResponse } from '@fast-learning/shared';

const API_BASE = '/fast-learning/api';

export class ClientError extends Error {
  public code: string;
  public status: number;
  public resetsAt?: string;
  public details?: unknown;

  constructor(options: {
    code: string;
    message: string;
    status: number;
    resetsAt?: string;
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'ClientError';
    this.code = options.code;
    this.status = options.status;
    this.resetsAt = options.resetsAt;
    this.details = options.details;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const defaultHeaders: Record<string, string> = {
    'Accept': 'application/json'
  };

  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    if (isJson) {
      const errData: ApiErrorResponse = await res.json();
      if (errData.error) {
        throw new ClientError({
          code: errData.error.code,
          message: errData.error.message,
          status: res.status,
          resetsAt: errData.error.resetsAt,
          details: errData.error.details
        });
      }
    }
    const text = await res.text();
    throw new ClientError({
      code: `HTTP_${res.status}`,
      message: text || `Request failed with status ${res.status}`,
      status: res.status
    });
  }

  if (isJson) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body)
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body)
    }),

  del: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'DELETE' })
};
