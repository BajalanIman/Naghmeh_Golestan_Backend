import crypto from "node:crypto";
import prisma from "../../config/prisma.js";

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSubscription({
  email,
  firstName,
  language = "EN",
}) {
  const existingSubscriber = await prisma.subscriber.findUnique({
    where: {
      email,
    },
  });

  // اگر قبلاً تأیید شده باشد، دوباره ثبت نشود
  if (existingSubscriber?.status === "CONFIRMED") {
    const error = new Error("This email is already subscribed.");
    error.statusCode = 409;
    throw error;
  }

  const confirmationToken = generateToken();
  const confirmTokenHash = hashToken(confirmationToken);

  const confirmTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const subscriber = await prisma.subscriber.upsert({
    where: {
      email,
    },

    update: {
      firstName: firstName || null,
      language,
      status: "PENDING",
      consentAt: new Date(),
      confirmedAt: null,
      unsubscribedAt: null,
      confirmTokenHash,
      confirmTokenExpiresAt,
    },

    create: {
      email,
      firstName: firstName || null,
      language,
      status: "PENDING",
      consentAt: new Date(),
      confirmTokenHash,
      confirmTokenExpiresAt,
    },

    select: {
      id: true,
      email: true,
      firstName: true,
      language: true,
      status: true,
      createdAt: true,
    },
  });

  return {
    subscriber,
    confirmationToken,
  };
}
