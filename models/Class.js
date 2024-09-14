const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  className: { type: String, required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  // Other fields...
});

module.exports = mongoose.model('Class', classSchema);
