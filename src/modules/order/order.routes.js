import { Router } from "express";

import {
  cancelOrderController,
  createOrderController,
  myOrdersController,
  orderDetailsController,
  orderQuoteController,
} from "./order.controller.js";

import {
  validateCreateOrder,
  validateOrderId,
  validateOrderQuote,
} from "./order.validation.js";

import { requireAuth } from "../../middleware/authMiddleware.js";
import { optionalAuth } from "../../middleware/optionalAuthMiddleware.js";

const router = Router();

/*
  Quote عمومی است و Login لازم ندارد.
  مبلغ، مالیات و Total فقط در Backend محاسبه می‌شوند.
*/
router.post("/quote", validateOrderQuote, orderQuoteController);

/*
  هم User لاگین‌شده و هم Guest می‌توانند
  Order ایجاد کنند.
*/
router.post("/", optionalAuth, validateCreateOrder, createOrderController);

/*
  Routeهای داشبورد فقط برای User لاگین‌شده‌اند.
*/
router.get("/me", requireAuth, myOrdersController);

router.get("/:id", requireAuth, validateOrderId, orderDetailsController);

router.post("/:id/cancel", requireAuth, validateOrderId, cancelOrderController);

export default router;
