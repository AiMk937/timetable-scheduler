// routes/timetableRoutes.js
const express = require("express");
const router = express.Router();
const { exec } = require("child_process");
const path = require("path");
const mongoose = require("mongoose");

// Import your Mongoose models
const Timetable = require("../models/Timetable");
const Class = require("../models/Class");
const AcademicYear = require("../models/AcademicYear");

// =========================================================
// 1) Generate Timetable (GET /timetable/generate)
//    Calls your Python service to generate a timetable.
// =========================================================
router.get("/generate", async (req, res) => {
  try {
    const { academicYearId, departmentId } = req.query;
    if (!academicYearId || !departmentId) {
      return res.status(400).send("Both academicYearId and departmentId are required.");
    }

    // Call the FastAPI batch endpoint
    const apiRes = await fetch("http://localhost:8000/generate-timetable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, academicYearId }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      console.error("Python service error:", err);
      return res.status(apiRes.status).send(err.detail || "Failed to generate timetables");
    }

    // **Destructure the correct field** here:
    const { timetables } = await apiRes.json();
    if (!timetables || typeof timetables !== "object") {
      return res.status(500).send("Invalid response format from timetable service.");
    }

    // Now only class IDs (no "message" key)!
    const classIds = Object.keys(timetables);
    if (classIds.length === 0) {
      return res.render("modules/timetable", { schedules: [] });
    }

    // Fetch class names
    const objectIds = classIds.map((id) => new mongoose.Types.ObjectId(id));
    const classes = await Class.find({ _id: { $in: objectIds } })
      .lean()
      .select("className");

    // Build schedules array
    const schedules = classes.map(c => ({
      classId: c._id.toString(),
      className: c.className,
      schedule: timetables[c._id.toString()]
    }));

    // Render your batch view
    res.render("modules/timetable", { schedules });

  } catch (error) {
    console.error("Error generating timetable:", error);
    res.status(500).send("Server error generating timetables.");
  }
});

// =========================================================
// 2) List Existing Timetables (GET /timetable/existing)
//    Shows all Timetable docs with minimal info (class name, year).
// =========================================================
router.get("/existing", async (req, res) => {
  try {
    // Fetch all Timetable docs from DB
    const rawTimetables = await Timetable.find({}).lean();
    const results = [];

    for (const doc of rawTimetables) {
      let className = "No Class Name";
      let academicYearStr = "No Academic Year";
      let possibleClassId = null;

      // If doc.timetable is an object like:
      // { "someClassId": { Monday: [...], Tuesday: [...], ... } }
      // we pick the first key to guess which class it belongs to.
      if (doc.timetable && typeof doc.timetable === "object") {
        const keys = Object.keys(doc.timetable);
        if (keys.length > 0) {
          possibleClassId = keys[0];
        }
      }

      // Attempt to find the Class doc
      if (possibleClassId && mongoose.Types.ObjectId.isValid(possibleClassId)) {
        const classDoc = await Class.findById(possibleClassId).lean();
        if (classDoc) {
          className = classDoc.className || "No Class Name";
          if (classDoc.academicYear) {
            const yearDoc = await AcademicYear.findById(classDoc.academicYear).lean();
            if (yearDoc && yearDoc.academicYear) {
              academicYearStr = yearDoc.academicYear;
            }
          }
        }
      }

      // If the Timetable doc itself has doc.academicYearId, we can override
      if (doc.academicYearId) {
        const altYearDoc = await AcademicYear.findById(doc.academicYearId).lean();
        if (altYearDoc && altYearDoc.academicYear) {
          academicYearStr = altYearDoc.academicYear;
        }
      }

      results.push({
        _id: doc._id,
        className,
        academicYear: academicYearStr,
        createdAt: doc.createdAt
      });
    }

    // Render a listing page
    res.render("modules/existing_timetable", { timetables: results });
  } catch (error) {
    console.error("Error fetching timetables:", error);
    res.status(500).send("Server error.");
  }
});

