// routes/index.js
const express = require('express');
const router = express.Router();
const AcademicYear = require('../models/AcademicYear');
const Class = require('../models/Class');
const Department = require('../models/Department'); // Import Department model

// Landing Page Route
router.get('/', (req, res) => {
  res.render('index'); // Render the landing page
});

// Generate Timetable Page Route
router.get('/generate-timetable', async (req, res) => {
  try {
    const academicYears = await AcademicYear.find(); // Fetch all academic years
    const classes = await Class.find(); // Fetch all classes
    const departments = await Department.find(); // Fetch all departments

    // Pass academicYears, classes, and departments to the view
    res.render('modules/generateTimetable', { academicYears, classes, departments });
  } catch (err) {
    console.error('Error fetching academic years, classes, or departments:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

module.exports = router;
