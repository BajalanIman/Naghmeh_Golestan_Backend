import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.js";

const OCCUPYING_REGISTRATION_STATUSES = ["PENDING", "CONFIRMED"];

const orderInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  },

  orderItems: {
    include: {
      activity: {
        include: {
          translations: true,

          sessions: {
            include: {
              location: true,
            },

            orderBy: {
              startAt: "asc",
            },
          },
        },
      },

      registration: {
        include: {
          sessions: {
            include: {
              session: {
                include: {
                  location: true,
                },
              },
            },
          },
        },
      },
    },
  },

  payments: {
    orderBy: {
      createdAt: "desc",
    },
  },
};

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

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function serializeOrder(order) {
  if (!order) {
    return order;
  }

  return {
    ...order,

    subtotal: serializeDecimal(order.subtotal),
    discount: serializeDecimal(order.discount),
    taxRate: serializeDecimal(order.taxRate),
    taxAmount: serializeDecimal(order.taxAmount),
    total: serializeDecimal(order.total),

    orderItems:
      order.orderItems?.map((item) => ({
        ...item,

        unitPrice: serializeDecimal(item.unitPrice),
        total: serializeDecimal(item.total),

        activity: item.activity
          ? {
              ...item.activity,

              price: serializeDecimal(item.activity.price),
              taxRate: serializeDecimal(item.activity.taxRate),

              sessions:
                item.activity.sessions?.map((session) => ({
                  ...session,

                  location: session.location
                    ? {
                        ...session.location,

                        latitude: serializeDecimal(session.location.latitude),

                        longitude: serializeDecimal(session.location.longitude),
                      }
                    : null,
                })) || [],
            }
          : null,
      })) || [],

    payments:
      order.payments?.map((payment) => ({
        ...payment,
        amount: serializeDecimal(payment.amount),
      })) || [],
  };
}

async function runSerializableTransaction(operation) {
  const maximumAttempts = 3;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error.code === "P2034" && attempt < maximumAttempts) {
        continue;
      }

      throw error;
    }
  }

  throw createHttpError("The order could not be completed.", 500);
}

function findTranslation(translations, preferredLanguage = "EN") {
  return (
    translations.find(
      (translation) => translation.language === preferredLanguage,
    ) ||
    translations.find((translation) => translation.language === "EN") ||
    translations[0] ||
    null
  );
}

function calculateOrderAmounts(activity, quantity, selectedSessionCount = 1) {
  const unitPrice = activity.isFree ? 0 : Number(activity.price || 0);
  const taxRate = Number(activity.taxRate || 0);

  const actualSessionCount = Math.max(Number(selectedSessionCount) || 0, 1);

  // COURSE: Activity.price is the price for the whole course per participant.
  // WORKSHOP/EVENT: Activity.price is charged per selected session per participant.
  const chargeableSessionCount =
    activity.type === "COURSE" ? 1 : actualSessionCount;

  const subtotal = roundMoney(
    unitPrice * quantity * chargeableSessionCount,
  );
  const discount = 0;
  const taxableAmount = roundMoney(subtotal - discount);
  const taxAmount = roundMoney(taxableAmount * taxRate);
  const total = roundMoney(taxableAmount + taxAmount);

  return {
    unitPrice,
    quantity,
    sessionCount: actualSessionCount,
    chargeableSessionCount,
    subtotal,
    discount,
    taxRate,
    taxPercentage: roundMoney(taxRate * 100),
    taxAmount,
    total,
    currency: activity.currency,
  };
}

function getSessionTimeZone(session) {
  return session?.timezone || "Europe/Berlin";
}

