import { Router } from "express";

import {
  checkoutStatusController,
  createCheckoutController,
  myPaymentsController,
} from "./payment.controller.js";

import {
  validateCheckoutSessionId,
  validateCreateCheckout,
} from "./payment.validation.js";

import { requireAuth } from "../../middleware/authMiddleware.js";
import { optionalAuth } from "../../middleware/optionalAuthMiddleware.js";

const router = Router();

/*
User و Guest هر دو
*/
router.post(
  "/checkout",
  optionalAuth,
  validateCreateCheckout,
  createCheckoutController,
);

/*
فقط برای User
*/
router.get("/me", requireAuth, myPaymentsController);

/*
هم User هم Guest
*/
router.get(
  "/checkout/:sessionId",
  optionalAuth,
  validateCheckoutSessionId,
  checkoutStatusController,
);

export default router;
