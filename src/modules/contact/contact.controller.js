import { createContactMessage } from "./contact.service.js";

export async function submitContactMessage(req, res, next) {
  try {
    const contactMessage = await createContactMessage(req.body);

    return res.status(201).json({
      success: true,
      message: "Your message has been sent successfully.",
      data: contactMessage,
    });
  } catch (error) {
    next(error);
  }
}
