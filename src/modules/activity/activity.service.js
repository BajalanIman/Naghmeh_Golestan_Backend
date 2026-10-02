import prisma from "../../config/prisma.js";

const activityDetailsInclude = {
  translations: true,

  instructors: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },

  categories: {
    include: {
      category: {
        include: {
          translations: true,
        },
      },
    },
  },

  sessions: {
    include: {
      location: true,
    },
    orderBy: {
      startAt: "asc",
    },
  },

  _count: {
    select: {
      registrations: true,
    },
  },
};

function serializeActivity(activity) {
  if (!activity) {
    return activity;
  }

  return {
    ...activity,
    price: activity.price === null ? null : Number(activity.price),

    sessions:
      activity.sessions?.map((session) => ({
        ...session,
        location: session.location
          ? {
              ...session.location,
              latitude:
                session.location.latitude === null
                  ? null
                  : Number(session.location.latitude),
              longitude:
                session.location.longitude === null
                  ? null
                  : Number(session.location.longitude),
            }
          : null,
      })) || [],
  };
}

export async function listPublishedActivities({
  type,
  language,
  category,
  featured,
  search,
  page = 1,
  limit = 12,
}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);

  const where = {
    status: "PUBLISHED",
  };

  if (type) {
    where.type = type;
  }

  if (featured === "true") {
    where.isFeatured = true;
  }

  if (language) {
    where.translations = {
      some: {
        language,
      },
    };
  }

  if (category) {
    where.categories = {
      some: {
        category: {
          slug: category,
        },
      },
    };
  }

  if (search) {
    where.translations = {
      some: {
        ...(language ? { language } : {}),
        OR: [
          {
            title: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            summary: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      },
    };
  }

  const [activities, total] = await prisma.$transaction([
    prisma.activity.findMany({
      where,
      include: activityDetailsInclude,
      orderBy: [
        {
          isFeatured: "desc",
        },
        {
          publishedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),

    prisma.activity.count({
      where,
    }),
  ]);

  return {
    activities: activities.map(serializeActivity),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

export async function getPublishedActivityBySlug(slug) {
  const activity = await prisma.activity.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
    },
    include: activityDetailsInclude,
  });

  if (!activity) {
    const error = new Error("Activity not found.");
    error.statusCode = 404;
    throw error;
  }

  return serializeActivity(activity);
}

export async function getFeaturedActivities(limit = 6) {
  const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 20);

  const activities = await prisma.activity.findMany({
    where: {
      status: "PUBLISHED",
      isFeatured: true,
    },
    include: activityDetailsInclude,
    orderBy: [
      {
        publishedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    take: safeLimit,
  });

  return activities.map(serializeActivity);
}

export async function getAdminActivities({
  type,
  status,
  page = 1,
  limit = 20,
}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const where = {};

  if (type) {
    where.type = type;
  }

  if (status) {
    where.status = status;
  }

  const [activities, total] = await prisma.$transaction([
    prisma.activity.findMany({
      where,
      include: activityDetailsInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),

    prisma.activity.count({
      where,
    }),
  ]);

  return {
    activities: activities.map(serializeActivity),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

export async function getAdminActivityById(id) {
  const activity = await prisma.activity.findUnique({
    where: {
      id,
    },
    include: activityDetailsInclude,
  });

  if (!activity) {
    const error = new Error("Activity not found.");
    error.statusCode = 404;
    throw error;
  }

  return serializeActivity(activity);
}

export async function createActivity(data) {
  const existingActivity = await prisma.activity.findUnique({
    where: {
      slug: data.slug,
    },
  });

  if (existingActivity) {
    const error = new Error("An activity with this slug already exists.");
    error.statusCode = 409;
    throw error;
  }

  const categoryIds = [...new Set(data.categoryIds || [])];

  const instructorInputs = data.instructors || [];
  const sessions = data.sessions || [];

  if (categoryIds.length > 0) {
    const existingCategories = await prisma.category.count({
      where: {
        id: {
          in: categoryIds,
        },
      },
    });

    if (existingCategories !== categoryIds.length) {
      const error = new Error("One or more selected categories do not exist.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (instructorInputs.length > 0) {
    const instructorIds = [
      ...new Set(instructorInputs.map((instructor) => instructor.userId)),
    ];

    const existingUsers = await prisma.user.count({
      where: {
        id: {
          in: instructorIds,
        },
      },
    });

    if (existingUsers !== instructorIds.length) {
      const error = new Error("One or more selected instructors do not exist.");
      error.statusCode = 400;
      throw error;
    }
  }

  const activity = await prisma.activity.create({
    data: {
      type: data.type,
      status: data.status || "DRAFT",
      slug: data.slug,
      imageUrl: data.imageUrl || null,
      bannerUrl: data.bannerUrl || null,
      isFree: data.isFree,
      price: data.isFree ? null : data.price,
      currency: data.currency || "EUR",
      capacity: data.capacity || null,
      sessionSelectionMode: data.sessionSelectionMode || "ALL",
      isFeatured: data.isFeatured || false,

      publishedAt: (data.status || "DRAFT") === "PUBLISHED" ? new Date() : null,

      translations: {
        create: data.translations.map((translation) => ({
          language: translation.language,
          title: translation.title.trim(),
          summary: translation.summary?.trim() || null,
          description: translation.description?.trim() || null,
        })),
      },

      categories:
        categoryIds.length > 0
          ? {
              create: categoryIds.map((categoryId) => ({
                categoryId,
              })),
            }
          : undefined,

      instructors:
        instructorInputs.length > 0
          ? {
              create: instructorInputs.map((instructor) => ({
                userId: instructor.userId,
                role: instructor.role?.trim() || null,
              })),
            }
          : undefined,

      sessions:
        sessions.length > 0
          ? {
              create: sessions.map((session) => ({
                title: session.title?.trim() || null,
                startAt: new Date(session.startAt),
                endAt: new Date(session.endAt),
                timezone: session.timezone || "Europe/Berlin",
                mode: session.mode || "IN_PERSON",
                capacity: session.capacity || null,
                locationId: session.locationId || null,
                onlineUrl: session.onlineUrl || null,
              })),
            }
          : undefined,
    },
    include: activityDetailsInclude,
  });

  return serializeActivity(activity);
}

export async function updateActivity(id, data) {
  const existingActivity = await prisma.activity.findUnique({
    where: {
      id,
    },
  });

  if (!existingActivity) {
    const error = new Error("Activity not found.");
    error.statusCode = 404;
    throw error;
  }

  if (data.slug && data.slug !== existingActivity.slug) {
    const duplicateSlug = await prisma.activity.findUnique({
      where: {
        slug: data.slug,
      },
    });

    if (duplicateSlug) {
      const error = new Error("An activity with this slug already exists.");
      error.statusCode = 409;
      throw error;
    }
  }

  const updatedActivity = await prisma.activity.update({
    where: {
      id,
    },
    data: {
      type: data.type,
      slug: data.slug,
      imageUrl: data.imageUrl,
      bannerUrl: data.bannerUrl,
      isFree: data.isFree,
      price: data.isFree === true ? null : data.price,
      currency: data.currency,
      capacity: data.capacity,
      sessionSelectionMode: data.sessionSelectionMode,
      isFeatured: data.isFeatured,
    },
    include: activityDetailsInclude,
  });

  return serializeActivity(updatedActivity);
}

export async function updateActivityStatus(id, status) {
  const activity = await prisma.activity.findUnique({
    where: {
      id,
    },
  });

  if (!activity) {
    const error = new Error("Activity not found.");
    error.statusCode = 404;
    throw error;
  }

  const updatedActivity = await prisma.activity.update({
    where: {
      id,
    },
    data: {
      status,

      publishedAt:
        status === "PUBLISHED"
          ? activity.publishedAt || new Date()
          : activity.publishedAt,
    },
    include: activityDetailsInclude,
  });

  return serializeActivity(updatedActivity);
}

export async function archiveActivity(id) {
  const activity = await prisma.activity.findUnique({
    where: {
      id,
    },
  });

  if (!activity) {
    const error = new Error("Activity not found.");
    error.statusCode = 404;
    throw error;
  }

  const archivedActivity = await prisma.activity.update({
    where: {
      id,
    },
    data: {
      status: "ARCHIVED",
      isFeatured: false,
    },
    include: activityDetailsInclude,
  });

  return serializeActivity(archivedActivity);
}
