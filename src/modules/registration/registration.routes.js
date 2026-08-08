import { Router } from "express";

import {
  activityAvailabilityController,
  cancelRegistrationController,
  createRegistrationController,
  myRegistrationsController,
  registrationDetailsController,
} from "./registration.controller.js";

import {
  validateCreateRegistration,
  validateRegistrationId,
} from "./registration.validation.js";

import { requireAuth } from "../../middleware/authMiddleware.js";
import { optionalAuth } from "../../middleware/optionalAuthMiddleware.js";

const router = Router();

/*
  عمومی:
  نمایش ظرفیت باقی‌مانده
*/
router.get("/availability/:activityId", activityAvailabilityController);

/*
  User و Guest هر دو می‌توانند
  در Activity رایگان ثبت‌نام کنند.
*/
router.post(
  "/",
  optionalAuth,
  validateCreateRegistration,
  createRegistrationController,
);

/*
  Routeهای حساب کاربری Login لازم دارند.
*/
router.get("/me", requireAuth, myRegistrationsController);

router.get(
  "/:id",
  requireAuth,
  validateRegistrationId,
  registrationDetailsController,
);

router.post(
  "/:id/cancel",
  requireAuth,
  validateRegistrationId,
  cancelRegistrationController,
);

export default router;
