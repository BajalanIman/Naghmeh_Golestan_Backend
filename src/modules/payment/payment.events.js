import { cents, getId, serializable } from "./payment.helpers.js";

const protectedPayments = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"];
const supported = ["checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired", "payment_intent.payment_failed"];

async function seatsAvailable(tx, order) {
  const excludeIds = order.orderItems.map(item => item.registration?.id).filter(Boolean);
  const occupying = { id: { notIn: excludeIds }, OR: [
    { status: "CONFIRMED" },
    { status: "PENDING", orderItem: { is: { order: { is: { status: "PENDING",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } } } },
  ] };
  for (const item of order.orderItems) {
    if (!item.activity || !item.registration) return false;
    if (item.activity.capacity !== null) {
      const occupied = await tx.registration.aggregate({ where: { ...occupying, activityId: item.activityId }, _sum: { quantity: true } });
      if ((occupied._sum.quantity || 0) + item.quantity > item.activity.capacity) return false;
    }
    for (const { session } of item.registration.sessions) {
      if (session.capacity === null) continue;
      const occupied = await tx.registration.aggregate({ where: { ...occupying,
        sessions: { some: { sessionId: session.id } } }, _sum: { quantity: true } });
      if ((occupied._sum.quantity || 0) + item.quantity > session.capacity) return false;
    }
  }
  return true;
}

export function createPaymentEventHandler(prisma) {
  return async event => {
    if (!supported.includes(event.type)) return;
    const object = event.data.object;
    // Donation and membership events may reach this endpoint too.
    if (object.metadata?.paymentType !== "ACTIVITY_ORDER") return;
    const { orderId, paymentId } = object.metadata;
    if (!orderId || !paymentId) throw new Error("Activity payment metadata is incomplete.");
    const isIntent = event.type === "payment_intent.payment_failed";
    await serializable(prisma, async tx => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: {
        order: { include: { orderItems: { include: {
          activity: true, registration: { include: { sessions: { include: { session: true } } } },
        } } } },
      } });
      const order = payment?.order;
      if (!order || payment.orderId !== orderId || payment.donationId || payment.provider !== "STRIPE") {
        throw new Error("Activity payment/order relation mismatch.");
      }
      if (object.currency?.toUpperCase() !== payment.currency || order.currency !== payment.currency ||
          cents(payment.amount, payment.currency) !== cents(order.total, order.currency) ||
          (isIntent ? object.amount : object.amount_total) !== cents(payment.amount, payment.currency)) {
        throw new Error("Activity payment amount or currency mismatch.");
      }
      const intentId = isIntent ? object.id : getId(object.payment_intent);
      if (payment.providerPaymentId && intentId && payment.providerPaymentId !== intentId) {
        throw new Error("PaymentIntent mismatch.");
      }
      if (!isIntent && (object.mode !== "payment" || (payment.providerCheckoutSessionId &&
          payment.providerCheckoutSessionId !== object.id))) throw new Error("Checkout Session mismatch.");
      // Never reverse a completed payment or a refund after a duplicate/old event.
      if (protectedPayments.includes(payment.status) || ["REFUNDED", "PARTIALLY_REFUNDED"].includes(order.status)) return;
      const identifiers = {
        ...(!isIntent ? { providerCheckoutSessionId: object.id } : {}),
        ...(intentId ? { providerPaymentId: intentId } : {}),
        ...(getId(object.customer) ? { providerCustomerId: getId(object.customer) } : {}),
      };
      if (isIntent) {
        await tx.payment.update({ where: { id: paymentId }, data: { ...identifiers,
          status: "FAILED", failureReason: object.last_payment_error?.message || "Card payment failed." } });
        // A declined card does not end Checkout or release the customer's seats.
        return;
      }
      const successEvent = ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type);
      if (successEvent && object.payment_status !== "paid") {
        if (["PENDING", "PROCESSING"].includes(payment.status)) {
          await tx.payment.update({ where: { id: paymentId }, data: { ...identifiers, status: "PROCESSING" } });
        }
        return;
      }
      if (successEvent) {
        const paidAt = new Date(event.created * 1000);
        const explicitCancellation = order.status === "CANCELLED" &&
          (!order.expiresAt || (order.cancelledAt && order.cancelledAt < order.expiresAt));
        const otherSuccess = order.status === "PAID";
        const canConfirm = !explicitCancellation && !otherSuccess && await seatsAvailable(tx, order);
        const reviewReason = otherSuccess ? "DUPLICATE_PAYMENT_REVIEW_REQUIRED" : "BOOKING_REVIEW_REQUIRED";
        await tx.payment.update({ where: { id: paymentId }, data: { ...identifiers, status: "COMPLETED", paidAt,
          failureReason: canConfirm ? null : reviewReason } });
        if (!canConfirm) {
          // Never resurrect an expired seat if it was subsequently sold.
          // Keep the actual successful payment recorded for manual reconciliation.
          if (!otherSuccess) {
            await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
            await tx.registration.updateMany({ where: { orderItem: { is: { orderId } }, status: "PENDING" },
              data: { status: "CANCELLED", cancelledAt: new Date() } });
          }
          console.error("Activity payment requires booking review:", orderId, paymentId, reviewReason);
          return;
        }
        await tx.order.update({ where: { id: orderId }, data: { status: "PAID", paidAt, cancelledAt: null } });
        await tx.registration.updateMany({ where: { orderItem: { is: { orderId } }, status: { in: ["PENDING", "CANCELLED"] } },
          data: { status: "CONFIRMED", cancelledAt: null } });
        return;
      }
      const expired = event.type === "checkout.session.expired";
      await tx.payment.update({ where: { id: paymentId }, data: { ...identifiers,
        status: expired ? "CANCELLED" : "FAILED", failureReason: expired ? "Stripe Checkout expired." : "Asynchronous payment failed." } });
      if (!expired || order.status !== "PENDING") return;
      // An old Session must not cancel a newer attempt on the same order.
      const anotherAttempt = await tx.payment.findFirst({ where: { orderId, id: { not: paymentId },
        status: { in: ["PENDING", "PROCESSING"] } } });
      if (anotherAttempt) return;
      await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      await tx.registration.updateMany({ where: { orderItem: { is: { orderId } }, status: "PENDING" },
        data: { status: "CANCELLED", cancelledAt: new Date() } });
    });
  };
}
