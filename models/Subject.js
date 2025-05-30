const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  subjectName: { type: String, required: true },
  departmentIds: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Department',
  required: true
  }],
  contactHours: { type: Number, required: true },  // Contact hours per week
  subjectType: { type: String, enum: ['Theory', 'Lab'], required: true },  // Type of subject: Theory or Lab
  category: {
    type: String,
    enum: ['Department Level Elective', 'Institute Level Elective', 'Honours/Minor', 'Regular'],
    default: 'Regular'
  }
});

module.exports = mongoose.model('Subject', subjectSchema);