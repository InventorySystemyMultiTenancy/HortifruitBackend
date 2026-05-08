import { ApiError } from "../utils/apiError.js";

export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      throw new ApiError(
        result.error.issues.map((issue) => issue.message).join(", "),
        422,
      );
    }

    req.validated = result.data;
    next();
  };
}
