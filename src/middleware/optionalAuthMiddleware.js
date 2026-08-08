import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

const COOKIE_NAME = "naghmeh_token";

export async function optionalAuth(req, res, next) {
  try {
    let token = req.cookies?.[COOKIE_NAME];

    if (!token) {
      const authorizationHeader = req.headers.authorization;

      if (authorizationHeader?.startsWith("Bearer ")) {
        token = authorizationHeader.split(" ")[1];
      }
    }

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.sub,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
      },
    });

    req.user = user || null;

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      req.user = null;
      return next();
    }

    next(error);
  }
}
