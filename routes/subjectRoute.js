// routes/subjectRoute.js
const express  = require('express');
const mongoose = require('mongoose');
const router   = express.Router();
const Subject  = require('../models/Subject');
const Department = require('../models/Department');

// LIST + FILTER
// GET /subjects?dept=<deptId>
router.get('/', async (req, res) => {
  try {
    const departments = await Department.find();
    const { dept } = req.query;

    // If dept query is present, match the string ID and let Mongoose cast it
    // Automatically handles both string and ObjectId under the hood
    const filter = dept
      ? { departmentIds: dept }
      : {};

    const subjects = await Subject
      .find(filter)
      .populate('departmentIds', 'departmentName');

    res.render('modules/subject', {
      subjects,
      departments,
      selectedDept: dept || ''
    });
  } catch (err) {
    console.error('Error fetching subjects:', err);
    res.status(500).render('error', { error: err });
  }
});

// CREATE
// POST /subjects
router.post('/', async (req, res) => {
  try {
    // Ensure we get an array, even if only one is selected
    let deptIds = req.body.departmentIds;
    if (!Array.isArray(deptIds)) {
      deptIds = [ deptIds ];
    }

    const subject = new Subject({
      subjectName:  req.body.subjectName,
      departmentIds: deptIds.map(id => new mongoose.Types.ObjectId(id)),
      contactHours: Number(req.body.contactHours),
      subjectType:  req.body.subjectType,
      category:     req.body.category
    });

    await subject.save();
    res.redirect('/subjects');
  } catch (err) {
    console.error('Error adding subject:', err);
    res.status(400).render('error', { error: err });
  }
});

// UPDATE
// PUT /subjects/:id
router.put('/:id', async (req, res) => {
  try {
    let deptIds = req.body.departmentIds;
    if (!Array.isArray(deptIds)) {
      deptIds = [ deptIds ];
    }

    await Subject.findByIdAndUpdate(req.params.id, {
      subjectName:   req.body.subjectName,
      departmentIds: deptIds.map(id => new mongoose.Types.ObjectId(id)),
      contactHours:  Number(req.body.contactHours),
      subjectType:   req.body.subjectType,
      category:      req.body.category
    }, { new: true });

    res.redirect('/subjects');
  } catch (err) {
    console.error('Error updating subject:', err);
    res.status(400).render('error', { error: err });
  }
});

// DELETE
// DELETE /subjects/:id
router.delete('/:id', async (req, res) => {
  try {
    await Subject.findByIdAndDelete(req.params.id);
    res.redirect('/subjects');
  } catch (err) {
    console.error('Error deleting subject:', err);
    res.status(400).render('error', { error: err });
  }
});

module.exports = router;