import prisma from "../../config/prisma.js";

function createHttpError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;

  if (code) {
    error.code = code;
  }

  return error;
}

const categoryInclude = {
  translations: {
    orderBy: {
      language: "asc",
    },
  },

  _count: {
    select: {
      activities: true,
    },
  },
};

export async function listCategories({ language, search }) {
  const where = {};

  if (language) {
    where.translations = {
      some: {
        language,
      },
    };
  }

  if (search) {
    where.translations = {
      some: {
        ...(language ? { language } : {}),

        OR: [
          {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      },
    };
  }

  return prisma.category.findMany({
    where,
    include: categoryInclude,

    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function getCategoryBySlug({ slug, language }) {
  const category = await prisma.category.findUnique({
    where: {
      slug,
    },

    include: {
      translations: language
        ? {
            where: {
              language,
            },
          }
        : {
            orderBy: {
              language: "asc",
            },
          },

      activities: {
        where: {
          activity: {
            status: "PUBLISHED",
          },
        },

        include: {
          activity: {
            include: {
              translations: language
                ? {
                    where: {
                      language,
                    },
                  }
                : true,

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
        },
      },

      _count: {
        select: {
          activities: true,
        },
      },
    },
  });

  if (!category) {
    throw createHttpError("Category not found.", 404);
  }

  return category;
}

export async function getCategoryById(id) {
  const category = await prisma.category.findUnique({
    where: {
      id,
    },

    include: categoryInclude,
  });

  if (!category) {
    throw createHttpError("Category not found.", 404);
  }

  return category;
}

export async function createCategory({ slug, translations }) {
  const existingCategory = await prisma.category.findUnique({
    where: {
      slug,
    },
  });

  if (existingCategory) {
    throw createHttpError(
      "A category with this slug already exists.",
      409,
      "CATEGORY_SLUG_EXISTS",
    );
  }

  return prisma.category.create({
    data: {
      slug,

      translations: {
        create: translations.map((translation) => ({
          language: translation.language,
          name: translation.name,
          description: translation.description || null,
        })),
      },
    },

    include: categoryInclude,
  });
}

export async function updateCategory(id, data) {
  const existingCategory = await prisma.category.findUnique({
    where: {
      id,
    },
  });

  if (!existingCategory) {
    throw createHttpError("Category not found.", 404);
  }

  if (data.slug && data.slug !== existingCategory.slug) {
    const duplicateSlug = await prisma.category.findUnique({
      where: {
        slug: data.slug,
      },
    });

    if (duplicateSlug) {
      throw createHttpError(
        "A category with this slug already exists.",
        409,
        "CATEGORY_SLUG_EXISTS",
      );
    }
  }

  return prisma.$transaction(async (transaction) => {
    if (data.translations) {
      for (const translation of data.translations) {
        await transaction.categoryTranslation.upsert({
          where: {
            categoryId_language: {
              categoryId: id,
              language: translation.language,
            },
          },

          update: {
            name: translation.name,
            description: translation.description || null,
          },

          create: {
            categoryId: id,
            language: translation.language,
            name: translation.name,
            description: translation.description || null,
          },
        });
      }
    }

    return transaction.category.update({
      where: {
        id,
      },

      data: {
        slug: data.slug,
      },

      include: categoryInclude,
    });
  });
}

export async function deleteCategory(id) {
  const category = await prisma.category.findUnique({
    where: {
      id,
    },

    include: {
      _count: {
        select: {
          activities: true,
        },
      },
    },
  });

  if (!category) {
    throw createHttpError("Category not found.", 404);
  }

  if (category._count.activities > 0) {
    throw createHttpError(
      "This category is assigned to one or more activities and cannot be deleted.",
      409,
      "CATEGORY_IN_USE",
    );
  }

  await prisma.category.delete({
    where: {
      id,
    },
  });

  return {
    id: category.id,
    slug: category.slug,
  };
}
