import { Router } from "express";

import {
  activityDetails,
  adminActivityDetails,
  adminListActivities,
  archiveActivityController,
  createActivityController,
  featuredActivities,
  listActivities,
  updateActivityController,
  updateActivityStatusController,
} from "./activity.controller.js";

import {
  validateActivityId,
  validateActivitySlug,
  validateActivityStatus,
  validateCreateActivity,
  validateUpdateActivity,
} from "./activity.validation.js";

import { requireAuth } from "../../middleware/authMiddleware.js";
import { requireRole } from "../../middleware/roleMiddleware.js";

const router = Router();

// Public routes
router.get("/", listActivities);
router.get("/featured", featuredActivities);
router.get("/slug/:slug", validateActivitySlug, activityDetails);

// Admin/editor routes
router.get(
  "/admin/all",
  requireAuth,
  requireRole("ADMIN", "EDITOR"),
  adminListActivities,
);

router.get(
  "/admin/:id",
  requireAuth,
  requireRole("ADMIN", "EDITOR"),
  validateActivityId,
  adminActivityDetails,
);

router.post(
  "/",
  requireAuth,
  requireRole("ADMIN", "EDITOR"),
  validateCreateActivity,
  createActivityController,
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "EDITOR"),
  validateActivityId,
  validateUpdateActivity,
  updateActivityController,
);

router.patch(
  "/:id/status",
  requireAuth,
  requireRole("ADMIN", "EDITOR"),
  validateActivityId,
  validateActivityStatus,
  updateActivityStatusController,
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  validateActivityId,
  archiveActivityController,
);

export default router;
