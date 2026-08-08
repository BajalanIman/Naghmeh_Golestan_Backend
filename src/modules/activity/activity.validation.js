const allowedTypes = ["WORKSHOP", "EVENT", "COURSE"];

const allowedStatuses = [
  "DRAFT",
  "PUBLISHED",
  "CANCELLED",
  "COMPLETED",
  "ARCHIVED",
];

const allowedLanguages = ["EN", "DE", "FA"];

const allowedSessionModes = ["ONLINE", "IN_PERSON", "HYBRID"];

function isValidUrl(value) {
  if (!value) {
    return true;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function validateActivityId(req, res, next) {
  const { id } = req.params;

  if (!id || typeof id !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid activity ID is required.",
    });
  }

  next();
}

export function validateActivitySlug(req, res, next) {
  const { slug } = req.params;

  if (!slug || typeof slug !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid activity slug is required.",
    });
  }

  req.params.slug = slug.trim().toLowerCase();

  next();
}

export function validateCreateActivity(req, res, next) {
  const {
    type,
    status,
    slug,
    imageUrl,
    bannerUrl,
    isFree,
    price,
    currency,
    capacity,
    isFeatured,
    translations,
    categoryIds,
    instructors,
    sessions,
  } = req.body;

  if (!type || !allowedTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      message: "Activity type must be WORKSHOP, EVENT, or COURSE.",
    });
  }

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "The activity status is invalid.",
    });
  }

  if (!slug || typeof slug !== "string") {
    return res.status(400).json({
      success: false,
      message: "Activity slug is required.",
    });
  }

  const normalizedSlug = slug.trim().toLowerCase();

  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (!slugPattern.test(normalizedSlug)) {
    return res.status(400).json({
      success: false,
      message: "Slug may contain lowercase letters, numbers, and hyphens only.",
    });
  }

  if (!isValidUrl(imageUrl)) {
    return res.status(400).json({
      success: false,
      message: "Image URL is invalid.",
    });
  }

  if (!isValidUrl(bannerUrl)) {
    return res.status(400).json({
      success: false,
      message: "Banner URL is invalid.",
    });
  }

  if (typeof isFree !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isFree must be true or false.",
    });
  }

  if (isFree) {
    if (price !== undefined && price !== null && Number(price) !== 0) {
      return res.status(400).json({
        success: false,
        message: "A free activity cannot have a positive price.",
      });
    }
  } else {
    if (price === undefined || price === null || Number(price) <= 0) {
      return res.status(400).json({
        success: false,
        message: "A paid activity must have a price greater than zero.",
      });
    }
  }

  if (
    capacity !== undefined &&
    capacity !== null &&
    (!Number.isInteger(Number(capacity)) || Number(capacity) <= 0)
  ) {
    return res.status(400).json({
      success: false,
      message: "Capacity must be a positive integer.",
    });
  }

  if (isFeatured !== undefined && typeof isFeatured !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isFeatured must be true or false.",
    });
  }

  if (
    currency !== undefined &&
    (typeof currency !== "string" || currency.trim().length !== 3)
  ) {
    return res.status(400).json({
      success: false,
      message: "Currency must be a three-letter code such as EUR.",
    });
  }

  if (!Array.isArray(translations) || translations.length === 0) {
    return res.status(400).json({
      success: false,
      message: "At least one translation is required.",
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
        message: "Each language can appear only once in translations.",
      });
    }

    seenLanguages.add(translation.language);

    if (
      !translation.title ||
      typeof translation.title !== "string" ||
      translation.title.trim().length < 2
    ) {
      return res.status(400).json({
        success: false,
        message: "Each translation must contain a valid title.",
      });
    }
  }

  if (categoryIds !== undefined && !Array.isArray(categoryIds)) {
    return res.status(400).json({
      success: false,
      message: "categoryIds must be an array.",
    });
  }

  if (instructors !== undefined && !Array.isArray(instructors)) {
    return res.status(400).json({
      success: false,
      message: "instructors must be an array.",
    });
  }

  if (sessions !== undefined && !Array.isArray(sessions)) {
    return res.status(400).json({
      success: false,
      message: "sessions must be an array.",
    });
  }

  for (const session of sessions || []) {
    if (!session.startAt || !session.endAt) {
      return res.status(400).json({
        success: false,
        message: "Every session must contain startAt and endAt.",
      });
    }

    const startAt = new Date(session.startAt);
    const endAt = new Date(session.endAt);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Session dates are invalid.",
      });
    }

    if (endAt <= startAt) {
      return res.status(400).json({
        success: false,
        message: "Session end time must be after its start time.",
      });
    }

    if (session.mode && !allowedSessionModes.includes(session.mode)) {
      return res.status(400).json({
        success: false,
        message: "Session mode must be ONLINE, IN_PERSON, or HYBRID.",
      });
    }

    if (session.onlineUrl && !isValidUrl(session.onlineUrl)) {
      return res.status(400).json({
        success: false,
        message: "Session online URL is invalid.",
      });
    }
  }

  req.body.slug = normalizedSlug;
  req.body.currency = currency?.trim().toUpperCase() || "EUR";

  next();
}

export function validateUpdateActivity(req, res, next) {
  const {
    type,
    status,
    slug,
    imageUrl,
    bannerUrl,
    isFree,
    price,
    currency,
    capacity,
    isFeatured,
  } = req.body;

  if (type !== undefined && !allowedTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      message: "The activity type is invalid.",
    });
  }

  if (status !== undefined && !allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "The activity status is invalid.",
    });
  }

  if (slug !== undefined) {
    const normalizedSlug = slug.trim().toLowerCase();
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    if (!slugPattern.test(normalizedSlug)) {
      return res.status(400).json({
        success: false,
        message: "The activity slug is invalid.",
      });
    }

    req.body.slug = normalizedSlug;
  }

  if (!isValidUrl(imageUrl)) {
    return res.status(400).json({
      success: false,
      message: "Image URL is invalid.",
    });
  }

  if (!isValidUrl(bannerUrl)) {
    return res.status(400).json({
      success: false,
      message: "Banner URL is invalid.",
    });
  }

  if (isFree !== undefined && typeof isFree !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isFree must be true or false.",
    });
  }

  if (price !== undefined && price !== null && Number(price) < 0) {
    return res.status(400).json({
      success: false,
      message: "Price cannot be negative.",
    });
  }

  if (
    capacity !== undefined &&
    capacity !== null &&
    (!Number.isInteger(Number(capacity)) || Number(capacity) <= 0)
  ) {
    return res.status(400).json({
      success: false,
      message: "Capacity must be a positive integer.",
    });
  }

  if (isFeatured !== undefined && typeof isFeatured !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isFeatured must be true or false.",
    });
  }

  if (currency !== undefined) {
    if (typeof currency !== "string" || currency.trim().length !== 3) {
      return res.status(400).json({
        success: false,
        message: "Currency must be a three-letter code such as EUR.",
      });
    }

    req.body.currency = currency.trim().toUpperCase();
  }

  next();
}

export function validateActivityStatus(req, res, next) {
  const { status } = req.body;

  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "A valid activity status is required.",
    });
  }

  next();
}
