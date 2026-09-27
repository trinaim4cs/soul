// Shared HTTP helpers for SOUL Edge Functions. Errors never leak internals.

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_request'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  invalid_request: 400,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: { code: error.code, message: error.message } }, STATUS[error.code]);
  }
  // Log the failure without payloads (SECURITY_MODEL section 10).
  console.error('unhandled_error', error instanceof Error ? error.name : typeof error);
  return json({ error: { code: 'internal', message: 'Something went wrong.' } }, 500);
}

/** Wraps a handler so every thrown error becomes a safe JSON envelope. */
export function handler(
  fn: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await fn(req);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
