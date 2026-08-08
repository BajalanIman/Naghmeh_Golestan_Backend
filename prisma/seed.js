import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plan = await prisma.membershipPlan.upsert({
    where: {
      slug: "golestan-membership",
    },

    update: {
      name: "Golestan Membership",
      description: "Monthly or yearly Golestan membership.",
      isActive: true,
    },

    create: {
      name: "Golestan Membership",
      slug: "golestan-membership",
      description: "Monthly or yearly Golestan membership.",
      isActive: true,
    },
  });

  await prisma.membershipPrice.upsert({
    where: {
      planId_billingInterval_currency: {
        planId: plan.id,
        billingInterval: "MONTHLY",
        currency: "EUR",
      },
    },

    update: {
      amount: 10,
      provider: "STRIPE",
      providerPriceId: process.env.STRIPE_MONTHLY_PRICE_ID || null,
      isActive: true,
    },

    create: {
      planId: plan.id,
      billingInterval: "MONTHLY",
      amount: 10,
      currency: "EUR",
      provider: "STRIPE",
      providerPriceId: process.env.STRIPE_MONTHLY_PRICE_ID || null,
      isActive: true,
    },
  });

  await prisma.membershipPrice.upsert({
    where: {
      planId_billingInterval_currency: {
        planId: plan.id,
        billingInterval: "YEARLY",
        currency: "EUR",
      },
    },

    update: {
      amount: 100,
      provider: "STRIPE",
      providerPriceId: process.env.STRIPE_YEARLY_PRICE_ID || null,
      isActive: true,
    },

    create: {
      planId: plan.id,
      billingInterval: "YEARLY",
      amount: 100,
      currency: "EUR",
      provider: "STRIPE",
      providerPriceId: process.env.STRIPE_YEARLY_PRICE_ID || null,
      isActive: true,
    },
  });

  console.log("Membership plans and prices created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
