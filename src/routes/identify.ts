import { Router } from "express";
import { handleIdentify } from "../controllers/identify.controller";

const router = Router();

router.post("/", handleIdentify);

export default router;
