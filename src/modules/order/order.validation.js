const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateOrderQuote(req, res, next) {
  const { activityId, quantity } = req.body;

  if (!activityId || typeof activityId !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid activityId is required.",
    });
  }

  const normalizedQuantity = Number(quantity);

  if (
    !Number.isInteger(normalizedQuantity) ||
    normalizedQuantity < 1 ||
    normalizedQuantity > 5
  ) {
    return res.status(400).json({
      success: false,
      message: "Quantity must be an integer between 1 and 5.",
    });
  }

  req.body.activityId = activityId.trim();
  req.body.quantity = normalizedQuantity;

  next();
}

export function validateCreateOrder(req, res, next) {
  const {
    activityId,
    sessionIds,
    quantity,
    email,
    firstName,
    lastName,
    phone,
  } = req.body;

  if (!activityId || typeof activityId !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid activityId is required.",
    });
  }

  const normalizedQuantity = Number(quantity);

  if (
    !Number.isInteger(normalizedQuantity) ||
    normalizedQuantity < 1 ||
    normalizedQuantity > 5
  ) {
    return res.status(400).json({
      success: false,
      message: "Quantity must be an integer between 1 and 5.",
    });
  }

  if (sessionIds !== undefined && !Array.isArray(sessionIds)) {
    return res.status(400).json({
      success: false,
      message: "sessionIds must be an array.",
    });
  }

  if (
    Array.isArray(sessionIds) &&
    sessionIds.some((sessionId) => !sessionId || typeof sessionId !== "string")
  ) {
    return res.status(400).json({
      success: false,
      message: "Every session ID must be a valid string.",
    });
  }

  /*
    این اطلاعات برای Guest لازم‌اند.
    اگر User وارد شده باشد Backend از حساب او استفاده می‌کند.
  */
  if (email !== undefined && email !== null) {
    if (
      typeof email !== "string" ||
      !emailPattern.test(email.trim().toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }
  }

  if (
    firstName !== undefined &&
    firstName !== null &&
    (typeof firstName !== "string" || firstName.trim().length < 2)
  ) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid first name.",
    });
  }

  if (
    lastName !== undefined &&
    lastName !== null &&
    typeof lastName !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Last name is invalid.",
    });
  }

  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    return res.status(400).json({
      success: false,
      message: "Phone number is invalid.",
    });
  }

  req.body.activityId = activityId.trim();
  req.body.quantity = normalizedQuantity;

  req.body.sessionIds = Array.isArray(sessionIds)
    ? [...new Set(sessionIds.map((id) => id.trim()))]
    : [];

  req.body.email =
    typeof email === "string" ? email.trim().toLowerCase() : null;

  req.body.firstName = typeof firstName === "string" ? firstName.trim() : null;

  req.body.lastName = typeof lastName === "string" ? lastName.trim() : null;

  req.body.phone = typeof phone === "string" ? phone.trim() : null;

  next();
}

export function validateOrderId(req, res, next) {
  const { id } = req.params;

  if (!id || typeof id !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid order ID is required.",
    });
  }

  req.params.id = id.trim();

  next();
}
