// backend/models/Workload.js
const mongoose = require('mongoose');

const workloadSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true }, // Reference to the teacher
  hoursPerWeek: { type: Number, required: true } // Number of hours per week
});

module.exports = mongoose.model('Workload', workloadSchema);
