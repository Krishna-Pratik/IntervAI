/**
 * Zod validation middleware. `validate.body/query/params(schema)` parses
 * the given request part and attaches it to `req.validated`; on failure
 * it stashes the ZodError on `req.validationError` and continues — pair
 * with `handleValidationErrors` downstream to turn that into a 400.
 */

import { type NextFunction, type Request, type Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';

interface ValidatedRequestParts {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

type AuthedValidatedRequest = Request & {
  validated?: ValidatedRequestParts;
  validationError?: ZodError;
};

function createValidator(source: 'body' | 'query' | 'params', schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req[source]);

      const typedReq = req as AuthedValidatedRequest;
      if (!result.success) {
        typedReq.validationError = result.error;
        return next();
      }

      typedReq.validated = {
        ...(typedReq.validated ?? {}),
        [source]: result.data,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace validate {
  /** Validate req.body against a Zod schema */
  export const body = (schema: ZodTypeAny) => createValidator('body', schema);
  /** Validate req.query against a Zod schema */
  export const query = (schema: ZodTypeAny) => createValidator('query', schema);
  /** Validate req.params against a Zod schema */
  export const params = (schema: ZodTypeAny) => createValidator('params', schema);
}

/** Converts a stashed `req.validationError` into a 400. */
export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const validationError = (req as AuthedValidatedRequest).validationError;
  if (validationError) {
    res.status(400).json({
      error: 'Validation Error',
      issues: validationError.issues,
    });
    return;
  }
  next();
}
