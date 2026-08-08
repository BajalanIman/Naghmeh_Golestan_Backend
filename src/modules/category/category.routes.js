import { Router } from "express";

import {
  adminCategoryDetailsController,
  categoryDetailsController,
  createCategoryController,
  deleteCategoryController,
  listCategoriesController,
  updateCategoryController,
} from "./category.controller.js";

import {
  validateCategoryId,
  validateCategorySlug,
  validateCreateCategory,
  validateUpdateCategory,
} from "./category.validation.js";

import { requireAuth } from "../../middleware/authMiddleware.js";
import { requireRole } from "../../middleware/roleMiddleware.js";

const router = Router();

/*
  Public routes
*/
router.get("/", listCategoriesController);

router.get("/slug/:slug", validateCategorySlug, categoryDetailsController);

/*
  Admin/editor routes
*/
router.get(
  "/admin/:id",
  requireAuth,
  requireRole("ADMIN", "EDITOR"),
  validateCategoryId,
  adminCategoryDetailsController,
);

router.post(
  "/",
  requireAuth,
  requireRole("ADMIN", "EDITOR"),
  validateCreateCategory,
  createCategoryController,
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN", "EDITOR"),
  validateCategoryId,
  validateUpdateCategory,
  updateCategoryController,
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  validateCategoryId,
  deleteCategoryController,
);

export default router;
