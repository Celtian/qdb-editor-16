import type { AppError, Result } from '../../shared/downloader/contracts.js';

export class ApplicationError extends Error {
  constructor(
    readonly appError: AppError,
    options?: ErrorOptions,
  ) {
    super(appError.message, options);
  }
}

export const success = <T>(value: T): Result<T> => ({ ok: true, value });

export const toFailure = (error: unknown): { ok: false; error: AppError } => {
  if (error instanceof ApplicationError) return { ok: false, error: error.appError };
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
  return { ok: false, error: { code: 'DATABASE', message, details: String(error) } };
};

export const wrap = async <T>(operation: () => T | Promise<T>): Promise<Result<T>> => {
  try {
    return success(await operation());
  } catch (error) {
    return toFailure(error);
  }
};
