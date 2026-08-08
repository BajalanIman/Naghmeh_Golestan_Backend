import {
  createOrderCheckout,
  getCheckoutStatus,
  listUserPayments,
} from "./payment.service.js";

export async function createCheckoutController(req, res, next) {
  try {
    const result = await createOrderCheckout({
      userId: req.user?.id || null,
      guestAccessToken: req.body.guestAccessToken || null,
      orderId: req.body.orderId,
    });

    return res.status(201).json({
      success: true,
      message: "Checkout session created successfully.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function checkoutStatusController(req, res, next) {
  try {
    const payment = await getCheckoutStatus({
      userId: req.user?.id || null,
      guestAccessToken: req.query.guestAccessToken || null,
      sessionId: req.params.sessionId,
    });

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    next(error);
  }
}

export async function myPaymentsController(req, res, next) {
  try {
    const result = await listUserPayments({
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
