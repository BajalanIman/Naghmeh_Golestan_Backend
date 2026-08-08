import { Router } from "express";

import { submitContactMessage } from "./contact.controller.js";
import { validateContactMessage } from "./contact.validation.js";

const router = Router();

router.post("/", validateContactMessage, submitContactMessage);

export default router;
