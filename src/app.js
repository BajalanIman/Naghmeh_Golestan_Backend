import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import subscriberRoutes from "./modules/subscriber/subscriber.routes.js";
import joinUsRoutes from "./modules/joinUs/joinUs.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import membershipRoutes from "./modules/membership/membership.routes.js";
import contactRoutes from "./modules/contact/contact.routes.js";
import activityRoutes from "./modules/activity/activity.routes.js";
import registrationRoutes from "./modules/registration/registration.routes.js";
import orderRoutes from "./modules/order/order.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";
import donationRoutes from "./modules/donation/donation.routes.js";
import categoryRoutes from "./modules/category/category.routes.js";

import { stripeDonationWebhook } from "./modules/donation/donation.webhook.js";
import { stripePaymentWebhook } from "./modules/payment/payment.webhook.js";
import { stripeWebhook } from "./modules/membership/membership.webhook.js";

import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

/*
  CORS باید قبل از Routeها قرار بگیرد.
*/
const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://golestanhub.de",
  "https://www.golestanhub.de",
  "https://golestanhub.com",
  "https://www.golestanhub.com",
  "https://naghmeh-golestan-front.onrender.com",
  "http://localhost:5173",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // درخواست‌های بدون Origin، مثل Postman یا ارتباط سرور‌به‌سرور
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);

/*
  نکته بسیار مهم:
  Stripe Webhookها باید قبل از express.json قرار بگیرند،
  چون Stripe برای بررسی امضا به Raw Body نیاز دارد.
*/

// Payment webhook for course/workshop/event orders
app.post(
  "/api/payments/webhook",
  express.raw({
    type: "application/json",
  }),
  stripePaymentWebhook,
);

// Membership subscription webhook
app.post(
  "/api/memberships/webhook",
  express.raw({
    type: "application/json",
  }),
  stripeWebhook,
);

app.post(
  "/api/donations/webhook",
  express.raw({
    type: "application/json",
  }),
  stripeDonationWebhook,
);

/*
  از این قسمت به بعد، درخواست‌های عادی JSON هستند.
*/
app.use(express.json());

/*
  باید قبل از Routeهایی که Cookie را می‌خوانند قرار بگیرد.
*/
app.use(cookieParser());

/*
  Health check
*/
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running.",
  });
});

/*
  API routes
*/
app.use("/api/auth", authRoutes);
app.use("/api/memberships", membershipRoutes);
app.use("/api/subscribers", subscriberRoutes);
app.use("/api/join-us", joinUsRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/categories", categoryRoutes);

/*
  این دو Middleware همیشه باید در انتهای Routeها باشند.
*/
app.use(notFound);
app.use(errorHandler);

export default app;
