import type { ErrorCode, ErrorResponse } from '@sitecheck/shared';

/**
 * Errors that services throw for broken business rules. Each carries the HTTP
 * status it maps to, and app.ts turns any of them into `{ message, code? }`
 * with that status, so route handlers do not need their own try/catch.
 */
export abstract class DomainError extends Error {
  abstract readonly statusCode: 400 | 404 | 409;
  /** Set when a client may need to tell this error apart from others with the same status. */
  readonly code?: ErrorCode;
}

/** The record named in the URL does not exist. */
export class NotFoundError extends DomainError {
  readonly statusCode = 404;
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = 'NotFoundError';
  }
}

/** The request is valid but clashes with the current state (duplicate, still in use, ...). */
export class ConflictError extends DomainError {
  readonly statusCode = 409;
  constructor(
    message: string,
    override readonly code: ErrorCode,
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** The body points at another record (e.g. siteId) that does not exist. */
export class InvalidReferenceError extends DomainError {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReferenceError';
  }
}

/** The response body for a domain error: its message, plus its code if it has one. */
export function toErrorResponse(error: DomainError): ErrorResponse {
  return error.code ? { message: error.message, code: error.code } : { message: error.message };
}
