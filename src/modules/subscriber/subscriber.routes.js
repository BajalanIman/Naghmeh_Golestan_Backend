import { Router } from "express";
import { subscribe } from "./subscriber.controller.js";
import { validateSubscribeInput } from "./subscriber.validation.js";

const router = Router();

router.post("/", validateSubscribeInput, subscribe);

export default router;
