// backend/models/AcademicYear.js
const mongoose = require('mongoose');

// const teacherAssignmentSchema = new mongoose.Schema({
//   teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
//   workload: { type: Number, required: true }, // Workload in hours per week
// });

const academicYearSchema = new mongoose.Schema({
  academicYear: { type: String, required: true }, // E.g., 2023-2024
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  semester: { type: String, enum: ['odd', 'even'], required: true },
});

module.exports = mongoose.model('AcademicYear', academicYearSchema);
