const mongoose = require('mongoose');

// Define a schema for rooms with department and class reference
const infrastructureSchema = new mongoose.Schema({
  roomNo: { type: String, required: true }, // Room number is required
  type: { type: String, required: true, enum: ['classroom', 'lab'] }, // Type to distinguish between classroom and lab
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true }, // Reference to Department
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true } // Reference to Class
});

module.exports = mongoose.model('Infrastructure', infrastructureSchema);
