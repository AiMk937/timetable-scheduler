const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Class = require('../models/Class');
const Department = require('../models/Department'); // Import Department model
const Subject = require('../models/Subject'); // Import Subject model

// GET route to display all classes
router.get('/', async (req, res) => {
  try {
    const classes = await Class.find()
      .populate('departmentId', 'departmentName')
      .populate('subjects', 'subjectName');
    const departments = await Department.find();
    const subjects = await Subject.find();
    res.render('modules/class', { classes, departments, subjects });
  } catch (err) {
    console.error('Error fetching classes:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// POST route to add a new class
router.post('/', async (req, res) => {
  try {

    const subjects = Array.isArray(req.body.subjects) ? req.body.subjects : [req.body.subjects];

    const newClass = new Class({
      className: req.body.className,
      departmentId: new mongoose.Types.ObjectId(req.body.departmentId),
      subjects: subjects.map(id => new mongoose.Types.ObjectId(id))
    });

    await newClass.save();
    res.redirect('/classes');
  } catch (err) {
    console.error('Error adding class:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// GET route to render edit form for a class
router.get('/edit/:id', async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id)
      .populate('departmentId', 'departmentName')
      .populate('subjects', 'subjectName');
    
    if (!classItem) {
      return res.status(404).render('error', { error: 'Class not found' });
    }

    const departments = await Department.find(); // Fetch all departments
    const subjects = await Subject.find(); // Fetch all subjects

    // Render the edit form with current class data, departments, and subjects
    res.render('modules/editClass', { classItem, departments, subjects });
  } catch (err) {
    console.error('Error fetching class for edit:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// PUT route to update a class
router.put('/:id', async (req, res) => {
  try {
    const { className, departmentId } = req.body;
    const subjects = Array.isArray(req.body.subjects) ? req.body.subjects : [req.body.subjects];
    await Class.findByIdAndUpdate(
      req.params.id,
      {
        className: className,
        departmentId: new mongoose.Types.ObjectId(departmentId),
        subjects: subjects.map(id => new mongoose.Types.ObjectId(id))
      },
      { new: true }
    );

    res.redirect('/classes');
  } catch (err) {
    console.error('Error updating class:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// DELETE route to delete a class
router.delete('/:id', async (req, res) => {
  try {
    await Class.findByIdAndDelete(req.params.id);
    res.redirect('/classes');
  } catch (err) {
    console.error('Error deleting class:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

module.exports = router;
