import {
  cancelPendingOrder,
  createActivityOrder,
  createActivityQuote,
  getUserOrder,
  listUserOrders,
} from "./order.service.js";

function getRequestLanguage(req) {
  const rawLanguage = req.body.language || req.query.language || "EN";

  const language = String(rawLanguage).toUpperCase();

  return ["EN", "DE", "FA"].includes(language) ? language : "EN";
}

export async function orderQuoteController(req, res, next) {
  try {
    const quote = await createActivityQuote({
      activityId: req.body.activityId,
      quantity: req.body.quantity,
    });

    return res.status(200).json({
      success: true,
      quote,
    });
  } catch (error) {
    next(error);
  }
}

export async function createOrderController(req, res, next) {
  try {
    const result = await createActivityOrder({
      user: req.user || null,

      activityId: req.body.activityId,
      sessionIds: req.body.sessionIds,
      quantity: req.body.quantity,

      preferredLanguage: getRequestLanguage(req),

      guestData: {
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Order created successfully.",

      order: result.order,

      registrationId: result.registrationId,

      /*
        برای User لاگین‌شده null است.
        برای Guest باید در فرانت‌اند موقتاً نگه‌داری شود
        و هنگام Checkout ارسال شود.
      */
      guestAccessToken: result.guestAccessToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function myOrdersController(req, res, next) {
  try {
    const result = await listUserOrders({
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

export async function orderDetailsController(req, res, next) {
  try {
    const order = await getUserOrder({
      userId: req.user.id,
      orderId: req.params.id,
    });

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelOrderController(req, res, next) {
  try {
    const order = await cancelPendingOrder({
      userId: req.user.id,
      orderId: req.params.id,
    });

    return res.status(200).json({
      success: true,
      message: "The pending order was cancelled successfully.",
      order,
    });
  } catch (error) {
    next(error);
  }
}
