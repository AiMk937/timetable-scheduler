// routes/infrastructureRoutes.js
const express = require('express');
const router  = express.Router();
const Infrastructure = require('../models/Infrastructure');
const Department     = require('../models/Department');
const ClassModel     = require('../models/Class');
const Subject        = require('../models/Subject');

// GET /infrastructure
// — fetch all rooms, populate the three ref-arrays,
//   plus load all depts/classes/subjects for the form
router.get('/', async (req, res) => {
  try {
    const infrastructures = await Infrastructure.find()
      .populate('departmentIds')
      .populate('classIds')
      .populate('labSubjectIds');
    const departments = await Department.find();
    const classes     = await ClassModel.find();
    const subjects    = await Subject.find();

    res.render('modules/infrastructure', {
      infrastructures,
      departments,
      classes,
      subjects
    });
  } catch (err) {
    console.error('Error fetching infrastructure:', err);
    res.status(400).render('error', { message: err.message });
  }
});

// POST /infrastructure
// — create a new room, pulling the checkbox arrays from req.body
router.post('/', async (req, res) => {
  try {
    const { roomNo, type } = req.body;

    // always treat these as arrays, even if only one was checked
    const departmentIds  = [].concat(req.body.departmentIds  || []);
    const classIds       = [].concat(req.body.classIds       || []);
    // only assign labs if this is a lab
    const labSubjectIds  = type === 'lab'
      ? [].concat(req.body.labSubjectIds || [])
      : [];

    await new Infrastructure({
      roomNo,
      type,
      departmentIds,
      classIds,
      labSubjectIds
    }).save();

    res.redirect('/infrastructure');
  } catch (err) {
    console.error('Error adding infrastructure:', err);
    res.status(400).render('error', { message: err.message });
  }
});

// PUT /infrastructure/:id
// — update an existing room
router.put('/:id', async (req, res) => {
  try {
    const { roomNo, type } = req.body;

    const departmentIds = [].concat(req.body.departmentIds || []);
    const classIds      = [].concat(req.body.classIds      || []);
    const labSubjectIds = type === 'lab'
      ? [].concat(req.body.labSubjectIds || [])
      : [];

    await Infrastructure.findByIdAndUpdate(
      req.params.id,
      { roomNo, type, departmentIds, classIds, labSubjectIds },
      { new: true }
    );

    res.redirect('/infrastructure');
  } catch (err) {
    console.error('Error updating infrastructure:', err);
    res.status(400).render('error', { message: err.message });
  }
});

// DELETE /infrastructure/delete/:id
router.delete('/delete/:id', async (req, res) => {
  try {
    await Infrastructure.findByIdAndDelete(req.params.id);
    res.redirect('/infrastructure');
  } catch (err) {
    console.error('Error deleting infrastructure:', err);
    res.status(400).render('error', { message: err.message });
  }
});

module.exports = router;