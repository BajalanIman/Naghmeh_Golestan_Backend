import { Router } from "express";

import {
  cancelMembership,
  createCheckout,
  listPlans,
  myMembership,
} from "./membership.controller.js";

import { validateCheckout } from "./membership.validation.js";
import { requireAuth } from "../../middleware/authMiddleware.js";

const router = Router();

// مشاهده پلن‌ها عمومی است
router.get("/plans", listPlans);

// Routeهای زیر نیاز به Login دارند
router.get("/me", requireAuth, myMembership);

router.post("/checkout", requireAuth, validateCheckout, createCheckout);

router.post("/cancel", requireAuth, cancelMembership);

export default router;
