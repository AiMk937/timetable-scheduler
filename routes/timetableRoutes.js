const express = require('express');
const router = express.Router();
const Class = require('../models/Class');
const Teacher = require('../models/Teachers');
const Infrastructure = require('../models/Infrastructure');
const Subject = require('../models/Subject');

router.get('/generate', async (req, res) => {
    try {
        const { academicYearId, classId } = req.query;
        
        // Fetch the class, teachers, subjects, and available infrastructure
        const selectedClass = await Class.findById(classId).populate('subjects').populate('academicYear');
        const subjects = await Subject.find({ _id: { $in: selectedClass.subjects } }).populate('departmentId');
        const teachers = await Teacher.find({ classIds: classId }).populate('subjects');
        const infrastructure = await Infrastructure.find();
        
        // Initialize the timetable structure
        const timetable = Array(6).fill().map(() => ({
            Monday: '-',
            Tuesday: '-',
            Wednesday: '-',
            Thursday: '-',
            Friday: '-',
        }));
        
        // Variables to track assigned slots and rooms for the week
        const subjectCount = {};
        const assignedRooms = {};
        const assignedTeachers = {};

        // Generate timetable logic
        for (let day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
            for (let slot = 0; slot < 6; slot++) {
                const availableSubjects = subjects.filter(sub => {
                    const count = subjectCount[sub._id] || 0;
                    return count < sub.contactHours;
                });
                
                if (availableSubjects.length > 0) {
                    const randomSubject = availableSubjects[Math.floor(Math.random() * availableSubjects.length)];
                    const subjectTeacher = teachers.find(teacher => teacher.subjects.some(sub => sub.equals(randomSubject._id)));
                    const availableRoom = infrastructure.find(room => !assignedRooms[day]?.includes(room.roomNo));

                    // Assign subject, teacher, and room if all are available
                    if (subjectTeacher && availableRoom) {
                        timetable[slot][day] = `${randomSubject.subjectName} (${availableRoom.roomNo}) - ${subjectTeacher.name}`;
                        
                        // Update the tracking variables
                        subjectCount[randomSubject._id] = (subjectCount[randomSubject._id] || 0) + 1;
                        assignedRooms[day] = assignedRooms[day] || [];
                        assignedRooms[day].push(availableRoom.roomNo);
                        assignedTeachers[day] = assignedTeachers[day] || [];
                        assignedTeachers[day].push(subjectTeacher._id);
                    }
                }
            }
        }

        res.render('modules/timetable', { timetable });
    } catch (err) {
        console.error('Error generating timetable:', err.message);
        res.status(400).send('Error generating timetable');
    }
});

module.exports = router;
