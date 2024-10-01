const express = require('express');
const router = express.Router();
const Department = require('../models/Department');

// Create a new department
router.post('/', async (req, res) => {
  try {
    const department = new Department(req.body);
    await department.save();
    res.redirect('/departments'); // Redirect to the list of departments after adding a new department
  } catch (err) {
    console.error('Error adding department:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// Get all departments
router.get('/', async (req, res) => {
  try {
    const departments = await Department.find();
    console.log(departments)
    res.render('modules/department', { departments }); // Render the department.ejs template with department data
  } catch (err) {
    console.error('Error fetching departments:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// PUT route to update a department
router.put('/:id', async (req, res) => {
  try {
    const { departmentName } = req.body;
    await Department.findByIdAndUpdate(req.params.id, { departmentName }, { new: true });
    res.redirect('/departments');
  } catch (err) {
    console.error('Error updating department:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// DELETE route to delete a department
router.delete('/:id', async (req, res) => {
  try {
    await Department.findByIdAndDelete(req.params.id);
    res.redirect('/departments');
  } catch (err) {
    console.error('Error deleting department:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

module.exports = router;
