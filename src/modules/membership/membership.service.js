import prisma from "../../config/prisma.js";
import stripe from "../../config/stripe.js";

export async function getAvailablePlans() {
  return prisma.membershipPlan.findMany({
    where: {
      isActive: true,
    },
    include: {
      prices: {
        where: {
          isActive: true,
        },
        orderBy: {
          amount: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function getUserMembership(userId) {
  const subscription = await prisma.membershipSubscription.findFirst({
    where: {
      userId,
      status: {
        in: ["ACTIVE", "PAST_DUE", "PAUSED", "INCOMPLETE"],
      },
    },
    include: {
      plan: true,
      price: true,
      payments: {
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!subscription) {
    return {
      isMember: false,
      subscription: null,
    };
  }

  const isMember =
    subscription.status === "ACTIVE" &&
    (!subscription.currentPeriodEnd ||
      subscription.currentPeriodEnd > new Date());

  return {
    isMember,
    subscription,
  };
}

export async function createMembershipCheckout({ userId, billingInterval }) {
  if (
    !process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY === "sk_test_placeholder"
  ) {
    const error = new Error("Stripe is not configured.");
    error.statusCode = 500;
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const existingSubscription = await prisma.membershipSubscription.findFirst({
    where: {
      userId,
      status: {
        in: ["ACTIVE", "PAST_DUE", "PAUSED"],
      },
    },
  });

  if (existingSubscription) {
    const error = new Error("You already have an existing membership.");
    error.statusCode = 409;
    throw error;
  }

  const membershipPrice = await prisma.membershipPrice.findFirst({
    where: {
      billingInterval,
      isActive: true,
      plan: {
        isActive: true,
      },
    },
    include: {
      plan: true,
    },
  });

  if (!membershipPrice) {
    const error = new Error("The selected membership price was not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!membershipPrice.providerPriceId) {
    const error = new Error(
      "The Stripe Price ID is missing for this membership.",
    );
    error.statusCode = 500;
    throw error;
  }

  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",

    line_items: [
      {
        price: membershipPrice.providerPriceId,
        quantity: 1,
      },
    ],

    customer_email: user.email,

    success_url:
      `${clientUrl}/membership/success` + "?session_id={CHECKOUT_SESSION_ID}",

    cancel_url: `${clientUrl}/membership/cancelled`,

    metadata: {
      userId: user.id,
      membershipPriceId: membershipPrice.id,
      membershipPlanId: membershipPrice.planId,
      billingInterval: membershipPrice.billingInterval,
    },

    subscription_data: {
      metadata: {
        userId: user.id,
        membershipPriceId: membershipPrice.id,
        membershipPlanId: membershipPrice.planId,
      },
    },
  });

  return {
    checkoutUrl: checkoutSession.url,
    checkoutSessionId: checkoutSession.id,
  };
}

export async function cancelUserMembership(userId) {
  const subscription = await prisma.membershipSubscription.findFirst({
    where: {
      userId,
      status: {
        in: ["ACTIVE", "PAST_DUE", "PAUSED"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!subscription) {
    const error = new Error("No active membership was found.");
    error.statusCode = 404;
    throw error;
  }

  if (!subscription.providerSubscriptionId) {
    const error = new Error("The payment provider subscription is missing.");
    error.statusCode = 500;
    throw error;
  }

  await stripe.subscriptions.update(subscription.providerSubscriptionId, {
    cancel_at_period_end: true,
  });

  return prisma.membershipSubscription.update({
    where: {
      id: subscription.id,
    },
    data: {
      cancelAtPeriodEnd: true,
    },
    include: {
      plan: true,
      price: true,
    },
  });
}
