const express = require('express');
const router = express.Router();
const Infrastructure = require('../models/Infrastructure');
const Department = require('../models/Department');  // Assuming you have a Department model
const Class = require('../models/Class');  // Assuming you have a Class model
const Subject = require('../models/Subject');  // Include the Subject model

// GET route to display all rooms
router.get('/', async (req, res) => {
    try {
        const infrastructures = await Infrastructure.find()
            .populate('departmentId')
            .populate('classId')
            .populate('labSubjectId'); // This populates an array of subjects
        const departments = await Department.find();  // Fetch all departments
        const classes = await Class.find();  // Fetch all classes
        const subjects = await Subject.find();  // Fetch all subjects
        res.render('modules/infrastructure', { infrastructures, departments, classes, subjects });
    } catch (err) {
        console.error('Error fetching infrastructure:', err.message);
        res.status(400).render('error', { error: err.message });
    }
});

// POST route to add a new room
router.post('/', async (req, res) => {
    try {
        const newInfrastructure = new Infrastructure({
            roomNo: req.body.roomNo,
            type: req.body.type,
            departmentId: req.body.departmentId,  // Add department ID
            classId: req.body.classId  // Add class ID
        });

        // If the room is a lab, convert labSubjectId into an array (handles no, one, or multiple selections)
        if (req.body.type === 'lab') {
            newInfrastructure.labSubjectId = [].concat(req.body.labSubjectId || []);
        }

        await newInfrastructure.save();
        res.redirect('/infrastructure');
    } catch (err) {
        console.error('Error adding infrastructure:', err.message);
        res.status(400).render('error', { error: err.message });
    }
});

// PUT route to update an infrastructure item
router.put('/:id', async (req, res) => {
    try {
        const { roomNo, type, departmentId, classId, labSubjectId } = req.body;
        const updateData = { roomNo, type, departmentId, classId };

        // If the room is a lab, update labSubjectId as an array; otherwise, clear it.
        if (type === 'lab') {
            updateData.labSubjectId = [].concat(labSubjectId || []);
        } else {
            updateData.labSubjectId = [];
        }

        await Infrastructure.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        res.redirect('/infrastructure');
    } catch (err) {
        console.error('Error updating infrastructure:', err.message);
        res.status(400).render('error', { error: err.message });
    }
});

// DELETE route to delete a room
router.delete('/delete/:id', async (req, res) => {
    try {
        await Infrastructure.findByIdAndDelete(req.params.id);
        res.redirect('/infrastructure');
    } catch (err) {
        console.error('Error deleting infrastructure:', err.message);
        res.status(400).render('error', { error: err.message });
    }
});

module.exports = router;
