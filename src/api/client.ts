import { getToken } from '@/utils/storage';
import { API_BASE_URL } from '@/api/api.config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Record<string, string[]>,
    public readonly raw?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestBody = string | FormData | Record<string, unknown> | null | undefined;

type RequestOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

function buildUrl(endpoint: string, params?: RequestOptions['params']): string {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    if (!response.ok) {
      throw new ApiError(response.status, 'Empty response from server');
    }
    return {} as T;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(response.status, 'Invalid JSON response', undefined, text);
  }

  if (!response.ok) {
    const errorData = json as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    throw new ApiError(
      response.status,
      errorData.message || 'Request failed',
      errorData.errors,
      text
    );
  }

  return json as T;
}

function prepareBody(body: RequestBody): { body: BodyInit | null | undefined; headers: Record<string, string> } {
  const isFormData = body instanceof FormData;
  const isStringBody = typeof body === 'string';

  const headers: Record<string, string> = {};

  let requestBody: BodyInit | null | undefined = body as BodyInit | null | undefined;
  if (body != null && !isFormData) {
    if (!isStringBody && typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    } else if (isStringBody) {
      headers['Content-Type'] = 'application/json';
    }
  }

  if (isFormData) {
    // Don't set Content-Type for FormData - browser sets it with boundary
  }

  return { body: requestBody, headers };
}

const apiClient = {
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const token = getToken();
    const { params, signal, headers: customHeaders, body, ...rest } = options;

    const { body: requestBody, headers: bodyHeaders } = prepareBody(body as RequestBody);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...bodyHeaders,
      ...(customHeaders as Record<string, string> || {}),
    };

    const response = await fetch(buildUrl(endpoint, params), {
      ...rest,
      headers,
      body: requestBody,
      signal,
    });

    return parseResponse<T>(response);
  },

  get<T>(endpoint: string, params?: RequestOptions['params'], signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', params, signal });
  },

  post<T>(endpoint: string, body?: unknown, params?: RequestOptions['params']): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body, params });
  },

  patch<T>(endpoint: string, body?: unknown, params?: RequestOptions['params']): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body, params });
  },

  put<T>(endpoint: string, body?: unknown, params?: RequestOptions['params']): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body, params });
  },

  delete<T>(endpoint: string, params?: RequestOptions['params']): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', params });
  },
};

export default apiClient;