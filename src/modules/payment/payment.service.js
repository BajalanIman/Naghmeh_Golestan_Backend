import crypto from "crypto";
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

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function serializeDecimal(value) {
  if (value === null || value === undefined) {
    return value;
  }

  return Number(value);
}

function serializePayment(payment) {
  if (!payment) {
    return payment;
  }

  return {
    ...payment,

    amount: serializeDecimal(payment.amount),

    order: payment.order
      ? {
          ...payment.order,

          subtotal: serializeDecimal(payment.order.subtotal),

          discount: serializeDecimal(payment.order.discount),

          taxRate: serializeDecimal(payment.order.taxRate),

          taxAmount: serializeDecimal(payment.order.taxAmount),

          total: serializeDecimal(payment.order.total),

          orderItems:
            payment.order.orderItems?.map((item) => ({
              ...item,

              unitPrice: serializeDecimal(item.unitPrice),

              total: serializeDecimal(item.total),
            })) || [],
        }
      : null,
  };
}

function convertToSmallestCurrencyUnit(amount, currency) {
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

  const normalizedCurrency = currency.toUpperCase();

  if (zeroDecimalCurrencies.includes(normalizedCurrency)) {
    return Math.round(Number(amount));
  }

  return Math.round(Number(amount) * 100);
}

function verifyOrderAccess({ order, userId, guestAccessToken }) {
  /*
    Order متعلق به User لاگین‌شده
  */
  if (order.userId) {
    if (!userId || order.userId !== userId) {
      throw createHttpError(
        "You do not have permission to access this order.",
        403,
        "ORDER_ACCESS_DENIED",
      );
    }

    return;
  }

  /*
    Order مهمان
  */
  if (!order.guestAccessTokenHash) {
    throw createHttpError(
      "Guest order access is not configured.",
      403,
      "GUEST_ACCESS_NOT_CONFIGURED",
    );
  }

  if (!guestAccessToken) {
    throw createHttpError(
      "Guest access token is required.",
      401,
      "GUEST_ACCESS_TOKEN_REQUIRED",
    );
  }

  const receivedTokenHash = hashToken(guestAccessToken);

  const storedHashBuffer = Buffer.from(order.guestAccessTokenHash, "utf8");

  const receivedHashBuffer = Buffer.from(receivedTokenHash, "utf8");

  if (
    storedHashBuffer.length !== receivedHashBuffer.length ||
    !crypto.timingSafeEqual(storedHashBuffer, receivedHashBuffer)
  ) {
    throw createHttpError(
      "The guest access token is invalid.",
      403,
      "INVALID_GUEST_ACCESS_TOKEN",
    );
  }
}

async function expireOrderIfNecessary(order) {
  if (
    order.status === "PENDING" &&
    order.expiresAt &&
    order.expiresAt <= new Date()
  ) {
    const now = new Date();

    await prisma.$transaction(async (transaction) => {
      await transaction.registration.updateMany({
        where: {
          orderItem: {
            is: {
              orderId: order.id,
            },
          },

          status: "PENDING",
        },

        data: {
          status: "CANCELLED",
          cancelledAt: now,
        },
      });

      await transaction.payment.updateMany({
        where: {
          orderId: order.id,

          status: {
            in: ["PENDING", "PROCESSING"],
          },
        },

        data: {
          status: "CANCELLED",
          failureReason: "The order expired before payment was completed.",
        },
      });

      await transaction.order.update({
        where: {
          id: order.id,
        },

        data: {
          status: "CANCELLED",
          cancelledAt: now,
        },
      });
    });

    throw createHttpError(
      "This order has expired. Please create a new order.",
      409,
      "ORDER_EXPIRED",
    );
  }
}

function buildStripeLineItems(order) {
  const lineItems = order.orderItems.map((item) => ({
    quantity: item.quantity,

    price_data: {
      currency: order.currency.toLowerCase(),

      unit_amount: convertToSmallestCurrencyUnit(
        item.unitPrice,
        order.currency,
      ),

      product_data: {
        name: item.title,

        metadata: {
          orderItemId: item.id,
          activityId: item.activityId || "",
        },
      },
    },
  }));

  const taxAmount = Number(order.taxAmount || 0);

  /*
    مالیات را به‌عنوان یک Line Item جدا می‌فرستیم
    تا مجموع Stripe دقیقاً برابر Order.total باشد.
  */
  if (taxAmount > 0) {
    lineItems.push({
      quantity: 1,

      price_data: {
        currency: order.currency.toLowerCase(),

        unit_amount: convertToSmallestCurrencyUnit(taxAmount, order.currency),

        product_data: {
          name: `Tax (${Number(order.taxRate) * 100}%)`,

          metadata: {
            orderId: order.id,
            type: "TAX",
          },
        },
      },
    });
  }

  return lineItems;
}

function calculateStripeLineItemsTotal(lineItems) {
  return lineItems.reduce(
    (sum, item) => sum + item.price_data.unit_amount * item.quantity,
    0,
  );
}

