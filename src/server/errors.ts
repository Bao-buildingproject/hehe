/** Error with an HTTP status and a message that is safe to show to the user (Vietnamese). */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = "error",
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Không tìm thấy dữ liệu") => new AppError(404, what, "not_found");
export const badRequest = (message: string) => new AppError(400, message, "bad_request");
export const unauthorized = () => new AppError(401, "Bạn cần đăng nhập để tiếp tục", "unauthorized");
export const forbidden = (message = "Yêu cầu không hợp lệ") => new AppError(403, message, "forbidden");
export const conflict = (message: string) => new AppError(409, message, "conflict");
export const tooMany = (retryAfter: number) =>
  new AppError(429, `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfter} giây.`, "rate_limited", {
    "Retry-After": String(retryAfter),
  });
