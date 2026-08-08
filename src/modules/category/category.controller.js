import {
  createCategory,
  deleteCategory,
  getCategoryById,
  getCategoryBySlug,
  listCategories,
  updateCategory,
} from "./category.service.js";

const allowedLanguages = ["EN", "DE", "FA"];

function normalizeLanguage(language) {
  if (!language) {
    return undefined;
  }

  const normalizedLanguage = language.toUpperCase();

  return allowedLanguages.includes(normalizedLanguage)
    ? normalizedLanguage
    : undefined;
}

export async function listCategoriesController(req, res, next) {
  try {
    const categories = await listCategories({
      language: normalizeLanguage(req.query.language),

      search: req.query.search?.trim() || undefined,
    });

    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    next(error);
  }
}

export async function categoryDetailsController(req, res, next) {
  try {
    const category = await getCategoryBySlug({
      slug: req.params.slug,

      language: normalizeLanguage(req.query.language),
    });

    return res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminCategoryDetailsController(req, res, next) {
  try {
    const category = await getCategoryById(req.params.id);

    return res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCategoryController(req, res, next) {
  try {
    const category = await createCategory(req.body);

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      category,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCategoryController(req, res, next) {
  try {
    const category = await updateCategory(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Category updated successfully.",
      category,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCategoryController(req, res, next) {
  try {
    const category = await deleteCategory(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully.",
      category,
    });
  } catch (error) {
    next(error);
  }
}
