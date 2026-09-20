import prisma from "../../config/prisma.js";
import stripe from "../../config/stripe.js";

function httpError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}
const serialize = (donation) => ({
  ...donation,
  amount: Number(donation.amount),
  payments:
    donation.payments?.map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    })) || [],
});

export async function createDonationCheckout({
  user,
  donorName,
  donorEmail,
  anonymous,
  amount,
  currency,
  message,
  language,
  requestId,
}) {
  if (
    !process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY === "sk_test_placeholder"
  ) {
    throw httpError("Payments are temporarily unavailable.", 503);
  }
  // Use a server-controlled origin, never a redirect URL supplied by the browser.
  let clientUrl;
  try {
    const url = new URL(process.env.CLIENT_URL);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error();
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
      throw new Error();
    clientUrl = url.origin;
  } catch {
    throw httpError(
      "Payments are temporarily unavailable: invalid CLIENT_URL.",
      503,
    );
  }
  const resolvedName = anonymous
    ? null
    : donorName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      null;
  const userId = user?.id || null;
  // The request UUID is the Donation primary key. Repeating a browser request
  // therefore reuses both the donation and the Stripe idempotency key.
  let donation;
  try {
    donation = await prisma.donation.create({
      data: {
        id: requestId,
        userId,
        donorName: resolvedName,
        donorEmail,
        anonymous,
        amount,
        currency,
        message,
        payments: {
          create: {
            provider: "STRIPE",
            amount,
            currency,
            status: "PROCESSING",
          },
        },
      },
      include: { payments: true },
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    donation = await prisma.donation.findUnique({
      where: { id: requestId },
      include: { payments: true },
    });
    if (!donation) throw error;
  }
  if (
    donation.userId !== userId ||
    donation.donorName !== resolvedName ||
    donation.donorEmail !== donorEmail ||
    donation.anonymous !== anonymous ||
    Number(donation.amount) !== amount ||
    donation.currency !== currency ||
    donation.message !== message
  ) {
    throw httpError(
      "The payment request changed. Please submit again.",
      409,
      "NEW_REQUEST_REQUIRED",
    );
  }
  const payment = donation.payments[0];
  if (!payment) throw httpError("The payment record is unavailable.", 503);
  if (
    ["FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(
      payment.status,
    )
  ) {
    throw httpError(
      "This checkout has ended. Please submit again.",
      409,
      "NEW_REQUEST_REQUIRED",
    );
  }
  // Stripe prunes idempotency keys after at least 24 h. Never replay an unknown
  // session with an old key, which could otherwise create a second checkout.
  if (
    !payment.providerCheckoutSessionId &&
    Date.now() - new Date(donation.createdAt).getTime() > 23 * 60 * 60 * 1000
  ) {
    throw httpError(
      "This payment request has expired. Please submit again.",
      409,
      "NEW_REQUEST_REQUIRED",
    );
  }
  const metadata = {
    paymentType: "DONATION",
    donationId: donation.id,
    paymentId: payment.id,
  };
  let session;
  try {
    session = payment.providerCheckoutSessionId
      ? await stripe.checkout.sessions.retrieve(
          payment.providerCheckoutSessionId,
        )
      : await stripe.checkout.sessions.create(
          {
            mode: "payment",
            customer_email: donorEmail,
            locale: language === "DE" ? "de" : "en",
            adaptive_pricing: { enabled: false },
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  unit_amount: Math.round(amount * 100),
                  product_data: { name: "Golestan Cultural Hub — Donation" },
                },
              },
            ],
            submit_type: "donate",
            success_url: `${clientUrl}/donation/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${clientUrl}/donation/cancelled`,
            client_reference_id: donation.id,
            metadata,
            payment_intent_data: { metadata, receipt_email: donorEmail },
          },
          { idempotencyKey: `donation:${donation.id}`, maxNetworkRetries: 2 },
        );
  } catch (error) {
    console.error(
      "Donation checkout request failed:",
      donation.id,
      error.type || error.code || "stripe_error",
    );
    // A timeout is not proof that Stripe failed to create the session.
    // Retain PENDING and the request ID so a retry recovers the same session.
    throw httpError(
      "Unable to open payment. Please retry shortly.",
      503,
      "CHECKOUT_UNAVAILABLE",
    );
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerCheckoutSessionId: session.id },
  });
  if (session.status === "expired")
    throw httpError(
      "This checkout has expired. Please submit again.",
      409,
      "NEW_REQUEST_REQUIRED",
    );
  const checkoutUrl =
    session.status === "complete"
      ? `${clientUrl}/donation/success?session_id=${encodeURIComponent(session.id)}`
      : session.url;
  if (!checkoutUrl)
    throw httpError("The checkout is temporarily unavailable.", 503);
  return { checkoutUrl, checkoutSessionId: session.id };
}

export async function getDonationCheckoutStatus({ sessionId }) {
  const payment = await prisma.payment.findUnique({
    where: { providerCheckoutSessionId: sessionId },
    select: {
      amount: true,
      currency: true,
      status: true,
      paidAt: true,
      donation: { select: { status: true } },
    },
  });
  if (!payment?.donation)
    throw httpError("Donation payment was not found.", 404);
  // Possession of the unguessable Stripe session ID grants only this minimal
  // receipt view. No donor identity, messages, user IDs or provider IDs leak.
  return {
    amount: Number(payment.amount),
    currency: payment.currency,
    status: payment.donation.status,
    paymentStatus: payment.status,
    completedAt: payment.paidAt,
  };
}

export async function listUserDonations({
  userId,
  status,
  page = 1,
  limit = 20,
}) {
  const safePage = Number(page),
    safeLimit = Number(limit);
  if (
    !Number.isSafeInteger(safePage) ||
    safePage < 1 ||
    !Number.isSafeInteger(safeLimit) ||
    safeLimit < 1 ||
    safeLimit > 50 ||
    !Number.isSafeInteger((safePage - 1) * safeLimit)
  ) {
    throw httpError("Invalid pagination.", 400);
  }
  if (
    status &&
    !["PENDING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"].includes(
      status,
    )
  )
    throw httpError("Invalid donation status.", 400);
  const where = { userId, ...(status ? { status } : {}) };
  const [donations, total] = await prisma.$transaction([
    prisma.donation.findMany({
      where,
      include: { payments: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    prisma.donation.count({ where }),
  ]);
  return {
    donations: donations.map(serialize),
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
    where: { id: donationId, userId },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!donation) throw httpError("Donation not found.", 404);
  return serialize(donation);
}
