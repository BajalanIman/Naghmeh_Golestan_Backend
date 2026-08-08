const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignUp(req, res, next) {
  const { email, password, firstName, lastName, phone } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({
      success: false,
      message: "Email is required.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!emailPattern.test(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address.",
    });
  }

  if (!password || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      message: "Password is required.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must contain at least 8 characters.",
    });
  }

  if (password.length > 128) {
    return res.status(400).json({
      success: false,
      message: "Password is too long.",
    });
  }

  if (!firstName || typeof firstName !== "string") {
    return res.status(400).json({
      success: false,
      message: "First name is required.",
    });
  }

  if (!lastName || typeof lastName !== "string") {
    return res.status(400).json({
      success: false,
      message: "Last name is required.",
    });
  }

  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();

  if (normalizedFirstName.length < 2) {
    return res.status(400).json({
      success: false,
      message: "First name must contain at least 2 characters.",
    });
  }

  if (normalizedLastName.length < 2) {
    return res.status(400).json({
      success: false,
      message: "Last name must contain at least 2 characters.",
    });
  }

  if (normalizedFirstName.length > 100) {
    return res.status(400).json({
      success: false,
      message: "First name is too long.",
    });
  }

  if (normalizedLastName.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Last name is too long.",
    });
  }

  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    return res.status(400).json({
      success: false,
      message: "Phone number is invalid.",
    });
  }

  if (phone?.trim().length > 30) {
    return res.status(400).json({
      success: false,
      message: "Phone number is too long.",
    });
  }

  req.body.email = normalizedEmail;
  req.body.firstName = normalizedFirstName;
  req.body.lastName = normalizedLastName;
  req.body.phone = phone?.trim() || null;

  next();
}

export function validateLogin(req, res, next) {
  const { email, password } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({
      success: false,
      message: "Email is required.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!emailPattern.test(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address.",
    });
  }

  if (!password || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      message: "Password is required.",
    });
  }

  req.body.email = normalizedEmail;

  next();
}
