const express = require('express');
const router = express.Router();
const Infrastructure = require('../models/Infrastructure');
const Department = require('../models/Department');  // Assuming you have a Department model
const Class = require('../models/Class');  // Assuming you have a Class model

// GET route to display all rooms
router.get('/', async (req, res) => {
    try {
        const infrastructures = await Infrastructure.find().populate('departmentId').populate('classId');
        const departments = await Department.find();  // Fetch all departments
        const classes = await Class.find();  // Fetch all classes
        res.render('modules/infrastructure', { infrastructures, departments, classes });
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
        const { roomNo, type, departmentId, classId } = req.body;
        await Infrastructure.findByIdAndUpdate(
            req.params.id,
            { roomNo, type, departmentId, classId },
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
