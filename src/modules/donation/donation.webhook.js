import prisma from "../../config/prisma.js";
import stripe from "../../config/stripe.js";
import { createDonationEventHandler } from "./donation.events.js";

const handleDonationEvent = createDonationEventHandler(prisma);

export async function stripeDonationWebhook(req, res) {
  const secret = process.env.STRIPE_DONATION_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ received: false });
  if (!Buffer.isBuffer(req.body)) {
    console.error("Donation webhook requires express.raw before express.json.");
    return res.status(500).json({ received: false });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      secret,
    );
  } catch {
    return res.status(400).send("Invalid webhook signature.");
  }
  try {
    await handleDonationEvent(event);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Donation webhook failed:", event.id, error.message);
    // Do not acknowledge a failed database write: Stripe must retry delivery.
    return res.status(500).json({ received: false });
  }
}
