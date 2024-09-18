require('dotenv').config();  // Load environment variables from .env file
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const methodOverride = require('method-override');

const app = express();
// Override POST methods with a query string parameter _method for PUT and DELETE
app.use(methodOverride('_method'));
// Middleware
app.use(cors());
app.use(express.json());
app.set('view engine', 'ejs');  // Set EJS as the view engine

// Set the directory for EJS templates to 'pages'
app.set('views', path.join(__dirname, 'pages'));
app.use(express.urlencoded({ extended: true }));  // Middleware to parse URL-encoded data


// Serve static files (CSS, JS, Images) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 5001;

// Connect to MongoDB using environment variable
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/test", { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import routes
const indexRoutes = require('./routes/index'); // Import the landing page routes
const teacherRoutes = require("./routes/teacherRoutes");
const subjectRoutes = require("./routes/subjectRoute");
const classRoutes = require("./routes/classRoutes");
const departmentRoutes = require('./routes/departmentRoutes');
const academicYearRoutes = require('./routes/academicYearRoutes');
const infrastructureRoutes = require('./routes/infrastructureRoutes');
const timetableRoutes = require('./routes/timetableRoutes');

// Use routes
app.use('/', indexRoutes); // Use the landing page routes
app.use('/teachers', teacherRoutes);
app.use('/subjects', subjectRoutes);
app.use('/classes', classRoutes);  // Correct route for classes
app.use('/departments', departmentRoutes);  // Correct route for departments
app.use('/academic-years', academicYearRoutes);
app.use('/infrastructure', infrastructureRoutes);
app.use('/timetable', timetableRoutes);


// Start the server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
