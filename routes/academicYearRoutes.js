const express = require('express');
const router = express.Router();
const AcademicYear = require('../models/AcademicYear');

// GET route to display all academic years
router.get('/', async (req, res) => {
  try {
    const academicYears = await AcademicYear.find();
    res.render('modules/academicYear', { academicYears });
  } catch (err) {
    console.error('Error fetching academic years:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// POST route to create a new academic year
router.post('/', async (req, res) => {
  try {
    const newAcademicYear = new AcademicYear({
      academicYear: req.body.academicYear,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      semester: req.body.semester,
    });

    await newAcademicYear.save();
    res.redirect('/academic-years');
  } catch (err) {
    console.error('Error adding academic year:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// GET route to render the edit form for an academic year
router.get('/edit/:id', async (req, res) => {
  try {
    const academicYear = await AcademicYear.findById(req.params.id);
    if (!academicYear) {
      return res.status(404).render('error', { error: 'Academic year not found' });
    }
    res.render('modules/editAcademicYear', { academicYear });
  } catch (err) {
    console.error('Error fetching academic year for edit:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// PUT route to update an academic year
router.put('/:id', async (req, res) => {
  try {
    const { academicYear, startDate, endDate, semester } = req.body;
    await AcademicYear.findByIdAndUpdate(
      req.params.id,
      { academicYear, startDate, endDate, semester },
      { new: true }
    );
    res.redirect('/academic-years');
  } catch (err) {
    console.error('Error updating academic year:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// DELETE route to delete an academic year
router.delete('/:id', async (req, res) => {
  try {
    await AcademicYear.findByIdAndDelete(req.params.id);
    res.redirect('/academic-years');
  } catch (err) {
    console.error('Error deleting academic year:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

module.exports = router;
