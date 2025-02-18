// server.js
// Wrap all code in an async IIFE so we can use dynamic import for node-fetch
(async () => {
  // Dynamically import node-fetch and assign it to global.fetch and global.Headers
  const { default: fetch, Headers } = await import('node-fetch');
  global.fetch = fetch;
  global.Headers = Headers;

  // Required modules
  const express = require('express');
  const mongoose = require('mongoose');
  const cors = require('cors');
  const path = require('path');
  const methodOverride = require('method-override');

  // Import Google Generative AI library
  const { GoogleGenerativeAI } = require('@google/generative-ai');

  // Initialize the Express application
  const app = express();

  // Middleware
  app.use(methodOverride('_method'));               // Allow override of HTTP methods via query parameter
  app.use(cors());                                  // Enable Cross-Origin Resource Sharing
  app.use(express.json());                          // Parse JSON bodies
  app.use(express.urlencoded({ extended: true }));  // Parse URL-encoded bodies

  // Set EJS as the view engine and define the views directory
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'pages'));

  // Serve static files from the "public" folder
  app.use(express.static(path.join(__dirname, 'public')));

  // Hard-coded configuration values
  const PORT = 5001;
  const MONGO_URI = "mongodb://localhost:27017/test";

  // Connect to MongoDB
  mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

  // Import routes (for other parts of your app)
  const indexRoutes = require('./routes/index');             // Landing page routes
  const teacherRoutes = require('./routes/teacherRoutes');
  const subjectRoutes = require('./routes/subjectRoute');
  const classRoutes = require('./routes/classRoutes');
  const departmentRoutes = require('./routes/departmentRoutes');
  const academicYearRoutes = require('./routes/academicYearRoutes');
  const infrastructureRoutes = require('./routes/infrastructureRoutes');
  const timetableRoutes = require('./routes/timetableRoutes');

  // Use the imported routes
  app.use('/', indexRoutes);
  app.use('/teachers', teacherRoutes);
  app.use('/subjects', subjectRoutes);
  app.use('/classes', classRoutes);
  app.use('/departments', departmentRoutes);
  app.use('/academic-years', academicYearRoutes);
  app.use('/infrastructure', infrastructureRoutes);
  app.use('/timetable', timetableRoutes);

  // ----- Gemini API Integration for Timetable Generation ----- //

  // Instantiate the Generative AI client with your API key
  const genAI = new GoogleGenerativeAI("AIzaSyDurrWhYB2hV234MlrKpPaQYUNX54cubmI"); // Replace with your actual API key
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Route to generate a timetable using the Gemini model via Google Generative AI
  // Expects a query parameter "classId" (and optionally "academicYearId" and "promptConstraints")
  app.get('/generate-with-gemini', async (req, res) => {
    try {
      // Extract query parameters: classId and additional prompt constraints (if provided)
      const { classId, promptConstraints } = req.query;
      if (!classId) {
        return res.status(400).send('The "classId" query parameter is required.');
      }

      // Import necessary models
      const Class = require('./models/Class');
      const Teacher = require('./models/Teachers');
      const Subject = require('./models/Subject');
      const Infrastructure = require('./models/Infrastructure');

      // Fetch the selected class and populate its subjects and academic year details
      const selectedClass = await Class.findById(classId)
        .populate('subjects')
        .populate('academicYear');

      if (!selectedClass) {
        return res.status(404).send('Class not found.');
      }

      // Fetch subjects (and populate additional details if needed)
      const subjects = await Subject.find({
        _id: { $in: selectedClass.subjects.map(sub => sub._id) }
      }).populate('departmentId');

      // Fetch teachers associated with the class (assuming teachers are linked via classIds)
      const teachers = await Teacher.find({ classIds: classId }).populate('subjects');

      // Fetch all available infrastructure (rooms and labs)
      const infrastructure = await Infrastructure.find();

      // Build the scheduling data object with constraints
      const schedulingData = {
        class: {
          id: selectedClass._id,
          className: selectedClass.className,
          academicYear: selectedClass.academicYear ? selectedClass.academicYear.academicYear : "N/A"
        },
        subjects: subjects.map(sub => ({
          id: sub._id,
          subjectName: sub.subjectName,
          contactHours: sub.contactHours,
          subjectType: sub.subjectType
        })),
        teachers: teachers.map(teacher => ({
          id: teacher._id,
          name: teacher.name,
          subjects: teacher.subjects.map(s => s._id)
        })),
        infrastructure: infrastructure.map(room => ({
          id: room._id,
          roomNo: room.roomNo,
          type: room.type
        })),
        constraints: {
          labConsecutiveSlots: true,
          avoidTeacherOverlap: true,
          weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          periodsPerDay: 6
        }
      };

      // Build the prompt text for the Generative AI model.
      // If additional constraints are provided, include them in the prompt.
      let prompt = `Using the following data and constraints, generate a complete timetable for the class:
Data: ${JSON.stringify(schedulingData, null, 2)}
Constraints:
- Lab subjects must be scheduled in two consecutive periods.
- A teacher should not be assigned to more than one class at the same time.
- Subjects should not repeat on the same day (unless necessary).
`;
      if (promptConstraints && promptConstraints.trim() !== "") {
        prompt += `Additional Constraints: ${promptConstraints}\n`;
      }
      prompt += `Generate a timetable that covers all weekdays with ${schedulingData.constraints.periodsPerDay} periods per day.`;

      // Use the Generative AI model to generate content (i.e. the timetable)
      const result = await model.generateContent(prompt);
      let generatedTimetable = result.response.text();
      console.log('Raw Generated Timetable from Gemini:', generatedTimetable);

      // Optionally, try to parse it as JSON if you expect JSON data:
      try {
        generatedTimetable = JSON.parse(generatedTimetable);
      } catch (e) {
        console.warn('Generated timetable is not valid JSON; using raw text.');
      }

      // Render the generated timetable using an EJS template
      res.render('modules/timetable', { timetable: generatedTimetable });
      // Alternatively, to return JSON:
      // res.json({ timetable: generatedTimetable });

    } catch (error) {
      console.error('Error generating timetable:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Start the server
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
