import prisma from "../../config/prisma.js";

export async function createContactMessage({
  fullName,
  email,
  subject,
  message,
  language,
}) {
  return prisma.contactMessage.create({
    data: {
      fullName,
      email,
      subject,
      message,
      language: language || "EN",
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      subject: true,
      language: true,
      status: true,
      createdAt: true,
    },
  });
}
