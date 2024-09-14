const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  subjectName: { type: String, required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true }  // Should reference departmentId
});

module.exports = mongoose.model('Subject', subjectSchema);
