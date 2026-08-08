const allowedContributionAreas = [
  "Workshop Instructor",
  "Course Teacher",
  "Artist / Performer",
  "Speaker / Researcher",
  "Volunteer",
  "Other",
];

const allowedLanguages = ["EN", "DE", "FA"];

export const validateJoinUsApplication = (req, res, next) => {
  const {
    fullName,
    email,
    phone,
    cityCountry,
    contributionArea,
    aboutYourself,
    ideaMessage,
    language,
  } = req.body;

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({
      success: false,
      message: "Full name is required.",
    });
  }

  if (fullName.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: "Full name must contain at least 2 characters.",
    });
  }

  if (!email || !email.trim()) {
    return res.status(400).json({
      success: false,
      message: "Email address is required.",
    });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email.trim())) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address.",
    });
  }

  if (!contributionArea || !contributionArea.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please select a contribution area.",
    });
  }

  if (!allowedContributionAreas.includes(contributionArea)) {
    return res.status(400).json({
      success: false,
      message: "The selected contribution area is not valid.",
    });
  }

  if (!aboutYourself || !aboutYourself.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please tell us something about yourself.",
    });
  }

  if (aboutYourself.trim().length < 20) {
    return res.status(400).json({
      success: false,
      message:
        "The about-yourself section must contain at least 20 characters.",
    });
  }

  if (!ideaMessage || !ideaMessage.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please describe your idea or message.",
    });
  }

  if (ideaMessage.trim().length < 20) {
    return res.status(400).json({
      success: false,
      message: "The idea or message must contain at least 20 characters.",
    });
  }

  if (phone && phone.trim().length > 30) {
    return res.status(400).json({
      success: false,
      message: "Phone number is too long.",
    });
  }

  if (cityCountry && cityCountry.trim().length > 150) {
    return res.status(400).json({
      success: false,
      message: "City and country are too long.",
    });
  }

  if (language && !allowedLanguages.includes(language)) {
    return res.status(400).json({
      success: false,
      message: "The selected language is not supported.",
    });
  }

  next();
};
