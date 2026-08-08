import { Router } from "express";

import { login, logout, me, signUp } from "./auth.controller.js";

import { validateLogin, validateSignUp } from "./auth.validation.js";

import { requireAuth } from "../../middleware/authMiddleware.js";

const router = Router();

router.post("/signup", validateSignUp, signUp);
router.post("/login", validateLogin, login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

export default router;
