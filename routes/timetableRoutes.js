// routes/timetableRoutes.js

const express      = require("express");
const router       = express.Router();
const mongoose     = require("mongoose");
const path         = require("path");
const { exec }     = require("child_process");

// Import your Mongoose models:
const Timetable    = require("../models/Timetable");
const Class        = require("../models/Class");
const Teacher      = require("../models/Teachers");
const Department   = require("../models/Department");
const AcademicYear = require("../models/AcademicYear");

/**
 * --------------------------------------------------------
 * Helper: call FastAPI POST /generate-timetable
 * --------------------------------------------------------
 */
async function callPythonGenerate(academicYearId, departmentId) {
  const { default: fetch } = await import("node-fetch");
  const payload = { academicYearId, departmentId };

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

/**
 * ========================================================
 * 1) Generate Timetable (GET /timetable/generate)
 *    Calls the FastAPI batch endpoint { schedules: [...], profTables: [...] }
 * ========================================================
 */
router.get("/generate", async (req, res) => {
  try {
    const { academicYearId, departmentId } = req.query;
    if (!academicYearId || !departmentId) {
      return res
        .status(400)
        .send("Both academicYearId and departmentId are required.");
    }

    // 1a) Look up AcademicYear name
    let academicYearName = academicYearId;
    if (mongoose.Types.ObjectId.isValid(academicYearId)) {
      const yearDoc = await AcademicYear.findById(academicYearId).lean();
      if (yearDoc && yearDoc.academicYear) {
        academicYearName = yearDoc.academicYear;
      }
    }

    // 1b) Look up Department name
    let departmentName = departmentId;
    if (mongoose.Types.ObjectId.isValid(departmentId)) {
      const deptDoc = await Department.findById(departmentId).lean();
      if (deptDoc && deptDoc.departmentName) {
        departmentName = deptDoc.departmentName;
      }
    }

    // 2) Call Python service to generate batch timetables
    const apiData = await callPythonGenerate(academicYearId, departmentId);
    const schedules  = Array.isArray(apiData.schedules)  ? apiData.schedules  : [];
    const profTables = Array.isArray(apiData.profTables) ? apiData.profTables : [];

    // 3) Render EJS template (modules/timetable.ejs)
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

/**
 * ========================================================
 * 1.5) Save All Generated Timetables (POST /timetable/save-generated)
 *
 *    Expects JSON body:
 *    {
 *      departmentId,
 *      academicYearId,
 *      departmentName?,      // optional
 *      academicYearName?,    // optional
 *      schedules: [
 *        { classId, className, schedule: { Monday: [...], … } },
 *        …
 *      ],
 *      profTables: [
 *        { teacherId, teacherName, schedule: { Monday: […], … } },
 *        …
 *      ]
 *    }
 * ========================================================
 */
router.post("/save-generated", async (req, res) => {
  try {
    const {
      departmentId,
      academicYearId,
      departmentName: providedDeptName,
      academicYearName: providedYearName,
      schedules,
      profTables
    } = req.body;

    // 1) Validate required fields
    if (!departmentId || !academicYearId) {
      return res
        .status(400)
        .json({ error: "departmentId and academicYearId are required." });
    }
    if (!Array.isArray(schedules) || !Array.isArray(profTables)) {
      return res
        .status(400)
        .json({ error: "Both schedules and profTables must be arrays." });
    }

    // 2) Look up Department name if not provided
    let deptName = providedDeptName;
    if (!deptName && mongoose.Types.ObjectId.isValid(departmentId)) {
      const deptDoc = await Department.findById(departmentId).lean();
      if (deptDoc) deptName = deptDoc.departmentName;
    }

    // 3) Look up AcademicYear name if not provided
    let yearName = providedYearName;
    if (!yearName && mongoose.Types.ObjectId.isValid(academicYearId)) {
      const yearDoc = await AcademicYear.findById(academicYearId).lean();
      if (yearDoc) yearName = yearDoc.academicYear;
    }

    // 4) Convert each schedule into classTimetableSchema
    const classEntries = schedules.map((sch) => ({
      classId:   sch.classId,
      className: sch.className,
      timetable: convertScheduleObjectToMatrix(sch.schedule)
    }));

    // 5) Convert each profTable into teacherTimetableSchema
    const teacherEntries = profTables.map((pt) => ({
      teacherId:   pt.teacherId,
      teacherName: pt.teacherName,
      timetable:   convertScheduleObjectToMatrix(pt.schedule)
    }));

    // 6) Upsert into Timetable collection
    const filter = { departmentId, academicYearId };
    const update = {
      departmentId,
      academicYearId,
      departmentName:   deptName || "",
      academicYearName: yearName || "",
      classes:          classEntries,
      teachers:         teacherEntries,
      createdAt:        new Date()
    };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true };

    const savedDoc = await Timetable.findOneAndUpdate(filter, update, options);
    return res.json({
      message:     "Timetable saved successfully.",
      timetableId: savedDoc._id
    });
  } catch (err) {
    console.error("Error in /timetable/save-generated:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * --------------------------------------------------------
 * 2) List Existing Timetables (GET /timetable/existing)
 *
 *    Shows a summary of all (department, year) documents
 * --------------------------------------------------------
 */
router.get("/existing", async (req, res) => {
  try {
    const rawDocs = await Timetable.find({}).lean();

    // Safely populate class names if classes array exists
    for (let doc of rawDocs) {
      if (Array.isArray(doc.classes)) {
        for (let cls of doc.classes) {
          if (cls.classId && mongoose.Types.ObjectId.isValid(cls.classId)) {
            const classDoc = await Class.findById(cls.classId).lean();
            cls.className = classDoc?.className || "Unnamed Class";
          }
        }
      } else {
        doc.classes = []; // Prevents template errors
      }
    }

    return res.render("modules/existing_timetable", { timetables: rawDocs });
  } catch (error) {
    console.error("Error fetching timetables:", error);
    return res.status(500).send("Server error.");
  }
});

/**
 * ========================================================
 * 3) View Timetable (GET /timetable/view)
 *
 *    Query param: tid=<timetableDocId>
 *
 *    NO LONGER REQUIRES classId. Renders ALL classes in that document.
 * ========================================================
 */
router.get("/view", async (req, res) => {
  try {
    const { tid } = req.query;
    if (!tid || !mongoose.Types.ObjectId.isValid(tid)) {
      return res
        .status(400)
        .send("Valid timetable document ID (tid) is required.");
    }

    // 1) Fetch the Timetable document
    const doc = await Timetable.findById(tid).lean();
    if (!doc) {
      return res.status(404).send("Timetable document not found.");
    }

    // 2) Look up the single Class’s name via doc.classId
    let className = "";
    let classId   = null;
    if (mongoose.Types.ObjectId.isValid(doc.classId)) {
      classId = doc.classId.toString();
      const c = await Class.findById(doc.classId, "className").lean();
      if (c && c.className) className = c.className;
    }

    // 3) Look up AcademicYear name (in case doc.academicYearName is missing)
    let academicYearName = "";
    if (doc.academicYearName) {
      academicYearName = doc.academicYearName;
    } else if (mongoose.Types.ObjectId.isValid(doc.academicYearId)) {
      const ay = await AcademicYear.findById(doc.academicYearId, "academicYear").lean();
      if (ay && ay.academicYear) academicYearName = ay.academicYear;
    }

    // 4) Look up Department name (in case doc.departmentName is missing)
    let departmentName = "";
    if (doc.departmentName) {
      departmentName = doc.departmentName;
    } else if (mongoose.Types.ObjectId.isValid(doc.departmentId)) {
      const dp = await Department.findById(doc.departmentId, "departmentName").lean();
      if (dp && dp.departmentName) departmentName = dp.departmentName;
    }

    // 5) Finally, render the EJS and pass tid + classId + everything else
    return res.render("modules/view_timetable", {
      tid,                 // so EJS can render the “Edit” button
      classId,             // ditto
      className,           // for header display
      departmentName,
      academicYearName,
      createdAt: doc.createdAt,
      timetable: doc.timetable
    });
  } catch (err) {
    console.error("Error in GET /timetable/view:", err);
    return res.status(500).send("Server error.");
  }
});

/**
 * ========================================================
 * 4) Edit Class Timetable (GET /timetable/edit)
 *
 *    Still requires tid (because editing is per‐document which holds exactly one classId)
 * ========================================================
 */
router.get("/edit", async (req, res) => {
  try {
    const { tid } = req.query;
    if (!tid || !mongoose.Types.ObjectId.isValid(tid)) {
      return res
        .status(400)
        .send("A valid timetable document ID (tid) is required.");
    }

    // 1) Fetch the Timetable document
    const doc = await Timetable.findById(tid).lean();
    if (!doc) {
      return res.status(404).send("Timetable document not found.");
    }

    // 2) Extract the single classId that this document represents
    const theClassId = doc.classId ? doc.classId.toString() : null;
    if (!theClassId) {
      return res
        .status(400)
        .send("This timetable document has no associated classId.");
    }

    // 3) Look up the Class name (to show in the “Edit” header)
    let className = "";
    if (mongoose.Types.ObjectId.isValid(theClassId)) {
      const classDoc = await Class.findById(theClassId).lean();
      if (classDoc && classDoc.className) {
        className = classDoc.className;
      }
    }

    // 4) Look up the Academic Year name (to show in the “Edit” header)
    let academicYearName = "";
    if (doc.academicYearId && mongoose.Types.ObjectId.isValid(doc.academicYearId)) {
      const ayDoc = await AcademicYear.findById(doc.academicYearId).lean();
      if (ayDoc && ayDoc.academicYear) {
        academicYearName = ayDoc.academicYear;
      }
    }

    // 5) doc.timetable is already in “schedule‐object” form:
    //    { Monday: [ … ], Tuesday: [ … ], … }
    //    So we can pass it directly to EJS. No conversion needed.
    const scheduleObj = doc.timetable;

    // 6) Render the “edit_timetable” EJS with all needed variables:
    return res.render("modules/edit_timetable", {
      timetable:         scheduleObj,
      timetableId:       tid,
      classId:           theClassId,
      className,         // looked up above
      academicYearName,  // looked up above
      createdAt:         doc.createdAt
    });
  } catch (error) {
    console.error("Error in GET /timetable/edit:", error);
    return res.status(500).send("Server error.");
  }
});

/**
 * ========================================================
 * 5) POST /timetable/edit-command
 *
 *    Uses NLP to swap two slots in a single class’s “draft” timetable.
 *    Expects JSON body: { timetableId, classId, command }
 *    Returns { updatedTimetable, changedSlots } on success.
 * ========================================================
 */
router.post("/edit-command", async (req, res) => {
  try {
    const { timetableId, classId, command } = req.body;
    if (!timetableId || !classId || !command) {
      return res.status(400).json({
        error: "timetableId, classId, and command are all required."
      });
    }
    if (
      !mongoose.Types.ObjectId.isValid(timetableId) ||
      !mongoose.Types.ObjectId.isValid(classId)
    ) {
      return res.status(400).json({ error: "Invalid timetableId or classId." });
    }

    // 1) Find the parent document and the specific class entry
    const parentDoc = await Timetable.findById(timetableId).lean();
    if (!parentDoc) {
      return res
        .status(404)
        .json({ error: "Timetable document not found." });
    }
    const classIndex = parentDoc.classes.findIndex(
      (c) => c.classId.toString() === classId
    );
    if (classIndex < 0) {
      return res
        .status(404)
        .json({ error: "Class timetable not found in this document." });
    }

    // 2) Convert the stored 5×7 matrix into a schedule‐object form for slot lookup
    const currentMatrix = parentDoc.classes[classIndex].timetable; // a 5×7 array or null
    const currentSched  = convertMatrixToScheduleObject(currentMatrix);

    // 3) Invoke your NLP parser (parse_command.py) to extract DAY_SOURCE, SLOT_SOURCE, SLOT_TARGET, etc.
    const pythonScript = path.join(__dirname, "../ai-service/parse_command.py");
    const safelyEscaped = command.replace(/"/g, '\\"');
    const execCommand   = `python "${pythonScript}" "${safelyEscaped}"`;

    exec(execCommand, async (error, stdout) => {
      if (error) {
        console.error("Error executing parse_command.py:", error);
        return res
          .status(500)
          .json({ error: "Error processing NLP command." });
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        console.error("Failed to parse NLP output:", e);
        return res
          .status(500)
          .json({ error: "Invalid NLP response." });
      }

      // 4) Extract entities
      const dayEntity        =
        parsed.entities.find((e) => e.label === "DAY_SOURCE") ||
        parsed.entities.find((e) => e.label === "DAY_TARGET");
      const slotSourceEntity = parsed.entities.find(
        (e) => e.label === "SLOT_SOURCE"
      );
      const slotTargetEntity = parsed.entities.find(
        (e) => e.label === "SLOT_TARGET"
      );

      if (!dayEntity || !slotSourceEntity || !slotTargetEntity) {
        return res
          .status(400)
          .json({ error: "Missing day/slot info in NLP command." });
      }

      // Helper to pull an integer out of “slot X”
      const extractSlotNumber = (txt) => {
        const m = txt.match(/\d+/);
        return m ? parseInt(m[0], 10) : NaN;
      };

      const dayName    = normalizeDay(dayEntity.text);
      const slotSource = extractSlotNumber(slotSourceEntity.text);
      const slotTarget = extractSlotNumber(slotTargetEntity.text);

      if (!dayName || isNaN(slotSource) || isNaN(slotTarget)) {
        return res
          .status(400)
          .json({ error: "Invalid day or slot number." });
      }

      // 5) Perform the swap in our “currentSched” object (not yet saved)
      if (
        !Array.isArray(currentSched[dayName]) ||
        currentSched[dayName].length < Math.max(slotSource, slotTarget)
      ) {
        return res
          .status(400)
          .json({ error: "Slot index out of range." });
      }

      // Zero-based indices for internal swap:
      const sIdx = slotSource - 1,
        tIdx = slotTarget - 1;
      const temp = currentSched[dayName][sIdx];
      currentSched[dayName][sIdx] = currentSched[dayName][tIdx];
      currentSched[dayName][tIdx] = temp;

      // 6) Convert updated “currentSched” back into a 5×7 matrix
      const updatedMatrix = convertScheduleObjectToMatrix(currentSched);

      // 7) Return draft result (but do NOT save to DB yet)
      return res.json({
        message:          "Draft swap applied.",
        updatedTimetable: currentSched,
        changedSlots: [
          { day: dayName, slot: slotSource },
          { day: dayName, slot: slotTarget }
        ]
      });
    });
  } catch (err) {
    console.error("Error in POST /edit-command:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * ========================================================
 * 6) Save Draft (POST /timetable/save-draft)
 *
 *    Expects JSON: { timetableId, classId, updatedTimetable }
 *    Overwrites only that one class’s matrix in the parent document.
 * ========================================================
 */
router.post("/save-draft", async (req, res) => {
  try {
    const { timetableId, classId, updatedTimetable } = req.body;
    if (!timetableId || !classId || !updatedTimetable) {
      return res.status(400).json({
        error: "timetableId, classId, and updatedTimetable are all required."
      });
    }
    if (
      !mongoose.Types.ObjectId.isValid(timetableId) ||
      !mongoose.Types.ObjectId.isValid(classId)
    ) {
      return res
        .status(400)
        .json({ error: "Invalid timetableId or classId." });
    }

    // 1) Find parent doc
    const parentDoc = await Timetable.findById(timetableId);
    if (!parentDoc) {
      return res
        .status(404)
        .json({ error: "Timetable document not found." });
    }

    // 2) Locate index of that class in classes[]
    const idx = parentDoc.classes.findIndex(
      (c) => c.classId.toString() === classId
    );
    if (idx < 0) {
      return res
        .status(404)
        .json({ error: "Class timetable not found in this document." });
    }

    // 3) Convert updatedTimetable (object form) back into 5×7 matrix
    const newMatrix = convertScheduleObjectToMatrix(updatedTimetable);

    // 4) Overwrite the matrix for that class
    parentDoc.classes[idx].timetable = newMatrix;
    parentDoc.markModified(`classes.${idx}.timetable`);
    await parentDoc.save();

    return res.json({ message: "Timetable saved successfully." });
  } catch (err) {
    console.error("Error in POST /save-draft:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * ========================================================
 * 7) Delete an entire (department, year) document
 *
 *    DELETE /timetable/delete?tid=<timetableDocId>
 * ========================================================
 */
router.delete("/delete", async (req, res) => {
  try {
    const { tid } = req.query;
    if (!tid) {
      return res
        .status(400)
        .json({ error: "timetableId (tid) is required for deletion." });
    }
    if (!mongoose.Types.ObjectId.isValid(tid)) {
      return res.status(400).json({ error: "Invalid timetableId." });
    }
    const result = await Timetable.findByIdAndDelete(tid);
    if (!result) {
      return res
        .status(404)
        .json({ error: "Timetable document not found or already deleted." });
    }
    return res.json({
      success: true,
      message: "Timetable document deleted successfully."
    });
  } catch (error) {
    console.error("Error deleting timetable:", error);
    return res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;

/**
 * ========================================================
 * Helper Functions Below
 * ========================================================
 */

/**
 * 1) Convert from { Monday: [slot0, slot1, …, slot6], … }
 *    into a 5×7 matrix of sessionSchema objects
 *
 *    sessionSchema shape = { day, slot, subject, teacher, room, batch, type }
 *    We assume each scheduleObj[day] is length 7 (or fewer; fill missing with null).
 */
function convertScheduleObjectToMatrix(scheduleObj) {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  // Initialize 5×7 matrix of nulls
  const matrix = Array(5)
    .fill()
    .map(() => Array(7).fill(null));

  DAYS.forEach((dayName, dIdx) => {
    const daySlots = Array.isArray(scheduleObj[dayName])
      ? scheduleObj[dayName]
      : [];
    for (let sIdx = 0; sIdx < 7; sIdx++) {
      const rawVal = daySlots[sIdx] || null;
      if (!rawVal) {
        matrix[dIdx][sIdx] = null;
      } else if (Array.isArray(rawVal) && rawVal.length) {
        // Lab block: take the first entry for subject/teacher/room, mark type="Lab"
        const entry = rawVal[0];
        matrix[dIdx][sIdx] = {
          day:     dayName,
          slot:    sIdx,
          subject: entry.subject,
          teacher: entry.teacher || null,
          room:    entry.room    || null,
          batch:   entry.batch   || null,
          type:    "Lab"
        };
      } else if (typeof rawVal === "object" && rawVal.subject) {
        // Single‐lecture or MOOC: rawVal has subject, teacher, room, maybe type
        matrix[dIdx][sIdx] = {
          day:     dayName,
          slot:    sIdx,
          subject: rawVal.subject,
          teacher: rawVal.teacher || null,
          room:    rawVal.room    || null,
          batch:   rawVal.batch   || null,
          type:    rawVal.type    || "Theory"
        };
      } else if (typeof rawVal === "string") {
        // A string like "Free slot" or "MOOC"
        matrix[dIdx][sIdx] = {
          day:     dayName,
          slot:    sIdx,
          subject: rawVal,
          teacher: null,
          room:    null,
          batch:   null,
          type:    rawVal === "MOOC" ? "MOOC" : "Free"
        };
      } else {
        matrix[dIdx][sIdx] = null;
      }
    }
  });

  return matrix;
}

/**
 * 2) Convert from a 5×7 matrix of sessionSchema objects
 *    back into { Monday: [ … ], … } form.
 */
function convertMatrixToScheduleObject(matrix) {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const scheduleObj = {};
  DAYS.forEach((dayName, dIdx) => {
    scheduleObj[dayName] = [];
    for (let sIdx = 0; sIdx < 7; sIdx++) {
      const sess = matrix[dIdx][sIdx];
      if (!sess) {
        scheduleObj[dayName].push(null);
      } else if (sess.type === "Lab") {
        // Reconstruct as an array of one element (batched lab)
        scheduleObj[dayName].push([
          {
            batch:   sess.batch,
            subject: sess.subject,
            teacher: sess.teacher,
            room:    sess.room
          }
        ]);
      } else {
        // Single‐lecture or MOOC
        scheduleObj[dayName].push({
          subject: sess.subject,
          teacher: sess.teacher,
          room:    sess.room,
          batch:   sess.batch,
          type:    sess.type
        });
      }
    }
  });
  return scheduleObj;
}

/**
 * 3) Normalize day string (“monday” → “Monday”)
 */
function normalizeDay(dayStr) {
  if (!dayStr) return "";
  dayStr = dayStr.trim().toLowerCase();
  const cap = dayStr.charAt(0).toUpperCase() + dayStr.slice(1);
  if (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(cap)) {
    return cap;
  }
  return "";
}