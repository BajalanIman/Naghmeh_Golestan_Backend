import {
  cancelUserMembership,
  createMembershipCheckout,
  getAvailablePlans,
  getUserMembership,
} from "./membership.service.js";

export async function listPlans(req, res, next) {
  try {
    const plans = await getAvailablePlans();

    return res.status(200).json({
      success: true,
      plans,
    });
  } catch (error) {
    next(error);
  }
}

export async function myMembership(req, res, next) {
  try {
    const membership = await getUserMembership(req.user.id);

    return res.status(200).json({
      success: true,
      ...membership,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCheckout(req, res, next) {
  try {
    const result = await createMembershipCheckout({
      userId: req.user.id,
      billingInterval: req.body.billingInterval,
    });

    return res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelMembership(req, res, next) {
  try {
    const subscription = await cancelUserMembership(req.user.id);

    return res.status(200).json({
      success: true,
      message:
        "Your membership will be cancelled at the end of the current billing period.",
      subscription,
    });
  } catch (error) {
    next(error);
  }
}
