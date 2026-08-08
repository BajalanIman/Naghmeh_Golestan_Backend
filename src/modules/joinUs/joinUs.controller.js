import { createJoinUsApplication } from "./joinUs.service.js";

export const submitJoinUsApplication = async (req, res, next) => {
  try {
    const application = await createJoinUsApplication(req.body);

    return res.status(201).json({
      success: true,
      message: "Your application has been submitted successfully.",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};
