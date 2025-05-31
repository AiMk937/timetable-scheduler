// routes/timetableRoutes.js

const express     = require("express");
const router      = express.Router();
const mongoose    = require("mongoose");

// Import your Mongoose models:
const Timetable    = require("../models/Timetable");
const Class        = require("../models/Class");
const AcademicYear = require("../models/AcademicYear");
const Department   = require("../models/Department");

// --------------------------------------------------------
// Helper: call FastAPI POST /generate-timetable
// --------------------------------------------------------
async function callPythonGenerate(academicYearId, departmentId) {
  const { default: fetch } = await import("node-fetch");

  const payload = {
    academicYearId,
    departmentId
  };

  const response = await fetch("http://localhost:8000/generate-timetable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Python service returned HTTP ${response.status}`);
  }
  return response.json();
}

// =========================================================
// 1) Generate Timetable (GET /timetable/generate)
//    Calls the FastAPI batch endpoint, which now returns:
//       { schedules: [...], profTables: [...] }
// =========================================================
router.get("/generate", async (req, res) => {
  try {
    const { academicYearId, departmentId } = req.query;

    if (!academicYearId || !departmentId) {
      return res.status(400).send("Both academicYearId and departmentId are required.");
    }

    // 1a) Look up AcademicYear document to get a human-readable string
    let academicYearName = academicYearId; // fallback to the ID string
    if (mongoose.Types.ObjectId.isValid(academicYearId)) {
      const yearDoc = await AcademicYear.findById(academicYearId).lean();
      if (yearDoc && yearDoc.academicYear) {
        academicYearName = yearDoc.academicYear;
      }
    }

    // 1b) Look up Department document to get a human-readable name
    let departmentName = departmentId; // fallback to the ID string
    if (mongoose.Types.ObjectId.isValid(departmentId)) {
      const deptDoc = await Department.findById(departmentId).lean();
      if (deptDoc && deptDoc.departmentName) {
        departmentName = deptDoc.departmentName;
      }
    }

    // 2) Call the FastAPI service to generate batch timetables
    const apiData = await callPythonGenerate(academicYearId, departmentId);
    // We expect apiData to look like: { schedules: [ { className, schedule }, … ], profTables: [ … ] }
    const schedules  = Array.isArray(apiData.schedules) ? apiData.schedules : [];
    const profTables = Array.isArray(apiData.profTables) ? apiData.profTables : [];

    // 3) Render EJS template, passing everything:
    return res.render("modules/timetable", {
      schedules,
      profTables,
      departmentId,
      academicYearId,
      departmentName,
      academicYearName
    });

  } catch (error) {
    console.error("Error generating timetable:", error);
    return res.status(500).send("Server error while generating timetables.");
  }
});


// =========================================================
// 2) List Existing Timetables (GET /timetable/existing)
//    (unchanged from before)
// =========================================================
router.get("/existing", async (req, res) => {
  try {
    const rawTimetables = await Timetable.find({}).lean();
    const results = [];

    for (const doc of rawTimetables) {
      let className = "No Class Name";
      let academicYearStr = "No Academic Year";
      let possibleClassId = null;

      if (doc.timetable && typeof doc.timetable === "object") {
        const keys = Object.keys(doc.timetable);
        if (keys.length > 0) {
          possibleClassId = keys[0];
        }
      }

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

    res.render("modules/existing_timetable", { timetables: results });
  } catch (error) {
    console.error("Error fetching timetables:", error);
    res.status(500).send("Server error.");
  }
});

// ===========================================================
// 3) Editable Timetable Page (GET /timetable/edit)
//    (unchanged from before)
// ===========================================================
router.get("/edit", async (req, res) => {
  try {
    const timetableId = req.query.tid;
    if (!timetableId) {
      return res.status(400).send("Timetable ID is required");
    }
    if (!mongoose.Types.ObjectId.isValid(timetableId)) {
      return res.status(400).send("Invalid Timetable ID.");
    }

    const timetableDoc = await Timetable.findById(timetableId)
      .populate("classId")
      .lean();

    if (!timetableDoc) {
      return res.status(404).send("Timetable not found.");
    }

    let actualTimetable = null;
    if (timetableDoc.classId && timetableDoc.classId._id) {
      const strClassId = timetableDoc.classId._id.toString();
      if (timetableDoc.timetable && typeof timetableDoc.timetable === "object") {
        actualTimetable = timetableDoc.timetable[strClassId] || null;
      }
    }

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
//    (unchanged from before)
// ===========================================================
router.post("/edit-command", async (req, res) => {
  try {
    let commandText = req.body.command;
    const timetableId = req.body.timetableId;
    console.log("Received command:", commandText, "for timetableId:", timetableId);

    if (!timetableId) {
      return res.status(400).send("No timetable ID in the form data.");
    }

    commandText = commandText.replace(/ to subject /gi, " with subject ");
    const pythonScript = path.join(__dirname, "../ai-service/parse_command.py");
    const execCommand = `python "${pythonScript}" "${commandText}"`;

    exec(execCommand, async (error, stdout) => {
      if (error) {
        console.error("Error executing Python script:", error);
        return res.status(500).send("Error processing command.");
      }

      try {
        const parsedOutput = JSON.parse(stdout);
        const dayEntity = parsedOutput.entities.find(e => e.label === "DAY_SOURCE")
          || parsedOutput.entities.find(e => e.label === "DAY_TARGET");
        const slotSourceEntity = parsedOutput.entities.find(e => e.label === "SLOT_SOURCE");
        const slotTargetEntity = parsedOutput.entities.find(e => e.label === "SLOT_TARGET");

        if (!dayEntity || !slotSourceEntity || !slotTargetEntity) {
          return res.status(400).send("Command missing required day/slot info.");
        }

        const extractSlotNumber = txt => {
          const match = txt.match(/\d+/);
          return match ? parseInt(match[0], 10) : NaN;
        };

        const day = dayEntity.text;
        const slotSource = extractSlotNumber(slotSourceEntity.text);
        const slotTarget = extractSlotNumber(slotTargetEntity.text);

        if (isNaN(slotSource) || isNaN(slotTarget)) {
          return res.status(400).send("Could not extract valid slot numbers from command.");
        }

        const doc = await Timetable.findById(timetableId).populate("classId");
        if (!doc) {
          return res.status(404).send("Timetable not found.");
        }

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

        if (actualTimetable[day]) {
          const dayTimetable = actualTimetable[day];
          if (Array.isArray(dayTimetable) && dayTimetable.length >= Math.max(slotSource, slotTarget)) {
            const temp = dayTimetable[slotSource - 1];
            dayTimetable[slotSource - 1] = dayTimetable[slotTarget - 1];
            dayTimetable[slotTarget - 1] = temp;

            actualTimetable[day] = dayTimetable;
            doc.timetable[doc.classId._id.toString()] = actualTimetable;
            await doc.save();

            return res.redirect("/timetable/edit?tid=" + timetableId);
          } else {
            return res.status(400).send("Specified slots are out of range for the given day.");
          }
        } else {
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
//    (unchanged from before)
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
//    (unchanged from before)
// ===========================================================
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
//    (unchanged from before)
// ===========================================================
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
//    (unchanged from before)
// ===========================================================
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