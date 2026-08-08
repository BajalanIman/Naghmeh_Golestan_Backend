import prisma from "../../config/prisma.js";
import stripe from "../../config/stripe.js";

function createHttpError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;

  if (code) {
    error.code = code;
  }

  return error;
}

function serializeDecimal(value) {
  if (value === null || value === undefined) {
    return value;
  }

  return Number(value);
}

function serializeDonation(donation) {
  if (!donation) {
    return donation;
  }

  return {
    ...donation,
    amount: serializeDecimal(donation.amount),

    payments:
      donation.payments?.map((payment) => ({
        ...payment,
        amount: serializeDecimal(payment.amount),
      })) || [],
  };
}

function convertToSmallestCurrencyUnit(amount, currency) {
  const normalizedCurrency = currency.toUpperCase();

  const zeroDecimalCurrencies = [
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ];

  if (zeroDecimalCurrencies.includes(normalizedCurrency)) {
    return Math.round(Number(amount));
  }

  return Math.round(Number(amount) * 100);
}

export async function createDonationCheckout({
  user,
  donorName,
  donorEmail,
  anonymous,
  amount,
  currency,
  message,
}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw createHttpError("Stripe is not configured.", 500);
  }

  /*
    اگر User وارد شده باشد، اطلاعات خالی فرم
    از حساب کاربری تکمیل می‌شود.
  */
  const resolvedName =
    donorName || (user ? `${user.firstName} ${user.lastName}`.trim() : null);

  const resolvedEmail = donorEmail || user?.email || null;

  /*
    حتی برای Donation ناشناس بهتر است Email
    برای رسید پرداخت قابل دریافت باشد.
    اما نام در نمایش عمومی مخفی می‌شود.
  */
  if (!resolvedEmail) {
    throw createHttpError(
      "An email address is required for the payment receipt.",
      400,
      "EMAIL_REQUIRED",
    );
  }

  const result = await prisma.$transaction(async (transaction) => {
    const donation = await transaction.donation.create({
      data: {
        userId: user?.id || null,

        donorName: anonymous ? null : resolvedName,

        donorEmail: resolvedEmail,

        anonymous,
        amount,
        currency,
        message,
        status: "PENDING",
      },
    });

    const payment = await transaction.payment.create({
      data: {
        donationId: donation.id,
        provider: "STRIPE",
        amount,
        currency,
        status: "PROCESSING",
      },
    });

    return {
      donation,
      payment,
    };
  });

  try {
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",

      customer_email: resolvedEmail,

      line_items: [
        {
          quantity: 1,

          price_data: {
            currency: currency.toLowerCase(),

            unit_amount: convertToSmallestCurrencyUnit(amount, currency),

            product_data: {
              name: "Donation",

              description: anonymous
                ? "Anonymous donation"
                : resolvedName
                  ? `Donation from ${resolvedName}`
                  : "Website donation",

              metadata: {
                donationId: result.donation.id,
              },
            },
          },
        },
      ],

      success_url:
        `${clientUrl}/donation/success` + "?session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        `${clientUrl}/donation/cancelled` +
        `?donation_id=${result.donation.id}`,

      metadata: {
        paymentType: "DONATION",
        donationId: result.donation.id,
        paymentId: result.payment.id,
        userId: user?.id || "",
      },

      payment_intent_data: {
        metadata: {
          paymentType: "DONATION",
          donationId: result.donation.id,
          paymentId: result.payment.id,
          userId: user?.id || "",
        },
      },
    });

    const updatedPayment = await prisma.payment.update({
      where: {
        id: result.payment.id,
      },

      data: {
        providerCheckoutSessionId: checkoutSession.id,

        providerPaymentId:
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id || null,

        providerCustomerId:
          typeof checkoutSession.customer === "string"
            ? checkoutSession.customer
            : checkoutSession.customer?.id || null,
      },
    });

    return {
      checkoutUrl: checkoutSession.url,

      checkoutSessionId: checkoutSession.id,

      donation: serializeDonation({
        ...result.donation,
        payments: [updatedPayment],
      }),
    };
  } catch (error) {
    await prisma.$transaction([
      prisma.payment.update({
        where: {
          id: result.payment.id,
        },

        data: {
          status: "FAILED",
          failureReason: error.message || "Stripe Checkout creation failed.",
        },
      }),

      prisma.donation.update({
        where: {
          id: result.donation.id,
        },

        data: {
          status: "FAILED",
        },
      }),
    ]);

    throw error;
  }
}

export async function getDonationCheckoutStatus({ sessionId, userId }) {
  const payment = await prisma.payment.findFirst({
    where: {
      providerCheckoutSessionId: sessionId,

      donationId: {
        not: null,
      },
    },

    include: {
      donation: {
        include: {
          payments: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      },
    },
  });

  if (!payment || !payment.donation) {
    throw createHttpError("Donation payment was not found.", 404);
  }

  /*
    اگر Donation متعلق به User خاصی باشد،
    فقط همان User اجازه مشاهده دارد.
  */
  if (payment.donation.userId && payment.donation.userId !== userId) {
    throw createHttpError(
      "You do not have permission to view this donation.",
      403,
    );
  }

  return serializeDonation(payment.donation);
}

export async function listUserDonations({
  userId,
  status,
  page = 1,
  limit = 20,
}) {
  const safePage = Math.max(Number(page) || 1, 1);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const where = {
    userId,
  };

  if (status) {
    where.status = status;
  }

  const [donations, total] = await prisma.$transaction([
    prisma.donation.findMany({
      where,

      include: {
        payments: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },

      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),

    prisma.donation.count({
      where,
    }),
  ]);

  return {
    donations: donations.map(serializeDonation),

    pagination: {
      page: safePage,
      limit: safeLimit,
      total,

      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

export async function getUserDonation({ userId, donationId }) {
  const donation = await prisma.donation.findFirst({
    where: {
      id: donationId,
      userId,
    },

    include: {
      payments: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!donation) {
    throw createHttpError("Donation not found.", 404);
  }

  return serializeDonation(donation);
}
