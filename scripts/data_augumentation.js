// scripts/data_augmentation.js
const fs = require('fs');
const mongoose = require('mongoose');
const Subject = require('../models/Subject');
const Teacher = require('../models/Teachers');

// Connect to MongoDB
const MONGO_URI = "mongodb://localhost:27017/test";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB for data augmentation'))
  .catch(err => console.error('MongoDB connection error:', err));

/**
 * Generate synthetic training examples by combining teachers and subjects.
 * This is a simple template that can be expanded or varied.
 */
async function generateSyntheticExamples() {
  try {
    const subjects = await Subject.find({});
    const teachers = await Teacher.find({});

    const examples = [];
    teachers.forEach(teacher => {
      subjects.forEach(subject => {
        // Example command template. You can add more variety here.
        const command = `${teacher.name} is not available on Mondays, so do not schedule ${subject.subjectName} on Monday.`;
        const entities = [
          { label: "TEACHER", text: teacher.name },
          { label: "SUBJECT", text: subject.subjectName },
          { label: "DAY", text: "Monday" }
        ];
        examples.push({ command, entities });
      });
    });
    return examples;
  } catch (err) {
    console.error('Error generating synthetic examples:', err);
    return [];
  }
}

/**
 * Combine the existing training data with newly generated examples.
 */
async function augmentData() {
  try {
    const syntheticExamples = await generateSyntheticExamples();
    let currentData = [];
    try {
      currentData = JSON.parse(fs.readFileSync('training_prompts.json', 'utf8'));
    } catch (err) {
      console.warn('No existing training data found. Starting fresh.');
    }
    
    // Combine current data with synthetic examples
    const augmentedData = currentData.concat(syntheticExamples);
    
    // Save the augmented training data for later use (e.g., retraining your NLP model)
    fs.writeFileSync('augmented_training_data.json', JSON.stringify(augmentedData, null, 2));
    console.log("Augmented training data saved to 'augmented_training_data.json'");
  } catch (err) {
    console.error("Error in data augmentation process:", err);
  } finally {
    mongoose.connection.close();
  }
}

augmentData();