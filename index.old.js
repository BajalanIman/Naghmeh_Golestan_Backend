import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import { PrismaClient } from "./generated/prisma/index.js";

const app = express();
const port = 8800;
const prisma = new PrismaClient();

app.use(
  cors({
    // methods: ["GET", "POST", "PUT", "DELETE"],
    // credentials: true,
  }),
);
app.use(express.static("public"));
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.json("Hello, this is the backend!");
});

// users (sing up) *************************************************
app.post("/users", async (req, res) => {
  const { username, email, password, full_name, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      username,
      email,
      password: hashedPassword,
      full_name, // include it directly
      role: role?.trim() || "user",
    };

    const newUser = await prisma.user.create({
      data: userData,
    });

    console.log("Inserted user:", newUser);

    return res.status(201).json({
      message: "Record inserted successfully",
      user_id: newUser.user_id,
    });
  } catch (err) {
    console.error("Error inserting record:", err);

    if (err.code === "P2002") {
      return res.status(409).json({ error: "Email or username already taken" });
    }

    return res.status(500).json({ error: "Error inserting record" });
  }
});

// Login ***********************************************************
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const { password: _, ...userWithoutPassword } = user;

    return res.json({ message: "Login successful", user: userWithoutPassword });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

//  area-admins/:userId **********************************************
app.get("/api/area-admins/:userId", async (req, res) => {
  const userId = Number(req.params.userId);

  try {
    const areaAdmin = await prisma.areaAdmins.findFirst({
      where: { user_id: userId },
      select: { area_id: true },
    });

    if (!areaAdmin) {
      return res.status(404).json({ error: "User is not an area admin." });
    }

    return res.json({ areaId: areaAdmin.area_id });
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// areas/:areaId ******************************************************************
app.get("/api/areas/:areaId", async (req, res) => {
  const areaId = Number(req.params.areaId);

  try {
    const area = await prisma.area.findUnique({
      where: { area_id: areaId },
      select: {
        area_name: true,
        area_information: true,
      },
    });

    if (!area) {
      return res.status(404).json({ error: "Area not found." });
    }

    res.json(area);
  } catch (err) {
    console.error("Error fetching area:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// workshops get ******************************************************************
app.get("/api/workshops", async (req, res) => {
  const lang = req.query.lang || "en";

  try {
    const workshops = await prisma.workshop.findMany({
      orderBy: { date: "desc" },
      include: {
        translations: {
          where: { language: lang },
        },
      },
    });

    const formatted = workshops.map((w) => ({
      id: w.id,
      date: w.date,
      image: w.image,
      location: w.location,
      title: w.translations[0]?.title,
      explanation: w.translations[0]?.explanation,
      paragraphs: w.translations[0]?.paragraphs,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch workshops" });
  }
});
app.get("/api/workshops/:id", async (req, res) => {
  const lang = req.query.lang || "en";
  const id = Number(req.params.id);

  try {
    const workshop = await prisma.workshop.findUnique({
      where: { id },
      include: {
        translations: {
          where: { language: lang },
        },
      },
    });

    if (!workshop) {
      return res.status(404).json({ error: "Workshop not found" });
    }

    const translation = workshop.translations[0];

    res.json({
      id: workshop.id,
      date: workshop.date,
      image: workshop.image,
      location: workshop.location,
      title: translation?.title,
      explanation: translation?.explanation,
      paragraphs: translation?.paragraphs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch workshop" });
  }
});

// course get ******************************************************************
app.get("/api/courses", async (req, res) => {
  const lang = req.query.lang || "en";

  try {
    const courses = await prisma.course.findMany({
      orderBy: { date: "desc" },
      include: {
        translations: {
          where: { language: lang },
        },
      },
    });

    const formatted = courses.map((w) => ({
      id: w.id,
      date: w.date,
      image: w.image,
      location: w.location,
      title: w.translations[0]?.title,
      explanation: w.translations[0]?.explanation,
      paragraphs: w.translations[0]?.paragraphs,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});
app.get("/api/courses/:id", async (req, res) => {
  const lang = req.query.lang || "en";
  const id = Number(req.params.id);

  try {
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        translations: {
          where: { language: lang },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: "course not found" });
    }

    const translation = course.translations[0];

    res.json({
      id: course.id,
      date: course.date,
      image: course.image,
      location: course.location,
      title: translation?.title,
      explanation: translation?.explanation,
      paragraphs: translation?.paragraphs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch course" });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