// ===========================================================
// 3) Editable Timetable Page (GET /timetable/edit)
//    Loads a single timetable for editing (chatbot or otherwise).
// ===========================================================
router.get("/edit", async (req, res) => {
  try {
    const timetableId = req.query.tid; // e.g. /timetable/edit?tid=63f7...
    if (!timetableId) {
      return res.status(400).send("Timetable ID is required");
    }
    if (!mongoose.Types.ObjectId.isValid(timetableId)) {
      return res.status(400).send("Invalid Timetable ID.");
    }

    // Populate classId so we know which key to pick from doc.timetable
    const timetableDoc = await Timetable.findById(timetableId)
      .populate("classId")
      .lean();

    if (!timetableDoc) {
      return res.status(404).send("Timetable not found.");
    }

    // The DB doc might look like:
    // { timetable: { "67caa161296d203bad514450": { Monday: [...], Tuesday: [...], ... } },
    //   classId: { _id: 67caa161296d203bad514450, className: "Computer BE SEM 7", ... }, ... }
    let actualTimetable = null;
    if (timetableDoc.classId && timetableDoc.classId._id) {
      const strClassId = timetableDoc.classId._id.toString();
      if (timetableDoc.timetable && typeof timetableDoc.timetable === "object") {
        actualTimetable = timetableDoc.timetable[strClassId] || null;
      }
    }

    // Render the EJS page
    res.render("modules/edit_timetable", {
      timetable: actualTimetable,
      timetableId: timetableDoc._id,
      createdAt: timetableDoc.createdAt
    });
  } catch (error) {
    console.error("Error fetching timetable for edit:", error);
    res.status(500).send("Server error.");
  }
});

// ===========================================================
// 4) POST /timetable/edit-command
//    Swaps two slots based on the user's command via chatbot.
//    (This route persists changes immediately. It remains available as original functionality.)
// ==========================================================
router.post("/edit-command", async (req, res) => {
  try {
    let commandText = req.body.command;
    const timetableId = req.body.timetableId;
    console.log("Received command:", commandText, "for timetableId:", timetableId);

    if (!timetableId) {
      return res.status(400).send("No timetable ID in the form data.");
    }

    // Example: standardize user text
    commandText = commandText.replace(/ to subject /gi, " with subject ");
    console.log("Processed command text:", commandText);

    const pythonScript = path.join(__dirname, "../ai-service/parse_command.py");
    const execCommand = `python "${pythonScript}" "${commandText}"`;
    console.log("Executing command:", execCommand);

    exec(execCommand, async (error, stdout) => {
      if (error) {
        console.error("Error executing Python script:", error);
        return res.status(500).send("Error processing command.");
      }
      console.log("Raw Python output:", stdout);

      try {
        const parsedOutput = JSON.parse(stdout);
        console.log("Parsed Output:", parsedOutput);

        // Attempt to find day, slot source, slot target
        const dayEntity = parsedOutput.entities.find(e => e.label === "DAY_SOURCE")
          || parsedOutput.entities.find(e => e.label === "DAY_TARGET");
        const slotSourceEntity = parsedOutput.entities.find(e => e.label === "SLOT_SOURCE");
        const slotTargetEntity = parsedOutput.entities.find(e => e.label === "SLOT_TARGET");

        if (!dayEntity || !slotSourceEntity || !slotTargetEntity) {
          console.warn("Missing required entities in parsed output.");
          return res.status(400).send("Command missing required day/slot info.");
        }

        const extractSlotNumber = txt => {
          const match = txt.match(/\d+/);
          return match ? parseInt(match[0], 10) : NaN;
        };

        const day = dayEntity.text;  // e.g. "Monday"
        const slotSource = extractSlotNumber(slotSourceEntity.text);
        const slotTarget = extractSlotNumber(slotTargetEntity.text);
        console.log("Extracted day:", day, "slotSource:", slotSource, "slotTarget:", slotTarget);

        if (isNaN(slotSource) || isNaN(slotTarget)) {
          return res.status(400).send("Could not extract valid slot numbers from command.");
        }

        const doc = await Timetable.findById(timetableId).populate("classId");
        if (!doc) {
          console.error("Timetable not found for id:", timetableId);
          return res.status(404).send("Timetable not found.");
        }

        // doc.timetable might be { "classIdString": { Monday: [...], ... } }
        let actualTimetable = null;
        if (doc.classId && doc.classId._id) {
          const strClassId = doc.classId._id.toString();
          if (doc.timetable && typeof doc.timetable === "object") {
            actualTimetable = doc.timetable[strClassId] || null;
          }
        }
        if (!actualTimetable) {
          return res.status(400).send("Cannot find the class-based timetable data to edit.");
        }

        // Now we do dayTimetable = actualTimetable[day]
        if (actualTimetable[day]) {
          const dayTimetable = actualTimetable[day];
          if (Array.isArray(dayTimetable) && dayTimetable.length >= Math.max(slotSource, slotTarget)) {
            // Perform the swap
            const temp = dayTimetable[slotSource - 1];
            dayTimetable[slotSource - 1] = dayTimetable[slotTarget - 1];
            dayTimetable[slotTarget - 1] = temp;

            actualTimetable[day] = dayTimetable;
            doc.timetable[doc.classId._id.toString()] = actualTimetable;

            await doc.save();
            console.log("Timetable updated successfully.");

            return res.redirect("/timetable/edit?tid=" + timetableId);
          } else {
            console.warn("Slots out of range for day:", day);
            return res.status(400).send("Specified slots are out of range for the given day.");
          }
        } else {
          console.warn("Day not found in timetable:", day);
          return res.status(400).send("Invalid day specified in command.");
        }
      } catch (err) {
        console.error("Error parsing Python output or updating doc:", err);
        return res.status(500).send("Error processing command.");
      }
    });
  } catch (err) {
    console.error("Error in POST /edit-command:", err);
    return res.status(500).send("Server error.");
  }
});

