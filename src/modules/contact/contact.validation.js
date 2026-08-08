const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const allowedLanguages = ["EN", "DE", "FA"];

export function validateContactMessage(req, res, next) {
  const { fullName, email, subject, message, language } = req.body;

  if (!fullName || typeof fullName !== "string") {
    return res.status(400).json({
      success: false,
      message: "Full name is required.",
    });
  }

  const normalizedFullName = fullName.trim();

  if (normalizedFullName.length < 2) {
    return res.status(400).json({
      success: false,
      message: "Full name must contain at least 2 characters.",
    });
  }

  if (normalizedFullName.length > 150) {
    return res.status(400).json({
      success: false,
      message: "Full name is too long.",
    });
  }

  if (!email || typeof email !== "string") {
    return res.status(400).json({
      success: false,
      message: "Email address is required.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!emailPattern.test(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address.",
    });
  }

  if (!subject || typeof subject !== "string") {
    return res.status(400).json({
      success: false,
      message: "Subject is required.",
    });
  }

  const normalizedSubject = subject.trim();

  if (normalizedSubject.length < 3) {
    return res.status(400).json({
      success: false,
      message: "Subject must contain at least 3 characters.",
    });
  }

  if (normalizedSubject.length > 200) {
    return res.status(400).json({
      success: false,
      message: "Subject is too long.",
    });
  }

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      success: false,
      message: "Message is required.",
    });
  }

  const normalizedMessage = message.trim();

  if (normalizedMessage.length < 10) {
    return res.status(400).json({
      success: false,
      message: "Message must contain at least 10 characters.",
    });
  }

  if (normalizedMessage.length > 5000) {
    return res.status(400).json({
      success: false,
      message: "Message is too long.",
    });
  }

  if (language !== undefined && !allowedLanguages.includes(language)) {
    return res.status(400).json({
      success: false,
      message: "Language must be EN, DE, or FA.",
    });
  }

  req.body.fullName = normalizedFullName;
  req.body.email = normalizedEmail;
  req.body.subject = normalizedSubject;
  req.body.message = normalizedMessage;
  req.body.language = language || "EN";

  next();
}
