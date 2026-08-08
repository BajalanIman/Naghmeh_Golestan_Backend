import { getCurrentUser, loginUser, signUpUser } from "./auth.service.js";

const COOKIE_NAME = "naghmeh_token";

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

export async function signUp(req, res, next) {
  try {
    const result = await signUpUser(req.body);

    res.cookie(COOKIE_NAME, result.token, getCookieOptions());

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const result = await loginUser(req.body);

    res.cookie(COOKIE_NAME, result.token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}

export function logout(req, res) {
  const isProduction = process.env.NODE_ENV === "production";

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });

  return res.status(200).json({
    success: true,
    message: "Logout successful.",
  });
}

export async function me(req, res, next) {
  try {
    const user = await getCurrentUser(req.user.id);

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
}
