const mongoose = require('mongoose');
const { Schema } = mongoose;

const InfrastructureSchema = new Schema(
  {
    roomNo: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['classroom', 'lab'],
      required: true
    },

    // **If you want to allow a single department per room**, keep this:
    // departmentId: {
    //   type: Schema.Types.ObjectId,
    //   ref: 'Department',
    //   required: true
    // },
    // **Or** if you want to allow multiple departments, use this instead:
    departmentIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true
    }],

    // same for Class:
    // classId: {
    //   type: Schema.Types.ObjectId,
    //   ref: 'Class',
    //   required: true
    // },
    // OR for multiple classes:
    classIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    }],

    // labSubjectIds is already an array of refs to Subject
    labSubjectIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Subject'
    }],

    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { strictPopulate: false } // if you ever need to override populates
);

module.exports = mongoose.model('Infrastructure', InfrastructureSchema);