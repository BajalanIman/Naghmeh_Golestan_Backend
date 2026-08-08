import * as subscriberService from "./subscriber.service.js";

export async function subscribe(req, res, next) {
  try {
    const result = await subscriberService.createSubscription(req.body);

    res.status(201).json({
      success: true,
      message: "Subscription request created successfully.",
      data: {
        subscriber: result.subscriber,

        // فقط برای تست اولیه
        confirmationToken: result.confirmationToken,
      },
    });
  } catch (error) {
    next(error);
  }
}
