const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AcademicYear = require('../models/AcademicYear');
const Teacher = require('../models/Teachers');


// GET route to display all academic years
router.get('/', async (req, res) => {
  try {
    const academicYears = await AcademicYear.find()
      .populate('teachers.teacher', 'name')
    
    const teachers = await Teacher.find();
   
    res.render('modules/academicYear', { academicYears,teachers });
  } catch (err) {
    console.error('Error fetching academic years:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    // Check if `teachers` and `workloads` exist in the request body
    if (!req.body.teachers || !req.body.workloads) {
      throw new Error('Teachers or workloads are missing from the form submission');
    }

    // Handle teachers and workloads
    const selectedTeachers = [];

    // Ensure both teachers and workloads are arrays (or single values)
    const teachersArray = Array.isArray(req.body.teachers) ? req.body.teachers : [req.body.teachers];
    const workloadsArray = Array.isArray(req.body.workloads) ? req.body.workloads : [req.body.workloads];

    // Iterate through teachers and workloads and add to selectedTeachers
    teachersArray.forEach((teacherId, index) => {
      const workload = workloadsArray[index];
      if (teacherId && workload) {
        selectedTeachers.push({
          teacher: new mongoose.Types.ObjectId(teacherId),
          workload: workload
        });
      }
    });

    // Create the new academic year document
    const newAcademicYear = new AcademicYear({
      academicYear: req.body.academicYear,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      semester: req.body.semester,
      teachers: selectedTeachers // Pass teachers with workloads
    });

    console.log(newAcademicYear); // For debugging purposes
    await newAcademicYear.save();
    res.redirect('/academic-years');
  } catch (err) {
    console.error('Error adding academic year:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});


// DELETE route for an academic year
router.post('/delete/:id', async (req, res) => {
  try {
    await AcademicYear.findByIdAndDelete(req.params.id);
    res.redirect('/academic-years');
  } catch (err) {
    console.error('Error deleting academic year:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

module.exports = router;
