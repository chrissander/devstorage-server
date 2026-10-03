export class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class StorageConflict extends Error {}

export function fail(statusCode, code, message, details) {
  throw new ApiError(statusCode, code, message, details);
}

export function unavailable() {
  return new ApiError(503, 'STORAGE_UNAVAILABLE', 'Storage ist nicht verfügbar oder enthält ungültige Daten.');
}

export function conflict() {
  return new ApiError(409, 'WRITE_CONFLICT', 'Gleichzeitige Änderung; bitte erneut versuchen.');
}
