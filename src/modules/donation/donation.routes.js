import { Router } from "express";

import {
  createDonationCheckoutController,
  donationCheckoutStatusController,
  donationDetailsController,
  myDonationsController,
} from "./donation.controller.js";

import {
  validateCreateDonationCheckout,
  validateDonationId,
  validateDonationSessionId,
} from "./donation.validation.js";

import { requireAuth } from "../../middleware/authMiddleware.js";
import { optionalAuth } from "../../middleware/optionalAuthMiddleware.js";

const router = Router();

/*
  هم مهمان و هم User واردشده می‌توانند Donation بسازند.
*/
router.post(
  "/checkout",
  optionalAuth,
  validateCreateDonationCheckout,
  createDonationCheckoutController,
);

/*
  Guest هم می‌تواند نتیجه Checkout خود را بررسی کند.
*/
router.get(
  "/checkout/:sessionId",
  optionalAuth,
  validateDonationSessionId,
  donationCheckoutStatusController,
);

/*
  این Routeها فقط برای User واردشده هستند.
*/
router.get("/me", requireAuth, myDonationsController);

router.get("/:id", requireAuth, validateDonationId, donationDetailsController);

export default router;
