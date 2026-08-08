const allowedIntervals = ["MONTHLY", "YEARLY"];

export function validateCheckout(req, res, next) {
  const { billingInterval } = req.body;

  if (!billingInterval || !allowedIntervals.includes(billingInterval)) {
    return res.status(400).json({
      success: false,
      message: "Billing interval must be MONTHLY or YEARLY.",
    });
  }

  next();
}
