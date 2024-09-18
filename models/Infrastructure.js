// backend/models/Infrastructure.js
const mongoose = require('mongoose');

// Define a schema for rooms with a new type field
const infrastructureSchema = new mongoose.Schema({
  roomNo: { type: String, required: true }, // Room number is required
  type: { type: String, required: true, enum: ['classroom', 'lab'] } // Type to distinguish between classroom and lab
});

module.exports = mongoose.model('Infrastructure', infrastructureSchema);