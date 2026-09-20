const getId = (value) =>
  typeof value === "string" ? value : value?.id || null;
const protectedStatuses = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"];

// Serializable transactions and retries make simultaneous webhook deliveries safe.
export async function serializable(prisma, operation) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (error.code !== "P2034" || attempt === 3) throw error;
    }
  }
}

export function createDonationEventHandler(prisma) {
  return async function handleDonationEvent(event) {
    const supported = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ];
    if (!supported.includes(event.type)) return;
    const session = event.data.object;
    // This endpoint can receive events for orders/memberships on the same account.
    if (session.metadata?.paymentType !== "DONATION") return;
    const { donationId, paymentId } = session.metadata;
    if (!donationId || !paymentId)
      throw new Error("Donation event metadata is incomplete.");

    await serializable(prisma, async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { donation: true },
      });
      const donation = payment?.donation;
      if (
        !donation ||
        payment.donationId !== donationId ||
        payment.orderId ||
        payment.provider !== "STRIPE"
      )
        throw new Error("Donation/payment relation mismatch.");
      if (
        payment.providerCheckoutSessionId &&
        payment.providerCheckoutSessionId !== session.id
      )
        throw new Error("Checkout Session mismatch.");
      if (
        session.mode !== "payment" ||
        session.currency?.toUpperCase() !== payment.currency ||
        donation.currency !== payment.currency ||
        session.amount_total !== Math.round(Number(payment.amount) * 100) ||
        Number(donation.amount) !== Number(payment.amount)
      ) {
        throw new Error("Donation amount or currency mismatch.");
      }
      const intentId = getId(session.payment_intent);
      if (
        payment.providerPaymentId &&
        intentId &&
        payment.providerPaymentId !== intentId
      )
        throw new Error("PaymentIntent mismatch.");
      // Never undo success or a refund. Duplicate success must preserve paidAt.
      if (
        protectedStatuses.includes(payment.status) ||
        ["COMPLETED", "REFUNDED"].includes(donation.status)
      )
        return;
      const identifiers = {
        providerCheckoutSessionId: session.id,
        ...(intentId ? { providerPaymentId: intentId } : {}),
        ...(getId(session.customer)
          ? { providerCustomerId: getId(session.customer) }
          : {}),
      };
      if (
        [
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
        ].includes(event.type)
      ) {
        if (session.payment_status !== "paid") {
          if (["PENDING", "PROCESSING"].includes(payment.status)) {
            await tx.payment.update({
              where: { id: paymentId },
              data: { ...identifiers, status: "PROCESSING" },
            });
          }
          return;
        }
        const paidAt = new Date(event.created * 1000);
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            ...identifiers,
            status: "COMPLETED",
            paidAt,
            failureReason: null,
          },
        });
        await tx.donation.update({
          where: { id: donationId },
          data: { status: "COMPLETED", completedAt: paidAt },
        });
      } else if (["PENDING", "PROCESSING"].includes(payment.status)) {
        const expired = event.type === "checkout.session.expired";
        const status = expired ? "CANCELLED" : "FAILED";
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            ...identifiers,
            status,
            failureReason: expired
              ? "Checkout expired."
              : "Asynchronous payment failed.",
          },
        });
        await tx.donation.update({
          where: { id: donationId },
          data: { status },
        });
      }
    });
  };
}
