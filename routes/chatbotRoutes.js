// routes/chatbotRoutes.js
const express = require("express");
const router = express.Router();
const { exec } = require("child_process");
const path = require("path");
const Timetable = require("../models/Timetable");
const Teacher = require("../models/Teachers");
const Subject = require("../models/Subject");
const Infrastructure = require("../models/Infrastructure");

// In-memory store for multi-turn conversation contexts
const dialogueContexts = {};

// Your Gemini endpoint with an API key parameter
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Helper function to call Gemini for a general question or fallback.
 * Expects raw user text, returns the model's string reply.
 */
async function callGemini(userText) {
  try {
    const { default: fetch } = await import("node-fetch");
    const payload = {
      contents: [
        {
          parts: [{ text: userText }]
        }
      ]
    };

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let geminiReply = "No response from Gemini.";
    if (data && data.contents && data.contents[0] && data.contents[0].parts[0]) {
      geminiReply = data.contents[0].parts[0].text;
    }
    return geminiReply;
  } catch (err) {
    console.error("Error calling Gemini:", err);
    return "Sorry, I couldn't get a response from Gemini.";
  }
}

/**
 * Helper: Normalize a day string (e.g. "monday" → "Monday")
 */
function normalizeDay(dayStr) {
  if (!dayStr) return "";
  dayStr = dayStr.replace(/^\s*on\s+/i, "");
  return dayStr.charAt(0).toUpperCase() + dayStr.slice(1).toLowerCase();
}

/**
 * Helper: Extract a numeric slot value from text.
 */
function extractSlotNumber(text) {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : NaN;
}

/**
 * Helper: Parse query-type messages (e.g. "what subject is assigned to slot 3 on monday?")
 */
function parseQueryDaySlot(message) {
  const dayMatch = message.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday)\b/i);
  const slotMatch = message.match(/slot\s+(\d+)/i);
  if (!dayMatch || !slotMatch) return null;
  return {
    day: normalizeDay(dayMatch[1]),
    slot: extractSlotNumber(slotMatch[0])
  };
}

/**
 * POST /chatbot/converse
 * Expects JSON body: { sessionId, message, timetableId }
 */
