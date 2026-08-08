import {
  archiveActivity,
  createActivity,
  getAdminActivities,
  getAdminActivityById,
  getFeaturedActivities,
  getPublishedActivityBySlug,
  listPublishedActivities,
  updateActivity,
  updateActivityStatus,
} from "./activity.service.js";

export async function listActivities(req, res, next) {
  try {
    const result = await listPublishedActivities(req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function activityDetails(req, res, next) {
  try {
    const activity = await getPublishedActivityBySlug(req.params.slug);

    return res.status(200).json({
      success: true,
      activity,
    });
  } catch (error) {
    next(error);
  }
}

export async function featuredActivities(req, res, next) {
  try {
    const activities = await getFeaturedActivities(req.query.limit);

    return res.status(200).json({
      success: true,
      activities,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminListActivities(req, res, next) {
  try {
    const result = await getAdminActivities(req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function adminActivityDetails(req, res, next) {
  try {
    const activity = await getAdminActivityById(req.params.id);

    return res.status(200).json({
      success: true,
      activity,
    });
  } catch (error) {
    next(error);
  }
}

export async function createActivityController(req, res, next) {
  try {
    const activity = await createActivity(req.body);

    return res.status(201).json({
      success: true,
      message: "Activity created successfully.",
      activity,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateActivityController(req, res, next) {
  try {
    const activity = await updateActivity(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Activity updated successfully.",
      activity,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateActivityStatusController(req, res, next) {
  try {
    const activity = await updateActivityStatus(req.params.id, req.body.status);

    return res.status(200).json({
      success: true,
      message: "Activity status updated successfully.",
      activity,
    });
  } catch (error) {
    next(error);
  }
}

export async function archiveActivityController(req, res, next) {
  try {
    const activity = await archiveActivity(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Activity archived successfully.",
      activity,
    });
  } catch (error) {
    next(error);
  }
}