// ===========================================================
// 4.5) Save Draft Timetable (POST /timetable/save-draft)
//    Persists draft changes when the user explicitly saves.
// ===========================================================
router.post("/save-draft", async (req, res) => {
  try {
    const { timetableId, updatedTimetable } = req.body;
    if (!timetableId || !updatedTimetable) {
      return res.status(400).json({ error: "Missing timetableId or updatedTimetable." });
    }
    const doc = await Timetable.findById(timetableId);
    if (!doc) {
      return res.status(404).json({ error: "Timetable not found." });
    }
    const classKey = doc.classId ? doc.classId.toString() : null;
    if (!classKey) {
      return res.status(400).json({ error: "Timetable document missing classId." });
    }
    // Update the timetable for the specific class.
    doc.timetable[classKey] = updatedTimetable;
    doc.markModified("timetable");
    await doc.save();
    return res.json({ message: "Timetable saved successfully." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// =========================================================
// 5) Chatbot Page (GET /timetable/chat)
// =========================================================
router.get("/chat", async (req, res) => {
  try {
    const timetableId = req.query.tid;
    if (!timetableId) {
      return res.status(400).send("Timetable ID is required");
    }
    if (!mongoose.Types.ObjectId.isValid(timetableId)) {
      return res.status(400).send("Invalid Timetable ID.");
    }
    const doc = await Timetable.findById(timetableId).populate("classId").lean();
    if (!doc) {
      return res.status(404).send("Timetable not found.");
    }
    // Extract the sub-timetable using the class key
    let actualTimetable = null;
    if (doc.classId && doc.classId._id) {
      const strClassId = doc.classId._id.toString();
      if (doc.timetable && typeof doc.timetable === "object") {
        actualTimetable = doc.timetable[strClassId] || null;
      }
    }
    res.render("modules/chatbot_edit", {
      timetable: actualTimetable,
      timetableId: doc._id,
    });
  } catch (error) {
    console.error("Error fetching timetable for chatbot edit:", error);
    res.status(500).send("Server error.");
  }
});

// =========================================================
// 6) View Timetable (GET /timetable/view)
// =========================================================
router.get("/view", async (req, res) => {
  try {
    const timetableId = req.query.tid;
    if (!timetableId) {
      return res.status(400).send("Timetable ID is required");
    }
    if (!mongoose.Types.ObjectId.isValid(timetableId)) {
      return res.status(400).send("Invalid Timetable ID.");
    }
    const doc = await Timetable.findById(timetableId)
      .populate("classId")
      .populate("academicYearId")
      .lean();
    if (!doc) {
      return res.status(404).send("Timetable not found.");
    }
    const className = doc.classId ? doc.classId.className : "No Class Name";
    const academicYear = doc.academicYearId ? doc.academicYearId.academicYear : "No Academic Year";
    let actualTimetable = null;
    if (doc.classId && doc.classId._id) {
      const strClassId = doc.classId._id.toString();
      if (doc.timetable && typeof doc.timetable === "object") {
        actualTimetable = doc.timetable[strClassId] || null;
      }
    }
    res.render("modules/view_timetable", {
      timetable: actualTimetable,
      timetableId: doc._id,
      className,
      academicYear,
      createdAt: doc.createdAt
    });
  } catch (error) {
    console.error("Error fetching timetable for view:", error);
    res.status(500).send("Server error.");
  }
});

// =========================================================
// 7) DELETE /timetable/delete
// =========================================================
router.delete("/delete", async (req, res) => {
  try {
    const timetableId = req.query.tid;
    if (!timetableId) {
      return res.status(400).json({ error: "Timetable ID is required for deletion." });
    }
    if (!mongoose.Types.ObjectId.isValid(timetableId)) {
      return res.status(400).json({ error: "Invalid Timetable ID." });
    }
    const result = await Timetable.findByIdAndDelete(timetableId);
    if (!result) {
      return res.status(404).json({ error: "Timetable not found or already deleted." });
    }
    console.log("Timetable deleted successfully:", timetableId);
    return res.status(200).json({ success: true, message: "Timetable deleted successfully." });
  } catch (error) {
    console.error("Error deleting timetable:", error);
    return res.status(500).json({ error: "Server error." });
  }
});



module.exports = router;
