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
        const labAssignedDays = { Monday: false, Tuesday: false, Wednesday: false, Thursday: false, Friday: false };
        const roomAssignments = {}; // Keep track of room assignments for theory subjects
        const daySubjects = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] }; // Track subjects assigned per day

        // Separate labs and theory subjects
        const labs = subjects.filter(subject => subject.subjectType === 'Lab');
        const theorySubjects = subjects.filter(subject => subject.subjectType === 'Theory');

        // Helper function to randomly pick an item from a list
        const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

        // Helper function to assign subject to the timetable
        const assignSubject = (day, slot, subject, teacher, room) => {
            timetable[slot][day] = `${subject.subjectName} (${room.roomNo}) - ${teacher.name}`;
            daySubjects[day].push(subject._id); // Track the subject assigned to this day
        };

        // Step 1: Assign lab subjects (one per day, 2 consecutive slots)
        for (let day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
            if (labs.length > 0 && !labAssignedDays[day]) {
                const availableLabSubjects = labs.filter(lab => (subjectCount[lab._id] || 0) < lab.contactHours);

                if (availableLabSubjects.length > 0) {
                    const randomLab = getRandomElement(availableLabSubjects);
                    const labTeacher = teachers.find(teacher => teacher.subjects.some(sub => sub.equals(randomLab._id)));
                    const availableLabRoom = infrastructure.find(room => room.type === 'lab' && (!assignedRooms[day] || !assignedRooms[day].includes(room.roomNo)));

                    if (labTeacher && availableLabRoom) {
                        // Assign lab to 2 consecutive slots
                        for (let slot = 0; slot < 5; slot++) {
                            if (timetable[slot][day] === '-' && timetable[slot + 1][day] === '-') {
                                assignSubject(day, slot, randomLab, labTeacher, availableLabRoom);
                                assignSubject(day, slot + 1, randomLab, labTeacher, availableLabRoom);

                                // Track assigned lab and increment hours
                                subjectCount[randomLab._id] = (subjectCount[randomLab._id] || 0) + 2;
                                assignedRooms[day] = assignedRooms[day] || [];
                                assignedRooms[day].push(availableLabRoom.roomNo);
                                labAssignedDays[day] = true;
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Step 2: Assign theory subjects in remaining slots and ensure room consistency
        for (let day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
            // Assign the same room for the entire day
            const dayRoom = infrastructure.find(room => room.type === 'classroom' && (!assignedRooms[day] || !assignedRooms[day].includes(room.roomNo)));

            for (let slot = 0; slot < 6; slot++) {
                if (timetable[slot][day] === '-') { // Check if the slot is empty
                    const availableTheorySubjects = theorySubjects.filter(theory => (subjectCount[theory._id] || 0) < theory.contactHours && !daySubjects[day].includes(theory._id));

                    if (availableTheorySubjects.length > 0) {
                        const randomTheory = getRandomElement(availableTheorySubjects);
                        const theoryTeacher = teachers.find(teacher => teacher.subjects.some(sub => sub.equals(randomTheory._id)));

                        if (theoryTeacher && dayRoom) {
                            assignSubject(day, slot, randomTheory, theoryTeacher, dayRoom);

                            // Track assigned theory and increment hours
                            subjectCount[randomTheory._id] = (subjectCount[randomTheory._id] || 0) + 1;
                            assignedRooms[day] = assignedRooms[day] || [];
                            assignedRooms[day].push(dayRoom.roomNo);
                        }
                    }
                }
            }
        }

        // Step 3: Fill any remaining empty slots, if subjects still have available hours
        for (let day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
            for (let slot = 0; slot < 6; slot++) {
                if (timetable[slot][day] === '-') {
                    // Randomly pick a subject that still has available contact hours
                    const remainingSubjects = subjects.filter(subject => subjectCount[subject._id] < subject.contactHours && !daySubjects[day].includes(subject._id));

                    if (remainingSubjects.length > 0) {
                        const randomSubject = getRandomElement(remainingSubjects);
                        const subjectTeacher = teachers.find(teacher => teacher.subjects.some(sub => sub.equals(randomSubject._id)));
                        const availableRoom = dayRoom || infrastructure.find(room => !assignedRooms[day]?.includes(room.roomNo));

                        // Assign the remaining subject if a teacher and room are available
                        if (subjectTeacher && availableRoom) {
                            assignSubject(day, slot, randomSubject, subjectTeacher, availableRoom);
                            subjectCount[randomSubject._id] = (subjectCount[randomSubject._id] || 0) + 1;
                            assignedRooms[day].push(availableRoom.roomNo);
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
