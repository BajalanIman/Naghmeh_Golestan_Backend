import {
  createDonationCheckout,
  getDonationCheckoutStatus,
  getUserDonation,
  listUserDonations,
} from "./donation.service.js";

export async function createDonationCheckoutController(req, res, next) {
  try {
    const result = await createDonationCheckout({
      user: req.user,
      donorName: req.body.donorName,
      donorEmail: req.body.donorEmail,
      anonymous: req.body.anonymous,
      amount: req.body.amount,
      currency: req.body.currency,
      message: req.body.message,
    });

    return res.status(201).json({
      success: true,
      message: "Donation checkout created successfully.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function donationCheckoutStatusController(req, res, next) {
  try {
    const donation = await getDonationCheckoutStatus({
      sessionId: req.params.sessionId,
      userId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      donation,
    });
  } catch (error) {
    next(error);
  }
}

export async function myDonationsController(req, res, next) {
  try {
    const result = await listUserDonations({
      userId: req.user.id,
      ...req.query,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function donationDetailsController(req, res, next) {
  try {
    const donation = await getUserDonation({
      userId: req.user.id,
      donationId: req.params.id,
    });

    return res.status(200).json({
      success: true,
      donation,
    });
  } catch (error) {
    next(error);
  }
}
