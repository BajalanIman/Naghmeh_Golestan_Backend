const allowedLanguages = ["DE", "EN", "FA"];

export function validateSubscribeInput(req, res, next) {
  const { email, firstName, language } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({
      success: false,
      message: "Email is required.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message: "Email format is invalid.",
    });
  }

  if (
    firstName !== undefined &&
    (typeof firstName !== "string" || firstName.trim().length > 100)
  ) {
    return res.status(400).json({
      success: false,
      message: "First name is invalid.",
    });
  }

  if (language !== undefined && !allowedLanguages.includes(language)) {
    return res.status(400).json({
      success: false,
      message: "Language must be DE, EN, or FA.",
    });
  }

  req.body.email = normalizedEmail;

  if (typeof firstName === "string") {
    req.body.firstName = firstName.trim();
  }

  next();
}
