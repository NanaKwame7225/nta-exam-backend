const mongoose = require('mongoose');

// ── STUDENT ──────────────────────────────────────────
const studentSchema = new mongoose.Schema({
  code:       { type: String, required: true, unique: true, uppercase: true },
  name:       { type: String, required: true },
  phone:      { type: String, default: '' },
  course:     { type: String, required: true },   // primary course
  courses:    [{ type: String }],                 // all enrolled courses
  registered: { type: String, default: () => new Date().toLocaleDateString('en-GB') },
  totalFee:   { type: Number, default: 0 },
  payments:   [{
    amount:    Number,
    date:      String,
    total:     Number,
    balance:   Number,
    method:    String,
    smsStatus: String
  }],
  active: { type: Boolean, default: true }
}, { timestamps: true });

// ── EXAM RESULT ───────────────────────────────────────
const resultSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true }, // 'r' + timestamp
  studentCode:{ type: String, required: true },
  studentName:{ type: String, required: true },
  course:     { type: String, required: true },
  exam:       { type: String, required: true }, // Mock 1 / Mock 2 / Main Exam
  pct:        { type: Number, required: true },
  earned:     { type: Number, required: true },
  total:      { type: Number, required: true },
  grade:      { type: String },
  gradeLabel: { type: String },
  breakdown:  { type: mongoose.Schema.Types.Mixed }, // full question breakdown
  hasShort:   { type: Boolean, default: false },
  released:   { type: Boolean, default: false },
  date:       { type: String }
}, { timestamps: true });

// ── EXTRA QUESTIONS (trainer-added) ──────────────────
const questionSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  course:   { type: String, required: true },
  exam:     { type: String, required: true },
  type:     { type: String, enum: ['mcq','tf','short','word'], required: true },
  question: { type: String, required: true },
  scenario: { type: String, default: null },
  options:  [String],
  correct:  { type: mongoose.Schema.Types.Mixed },
  marks:    { type: Number, default: 1 }
}, { timestamps: true });

// ── SETTINGS ─────────────────────────────────────────
const settingsSchema = new mongoose.Schema({
  _id:           { type: String, default: 'singleton' },
  gradeDist:     { type: Number, default: 80 },
  gradeMerit:    { type: Number, default: 70 },
  gradePass:     { type: Number, default: 60 },
  mockTime:      { type: Number, default: 20 },
  mainTime:      { type: Number, default: 50 },
  mockQCount:    { type: Number, default: 20 },
  mainQCount:    { type: Number, default: 50 },
  autoRelease:   { type: Boolean, default: true },
  examPasswords: { type: Map, of: String, default: {} }
});

// ── TRAINER CREDENTIALS ───────────────────────────────
const trainerSchema = new mongoose.Schema({
  _id:      { type: String, default: 'singleton' },
  username: { type: String, default: 'trainer' },
  password: { type: String, default: 'NkaySolutions2025' }
});

module.exports = {
  Student:  mongoose.model('Student',  studentSchema),
  Result:   mongoose.model('Result',   resultSchema),
  Question: mongoose.model('Question', questionSchema),
  Settings: mongoose.model('Settings', settingsSchema),
  Trainer:  mongoose.model('Trainer',  trainerSchema)
};
