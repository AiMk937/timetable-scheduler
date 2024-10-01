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

        // Variables to track assigned subjects and rooms
        const subjectCount = {};
        const daySubjects = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };

        // Separate labs and theory subjects
        const labs = subjects.filter(subject => subject.subjectType === 'Lab');
        const theorySubjects = subjects.filter(subject => subject.subjectType === 'Theory');

        // Helper function to assign a subject
        const assignSubject = (day, slot, subject, teacher, room) => {
            timetable[slot][day] = `${subject.subjectName} (${room.roomNo}) - ${teacher.name}`;
            daySubjects[day].push(subject._id); // Keep track of subjects assigned on that day
        };

        // Helper function to get a random element from an array
        const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

        // Helper function to get a random available room for a subject (can reuse rooms)
        const getAvailableRoom = (type) => {
            const availableRooms = infrastructure.filter(room => room.type === type);
            return getRandomElement(availableRooms);  // Randomly pick from available rooms
        };

        // Step 1: Assign lab subjects (ensure 2 consecutive slots)
        for (let day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
            const availableLabs = labs.filter(lab => (subjectCount[lab._id] || 0) < lab.contactHours);

            if (availableLabs.length > 0) {
                const selectedLab = getRandomElement(availableLabs);
                const labTeacher = teachers.find(teacher => teacher.subjects.some(sub => sub.equals(selectedLab._id)));
                const availableLabRoom = getAvailableRoom('lab');  // Random room assignment for labs

                if (labTeacher && availableLabRoom) {
                    for (let slot = 0; slot < 5; slot++) {
                        if (timetable[slot][day] === '-' && timetable[slot + 1][day] === '-') {
                            assignSubject(day, slot, selectedLab, labTeacher, availableLabRoom);
                            assignSubject(day, slot + 1, selectedLab, labTeacher, availableLabRoom);

                            subjectCount[selectedLab._id] = (subjectCount[selectedLab._id] || 0) + 2;
                            break;
                        }
                    }
                }
            }
        }

        // Step 2: Assign theory subjects ensuring no repetition on the same day and rooms can repeat
        for (let day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
            for (let slot = 0; slot < 6; slot++) {
                if (timetable[slot][day] === '-') {
                    const availableTheorySubjects = theorySubjects.filter(theory =>
                        (subjectCount[theory._id] || 0) < theory.contactHours && !daySubjects[day].includes(theory._id)
                    );

                    if (availableTheorySubjects.length > 0) {
                        const selectedTheory = getRandomElement(availableTheorySubjects);
                        const theoryTeacher = teachers.find(teacher => teacher.subjects.some(sub => sub.equals(selectedTheory._id)));
                        const availableClassroom = getAvailableRoom('classroom');  // Random room assignment for theory

                        if (theoryTeacher && availableClassroom) {
                            assignSubject(day, slot, selectedTheory, theoryTeacher, availableClassroom);
                            subjectCount[selectedTheory._id] = (subjectCount[selectedTheory._id] || 0) + 1;
                        }
                    }
                }
            }
        }

        // Step 3: Handle remaining empty slots by assigning subjects with remaining hours
        for (let day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
            for (let slot = 0; slot < 6; slot++) {
                if (timetable[slot][day] === '-') {
                    const remainingSubjects = subjects.filter(subject => subjectCount[subject._id] < subject.contactHours);

                    if (remainingSubjects.length > 0) {
                        const selectedSubject = getRandomElement(remainingSubjects);
                        const subjectTeacher = teachers.find(teacher => teacher.subjects.some(sub => sub.equals(selectedSubject._id)));
                        const availableRoom = getAvailableRoom(selectedSubject.subjectType === 'Lab' ? 'lab' : 'classroom');  // Assign appropriate room type

                        if (subjectTeacher && availableRoom) {
                            assignSubject(day, slot, selectedSubject, subjectTeacher, availableRoom);
                            subjectCount[selectedSubject._id] = (subjectCount[selectedSubject._id] || 0) + 1;
                        }
                    }
                }
            }
        }

        console.log('Final Timetable:', timetable);

        // Send the generated timetable to the client
        res.render('modules/timetable', { timetable });

    } catch (err) {
        console.error('Error generating timetable:', err.message);
        res.status(400).send('Error generating timetable');
    }
});

module.exports = router;
