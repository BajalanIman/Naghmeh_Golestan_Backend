export function validateCreateCheckout(req, res, next) {
  const { orderId, guestAccessToken } = req.body;

  if (!orderId || typeof orderId !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid orderId is required.",
    });
  }

  if (
    guestAccessToken !== undefined &&
    guestAccessToken !== null &&
    typeof guestAccessToken !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Guest access token is invalid.",
    });
  }

  if (
    typeof guestAccessToken === "string" &&
    guestAccessToken.trim().length < 32
  ) {
    return res.status(400).json({
      success: false,
      message: "Guest access token is invalid.",
    });
  }

  req.body.orderId = orderId.trim();

  req.body.guestAccessToken =
    typeof guestAccessToken === "string" ? guestAccessToken.trim() : null;

  next();
}

export function validateCheckoutSessionId(req, res, next) {
  const { sessionId } = req.params;
  const { guestAccessToken } = req.query;

  if (
    !sessionId ||
    typeof sessionId !== "string" ||
    !sessionId.startsWith("cs_")
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid Stripe Checkout Session ID is required.",
    });
  }

  if (
    guestAccessToken !== undefined &&
    guestAccessToken !== null &&
    typeof guestAccessToken !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Guest access token is invalid.",
    });
  }

  if (
    typeof guestAccessToken === "string" &&
    guestAccessToken.trim().length < 32
  ) {
    return res.status(400).json({
      success: false,
      message: "Guest access token is invalid.",
    });
  }

  req.params.sessionId = sessionId.trim();

  req.query.guestAccessToken =
    typeof guestAccessToken === "string" ? guestAccessToken.trim() : null;

  next();
}
