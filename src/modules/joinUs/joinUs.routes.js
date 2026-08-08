import { Router } from "express";

import { submitJoinUsApplication } from "./joinUs.controller.js";
import { validateJoinUsApplication } from "./joinUs.validation.js";

const router = Router();

router.post("/", validateJoinUsApplication, submitJoinUsApplication);

export default router;