function formatSessionDatePart(dateValue, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(dateValue));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function formatSessionTimePart(dateValue, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(dateValue));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.hour}:${values.minute}`;
}

function getSessionLocalDateKey(session) {
  return formatSessionDatePart(session.startAt, getSessionTimeZone(session));
}

function getSessionTimeSlotKey(session) {
  const timeZone = getSessionTimeZone(session);
  const start = formatSessionTimePart(session.startAt, timeZone);
  const end = formatSessionTimePart(session.endAt, timeZone);

  return `${timeZone}|${start}-${end}`;
}

function courseHasAlternativeTimeSlots(activitySessions) {
  const sessionsPerDate = new Map();

  for (const session of activitySessions) {
    const dateKey = getSessionLocalDateKey(session);
    sessionsPerDate.set(dateKey, (sessionsPerDate.get(dateKey) || 0) + 1);
  }

  return [...sessionsPerDate.values()].some((count) => count > 1);
}

function resolveSelectedSessions(
  activitySessions,
  requestedSessionIds = [],
  sessionSelectionMode = "ALL",
  activityType = null,
) {
  if (activitySessions.length === 0) {
    if (requestedSessionIds.length > 0) {
      throw createHttpError(
        "This activity does not have selectable sessions.",
        400,
      );
    }

    return [];
  }

  const uniqueRequestedSessionIds = [...new Set(requestedSessionIds)];
  const sessionsById = new Map(
    activitySessions.map((session) => [session.id, session]),
  );

  /*
    COURSE:
    - اگر در یک تاریخ چند Session وجود داشته باشد، آن‌ها Time Slotهای جایگزین‌اند.
    - کاربر یک Time Slot را انتخاب می‌کند.
    - Backend تمام تاریخ‌های متعلق به همان Time Slot را ثبت می‌کند.
    - اگر Time Slot جایگزین وجود نداشته باشد، تمام Sessionهای دوره اجباری‌اند.
  */
  if (activityType === "COURSE") {
    if (!courseHasAlternativeTimeSlots(activitySessions)) {
      return activitySessions;
    }

    if (uniqueRequestedSessionIds.length === 0) {
      throw createHttpError(
        "Please select one course time slot.",
        400,
        "COURSE_TIME_SLOT_REQUIRED",
      );
    }

    const requestedSessions = uniqueRequestedSessionIds.map((sessionId) => {
      const session = sessionsById.get(sessionId);

      if (!session) {
        throw createHttpError(
          "One or more selected sessions do not belong to this activity.",
          400,
          "INVALID_SESSION",
        );
      }

      return session;
    });

    const selectedSlotKeys = new Set(
      requestedSessions.map((session) => getSessionTimeSlotKey(session)),
    );

    if (selectedSlotKeys.size !== 1) {
      throw createHttpError(
        "Please select exactly one course time slot.",
        400,
        "MULTIPLE_COURSE_TIME_SLOTS",
      );
    }

    const [selectedSlotKey] = selectedSlotKeys;

    return activitySessions.filter(
      (session) => getSessionTimeSlotKey(session) === selectedSlotKey,
    );
  }

  if (activitySessions.length === 1 && uniqueRequestedSessionIds.length === 0) {
    return activitySessions;
  }

  if (sessionSelectionMode === "ALL") {
    return activitySessions;
  }

  if (
    sessionSelectionMode === "SINGLE" &&
    uniqueRequestedSessionIds.length !== 1
  ) {
    throw createHttpError(
      "Please select exactly one session.",
      400,
      "SINGLE_SESSION_REQUIRED",
    );
  }

  if (
    sessionSelectionMode === "MULTIPLE" &&
    uniqueRequestedSessionIds.length === 0
  ) {
    throw createHttpError(
      "Please select at least one session.",
      400,
      "SESSION_REQUIRED",
    );
  }

  return uniqueRequestedSessionIds.map((sessionId) => {
    const session = sessionsById.get(sessionId);

    if (!session) {
      throw createHttpError(
        "One or more selected sessions do not belong to this activity.",
        400,
        "INVALID_SESSION",
      );
    }

    return session;
  });
}

/*
  فقط Registrationهای فعال را در ظرفیت حساب می‌کنیم.

  Registration تأییدشده همیشه ظرفیت اشغال می‌کند.

  Registration در وضعیت PENDING فقط وقتی ظرفیت اشغال
  می‌کند که Order آن هنوز PENDING و منقضی‌نشده باشد.
*/
function getOccupyingRegistrationWhere() {
  const now = new Date();

  return {
    OR: [
      {
        status: "CONFIRMED",
      },

      {
        status: "PENDING",

        orderItem: {
          is: {
            order: {
              is: {
                status: "PENDING",

                OR: [
                  {
                    expiresAt: null,
                  },
                  {
                    expiresAt: {
                      gt: now,
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  };
}

async function getOccupiedActivitySeats(transaction, activityId) {
  const result = await transaction.registration.aggregate({
    where: {
      activityId,
      ...getOccupyingRegistrationWhere(),
    },

    _sum: {
      quantity: true,
    },
  });

  return result._sum.quantity || 0;
}

async function getOccupiedSessionSeats(transaction, sessionId) {
  const result = await transaction.registration.aggregate({
    where: {
      ...getOccupyingRegistrationWhere(),

      sessions: {
        some: {
          sessionId,
        },
      },
    },

    _sum: {
      quantity: true,
    },
  });

  return result._sum.quantity || 0;
}

async function checkActivityCapacity({ transaction, activity, quantity }) {
  if (activity.capacity === null) {
    return;
  }

  // For a COURSE with alternative time slots, activity.capacity is the
  // capacity of EACH time slot, not a global cap shared by all slots.
  // Capacity is therefore enforced by checkSessionCapacity below.
  if (
    activity.type === "COURSE" &&
    courseHasAlternativeTimeSlots(activity.sessions || [])
  ) {
    return;
  }

  const occupied = await getOccupiedActivitySeats(transaction, activity.id);

  const remaining = Math.max(activity.capacity - occupied, 0);

  if (quantity > remaining) {
    throw createHttpError(
      `Only ${remaining} places are currently available.`,
      409,
      "NOT_ENOUGH_CAPACITY",
    );
  }
}

async function checkSessionCapacity({
  transaction,
  activity,
  sessions,
  quantity,
}) {
  const useCourseSlotCapacity =
    activity?.type === "COURSE" &&
    courseHasAlternativeTimeSlots(activity.sessions || []) &&
    activity.capacity !== null;

  for (const session of sessions) {
    const capacity = useCourseSlotCapacity
      ? Number(activity.capacity)
      : session.capacity;

    if (capacity === null || capacity === undefined) {
      continue;
    }

    const occupied = await getOccupiedSessionSeats(transaction, session.id);

    const remaining = Math.max(Number(capacity) - occupied, 0);

    if (quantity > remaining) {
      throw createHttpError(
        `Only ${remaining} places are available in the selected session.`,
        409,
        "SESSION_CAPACITY_EXCEEDED",
      );
    }
  }
}

async function expireOldPendingOrders(transaction) {
  const now = new Date();

  const expiredOrders = await transaction.order.findMany({
    where: {
      status: "PENDING",

      expiresAt: {
        lte: now,
      },
    },

    select: {
      id: true,

      orderItems: {
        select: {
          registration: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (expiredOrders.length === 0) {
    return;
  }

  const orderIds = expiredOrders.map((order) => order.id);

  const registrationIds = expiredOrders
    .flatMap((order) => order.orderItems.map((item) => item.registration?.id))
    .filter(Boolean);

  if (registrationIds.length > 0) {
    await transaction.registration.updateMany({
      where: {
        id: {
          in: registrationIds,
        },

        status: "PENDING",
      },

      data: {
        status: "CANCELLED",
        cancelledAt: now,
      },
    });
  }

  await transaction.order.updateMany({
    where: {
      id: {
        in: orderIds,
      },

      status: "PENDING",
    },

    data: {
      status: "CANCELLED",
      cancelledAt: now,
    },
  });
}

export async function createActivityQuote({
  activityId,
  sessionIds = [],
  quantity,
}) {
  const activity = await prisma.activity.findUnique({
    where: {
      id: activityId,
    },

    include: {
      translations: true,

      sessions: {
        orderBy: {
          startAt: "asc",
        },
      },
    },
  });

  if (!activity) {
    throw createHttpError("Activity not found.", 404);
  }

  if (activity.status !== "PUBLISHED") {
    throw createHttpError(
      "This activity is not currently available.",
      409,
      "ACTIVITY_NOT_AVAILABLE",
    );
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw createHttpError(
      "Quantity must be a positive integer.",
      400,
      "INVALID_QUANTITY",
    );
  }

  if (quantity > activity.maxTicketsPerOrder) {
    throw createHttpError(
      `A maximum of ${activity.maxTicketsPerOrder} places can be booked per order.`,
      400,
      "MAX_QUANTITY_EXCEEDED",
    );
  }

  if (
    !activity.isFree &&
    (activity.price === null || Number(activity.price) <= 0)
  ) {
    throw createHttpError(
      "This activity does not have a valid price.",
      500,
      "INVALID_ACTIVITY_PRICE",
    );
  }

  const selectedSessions = resolveSelectedSessions(
    activity.sessions,
    sessionIds,
    activity.sessionSelectionMode,
    activity.type,
  );

  const now = new Date();

  for (const session of selectedSessions) {
    if (session.endAt <= now) {
      throw createHttpError(
        "A selected session has already ended.",
        409,
        "SESSION_ENDED",
      );
    }
  }

  const hasAlternativeCourseTimeSlots =
    activity.type === "COURSE" &&
    courseHasAlternativeTimeSlots(activity.sessions || []);

  const occupied = hasAlternativeCourseTimeSlots
    ? null
    : await getOccupiedActivitySeats(prisma, activity.id);

  const remaining = hasAlternativeCourseTimeSlots
    ? null
    : activity.capacity === null
      ? null
      : Math.max(activity.capacity - occupied, 0);

  if (remaining !== null && quantity > remaining) {
    throw createHttpError(
      `Only ${remaining} places are currently available.`,
      409,
      "NOT_ENOUGH_CAPACITY",
    );
  }

  await checkSessionCapacity({
    transaction: prisma,
    activity,
    sessions: selectedSessions,
    quantity,
  });

  const amounts = calculateOrderAmounts(
    activity,
    quantity,
    selectedSessions.length,
  );

  return {
    activityId: activity.id,
    type: activity.type,
    isFree: activity.isFree,

    capacity: activity.capacity,
    occupied,
    remaining,

    maxTicketsPerOrder: activity.maxTicketsPerOrder,

    ...amounts,
  };
}

export async function createActivityOrder({
  user,
  activityId,
  sessionIds = [],
  quantity,
  preferredLanguage = "EN",
  guestData = {},
}) {
  return runSerializableTransaction(async (transaction) => {
    /*
        Orderهای قدیمی منقضی‌شده را قبل از
        محاسبه ظرفیت آزاد می‌کنیم.
      */
    await expireOldPendingOrders(transaction);

    const activity = await transaction.activity.findUnique({
      where: {
        id: activityId,
      },

      include: {
        translations: true,

        sessions: {
          include: {
            location: true,
          },

          orderBy: {
            startAt: "asc",
          },
        },
      },
    });

    if (!activity) {
      throw createHttpError("Activity not found.", 404);
    }

    if (activity.status !== "PUBLISHED") {
      throw createHttpError(
        "This activity is not available for booking.",
        409,
        "ACTIVITY_NOT_AVAILABLE",
      );
    }

    if (activity.isFree) {
      throw createHttpError(
        "This activity is free. Please use the registration endpoint.",
        409,
        "FREE_ACTIVITY",
      );
    }

    if (activity.price === null || Number(activity.price) <= 0) {
      throw createHttpError(
        "This activity does not have a valid price.",
        500,
        "INVALID_ACTIVITY_PRICE",
      );
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > activity.maxTicketsPerOrder
    ) {
      throw createHttpError(
        `You may book between 1 and ${activity.maxTicketsPerOrder} places.`,
        400,
        "INVALID_QUANTITY",
      );
    }

    const resolvedEmail = user?.email || guestData.email?.trim().toLowerCase();

    const resolvedFirstName = user?.firstName || guestData.firstName?.trim();

    const resolvedLastName =
      user?.lastName || guestData.lastName?.trim() || null;

    const resolvedPhone = user?.phone || guestData.phone?.trim() || null;

    if (!resolvedEmail || !resolvedFirstName) {
      throw createHttpError(
        "First name and email are required for guest checkout.",
        400,
        "GUEST_INFORMATION_REQUIRED",
      );
    }

    const selectedSessions = resolveSelectedSessions(
      activity.sessions,
      sessionIds,
      activity.sessionSelectionMode,
      activity.type,
    );

    const now = new Date();

    for (const session of selectedSessions) {
      if (session.endAt <= now) {
        throw createHttpError(
          "A selected session has already ended.",
          409,
          "SESSION_ENDED",
        );
      }
    }

    await checkActivityCapacity({
      transaction,
      activity,
      quantity,
    });

    await checkSessionCapacity({
      transaction,
      activity,
      sessions: selectedSessions,
      quantity,
    });

    const translation = findTranslation(
      activity.translations,
      preferredLanguage,
    );

    if (!translation) {
      throw createHttpError("This activity does not have a title.", 500);
    }

    const amounts = calculateOrderAmounts(
      activity,
      quantity,
      selectedSessions.length,
    );

    /*
        برای Guest یک Token تصادفی تولید می‌کنیم.
        فقط Hash آن در دیتابیس ذخیره می‌شود.
      */
    const guestAccessToken = user
      ? null
      : crypto.randomBytes(32).toString("hex");

    const order = await transaction.order.create({
      data: {
        userId: user?.id || null,

        email: resolvedEmail,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        phone: resolvedPhone,

        subtotal: new Prisma.Decimal(amounts.subtotal),

        discount: new Prisma.Decimal(amounts.discount),

        taxRate: new Prisma.Decimal(amounts.taxRate),

        taxAmount: new Prisma.Decimal(amounts.taxAmount),

        total: new Prisma.Decimal(amounts.total),

        currency: activity.currency,
        status: "PENDING",

        expiresAt: new Date(Date.now() + 30 * 60 * 1000),

        guestAccessTokenHash: guestAccessToken
          ? hashToken(guestAccessToken)
          : null,

        orderItems: {
          create: {
            activityId: activity.id,
            title: translation.title,
            unitPrice: activity.price,
            quantity,

            /*
                  OrderItem.total بدون مالیات است.
                  مالیات در Order.taxAmount ذخیره می‌شود.
                */
            total: new Prisma.Decimal(amounts.subtotal),
          },
        },
      },

      include: {
        orderItems: true,
      },
    });

    const orderItem = order.orderItems[0];

    const registration = await transaction.registration.create({
      data: {
        userId: user?.id || null,
        activityId: activity.id,
        orderItemId: orderItem.id,
        quantity,
        status: "PENDING",

        sessions:
          selectedSessions.length > 0
            ? {
                create: selectedSessions.map((session) => ({
                  sessionId: session.id,
                })),
              }
            : undefined,
      },
    });

    const completeOrder = await transaction.order.findUnique({
      where: {
        id: order.id,
      },

      include: orderInclude,
    });

    return {
      order: serializeOrder(completeOrder),
      registrationId: registration.id,
      guestAccessToken,
    };
  });
}

export async function listUserOrders({ userId, status, page = 1, limit = 20 }) {
  const safePage = Math.max(Number(page) || 1, 1);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const where = {
    userId,
  };

  if (status) {
    where.status = status;
  }

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: orderInclude,

      orderBy: {
        createdAt: "desc",
      },

      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),

    prisma.order.count({
      where,
    }),
  ]);

  return {
    orders: orders.map(serializeOrder),

    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

export async function getUserOrder({ userId, orderId }) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      userId,
    },

    include: orderInclude,
  });

  if (!order) {
    throw createHttpError("Order not found.", 404);
  }

  return serializeOrder(order);
}

export async function cancelPendingOrder({ userId, orderId }) {
  return runSerializableTransaction(async (transaction) => {
    const order = await transaction.order.findFirst({
      where: {
        id: orderId,
        userId,
      },

      include: {
        orderItems: {
          include: {
            registration: true,
          },
        },
      },
    });

    if (!order) {
      throw createHttpError("Order not found.", 404);
    }

    if (order.status !== "PENDING") {
      throw createHttpError(
        "Only pending orders can be cancelled directly.",
        409,
        "ORDER_NOT_PENDING",
      );
    }

    const registrationIds = order.orderItems
      .map((item) => item.registration?.id)
      .filter(Boolean);

    if (registrationIds.length > 0) {
      await transaction.registration.updateMany({
        where: {
          id: {
            in: registrationIds,
          },
        },

        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });
    }

    const updatedOrder = await transaction.order.update({
      where: {
        id: order.id,
      },

      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },

      include: orderInclude,
    });

    return serializeOrder(updatedOrder);
  });
}
