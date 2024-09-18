// routes/index.js
const express = require('express');
const router = express.Router();
const AcademicYear = require('../models/AcademicYear');
const Class = require('../models/Class');

// Landing Page Route
router.get('/', (req, res) => {
  res.render('index'); // Render the landing page
});

// Generate Timetable Page Route
router.get('/generate-timetable', async (req, res) => {
  try {
    const academicYears = await AcademicYear.find(); // Fetch all academic years
    const classes = await Class.find(); // Fetch all classes
    res.render('modules/generateTimetable', { academicYears, classes });
  } catch (err) {
    console.error('Error fetching academic years or classes:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

module.exports = router;
