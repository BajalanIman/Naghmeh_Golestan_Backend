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

async function completeDonation(session) {
  const donationId = session.metadata?.donationId;

  const paymentId = session.metadata?.paymentId;

  if (!donationId || !paymentId) {
    console.error("Donation Stripe metadata is incomplete:", session.id);

    return;
  }

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
    const donation = await transaction.donation.findUnique({
      where: {
        id: donationId,
      },
    });

    if (!donation) {
      throw new Error(`Donation ${donationId} was not found.`);
    }

    if (donation.status !== "COMPLETED") {
      await transaction.donation.update({
        where: {
          id: donation.id,
        },

        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
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

async function failDonation(session, failureReason) {
  const donationId = session.metadata?.donationId;

  const paymentId = session.metadata?.paymentId;

  if (!donationId || !paymentId) {
    return;
  }

  await prisma.$transaction([
    prisma.payment.updateMany({
      where: {
        id: paymentId,

        status: {
          not: "COMPLETED",
        },
      },

      data: {
        status: "FAILED",

        providerCheckoutSessionId: session.id,

        providerPaymentId: getStringId(session.payment_intent),

        failureReason: failureReason || "Donation payment failed.",
      },
    }),

    prisma.donation.updateMany({
      where: {
        id: donationId,

        status: {
          not: "COMPLETED",
        },
      },

      data: {
        status: "FAILED",
      },
    }),
  ]);
}

async function cancelExpiredDonation(session) {
  const donationId = session.metadata?.donationId;

  const paymentId = session.metadata?.paymentId;

  if (!donationId || !paymentId) {
    return;
  }

  await prisma.$transaction([
    prisma.payment.updateMany({
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
    }),

    prisma.donation.updateMany({
      where: {
        id: donationId,

        status: "PENDING",
      },

      data: {
        status: "CANCELLED",
      },
    }),
  ]);
}

async function handleDonationPaymentIntentFailed(paymentIntent) {
  if (paymentIntent.metadata?.paymentType !== "DONATION") {
    return;
  }

  const donationId = paymentIntent.metadata?.donationId;

  const paymentId = paymentIntent.metadata?.paymentId;

  if (!donationId || !paymentId) {
    return;
  }

  const failureMessage =
    paymentIntent.last_payment_error?.message || "Donation payment failed.";

  await prisma.$transaction([
    prisma.payment.updateMany({
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
    }),

    prisma.donation.updateMany({
      where: {
        id: donationId,

        status: {
          not: "COMPLETED",
        },
      },

      data: {
        status: "FAILED",
      },
    }),
  ]);
}

export async function stripeDonationWebhook(req, res) {
  const signature = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_DONATION_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error("Donation webhook signature error:", error.message);

    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await completeDonation(event.data.object);
        break;

      case "checkout.session.async_payment_succeeded":
        await completeDonation(event.data.object);
        break;

      case "checkout.session.async_payment_failed":
        await failDonation(
          event.data.object,
          "Asynchronous donation payment failed.",
        );
        break;

      case "checkout.session.expired":
        await cancelExpiredDonation(event.data.object);
        break;

      case "payment_intent.payment_failed":
        await handleDonationPaymentIntentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled donation event: ${event.type}`);
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error("Donation webhook processing error:", error);

    return res.status(500).json({
      received: false,
      message: "Donation webhook processing failed.",
    });
  }
}
