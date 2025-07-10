import createHttpError from 'http-errors';

type Properties = Record<string, unknown>;

export class HttpError extends Error {
  status: number;
  statusCode: number;
  expose: boolean;
  [key: string]: unknown;

  constructor(err: HttpError) {
    super(err.message);
    this.name = err.name || 'HttpError';
    this.status = err.status;
    this.statusCode = err.statusCode;
    this.expose = err.expose;
    // Copy all other properties
    Object.assign(this, err);
  }
}

export class NotFoundException extends HttpError {
  constructor(message: string = 'Not Found', properties: Properties = {}) {
    super(createHttpError(404, message, properties));
    this.name = 'NotFoundException';
  }
}

export class UnauthorizedException extends HttpError {
  constructor(message: string = 'Unauthorized', properties: Properties = {}) {
    super(createHttpError(401, message, properties));
    this.name = 'UnauthorizedException';
  }
}
