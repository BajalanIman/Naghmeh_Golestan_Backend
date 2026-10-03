import crypto from "crypto";

import { Prisma } from "@prisma/client";

import prisma from "../../config/prisma.js";



const OCCUPYING_STATUSES = ["PENDING", "CONFIRMED"];



const registrationInclude = {

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



  sessions: {

    include: {

      session: {

        include: {

          location: true,

        },

      },

    },

  },



  orderItem: {

    include: {

      order: {

        select: {

          id: true,

          status: true,

          email: true,

          firstName: true,

          lastName: true,

          phone: true,

          subtotal: true,

          discount: true,

          taxRate: true,

          taxAmount: true,

          total: true,

          currency: true,

          paidAt: true,

        },

      },

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



function serializeDecimal(value) {

  if (value === null || value === undefined) {

    return value;

  }



  return Number(value);

}



function serializeRegistration(registration) {

  if (!registration) {

    return registration;

  }



  return {

    ...registration,



    orderItem: registration.orderItem

      ? {

          ...registration.orderItem,



          unitPrice: serializeDecimal(registration.orderItem.unitPrice),



          total: serializeDecimal(registration.orderItem.total),



          order: registration.orderItem.order

            ? {

                ...registration.orderItem.order,



                subtotal: serializeDecimal(

                  registration.orderItem.order.subtotal,

                ),



                discount: serializeDecimal(

                  registration.orderItem.order.discount,

                ),



                taxRate: serializeDecimal(registration.orderItem.order.taxRate),



                taxAmount: serializeDecimal(

                  registration.orderItem.order.taxAmount,

                ),



                total: serializeDecimal(registration.orderItem.order.total),

              }

            : null,

        }

      : null,

  };

}



function hashToken(token) {

  return crypto.createHash("sha256").update(token).digest("hex");

}



async function runSerializableTransaction(operation) {

  const maximumAttempts = 3;



  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {

    try {

      return await prisma.$transaction(operation, {

        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,

      });

    } catch (error) {

      const shouldRetry = error.code === "P2034" && attempt < maximumAttempts;



      if (shouldRetry) {

        continue;

      }



      throw error;

    }

  }



  throw createHttpError("Registration could not be completed.", 500);

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
  // capacity of each slot. It must not be treated as one global cap shared
  // by all alternative slots.
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



export async function createFreeRegistration({

  user = null,

  activityId,

  sessionIds = [],

  quantity = 1,

  preferredLanguage = "EN",

  guestData = {},

}) {

  return runSerializableTransaction(async (transaction) => {

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

        "This activity is not available for registration.",

        409,

        "ACTIVITY_NOT_AVAILABLE",

      );

    }



    if (!activity.isFree) {

      throw createHttpError(

        "This is a paid activity. Please continue through checkout.",

        402,

        "PAYMENT_REQUIRED",

      );

    }



    if (

      !Number.isInteger(quantity) ||

      quantity < 1 ||

      quantity > activity.maxTicketsPerOrder

    ) {

      throw createHttpError(

        `You may reserve between 1 and ${activity.maxTicketsPerOrder} places.`,

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

        "First name and email are required for guest registration.",

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

          "Registration is not available for a session that has already ended.",

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



    /*

        حتی برای Activity رایگان یک Order صفر یورویی

        می‌سازیم تا اطلاعات Guest ذخیره شوند و ساختار

        گزارش‌ها یکسان باقی بماند.

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



        subtotal: new Prisma.Decimal(0),

        discount: new Prisma.Decimal(0),

        taxRate: new Prisma.Decimal(0),

        taxAmount: new Prisma.Decimal(0),

        total: new Prisma.Decimal(0),



        currency: activity.currency,



        /*

              چون مبلغ صفر است و پرداخت لازم ندارد،

              Order بلافاصله PAID در نظر گرفته می‌شود.

            */

        status: "PAID",

        paidAt: new Date(),



        guestAccessTokenHash: guestAccessToken

          ? hashToken(guestAccessToken)

          : null,



        orderItems: {

          create: {

            activityId: activity.id,

            title: translation.title,

            unitPrice: new Prisma.Decimal(0),

            quantity,

            total: new Prisma.Decimal(0),

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

        status: "CONFIRMED",



        sessions:

          selectedSessions.length > 0

            ? {

                create: selectedSessions.map((session) => ({

                  sessionId: session.id,

                })),

              }

            : undefined,

      },



      include: registrationInclude,

    });



    return {

      registration: serializeRegistration(registration),



      guestAccessToken,

    };

  });

}



export async function listUserRegistrations({

  userId,

  status,

  page = 1,

  limit = 20,

}) {

  const safePage = Math.max(Number(page) || 1, 1);



  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);



  const where = {

    userId,

  };



  if (status) {

    where.status = status;

  }



  const [registrations, total] = await prisma.$transaction([

    prisma.registration.findMany({

      where,



      include: registrationInclude,



      orderBy: {

        registeredAt: "desc",

      },



      skip: (safePage - 1) * safeLimit,

      take: safeLimit,

    }),



    prisma.registration.count({

      where,

    }),

  ]);



  return {

    registrations: registrations.map(serializeRegistration),



    pagination: {

      page: safePage,

      limit: safeLimit,

      total,

      totalPages: Math.ceil(total / safeLimit),

    },

  };

}



export async function getUserRegistration({ userId, registrationId }) {

  const registration = await prisma.registration.findFirst({

    where: {

      id: registrationId,

      userId,

    },



    include: registrationInclude,

  });



  if (!registration) {

    throw createHttpError("Registration not found.", 404);

  }



  return serializeRegistration(registration);

}



export async function cancelUserRegistration({ userId, registrationId }) {

  const registration = await prisma.registration.findFirst({

    where: {

      id: registrationId,

      userId,

    },



    include: {

      activity: true,



      orderItem: {

        include: {

          order: true,

        },

      },

    },

  });



  if (!registration) {

    throw createHttpError("Registration not found.", 404);

  }



  if (registration.status === "CANCELLED") {

    throw createHttpError("This registration is already cancelled.", 409);

  }



  if (registration.status === "ATTENDED") {

    throw createHttpError("An attended registration cannot be cancelled.", 409);

  }



  /*

    Order رایگان مبلغ صفر دارد و نیازی به Refund ندارد.

    Registrationهای پولی باید از فرآیند Refund عبور کنند.

  */

  if (

    registration.orderItem &&

    Number(registration.orderItem.order.total) > 0

  ) {

    throw createHttpError(

      "Paid registrations must be cancelled through the order and refund process.",

      409,

      "PAID_REGISTRATION",

    );

  }



  const updatedRegistration = await prisma.$transaction(async (transaction) => {

    const updated = await transaction.registration.update({

      where: {

        id: registration.id,

      },



      data: {

        status: "CANCELLED",

        cancelledAt: new Date(),

      },



      include: registrationInclude,

    });



    if (registration.orderItem?.order?.id) {

      await transaction.order.updateMany({

        where: {

          id: registration.orderItem.order.id,



          total: new Prisma.Decimal(0),

        },



        data: {

          status: "CANCELLED",

          cancelledAt: new Date(),

        },

      });

    }



    return updated;

  });



  return serializeRegistration(updatedRegistration);

}



export async function getActivityAvailability(activityId) {

  const activity = await prisma.activity.findUnique({

    where: {

      id: activityId,

    },



    include: {

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



  const hasAlternativeCourseTimeSlots =
    activity.type === "COURSE" &&
    courseHasAlternativeTimeSlots(activity.sessions || []);



  const occupied = await getOccupiedActivitySeats(prisma, activity.id);



  const sessionAvailability = await Promise.all(

    activity.sessions.map(async (session) => {

      const sessionOccupied = await getOccupiedSessionSeats(prisma, session.id);



      // For alternative COURSE time slots, the course-level capacity is the
      // capacity of each slot. This also keeps old records safe if their
      // individual session capacity was stored too low.
      const effectiveCapacity =
        hasAlternativeCourseTimeSlots && activity.capacity !== null
          ? Number(activity.capacity)
          : session.capacity;



      return {

        id: session.id,

        title: session.title,

        startAt: session.startAt,

        endAt: session.endAt,

        capacity: effectiveCapacity,



        occupied: sessionOccupied,



        remaining:

          effectiveCapacity === null || effectiveCapacity === undefined

            ? null

            : Math.max(Number(effectiveCapacity) - sessionOccupied, 0),



        isFull:

          effectiveCapacity !== null &&
          effectiveCapacity !== undefined &&
          sessionOccupied >= Number(effectiveCapacity),

      };

    }),

  );



  // A time-slot course has independent capacity per slot, so there is no
  // meaningful single activity-level "remaining" number. The frontend uses
  // the selected slot's session availability instead.
  const activityRemaining = hasAlternativeCourseTimeSlots
    ? null
    : activity.capacity === null
      ? null
      : Math.max(activity.capacity - occupied, 0);



  const activityIsFull = hasAlternativeCourseTimeSlots
    ? sessionAvailability.length > 0 &&
      sessionAvailability.every((session) => session.isFull)
    : activity.capacity !== null && occupied >= activity.capacity;



  return {

    activityId: activity.id,

    capacity: activity.capacity,



    occupied,

    remaining: activityRemaining,

    isFull: activityIsFull,



    maxTicketsPerOrder: activity.maxTicketsPerOrder,



    sessions: sessionAvailability,

  };

}
