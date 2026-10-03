import crypto from "crypto";
import prisma from "../../config/prisma.js";
import stripe from "../../config/stripe.js";
import { buildStripeLineItems, getClientOrigin, getId, httpError, serializable } from "./payment.helpers.js";

function verifyOrderAccess({ order, userId, guestAccessToken }) {
  if (order.userId) {
    if (!userId || userId !== order.userId) throw httpError("You cannot access this order.", 403, "ORDER_ACCESS_DENIED");
    return;
  }
  if (!guestAccessToken || !order.guestAccessTokenHash) {
    throw httpError("Guest access token is required.", 401, "GUEST_ACCESS_TOKEN_REQUIRED");
  }
  const expected = Buffer.from(order.guestAccessTokenHash);
  const actual = Buffer.from(crypto.createHash("sha256").update(guestAccessToken).digest("hex"));
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw httpError("Invalid guest access token.", 403, "INVALID_GUEST_ACCESS_TOKEN");
  }
}

function serializePayment(payment) {
  if (!payment) return payment;
  const order = payment.order;
  const safeOrder = order ? { ...order } : null;
  if (safeOrder) {
    delete safeOrder.guestAccessTokenHash;
    for (const field of ["subtotal", "discount", "taxRate", "taxAmount", "total"]) {
      safeOrder[field] = Number(safeOrder[field]);
    }
    safeOrder.orderItems = order.orderItems?.map(item => ({ ...item, unitPrice: Number(item.unitPrice), total: Number(item.total) })) || [];
  }
  return { ...payment, amount: Number(payment.amount), order: safeOrder };
}

async function reserveCheckout({ userId, orderId, guestAccessToken }) {
  return serializable(prisma, async tx => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true, payments: { orderBy: { createdAt: "desc" } } },
    });
    if (!order) throw httpError("Order not found.", 404);
    verifyOrderAccess({ order, userId, guestAccessToken });
    if (order.status === "PAID") throw httpError("This order is already paid.", 409, "ORDER_ALREADY_PAID");
    if (order.status !== "PENDING") throw httpError("This order is not available for payment.", 409, "ORDER_NOT_PAYABLE");
    if (order.expiresAt && order.expiresAt <= new Date()) {
      throw httpError("This order has expired. Please start a new booking.", 409, "ORDER_EXPIRED");
    }
    if (!order.orderItems.length || Number(order.total) <= 0) throw httpError("Invalid order total.", 400, "INVALID_ORDER_TOTAL");
    buildStripeLineItems(order);
    // A card decline can mark Payment FAILED while its Checkout is still open.
    // Reuse that same Checkout; never create a second payable session.
    const existing = order.payments.find(p => p.provider === "STRIPE" &&
      ["PENDING", "PROCESSING", "FAILED"].includes(p.status));
    if (existing) return { order, payment: existing };
    const now = new Date();
    // Stripe requires >=30 min from session creation. A small buffer accounts
    // for network time; the order and Stripe share the SAME absolute deadline.
    const expiresAt = new Date(Math.floor(now.getTime() / 1000) * 1000 + 35 * 60 * 1000);
    const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { expiresAt } });
    const payment = await tx.payment.create({ data: {
      orderId: order.id, provider: "STRIPE", amount: order.total,
      currency: order.currency, status: "PROCESSING", createdAt: now,
    } });
    return { order: { ...order, expiresAt: updatedOrder.expiresAt }, payment };
  });
}

function checkoutResult(session, payment, clientUrl) {
  if (session.status === "expired") throw httpError("Checkout expired. Please start a new booking.", 409, "ORDER_EXPIRED");
  const checkoutUrl = session.status === "complete"
    ? `${clientUrl}/payment/success?session_id=${encodeURIComponent(session.id)}`
    : session.url;
  if (!checkoutUrl) throw httpError("Checkout is temporarily unavailable.", 503, "CHECKOUT_UNAVAILABLE");
  return { checkoutUrl, checkoutSessionId: session.id, payment: serializePayment(payment) };
}

export async function createOrderCheckout({ userId = null, orderId, guestAccessToken = null }) {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === "sk_test_placeholder") {
    throw httpError("Payments are temporarily unavailable.", 503, "CHECKOUT_UNAVAILABLE");
  }
  const clientUrl = getClientOrigin();
  const { order, payment } = await reserveCheckout({ userId, orderId, guestAccessToken });
  const metadata = { paymentType: "ACTIVITY_ORDER", orderId: order.id, paymentId: payment.id,
    userId: order.userId || "", isGuest: order.userId ? "false" : "true" };
  let session;
  try {
    session = payment.providerCheckoutSessionId
      ? await stripe.checkout.sessions.retrieve(payment.providerCheckoutSessionId)
      : await stripe.checkout.sessions.create({
          mode: "payment",
          // Instant card payments (including eligible Apple/Google Pay wallets).
          // Bank debit methods need a separate policy for long-lived seat holds.
          payment_method_types: ["card"],
          adaptive_pricing: { enabled: false },
          customer_email: order.email,
          line_items: buildStripeLineItems(order),
          client_reference_id: order.id,
          success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${clientUrl}/payment/cancelled?order_id=${encodeURIComponent(order.id)}`,
          metadata,
          payment_intent_data: { metadata, receipt_email: order.email },
          expires_at: Math.floor(order.expiresAt.getTime() / 1000),
        }, { idempotencyKey: `activity-order:${payment.id}`, maxNetworkRetries: 2 });
  } catch (error) {
    console.error("Activity checkout request failed:", order.id, error.type || error.code || "stripe_error");
    // A timeout doesn't prove Stripe failed. Retain the Payment so the same
    // idempotency key recovers the existing Session on the next request.
    throw httpError("Unable to open payment. Please retry shortly.", 503, "CHECKOUT_UNAVAILABLE");
  }
  if (session.metadata?.paymentType !== "ACTIVITY_ORDER" || session.metadata?.orderId !== order.id ||
      session.metadata?.paymentId !== payment.id) throw httpError("Checkout/order mismatch.", 500, "CHECKOUT_MISMATCH");
  const updatedPayment = await prisma.payment.update({ where: { id: payment.id }, data: {
    providerCheckoutSessionId: session.id,
    ...(getId(session.payment_intent) ? { providerPaymentId: getId(session.payment_intent) } : {}),
    ...(getId(session.customer) ? { providerCustomerId: getId(session.customer) } : {}),
  } });
  return checkoutResult(session, updatedPayment, clientUrl);
}

export async function getCheckoutStatus({ userId = null, sessionId, guestAccessToken = null }) {
  const payment = await prisma.payment.findUnique({ where: { providerCheckoutSessionId: sessionId },
    include: { order: { include: { orderItems: true } } } });
  if (!payment?.order) throw httpError("Payment was not found.", 404);
  verifyOrderAccess({ order: payment.order, userId, guestAccessToken });
  // Payment status comes from verified webhooks, never from URL parameters.
  return serializePayment(payment);
}

export async function listUserPayments({ userId, status, page = 1, limit = 20 }) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const where = { order: { is: { userId } }, ...(status ? { status } : {}) };
  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({ where, include: { order: { include: { orderItems: true } } },
      orderBy: { createdAt: "desc" }, skip: (safePage - 1) * safeLimit, take: safeLimit }),
    prisma.payment.count({ where }),
  ]);
  return { payments: payments.map(serializePayment), pagination: {
    page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit),
  } };
}
