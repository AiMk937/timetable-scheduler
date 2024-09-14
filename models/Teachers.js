// backend/models/Teacher.js
const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }], // References to subjects taught by the teacher
  classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }], // References to classes the teacher is associated with
  departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }], // References to departments the teacher belongs to
});

module.exports = mongoose.model('Teacher', teacherSchema);
