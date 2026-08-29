export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiEnvelope<T> {
  data: T;
}

export function ok<T>(data: T): ApiEnvelope<T> {
  return { data };
}

export function errorBody(error: {
  code: string;
  message: string;
  details?: unknown;
}): ApiErrorBody {
  return { error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) } };
}
