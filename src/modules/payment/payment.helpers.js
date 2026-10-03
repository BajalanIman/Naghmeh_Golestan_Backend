export function httpError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

export async function serializable(prisma, operation) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error.code !== "P2034" || attempt === 3) throw error;
    }
  }
}

// This integration charges EUR, matching the website's configured prices.
export function cents(amount, currency = "EUR") {
  if (currency.toUpperCase() !== "EUR") {
    throw httpError("Activity checkout currently supports EUR only.", 400, "UNSUPPORTED_CURRENCY");
  }
  const value = Number(amount);
  const result = Math.round(value * 100);
  if (!Number.isFinite(value) || !Number.isSafeInteger(result) || result < 0) {
    throw httpError("Invalid payment amount.", 500, "INVALID_PAYMENT_AMOUNT");
  }
  return result;
}

export const getId = value => typeof value === "string" ? value : value?.id || null;

export function getClientOrigin() {
  try {
    const url = new URL(process.env.CLIENT_URL);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== "/" ||
        (process.env.NODE_ENV === "production" && url.protocol !== "https:")) throw new Error();
    return url.origin;
  } catch {
    throw httpError("Payments are unavailable: invalid CLIENT_URL.", 503, "INVALID_CLIENT_URL");
  }
}

export function buildStripeLineItems(order) {
  const currency = order.currency.toLowerCase();
  const items = order.orderItems.map(item => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw httpError("Invalid order quantity.", 500, "INVALID_ORDER_QUANTITY");
    }
    // OrderItem.total is an immutable snapshot of ALL selected sessions.
    // quantity remains the number of people, so seat counts are unaffected.
    const total = cents(item.total, order.currency);
    if (total % item.quantity !== 0) {
      throw httpError("Invalid order item total.", 500, "INVALID_ORDER_ITEM_TOTAL");
    }
    const unit = total / item.quantity;
    const perSession = cents(item.unitPrice, order.currency);
    const sessionCount = perSession > 0 && unit % perSession === 0 ? unit / perSession : null;
    return {
      quantity: item.quantity,
      price_data: {
        currency,
        unit_amount: unit,
        product_data: {
          name: item.title,
          ...(sessionCount ? { description: `${sessionCount} session(s) per participant` } : {}),
          metadata: { orderItemId: item.id, activityId: item.activityId || "" },
        },
      },
    };
  });
  const tax = cents(order.taxAmount || 0, order.currency);
  if (tax > 0) {
    items.push({ quantity: 1, price_data: { currency, unit_amount: tax,
      product_data: { name: `Tax (${Number(order.taxRate) * 100}%)`, metadata: { type: "TAX", orderId: order.id } } } });
  }
  const sum = items.reduce((total, item) => total + item.quantity * item.price_data.unit_amount, 0);
  if (sum !== cents(order.total, order.currency)) {
    throw httpError("Checkout amount does not match the order total.", 500, "ORDER_TOTAL_MISMATCH");
  }
  return items;
}
