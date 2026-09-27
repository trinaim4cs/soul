import { z } from 'npm:zod@4';

import { HttpError } from './http.ts';

/** Parses a JSON body against a schema; rejects anything unexpected. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError('invalid_request', 'Expected a JSON body.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError('invalid_request', 'The request was not valid.');
  }
  return result.data;
}
