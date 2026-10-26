export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, details);
export const notFound = (msg = 'Not found') => new AppError(404, msg);
export const conflict = (msg) => new AppError(409, msg);
