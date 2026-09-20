const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateCreateDonationCheckout(req, res, next) {
  const reject = (message) => res.status(400).json({ success: false, message });
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body))
    return reject("Invalid request body.");
  const {
    amount,
    donorName,
    donorEmail,
    message,
    anonymous,
    currency,
    language,
    requestId,
  } = body;
  if (
    !["string", "number"].includes(typeof amount) ||
    !/^\d+(\.\d{1,2})?$/.test(String(amount))
  ) {
    return reject("Enter an amount with at most two decimal places.");
  }
  const numericAmount = Number(amount);
  if (
    !Number.isFinite(numericAmount) ||
    numericAmount < 1 ||
    numericAmount > 10000
  ) {
    return reject("The donation amount must be between 1 and 10,000 EUR.");
  }
  for (const [name, value, max] of [
    ["Donor name", donorName, 150],
    ["Email", donorEmail, 254],
    ["Message", message, 2000],
  ]) {
    if (
      value != null &&
      (typeof value !== "string" || value.trim().length > max)
    )
      return reject(`${name} is invalid or too long.`);
  }
  const email = (donorEmail?.trim() || req.user?.email || "").toLowerCase();
  if (!emailPattern.test(email) || email.length > 254)
    return reject("A valid email address is required.");
  if (anonymous !== undefined && typeof anonymous !== "boolean")
    return reject("anonymous must be a boolean.");
  if (
    currency !== undefined &&
    (typeof currency !== "string" || currency.trim().toUpperCase() !== "EUR")
  )
    return reject("Only EUR is supported.");
  if (
    language !== undefined &&
    (typeof language !== "string" ||
      !["EN", "DE", "FA"].includes(language.toUpperCase()))
  )
    return reject("Invalid language.");
  if (typeof requestId !== "string" || !uuidPattern.test(requestId))
    return reject("A UUID v4 requestId is required.");
  req.body = {
    amount: numericAmount,
    currency: "EUR",
    donorName: donorName?.trim() || null,
    donorEmail: email,
    message: message?.trim() || null,
    anonymous: anonymous ?? false,
    language: language?.toUpperCase() || "EN",
    requestId: requestId.toLowerCase(),
  };
  next();
}

export function validateDonationSessionId(req, res, next) {
  if (
    typeof req.params.sessionId !== "string" ||
    !/^cs_(test_|live_)?[A-Za-z0-9]{10,250}$/.test(req.params.sessionId)
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Checkout Session ID." });
  }
  next();
}

export function validateDonationId(req, res, next) {
  if (
    typeof req.params.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(req.params.id)
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid donation ID." });
  }
  next();
}
