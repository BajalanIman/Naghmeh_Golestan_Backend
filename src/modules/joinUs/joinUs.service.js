import prisma from "../../config/prisma.js";

export const createJoinUsApplication = async (applicationData) => {
  const {
    fullName,
    email,
    phone,
    cityCountry,
    contributionArea,
    aboutYourself,
    ideaMessage,
    language,
  } = applicationData;

  const application = await prisma.joinUsApplication.create({
    data: {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      cityCountry: cityCountry?.trim() || null,
      contributionArea: contributionArea.trim(),
      aboutYourself: aboutYourself.trim(),
      ideaMessage: ideaMessage.trim(),
      language: language || "EN",
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      contributionArea: true,
      status: true,
      createdAt: true,
    },
  });

  return application;
};
