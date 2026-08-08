const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const allowedCurrencies = ["EUR"];

function hasMaximumTwoDecimals(value) {
  const valueAsString = String(value);

  if (!valueAsString.includes(".")) {
    return true;
  }

  return valueAsString.split(".")[1].length <= 2;
}

export function validateCreateDonationCheckout(req, res, next) {
  const { donorName, donorEmail, anonymous, amount, currency, message } =
    req.body;

  const numericAmount = Number(amount);

  if (amount === undefined || amount === null || Number.isNaN(numericAmount)) {
    return res.status(400).json({
      success: false,
      message: "A valid donation amount is required.",
    });
  }

  if (numericAmount < 1) {
    return res.status(400).json({
      success: false,
      message: "The minimum donation amount is 1 EUR.",
    });
  }

  if (numericAmount > 10000) {
    return res.status(400).json({
      success: false,
      message: "The maximum online donation amount is 10,000 EUR.",
    });
  }

  if (!hasMaximumTwoDecimals(amount)) {
    return res.status(400).json({
      success: false,
      message: "The donation amount may contain at most two decimal places.",
    });
  }

  if (anonymous !== undefined && typeof anonymous !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "anonymous must be true or false.",
    });
  }

  if (
    donorName !== undefined &&
    donorName !== null &&
    typeof donorName !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Donor name is invalid.",
    });
  }

  if (donorName?.trim().length > 150) {
    return res.status(400).json({
      success: false,
      message: "Donor name is too long.",
    });
  }

  if (
    donorEmail !== undefined &&
    donorEmail !== null &&
    typeof donorEmail !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Donor email is invalid.",
    });
  }

  if (donorEmail && !emailPattern.test(donorEmail.trim().toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address.",
    });
  }

  const normalizedCurrency = (currency || "EUR").trim().toUpperCase();

  if (!allowedCurrencies.includes(normalizedCurrency)) {
    return res.status(400).json({
      success: false,
      message: "Only EUR donations are currently supported.",
    });
  }

  if (
    message !== undefined &&
    message !== null &&
    typeof message !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Donation message is invalid.",
    });
  }

  if (message?.trim().length > 2000) {
    return res.status(400).json({
      success: false,
      message: "Donation message may contain at most 2,000 characters.",
    });
  }

  req.body.amount = numericAmount;
  req.body.currency = normalizedCurrency;
  req.body.anonymous = Boolean(anonymous);
  req.body.donorName = donorName?.trim() || null;
  req.body.donorEmail = donorEmail?.trim().toLowerCase() || null;
  req.body.message = message?.trim() || null;

  next();
}

export function validateDonationId(req, res, next) {
  const { id } = req.params;

  if (!id || typeof id !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid donation ID is required.",
    });
  }

  req.params.id = id.trim();

  next();
}

export function validateDonationSessionId(req, res, next) {
  const { sessionId } = req.params;

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

  req.params.sessionId = sessionId.trim();

  next();
}
