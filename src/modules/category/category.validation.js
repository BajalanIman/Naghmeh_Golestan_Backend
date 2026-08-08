const allowedLanguages = ["EN", "DE", "FA"];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCategoryId(req, res, next) {
  const { id } = req.params;

  if (!id || typeof id !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid category ID is required.",
    });
  }

  req.params.id = id.trim();

  next();
}

export function validateCategorySlug(req, res, next) {
  const { slug } = req.params;

  if (!slug || typeof slug !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid category slug is required.",
    });
  }

  const normalizedSlug = slug.trim().toLowerCase();

  if (!slugPattern.test(normalizedSlug)) {
    return res.status(400).json({
      success: false,
      message: "The category slug is invalid.",
    });
  }

  req.params.slug = normalizedSlug;

  next();
}

export function validateCreateCategory(req, res, next) {
  const { slug, translations } = req.body;

  if (!slug || typeof slug !== "string") {
    return res.status(400).json({
      success: false,
      message: "Category slug is required.",
    });
  }

  const normalizedSlug = slug.trim().toLowerCase();

  if (!slugPattern.test(normalizedSlug)) {
    return res.status(400).json({
      success: false,
      message: "Slug may contain lowercase letters, numbers, and hyphens only.",
    });
  }

  if (!Array.isArray(translations) || translations.length === 0) {
    return res.status(400).json({
      success: false,
      message: "At least one category translation is required.",
    });
  }

  const seenLanguages = new Set();

  for (const translation of translations) {
    if (!translation || typeof translation !== "object") {
      return res.status(400).json({
        success: false,
        message: "Each translation must be a valid object.",
      });
    }

    if (
      !translation.language ||
      !allowedLanguages.includes(translation.language)
    ) {
      return res.status(400).json({
        success: false,
        message: "Translation language must be EN, DE, or FA.",
      });
    }

    if (seenLanguages.has(translation.language)) {
      return res.status(400).json({
        success: false,
        message: "Each language can appear only once in category translations.",
      });
    }

    seenLanguages.add(translation.language);

    if (
      !translation.name ||
      typeof translation.name !== "string" ||
      translation.name.trim().length < 2
    ) {
      return res.status(400).json({
        success: false,
        message: "Every category translation must contain a valid name.",
      });
    }

    if (translation.name.trim().length > 150) {
      return res.status(400).json({
        success: false,
        message: "Category name is too long.",
      });
    }

    if (
      translation.description !== undefined &&
      translation.description !== null &&
      typeof translation.description !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Category description is invalid.",
      });
    }

    if (
      translation.description &&
      translation.description.trim().length > 2000
    ) {
      return res.status(400).json({
        success: false,
        message: "Category description is too long.",
      });
    }
  }

  req.body.slug = normalizedSlug;

  req.body.translations = translations.map((translation) => ({
    language: translation.language,
    name: translation.name.trim(),
    description: translation.description?.trim() || null,
  }));

  next();
}

export function validateUpdateCategory(req, res, next) {
  const { slug, translations } = req.body;

  if (slug !== undefined) {
    if (typeof slug !== "string") {
      return res.status(400).json({
        success: false,
        message: "Category slug is invalid.",
      });
    }

    const normalizedSlug = slug.trim().toLowerCase();

    if (!slugPattern.test(normalizedSlug)) {
      return res.status(400).json({
        success: false,
        message:
          "Slug may contain lowercase letters, numbers, and hyphens only.",
      });
    }

    req.body.slug = normalizedSlug;
  }

  if (translations !== undefined) {
    if (!Array.isArray(translations) || translations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Translations must be a non-empty array.",
      });
    }

    const seenLanguages = new Set();

    for (const translation of translations) {
      if (
        !translation.language ||
        !allowedLanguages.includes(translation.language)
      ) {
        return res.status(400).json({
          success: false,
          message: "Translation language must be EN, DE, or FA.",
        });
      }

      if (seenLanguages.has(translation.language)) {
        return res.status(400).json({
          success: false,
          message: "Each language can appear only once.",
        });
      }

      seenLanguages.add(translation.language);

      if (
        !translation.name ||
        typeof translation.name !== "string" ||
        translation.name.trim().length < 2
      ) {
        return res.status(400).json({
          success: false,
          message: "Every translation must contain a valid name.",
        });
      }
    }

    req.body.translations = translations.map((translation) => ({
      language: translation.language,
      name: translation.name.trim(),
      description: translation.description?.trim() || null,
    }));
  }

  if (slug === undefined && translations === undefined) {
    return res.status(400).json({
      success: false,
      message: "At least one category field must be provided.",
    });
  }

  next();
}
