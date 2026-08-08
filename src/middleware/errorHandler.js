export function errorHandler(error, req, res, next) {
  console.error(error);

  if (error.code === "P2002" && error.meta?.target) {
    return res.status(409).json({
      success: false,
      message: "A record with this information already exists.",
    });
  }

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Internal server error.",
  });
}
