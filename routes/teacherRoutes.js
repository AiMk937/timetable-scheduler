const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Teacher = require('../models/Teachers');
const Subject = require('../models/Subject');
const Class = require('../models/Class');
const Department = require('../models/Department');

// GET route to display all teachers
router.get('/', async (req, res) => {
  try {
    const teachers = await Teacher.find()
      .populate('subjects', 'subjectName')
      .populate('classIds', 'className')
      .populate('departments', 'departmentName');
    const subjects = await Subject.find();
    const classes = await Class.find();
    const departments = await Department.find();
    res.render('modules/teacher', { teachers, subjects, classes, departments });
  } catch (err) {
    console.error('Error fetching teachers:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// POST route to add a new teacher
router.post('/', async (req, res) => {
  try {
    //add workload here if you when you want to add
    const { name, subjects, classIds, departments } = req.body;

    const subjectArray = Array.isArray(subjects) ? subjects : [subjects];
    const classArray = Array.isArray(classIds) ? classIds : [classIds];
    const departmentArray = Array.isArray(departments) ? departments : [departments];

    const newTeacher = new Teacher({
      name,
      subjects: subjectArray.map(id => new mongoose.Types.ObjectId(id)),
      classIds: classArray.map(id => new mongoose.Types.ObjectId(id)),
      departments: departmentArray.map(id => new mongoose.Types.ObjectId(id)), // Handle departments
      // workload
    });

    await newTeacher.save();
    res.redirect('/teachers');
  } catch (err) {
    console.error('Error adding teacher:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// GET route to render edit form for a teacher (Inline editing handled in ejs)
router.get('/edit/:id', async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id)
      .populate('subjects', 'subjectName')
      .populate('classIds', 'className');
    const subjects = await Subject.find();
    const classes = await Class.find();
    res.render('modules/teacher', { teacher, subjects, classes });
  } catch (err) {
    console.error('Error fetching teacher for edit:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// PUT route to update a teacher
router.put('/:id', async (req, res) => {
  try {
    const { name, subjects, classIds, departments} = req.body;

    const subjectArray = Array.isArray(subjects) ? subjects : [subjects];
    const classArray = Array.isArray(classIds) ? classIds : [classIds];
    const departmentArray = Array.isArray(departments) ? departments : [departments];

    await Teacher.findByIdAndUpdate(
      req.params.id,
      {
        name,
        subjects: subjectArray.map(id => new mongoose.Types.ObjectId(id)),
        classIds: classArray.map(id => new mongoose.Types.ObjectId(id)),
        departments: departmentArray.map(id => new mongoose.Types.ObjectId(id)), // Handle departments
        // workload
      },
      { new: true }
    );

    res.redirect('/teachers');
  } catch (err) {
    console.error('Error updating teacher:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// DELETE route to delete a teacher
router.delete('/:id', async (req, res) => {
  try {
    await Teacher.findByIdAndDelete(req.params.id);
    res.redirect('/teachers');
  } catch (err) {
    console.error('Error deleting teacher:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

module.exports = router;