export async function createOrderCheckout({
  userId = null,
  orderId,
  guestAccessToken = null,
}) {
  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },

    include: {
      orderItems: true,

      payments: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!order) {
    throw createHttpError("Order not found.", 404);
  }

  verifyOrderAccess({
    order,
    userId,
    guestAccessToken,
  });

  await expireOrderIfNecessary(order);

  if (order.status === "PAID") {
    throw createHttpError(
      "This order has already been paid.",
      409,
      "ORDER_ALREADY_PAID",
    );
  }

  if (order.status !== "PENDING") {
    throw createHttpError(
      "This order is not available for payment.",
      409,
      "ORDER_NOT_PAYABLE",
    );
  }

  if (Number(order.total) <= 0) {
    throw createHttpError(
      "The order total must be greater than zero.",
      400,
      "INVALID_ORDER_TOTAL",
    );
  }

  if (!order.orderItems.length) {
    throw createHttpError("This order does not contain any items.", 400);
  }

  /*
    اگر قبلاً Checkout فعال برای Order ساخته شده باشد،
    از ساخت تعداد نامحدود Payment جلوگیری می‌کنیم.
  */
  const existingProcessingPayment = order.payments.find(
    (payment) =>
      payment.status === "PROCESSING" && payment.providerCheckoutSessionId,
  );

  if (existingProcessingPayment) {
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(
        existingProcessingPayment.providerCheckoutSessionId,
      );

      if (existingSession.status === "open" && existingSession.url) {
        return {
          checkoutUrl: existingSession.url,

          checkoutSessionId: existingSession.id,

          payment: serializePayment(existingProcessingPayment),
        };
      }
    } catch (error) {
      console.error("Existing Stripe session retrieval failed:", error.message);
    }
  }

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "STRIPE",
      amount: order.total,
      currency: order.currency,
      status: "PROCESSING",
    },
  });

  try {
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    const lineItems = buildStripeLineItems(order);

    /*
      کنترل نهایی برای جلوگیری از اختلاف مبلغ
      Order و Line Items ارسالی به Stripe.
    */
    const stripeLineItemsTotal = calculateStripeLineItemsTotal(lineItems);

    const expectedOrderTotal = convertToSmallestCurrencyUnit(
      order.total,
      order.currency,
    );

    if (stripeLineItemsTotal !== expectedOrderTotal) {
      throw createHttpError(
        "The Stripe checkout amount does not match the order total.",
        500,
        "ORDER_TOTAL_MISMATCH",
      );
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",

      customer_email: order.email,

      line_items: lineItems,

      success_url:
        `${clientUrl}/payment/success` + "?session_id={CHECKOUT_SESSION_ID}",

      cancel_url: `${clientUrl}/payment/cancelled` + `?order_id=${order.id}`,

      metadata: {
        paymentType: "ACTIVITY_ORDER",
        orderId: order.id,
        paymentId: payment.id,
        userId: userId || "",
        isGuest: order.userId ? "false" : "true",
      },

      payment_intent_data: {
        metadata: {
          paymentType: "ACTIVITY_ORDER",
          orderId: order.id,
          paymentId: payment.id,
          userId: userId || "",
          isGuest: order.userId ? "false" : "true",
        },
      },

      expires_at: Math.floor(
        (order.expiresAt || new Date(Date.now() + 30 * 60 * 1000)).getTime() /
          1000,
      ),
    });

    const updatedPayment = await prisma.payment.update({
      where: {
        id: payment.id,
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

      payment: serializePayment(updatedPayment),
    };
  } catch (error) {
    await prisma.payment.update({
      where: {
        id: payment.id,
      },

      data: {
        status: "FAILED",

        failureReason:
          error.message || "Stripe Checkout Session creation failed.",
      },
    });

    throw error;
  }
}

export async function getCheckoutStatus({
  userId = null,
  sessionId,
  guestAccessToken = null,
}) {
  const payment = await prisma.payment.findFirst({
    where: {
      providerCheckoutSessionId: sessionId,
    },

    include: {
      order: {
        include: {
          orderItems: true,
        },
      },
    },
  });

  if (!payment || !payment.order) {
    throw createHttpError("Payment was not found.", 404);
  }

  verifyOrderAccess({
    order: payment.order,
    userId,
    guestAccessToken,
  });

  return serializePayment(payment);
}

export async function listUserPayments({
  userId,
  status,
  page = 1,
  limit = 20,
}) {
  const safePage = Math.max(Number(page) || 1, 1);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const where = {
    order: {
      is: {
        userId,
      },
    },
  };

  if (status) {
    where.status = status;
  }

  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,

      include: {
        order: {
          include: {
            orderItems: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },

      skip: (safePage - 1) * safeLimit,

      take: safeLimit,
    }),

    prisma.payment.count({
      where,
    }),
  ]);

  return {
    payments: payments.map(serializePayment),

    pagination: {
      page: safePage,
      limit: safeLimit,
      total,

      totalPages: Math.ceil(total / safeLimit),
    },
  };
}
