import {
  cancelUserRegistration,
  createFreeRegistration,
  getActivityAvailability,
  getUserRegistration,
  listUserRegistrations,
} from "./registration.service.js";

function getRequestLanguage(req) {
  const rawLanguage = req.body.language || req.query.language || "EN";

  const language = String(rawLanguage).toUpperCase();

  return ["EN", "DE", "FA"].includes(language) ? language : "EN";
}

export async function createRegistrationController(req, res, next) {
  try {
    const result = await createFreeRegistration({
      user: req.user || null,

      activityId: req.body.activityId,

      sessionIds: req.body.sessionIds,

      quantity: req.body.quantity,

      preferredLanguage: getRequestLanguage(req),

      guestData: {
        firstName: req.body.firstName,

        lastName: req.body.lastName,

        email: req.body.email,

        phone: req.body.phone,
      },
    });

    return res.status(201).json({
      success: true,

      message: "Registration completed successfully.",

      registration: result.registration,

      /*
        فقط برای Guest مقدار دارد.
        برای User لاگین‌شده null است.
      */
      guestAccessToken: result.guestAccessToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function myRegistrationsController(req, res, next) {
  try {
    const result = await listUserRegistrations({
      userId: req.user.id,
      ...req.query,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function registrationDetailsController(req, res, next) {
  try {
    const registration = await getUserRegistration({
      userId: req.user.id,

      registrationId: req.params.id,
    });

    return res.status(200).json({
      success: true,
      registration,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelRegistrationController(req, res, next) {
  try {
    const registration = await cancelUserRegistration({
      userId: req.user.id,

      registrationId: req.params.id,
    });

    return res.status(200).json({
      success: true,

      message: "Registration cancelled successfully.",

      registration,
    });
  } catch (error) {
    next(error);
  }
}

export async function activityAvailabilityController(req, res, next) {
  try {
    const availability = await getActivityAvailability(req.params.activityId);

    return res.status(200).json({
      success: true,
      availability,
    });
  } catch (error) {
    next(error);
  }
}
