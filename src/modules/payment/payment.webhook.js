import prisma from "../../config/prisma.js";
import stripe from "../../config/stripe.js";

function getStringId(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.id || null;
}

async function completeOrderPayment(session) {
  const orderId = session.metadata?.orderId;
  const paymentId = session.metadata?.paymentId;

  if (!orderId || !paymentId) {
    console.error("Stripe session metadata is incomplete:", session.id);

    return;
  }

  /*
    checkout.session.completed may be emitted while
    a delayed payment is still unpaid.
  */
  if (session.payment_status !== "paid") {
    await prisma.payment.updateMany({
      where: {
        id: paymentId,
        status: {
          in: ["PENDING", "PROCESSING"],
        },
      },

      data: {
        status: "PROCESSING",
        providerCheckoutSessionId: session.id,
        providerPaymentId: getStringId(session.payment_intent),
        providerCustomerId: getStringId(session.customer),
      },
    });

    return;
  }

  await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: {
        id: orderId,
      },

      include: {
        orderItems: {
          include: {
            registration: true,
          },
        },
      },
    });

    if (!order) {
      throw new Error(`Order not found for Stripe session ${session.id}.`);
    }

    /*
        Webhooks can be delivered more than once.
        If already paid, do nothing except keep
        Payment synchronized.
      */
    if (order.status !== "PAID") {
      await transaction.order.update({
        where: {
          id: order.id,
        },

        data: {
          status: "PAID",
          paidAt: new Date(),
          cancelledAt: null,
        },
      });

      const registrationIds = order.orderItems
        .map((item) => item.registration?.id)
        .filter(Boolean);

      if (registrationIds.length > 0) {
        await transaction.registration.updateMany({
          where: {
            id: {
              in: registrationIds,
            },
            status: "PENDING",
          },

          data: {
            status: "CONFIRMED",
            cancelledAt: null,
          },
        });
      }
    }

    await transaction.payment.update({
      where: {
        id: paymentId,
      },

      data: {
        status: "COMPLETED",
        providerCheckoutSessionId: session.id,
        providerPaymentId: getStringId(session.payment_intent),
        providerCustomerId: getStringId(session.customer),
        failureReason: null,
        paidAt: new Date(),
      },
    });
  });
}

async function failOrderPayment(session, failureReason) {
  const orderId = session.metadata?.orderId;
  const paymentId = session.metadata?.paymentId;

  if (!orderId || !paymentId) {
    return;
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.payment.updateMany({
      where: {
        id: paymentId,

        status: {
          not: "COMPLETED",
        },
      },

      data: {
        status: "FAILED",
        failureReason: failureReason || "Payment failed.",
        providerCheckoutSessionId: session.id,
        providerPaymentId: getStringId(session.payment_intent),
      },
    });

    /*
        For an explicit failed payment, the Order stays
        PENDING so the customer may try again.
      */
    await transaction.order.updateMany({
      where: {
        id: orderId,
        status: "PENDING",
      },

      data: {
        updatedAt: new Date(),
      },
    });
  });
}

async function expireCheckout(session) {
  const orderId = session.metadata?.orderId;
  const paymentId = session.metadata?.paymentId;

  if (!orderId || !paymentId) {
    return;
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.payment.updateMany({
      where: {
        id: paymentId,

        status: {
          in: ["PENDING", "PROCESSING"],
        },
      },

      data: {
        status: "CANCELLED",
        failureReason: "Stripe Checkout Session expired.",
      },
    });

    const order = await transaction.order.findUnique({
      where: {
        id: orderId,
      },

      include: {
        orderItems: {
          include: {
            registration: true,
          },
        },
      },
    });

    if (!order || order.status !== "PENDING") {
      return;
    }

    await transaction.order.update({
      where: {
        id: order.id,
      },

      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    const registrationIds = order.orderItems
      .map((item) => item.registration?.id)
      .filter(Boolean);

    if (registrationIds.length > 0) {
      await transaction.registration.updateMany({
        where: {
          id: {
            in: registrationIds,
          },
          status: "PENDING",
        },

        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });
    }
  });
}

async function handlePaymentIntentFailed(paymentIntent) {
  const paymentId = paymentIntent.metadata?.paymentId;

  if (!paymentId) {
    return;
  }

  const failureMessage =
    paymentIntent.last_payment_error?.message || "Payment intent failed.";

  await prisma.payment.updateMany({
    where: {
      id: paymentId,
      status: {
        not: "COMPLETED",
      },
    },

    data: {
      status: "FAILED",
      providerPaymentId: paymentIntent.id,
      providerCustomerId: getStringId(paymentIntent.customer),
      failureReason: failureMessage,
    },
  });
}

export async function stripePaymentWebhook(req, res) {
  const signature = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_PAYMENT_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error("Stripe payment webhook signature error:", error.message);

    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await completeOrderPayment(event.data.object);
        break;

      case "checkout.session.async_payment_succeeded":
        await completeOrderPayment(event.data.object);
        break;

      case "checkout.session.async_payment_failed":
        await failOrderPayment(
          event.data.object,
          "Asynchronous payment failed.",
        );
        break;

      case "checkout.session.expired":
        await expireCheckout(event.data.object);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled payment event: ${event.type}`);
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error("Stripe payment webhook processing error:", error);

    return res.status(500).json({
      received: false,
      message: "Payment webhook processing failed.",
    });
  }
}
