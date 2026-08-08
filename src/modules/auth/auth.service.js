import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../config/prisma.js";

const SALT_ROUNDS = 12;

function createToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return jwt.sign(
    {
      sub: userId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    },
  );
}

function getMembershipInformation(subscriptions) {
  const activeSubscription = subscriptions.find(
    (subscription) =>
      subscription.status === "ACTIVE" &&
      (!subscription.currentPeriodEnd ||
        subscription.currentPeriodEnd > new Date()),
  );

  if (!activeSubscription) {
    return {
      isMember: false,
      subscriptionId: null,
      status: null,
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    isMember: true,
    subscriptionId: activeSubscription.id,
    status: activeSubscription.status,
    billingInterval: activeSubscription.price.billingInterval,
    currentPeriodEnd: activeSubscription.currentPeriodEnd,
    cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
  };
}

function formatUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    membership: getMembershipInformation(user.membershipSubscriptions || []),
  };
}

const userInclude = {
  membershipSubscriptions: {
    where: {
      status: {
        in: ["ACTIVE", "PAST_DUE", "PAUSED", "INCOMPLETE"],
      },
    },
    include: {
      price: true,
      plan: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  },
};

export async function signUpUser({
  email,
  password,
  firstName,
  lastName,
  phone,
}) {
  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingUser) {
    const error = new Error("An account with this email already exists.");
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      phone: phone || null,
    },
    include: userInclude,
  });

  const token = createToken(user.id);

  return {
    user: formatUser(user),
    token,
  };
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
    include: userInclude,
  });

  // عمداً پیام مشترک برای ایمیل و رمز اشتباه
  if (!user || !user.passwordHash) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  const passwordIsValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordIsValid) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  const updatedUser = await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      lastLoginAt: new Date(),
    },
    include: userInclude,
  });

  const token = createToken(updatedUser.id);

  return {
    user: formatUser(updatedUser),
    token,
  };
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    include: userInclude,
  });

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return formatUser(user);
}
