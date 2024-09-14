const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Subject = require('../models/Subject');
const Department = require('../models/Department'); // Import Department model

// GET route to display all subjects
router.get('/', async (req, res) => {
  try {
    // Fetch subjects and populate department information
    const subjects = await Subject.find().populate('departmentId', 'departmentName');
    const departments = await Department.find();  // Fetch all departments
    console.log(subjects);
    console.log(departments);

    // Render the 'subject' template and pass subjects and departments to it
    res.render('modules/subject', { subjects, departments });
  } catch (err) {
    console.error('Error fetching subjects:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// POST route to add a new subject
router.post('/', async (req, res) => {
  try {
    const newSubject = new Subject({
      subjectName: req.body.subjectName,
      departmentId: new mongoose.Types.ObjectId(req.body.departmentName)  // Correct usage with 'new'
    });

    await newSubject.save();
    res.redirect('/subjects');  // Redirect to the list of subjects after adding a new subject
  } catch (err) {
    console.error('Error adding subject:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// PUT route to update a subject
router.put('/:id', async (req, res) => {
  try {
    const { subjectName, departmentName } = req.body;

    // Update the subject
    await Subject.findByIdAndUpdate(
      req.params.id,
      {
        subjectName: subjectName,
        departmentId: new mongoose.Types.ObjectId(departmentName),  // Update department reference
      },
      { new: true }
    );

    res.redirect('/subjects');  // Redirect to the list of subjects after updating
  } catch (err) {
    console.error('Error updating subject:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// DELETE route to delete a subject
router.delete('/:id', async (req, res) => {
  try {
    await Subject.findByIdAndDelete(req.params.id);
    res.redirect('/subjects');  // Redirect to the list of subjects after deleting
  } catch (err) {
    console.error('Error deleting subject:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

module.exports = router;
