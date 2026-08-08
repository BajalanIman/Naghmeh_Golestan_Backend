const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCreateRegistration(req, res, next) {
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
      message: "Quantity must be between 1 and 5.",
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
    sessionIds.some((id) => !id || typeof id !== "string")
  ) {
    return res.status(400).json({
      success: false,
      message: "Every sessionId must be a valid string.",
    });
  }

  /*
      Guest validation
    */

  if (email !== undefined && email !== null) {
    if (typeof email !== "string" || !emailPattern.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Invalid email.",
      });
    }
  }

  req.body.activityId = activityId.trim();

  req.body.quantity = normalizedQuantity;

  req.body.sessionIds = Array.isArray(sessionIds)
    ? [...new Set(sessionIds.map((x) => x.trim()))]
    : [];

  req.body.email = email?.trim().toLowerCase() || null;

  req.body.firstName = firstName?.trim() || null;

  req.body.lastName = lastName?.trim() || null;

  req.body.phone = phone?.trim() || null;

  next();
}

export function validateRegistrationId(req, res, next) {
  if (!req.params.id) {
    return res.status(400).json({
      success: false,
      message: "Registration ID is required.",
    });
  }

  next();
}
