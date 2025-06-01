// models/Timetable.js

const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/**
 * We store _one_ timetable per document. The JSON will look like:
 *
 * {
 *   "_id": ObjectId("..."),
 *   "academicYearId": ObjectId("..."),
 *   "classId":        ObjectId("..."),
 *   "departmentId":   ObjectId("..."),
 *   "timetable": {
 *     "Monday":    [ {subject, teacher, room} , … ],   // length 7
 *     "Tuesday":   [ … ],
 *     "Wednesday": [ … ],
 *     "Thursday":  [ … ],
 *     "Friday":    [ … ]
 *   },
 *   "createdAt": ISODate("…")
 * }
 *
 * Notice:
 *  - Each weekday key maps to an array of exactly 7 “slots.” 
 *  - A “slot” may be:
 *      • an Object with { subject, teacher, room }
 *      • OR an Array of Objects (lab‐batches) each having { batch, subject, teacher, room }
 *      • OR null (if that slot is free).
 */

const timetableSchema = new Schema({
  academicYearId: {
    type: Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true
  },
  classId: {
    type: Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  departmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  // We store the entire weekday → [ slots ] mapping as a Mixed type.
  // You could also do `type: Map, of: [Schema.Types.Mixed]` but `Mixed` is simpler.
  timetable: {
    type: Schema.Types.Mixed,
    required: true
    /*
      Expect exactly this shape:
      {
        Monday:    [ slot0, slot1, … slot6 ],
        Tuesday:   [ slot0, slot1, … slot6 ],
        Wednesday: [ … ],
        Thursday:  [ … ],
        Friday:    [ … ]
      }
      Where each `slotX` is either:
        • null                  ← FREE
        • { subject, teacher, room }   ← single lecture
        • [ {batch, subject, teacher, room}, … ]  ← lab‐batch
    */
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Finally, export:
module.exports = model('Timetable', timetableSchema);