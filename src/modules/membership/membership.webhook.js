import prisma from "../../config/prisma.js";
import stripe from "../../config/stripe.js";

function mapSubscriptionStatus(stripeStatus) {
  const statusMap = {
    incomplete: "INCOMPLETE",
    incomplete_expired: "EXPIRED",
    trialing: "ACTIVE",
    active: "ACTIVE",
    past_due: "PAST_DUE",
    paused: "PAUSED",
    canceled: "CANCELLED",
    unpaid: "PAST_DUE",
  };

  return statusMap[stripeStatus] || "INCOMPLETE";
}

function toDate(unixTimestamp) {
  if (!unixTimestamp) {
    return null;
  }

  return new Date(unixTimestamp * 1000);
}

function getSubscriptionIdFromInvoice(invoice) {
  if (typeof invoice.subscription === "string") {
    return invoice.subscription;
  }

  if (invoice.subscription?.id) {
    return invoice.subscription.id;
  }

  return invoice.parent?.subscription_details?.subscription || null;
}

async function syncSubscription(stripeSubscription, metadata = {}) {
  const providerSubscriptionId = stripeSubscription.id;

  const userId = metadata.userId || stripeSubscription.metadata?.userId;

  const membershipPriceId =
    metadata.membershipPriceId ||
    stripeSubscription.metadata?.membershipPriceId;

  if (!userId || !membershipPriceId) {
    console.error("Subscription metadata is incomplete.", {
      providerSubscriptionId,
      userId,
      membershipPriceId,
    });

    return null;
  }

  const membershipPrice = await prisma.membershipPrice.findUnique({
    where: {
      id: membershipPriceId,
    },
  });

  if (!membershipPrice) {
    console.error("Membership price not found:", membershipPriceId);

    return null;
  }

  return prisma.membershipSubscription.upsert({
    where: {
      providerSubscriptionId,
    },

    update: {
      status: mapSubscriptionStatus(stripeSubscription.status),
      currentPeriodStart: toDate(stripeSubscription.current_period_start),
      currentPeriodEnd: toDate(stripeSubscription.current_period_end),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
      cancelledAt: toDate(stripeSubscription.canceled_at),
      endedAt: toDate(stripeSubscription.ended_at),
      providerCustomerId:
        typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer?.id,
    },

    create: {
      userId,
      planId: membershipPrice.planId,
      priceId: membershipPrice.id,
      provider: "STRIPE",
      providerSubscriptionId,
      providerCustomerId:
        typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer?.id,
      status: mapSubscriptionStatus(stripeSubscription.status),
      currentPeriodStart: toDate(stripeSubscription.current_period_start),
      currentPeriodEnd: toDate(stripeSubscription.current_period_end),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
      cancelledAt: toDate(stripeSubscription.canceled_at),
      endedAt: toDate(stripeSubscription.ended_at),
    },
  });
}

async function handleCheckoutCompleted(session) {
  if (!session.subscription) {
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;

  const stripeSubscription =
    await stripe.subscriptions.retrieve(subscriptionId);

  await syncSubscription(stripeSubscription, session.metadata);
}

async function handleSubscriptionChanged(stripeSubscription) {
  const existingSubscription = await prisma.membershipSubscription.findUnique({
    where: {
      providerSubscriptionId: stripeSubscription.id,
    },
  });

  if (!existingSubscription) {
    await syncSubscription(stripeSubscription);
    return;
  }

  await prisma.membershipSubscription.update({
    where: {
      id: existingSubscription.id,
    },
    data: {
      status: mapSubscriptionStatus(stripeSubscription.status),
      currentPeriodStart: toDate(stripeSubscription.current_period_start),
      currentPeriodEnd: toDate(stripeSubscription.current_period_end),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
      cancelledAt: toDate(stripeSubscription.canceled_at),
      endedAt: toDate(stripeSubscription.ended_at),
    },
  });
}

async function handleInvoicePaid(invoice) {
  const providerSubscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!providerSubscriptionId) {
    return;
  }

  const subscription = await prisma.membershipSubscription.findUnique({
    where: {
      providerSubscriptionId,
    },
  });

  if (!subscription) {
    return;
  }

  await prisma.membershipPayment.upsert({
    where: {
      providerInvoiceId: invoice.id,
    },

    update: {
      status: "SUCCEEDED",
      amount: invoice.amount_paid / 100,
      currency: invoice.currency.toUpperCase(),
      paidAt: new Date(),
    },

    create: {
      subscriptionId: subscription.id,
      provider: "STRIPE",
      providerInvoiceId: invoice.id,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency.toUpperCase(),
      status: "SUCCEEDED",
      periodStart: toDate(invoice.period_start),
      periodEnd: toDate(invoice.period_end),
      paidAt: new Date(),
    },
  });
}

async function handleInvoiceFailed(invoice) {
  const providerSubscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!providerSubscriptionId) {
    return;
  }

  const subscription = await prisma.membershipSubscription.findUnique({
    where: {
      providerSubscriptionId,
    },
  });

  if (!subscription) {
    return;
  }

  await prisma.$transaction([
    prisma.membershipSubscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: "PAST_DUE",
      },
    }),

    prisma.membershipPayment.upsert({
      where: {
        providerInvoiceId: invoice.id,
      },

      update: {
        status: "FAILED",
        failedAt: new Date(),
      },

      create: {
        subscriptionId: subscription.id,
        provider: "STRIPE",
        providerInvoiceId: invoice.id,
        amount: (invoice.amount_due || 0) / 100,
        currency: invoice.currency.toUpperCase(),
        status: "FAILED",
        periodStart: toDate(invoice.period_start),
        periodEnd: toDate(invoice.period_end),
        failedAt: new Date(),
      },
    }),
  ]);
}

export async function stripeWebhook(req, res) {
  const signature = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error("Stripe webhook signature error:", error.message);

    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChanged(event.data.object);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;

      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error("Stripe webhook processing error:", error);

    return res.status(500).json({
      received: false,
      message: "Webhook processing failed.",
    });
  }
}
