// backend/routes/infrastructureRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Infrastructure = require('../models/Infrastructure');

// GET route to display all rooms
router.get('/', async (req, res) => {
  try {
    const infrastructures = await Infrastructure.find();
    res.render('modules/infrastructure', { infrastructures });
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
      type: req.body.type
    });

    await newInfrastructure.save();
    res.redirect('/infrastructure');
  } catch (err) {
    console.error('Error adding infrastructure:', err.message);
    res.status(400).render('error', { error: err.message });
  }
});

// POST route to delete a room
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