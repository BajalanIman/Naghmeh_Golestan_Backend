import {
  createDonationCheckout,
  getDonationCheckoutStatus,
  getUserDonation,
  listUserDonations,
} from "./donation.service.js";

export async function createDonationCheckoutController(req, res, next) {
  res.set("Cache-Control", "no-store");
  try {
    const result = await createDonationCheckout({
      ...req.body,
      user: req.user,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode)
      return res
        .status(error.statusCode)
        .json({ success: false, message: error.message, code: error.code });
    next(error);
  }
}
export async function donationCheckoutStatusController(req, res, next) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  try {
    const donation = await getDonationCheckoutStatus({
      sessionId: req.params.sessionId,
    });
    return res.json({ success: true, donation });
  } catch (error) {
    next(error);
  }
}
export async function myDonationsController(req, res, next) {
  res.set("Cache-Control", "no-store");
  try {
    // A query parameter must never override the authenticated user ID.
    const result = await listUserDonations({
      ...req.query,
      userId: req.user.id,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}
export async function donationDetailsController(req, res, next) {
  res.set("Cache-Control", "no-store");
  try {
    const donation = await getUserDonation({
      userId: req.user.id,
      donationId: req.params.id,
    });
    return res.json({ success: true, donation });
  } catch (error) {
    next(error);
  }
}
