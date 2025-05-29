// server.js
// This is the main entry point for our Express application.
// It sets up middleware, connects to MongoDB, imports routes,
// and integrates the Gemini API (now generically referred to as our
// "Generative AI" integration) for timetable generation.

(async () => {
  // ------------------------------------------------
  // 1. Dynamic Import for node-fetch
  // ------------------------------------------------
  const { default: fetch, Headers } = await import('node-fetch');
  global.fetch = fetch;
  global.Headers = Headers;

  // ------------------------------------------------
  // 2. Required Modules and Configuration
  // ------------------------------------------------
  const express = require('express');
  const mongoose = require('mongoose');
  const cors = require('cors');
  const path = require('path');
  const methodOverride = require('method-override');
  const { GoogleGenerativeAI } = require('@google/generative-ai'); // Generative AI client

  // Configuration values
  const PORT = 5001;
  const MONGO_URI = "mongodb+srv://aimaanjkhaan:Arshee2597@cluster1.1ycsg.mongodb.net/timetableDB?retryWrites=true&w=majority&appName=Cluster1";
  const GENI_API_KEY = process.env.GOOGLE_API_KEY || "AIzaSyDurrWhYB2hV234MlrKpPaQYUNX54cubmI"; // Set your API key via environment variable

  // ------------------------------------------------
  // 3. Initialize Express App and Middleware
  // ------------------------------------------------
  const app = express();
  app.use(methodOverride('_method')); // Allow method override via query parameter
  app.use(cors()); // Enable CORS
  app.use(express.json()); // Parse JSON bodies
  app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

  // Set EJS as the view engine and serve static files
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'pages'));
  app.use(express.static(path.join(__dirname, 'public')));

  // ------------------------------------------------
  // 4. MongoDB Connection
  // ------------------------------------------------
  mongoose.connect(MONGO_URI, {})
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

  // ------------------------------------------------
  // 5. Import Application Routes
  // ------------------------------------------------
  const indexRoutes = require('./routes/index');
  const teacherRoutes = require('./routes/teacherRoutes');
  const subjectRoutes = require('./routes/subjectRoute');
  const classRoutes = require('./routes/classRoutes');
  const departmentRoutes = require('./routes/departmentRoutes');
  const academicYearRoutes = require('./routes/academicYearRoutes');
  const infrastructureRoutes = require('./routes/infrastructureRoutes');
  const timetableRoutes = require('./routes/timetableRoutes');
  const chatbotRoutes = require('./routes/chatbotRoutes');
  // const timetableUpdater = require('./routes/timetableupdater');
  // const timetableManagerRoutes = require('./routes/timetable_manager'); // JSON-based timetable modifications

  // Mount routes
  app.use('/', indexRoutes);
  app.use('/teachers', teacherRoutes);
  app.use('/subjects', subjectRoutes);
  app.use('/classes', classRoutes);
  app.use('/departments', departmentRoutes);
  app.use('/academic-years', academicYearRoutes);
  app.use('/infrastructure', infrastructureRoutes);
  app.use('/timetable', timetableRoutes);
  app.use('/chatbot', chatbotRoutes);

  // ------------------------------------------------
  // 6. Generative AI Integration for Timetable Generation
  // ------------------------------------------------
  if (!GENI_API_KEY) {
    console.warn("Warning: No API key provided. Generative AI features will not work unless you set GOOGLE_API_KEY.");
  }
  const genAI = new GoogleGenerativeAI(GENI_API_KEY);
  const generativeModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Route: Generate Timetable with Generative AI
  app.get('/generate-with-gemini', async (req, res) => {
    try {
      const { classId, promptConstraints } = req.query;
      if (!classId) {
        return res.status(400).send('The "classId" query parameter is required.');
      }

      // Lazy-load required models
      const Class = require('./models/Class');
      const Teacher = require('./models/Teachers');
      const Subject = require('./models/Subject');
      const Infrastructure = require('./models/Infrastructure');

      // Retrieve the selected class and its details
      const selectedClass = await Class.findById(classId)
        .populate('subjects')
        .populate('academicYear');
      if (!selectedClass) {
        return res.status(404).send('Class not found.');
      }

      // Fetch related subjects, teachers, and infrastructure
      const subjects = await Subject.find({
        _id: { $in: selectedClass.subjects.map(sub => sub._id) }
      }).populate('departmentId');
      const teachers = await Teacher.find({ classIds: classId }).populate('subjects');
      const infrastructure = await Infrastructure.find();

      // Build scheduling data and constraints
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

      // Construct prompt for Generative AI
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

      console.log("Generative AI prompt:\n", prompt);

      // Generate timetable using the Generative AI model
      const result = await generativeModel.generateContent(prompt);
      let generatedTimetable = result.response.text();
      console.log('Raw Generated Timetable:', generatedTimetable);

      // Attempt to parse the response as JSON
      try {
        generatedTimetable = JSON.parse(generatedTimetable);
      } catch (e) {
        console.warn('Response is not valid JSON; sending raw text as fallback.');
      }

      // Render timetable view using EJS
      res.render('modules/timetable', { timetable: generatedTimetable });
    } catch (error) {
      console.error('Error generating timetable:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ------------------------------------------------
  // 7. Start the Server
  // ------------------------------------------------
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();