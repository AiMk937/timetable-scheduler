const express = require("express");
const router = express.Router();

router.get("/generate", async (req, res) => {
  try {
    // Dynamically import node-fetch (v3+ is an ES module)
    const { default: fetch } = await import("node-fetch");
    
    // Extract query parameters from the GET request
    const academicYearId = req.query.academicYearId;
    const classId = req.query.classId;
    const departmentId = req.query.departmentId;
    const promptConstraints = req.query.promptConstraints;
    
    // Forward these parameters to your Python timetable service
    const response = await fetch("http://localhost:8000/generate-timetable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        academicYearId,
        classId,
        departmentId,
        promptConstraints
      })
    });
    
    const data = await response.json();
    // data typically looks like:
    // {
    //   "message": "Timetable generated and stored successfully",
    //   "timetable": {
    //     "66e91ee86d5f16bbb171c326": {
    //       "Monday": [...],
    //       "Tuesday": [...],
    //       ...
    //     }
    //   }
    // }

    // If you only have one class, or you want to pick the first:
    const allClassIds = Object.keys(data.timetable || {});
    if (!allClassIds.length) {
      // If there's no timetable data, handle it gracefully
      return res.render("timetable", { timetable: null });
    }

    // If your code specifically wants to show the timetable for classId from the query,
    // you can do: const chosenClassId = classId;
    // Otherwise, pick the first available class ID:
    const chosenClassId = classId && data.timetable[classId] 
      ? classId 
      : allClassIds[0];
    
    const timetableData = data.timetable[chosenClassId];
    
    // Now render the EJS view named "timetable"
    // Pass timetableData to the template
    res.render("modules/timetable", { timetable: timetableData });

  } catch (error) {
    console.error("Error generating timetable:", error);
    res.status(500).json({ error: "Failed to generate timetable" });
  }
});

module.exports = router;