router.post("/converse", async (req, res) => {
  try {
    const sessionId = req.body.sessionId || "default";
    const userMessage = req.body.message || "";
    const timetableId = req.body.timetableId;
    console.log(`\nSession ${sessionId} received message: "${userMessage}" (timetableId=${timetableId})`);

    // ---------------------------
    // 1) Query Handling
    // ---------------------------
    if (/what\s+subject/i.test(userMessage.toLowerCase())) {
      console.log("Detected a 'what/which subject' query...");
      const info = parseQueryDaySlot(userMessage);
      if (!info) {
        const geminiReply = await callGemini(userMessage);
        return res.json({ reply: geminiReply });
      }
      const { day, slot } = info;
      console.log(`Query parse => day=${day}, slot=${slot}`);

      const timetableDoc = await Timetable.findById(timetableId);
      if (!timetableDoc) return res.status(404).json({ error: "Timetable not found." });
      // In the new schema, doc.timetable is already { Monday: [...], Tuesday: [...], … }
      const scheduleObj = timetableDoc.timetable || {};

      // We no longer index by classKey. Just read scheduleObj[day].
      const dayArr = scheduleObj[day];
      if (!dayArr || !Array.isArray(dayArr) || dayArr.length < slot) {
        return res.status(400).json({ error: `Slot ${slot} out of range for ${day}.` });
      }
      const slotVal = dayArr[slot - 1];
      let reply;
      if (typeof slotVal === "object" && slotVal !== null) {
        if (slotVal.subject) {
          // single-theory-session object
          reply = `Slot ${slot} on ${day} has "${slotVal.subject}" taught by ${slotVal.teacher || "someone"}.`;
        } else if (Array.isArray(slotVal)) {
          // lab-block array
          const subjectsList = slotVal.map(item => item.subject).join(", ");
          reply = `Slot ${slot} on ${day} has labs: ${subjectsList}.`;
        } else {
          reply = `Slot ${slot} on ${day} is occupied by something I cannot interpret.`;
        }
      } else {
        // e.g. string “Free slot” or null
        reply = `Slot ${slot} on ${day} is "${slotVal}".`;
      }
      return res.json({ reply });
    }

    // ---------------------------
    // 2) Swap/Update Handling (Draft Mode)
    // ---------------------------
    let context = dialogueContexts[sessionId] || { partialCommand: "", missingEntities: [] };
    const combinedCommand = context.partialCommand
      ? `${context.partialCommand} ${userMessage}`
      : userMessage;
    console.log("Combined command for update:", combinedCommand);

    const pythonScript = path.join(__dirname, "../ai-service/parse_command.py");
    const execCommand = `python3 "${pythonScript}" "${combinedCommand.replace(/"/g, '\\"')}"`;
    console.log("Executing command:", execCommand);

    exec(execCommand, async (error, stdout) => {
      if (error) {
        console.error("Error executing parse_command:", error);
        const geminiReply = await callGemini(userMessage);
        return res.json({ reply: geminiReply });
      }
      console.log("Raw Python output:", stdout);

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (err) {
        console.error("Failed to parse Python output:", err);
        const geminiReply = await callGemini(userMessage);
        return res.json({ reply: geminiReply });
      }

      // ---------------------------
      // 2a) Assignment commands (no SLOT_TARGET but has PERSON)
      // ---------------------------
      let dayEntity = parsed.entities.find(e => e.label === "DAY_SOURCE") ||
                      parsed.entities.find(e => e.label === "DATE");
      let slotSourceEntity = parsed.entities.find(e => e.label === "SLOT_SOURCE");
      let slotTargetEntity = parsed.entities.find(e => e.label === "SLOT_TARGET");
      const cardinalSlots = parsed.entities.filter(e => e.label === "CARDINAL");

      if (!slotSourceEntity && cardinalSlots[0]) {
        slotSourceEntity = cardinalSlots[0];
      }
      if (!slotTargetEntity && cardinalSlots[1]) {
        slotTargetEntity = cardinalSlots[1];
      }

      // If no SLOT_TARGET but a PERSON entity exists, treat as an assignment command.
      if (!slotTargetEntity && parsed.entities.some(e => e.label === "PERSON")) {
        const teacherEntity = parsed.entities.find(e => e.label === "PERSON");
        if (!dayEntity) {
          return res.status(400).json({ error: "Missing day information for assignment." });
        }
        const day = normalizeDay(dayEntity.text);
        const slot = slotSourceEntity
          ? extractSlotNumber(slotSourceEntity.text)
          : (cardinalSlots[0] ? extractSlotNumber(cardinalSlots[0].text) : NaN);
        if (isNaN(slot)) {
          return res.status(400).json({ error: "Missing or invalid slot number for assignment." });
        }
        console.log(`Assignment command: assign ${teacherEntity.text} to ${day} slot ${slot}`);

        // Query the Teacher model for this professor.
        const teacherDoc = await Teacher
          .findOne({ name: new RegExp(teacherEntity.text.trim(), "i") })
          .populate("subjects")
          .lean();
        if (!teacherDoc) return res.status(404).json({ error: "Teacher not found." });
        // From teacherDoc.subjects, choose a subject that the teacher teaches.
        const subjectId = teacherDoc.subjects && teacherDoc.subjects.length > 0
                         ? teacherDoc.subjects[0]
                         : null;
        if (!subjectId) {
          return res.status(400).json({ error: "Teacher has no subject assigned." });
        }
        const subjectDoc = await Subject.findById(subjectId).lean();
        if (!subjectDoc) {
          return res.status(400).json({ error: "Subject not found for teacher." });
        }

        // Now, assign an appropriate infrastructure.
        // For theory subjects, choose a classroom; for labs, choose a lab with this subject.
        const timetableDoc = await Timetable.findById(timetableId).lean();
        if (!timetableDoc) return res.status(404).json({ error: "Timetable not found." });
        const scheduleObj = timetableDoc.timetable || {};

        let infraDoc;
        if (subjectDoc.subjectType === "Theory") {
          infraDoc = await Infrastructure.findOne({
            classId: timetableDoc.classId,
            type: "classroom"
          }).lean();
        } else {
          infraDoc = await Infrastructure.findOne({
            classId: timetableDoc.classId,
            type: "lab",
            labSubjectId: subjectId
          }).lean();
        }
        const room = infraDoc ? infraDoc.roomNo : "Unknown Room";

        // Update the draft timetable (directly on scheduleObj).
        if (!Array.isArray(scheduleObj[day]) || scheduleObj[day].length < slot) {
          return res.status(400).json({ error: `Slot ${slot} out of range for ${day}.` });
        }
        scheduleObj[day][slot - 1] = {
          subject: subjectDoc.subjectName,
          teacher: teacherDoc.name,
          room: room
        };
        const changedSlots = [{ day, slot }];
        console.log(`Draft assignment => ${day}[${slot}]: subject "${subjectDoc.subjectName}", teacher "${teacherDoc.name}", room "${room}"`);

        if (dialogueContexts[sessionId]) delete dialogueContexts[sessionId];
        return res.json({
          message: "Timetable updated successfully (draft assignment).",
          updatedTimetable: scheduleObj,
          changedSlots
        });
      }

      // ---------------------------
      // 2b) Swap/Update Handling (requires DAY_SOURCE, SLOT_SOURCE, SLOT_TARGET)
      // ---------------------------
      if (!dayEntity || !slotSourceEntity || !slotTargetEntity) {
        dialogueContexts[sessionId] = {
          partialCommand: combinedCommand,
          missingEntities: ["DAY_SOURCE", "SLOT_SOURCE", "SLOT_TARGET"].filter(lbl => {
            if (lbl === "DAY_SOURCE" && !dayEntity) return true;
            if (lbl === "SLOT_SOURCE" && !slotSourceEntity) return true;
            if (lbl === "SLOT_TARGET" && !slotTargetEntity) return true;
            return false;
          })
        };
        console.error("Missing required entities:", dialogueContexts[sessionId].missingEntities);
        const geminiReply = await callGemini(userMessage);
        return res.json({
          error: "Missing required info for a swap. Here's a Gemini answer:",
          reply: geminiReply,
          missing: dialogueContexts[sessionId].missingEntities
        });
      }

      // Process as a swap command.
      const dateEntities = parsed.entities.filter(e => e.label === "DATE");
      let daySource = "", dayTarget = "";
      if (dateEntities.length >= 2) {
        daySource = normalizeDay(dateEntities[0].text);
        dayTarget = normalizeDay(dateEntities[1].text);
      } else if (dateEntities.length === 1) {
        daySource = normalizeDay(dateEntities[0].text);
        dayTarget = daySource;
      }

      const slotSource = extractSlotNumber(slotSourceEntity.text);
      const slotTarget = extractSlotNumber(slotTargetEntity.text);
      console.log(`Parsed swap => daySource=${daySource}, slotSource=${slotSource}, dayTarget=${dayTarget}, slotTarget=${slotTarget}`);

      if (!daySource || isNaN(slotSource) || isNaN(slotTarget)) {
        const geminiReply = await callGemini(userMessage);
        return res.json({
          error: "Invalid day/slot data. Here's a Gemini answer instead:",
          reply: geminiReply
        });
      }

      // Fetch Timetable doc and directly use doc.timetable
      const doc = await Timetable.findById(timetableId).lean();
      if (!doc) return res.status(404).json({ error: "Timetable not found." });
      const scheduleObj = doc.timetable || {};

      if (!scheduleObj[daySource] || !scheduleObj[dayTarget]) {
        return res.status(400).json({ error: "One of the specified days has no data." });
      }
      const sourceArr = scheduleObj[daySource];
      const targetArr = scheduleObj[dayTarget];
      if (!sourceArr || !targetArr) {
        return res.status(400).json({ error: "No timetable data found for one of the specified days." });
      }
      if (sourceArr.length < slotSource) {
        return res.status(400).json({ error: `Slot ${slotSource} out of range for ${daySource}` });
      }
      if (targetArr.length < slotTarget) {
        return res.status(400).json({ error: `Slot ${slotTarget} out of range for ${dayTarget}` });
      }

      // Perform the swap in draft mode (do not persist changes).
      const temp = sourceArr[slotSource - 1];
      sourceArr[slotSource - 1] = targetArr[slotTarget - 1];
      targetArr[slotTarget - 1] = temp;
      scheduleObj[daySource] = sourceArr;
      scheduleObj[dayTarget] = targetArr;

      console.log(`Draft swap updated => from ${daySource}[${slotSource}] to ${dayTarget}[${slotTarget}]`);

      const updatedSubTimetable = scheduleObj;
      const changedSlots = [
        { day: daySource, slot: slotSource },
        { day: dayTarget, slot: slotTarget }
      ];

      if (dialogueContexts[sessionId]) delete dialogueContexts[sessionId];

      return res.json({
        message: "Timetable updated successfully (draft swap).",
        updatedTimetable: updatedSubTimetable,
        changedSlots
      });
    });
  } catch (err) {
    console.error("Error in /chatbot/converse:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
});

module.exports = router;