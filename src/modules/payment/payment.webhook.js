import prisma from "../../config/prisma.js";
import stripe from "../../config/stripe.js";
import { createPaymentEventHandler } from "./payment.events.js";

const handlePaymentEvent = createPaymentEventHandler(prisma);

export async function stripePaymentWebhook(req, res) {
  const secret = process.env.STRIPE_PAYMENT_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ received: false });
  if (!Buffer.isBuffer(req.body)) {
    console.error("Payment webhook requires express.raw before express.json.");
    return res.status(500).json({ received: false });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], secret);
  } catch {
    return res.status(400).send("Invalid webhook signature.");
  }
  try {
    await handlePaymentEvent(event);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Activity webhook failed:", event.id, error.message);
    // Stripe should retry if the database write did not finish.
    return res.status(500).json({ received: false });
  }
}
