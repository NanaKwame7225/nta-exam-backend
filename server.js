require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const https    = require('https');
const { Student, Result, Question, Settings, Trainer } = require('./models');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://nanakwame7225.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'null' // for file:// local testing
  ],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '5mb' }));

// ── MONGODB ───────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
})
  .then(async () => {
    console.log('✅ MongoDB connected — NTA Exam DB');
    await seedDefaults();
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    // Don't exit — let health endpoint show disconnected status
  });

// ── SEED DEFAULTS (run once on fresh DB) ──────────────
async function seedDefaults() {
  try {
    const s = await Settings.findById('singleton');
    if (!s) await new Settings({ _id: 'singleton' }).save();
    const t = await Trainer.findById('singleton');
    if (!t) await new Trainer({ _id: 'singleton' }).save();
    console.log('✅ Defaults seeded');
  } catch(e) {
    console.error('⚠️ seedDefaults error:', e.message);
  }
}

// ── HELPERS ───────────────────────────────────────────
function fmtGHS(n) {
  return 'GHS ' + Number(n).toFixed(2);
}

function normalizePhone(p) {
  if (!p) return null;
  p = p.replace(/\s+/g, '').replace(/^\+/, '');
  if (p.startsWith('233')) return p;
  if (p.startsWith('0'))   return '233' + p.slice(1);
  if (p.length === 9)      return '233' + p;
  return p;
}

function sendSMS(phone, message) {
  const to  = normalizePhone(phone);
  if (!to) return Promise.resolve(false);
  const key    = process.env.MNOTIFY_KEY    || 's6mhqRtYmKUm4Pf3Go6garMmT';
  const sender = process.env.MNOTIFY_SENDER || 'NkayAcad';
  const url    = `https://apps.mnotify.net/smsapi?key=${encodeURIComponent(key)}&to=${encodeURIComponent(to)}&msg=${encodeURIComponent(message)}&sender_id=${encodeURIComponent(sender)}`;
  return new Promise(resolve => {
    https.get(url, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { console.log(`[SMS] to ${to}: ${data}`); resolve(true); });
    }).on('error', err => { console.error('[SMS] error:', err.message); resolve(false); });
  });
}


// ═══════════════════════════════════════════════════
// SMS — send via backend (avoids browser CORS blocks)
// ═══════════════════════════════════════════════════
app.post('/api/sms', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    const ok = await sendSMS(phone, message);
    res.json({ ok, to: normalizePhone(phone) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════
app.get('/', (req, res) => res.json({ status: 'NTA Exam Backend running ✅', version: '1.0.0' }));
app.get('/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

// ═══════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════

// Trainer login
app.post('/api/auth/trainer', async (req, res) => {
  try {
    const { username, password } = req.body;
    const trainer = await Trainer.findById('singleton');
    if (!trainer || username !== trainer.username || password !== trainer.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ ok: true, role: 'trainer', username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Student login (by code)
app.post('/api/auth/student', async (req, res) => {
  try {
    const { code } = req.body;
    const student = await Student.findOne({ code: code.toUpperCase() });
    if (!student) return res.status(404).json({ error: 'Student code not found' });
    res.json({ ok: true, student: {
      code: student.code, name: student.name,
      course: student.course, courses: student.courses
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update trainer credentials
app.put('/api/auth/trainer', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Both fields required' });
    await Trainer.findByIdAndUpdate('singleton', { username, password }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// STUDENTS
// ═══════════════════════════════════════════════════

// Get all students
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find({ active: true }).sort({ createdAt: 1 });
    res.json(students);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add student
app.post('/api/students', async (req, res) => {
  try {
    const { name, phone, course, courses, code } = req.body;
    if (!name || !course || !code) return res.status(400).json({ error: 'Name, course and code required' });

    // Auto-generate code if not provided or check uniqueness
    const existing = await Student.findOne({ code: code.toUpperCase() });
    if (existing) return res.status(409).json({ error: 'Student code already exists' });

    const student = await new Student({
      code: code.toUpperCase(),
      name, phone: phone || '',
      course,
      courses: courses && courses.length ? courses : [course],
      registered: new Date().toLocaleDateString('en-GB')
    }).save();

    res.status(201).json(student);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete student (soft delete)
app.delete('/api/students/:code', async (req, res) => {
  try {
    await Student.findOneAndUpdate({ code: req.params.code }, { active: false });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get next student code
app.get('/api/students/next-code', async (req, res) => {
  try {
    const count = await Student.countDocuments();
    const yr    = new Date().getFullYear();
    const code  = `NTA-${yr}-${String(count + 1).padStart(3, '0')}`;
    res.json({ code });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════

// Get all results
app.get('/api/results', async (req, res) => {
  try {
    const { course, exam, released, studentCode } = req.query;
    const filter = {};
    if (course)      filter.course      = course;
    if (exam)        filter.exam        = exam;
    if (studentCode) filter.studentCode = studentCode;
    if (released !== undefined) filter.released = released === 'true';
    const results = await Result.find(filter).sort({ createdAt: -1 });
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get results for a specific student
app.get('/api/results/student/:code', async (req, res) => {
  try {
    const results = await Result.find({ studentCode: req.params.code }).sort({ createdAt: -1 });
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Submit exam result
app.post('/api/results', async (req, res) => {
  try {
    const data = req.body;
    const result = await new Result({
      id:          data.id || ('r' + Date.now()),
      studentCode: data.studentCode,
      studentName: data.studentName,
      course:      data.course,
      exam:        data.exam,
      pct:         data.pct,
      earned:      data.earned,
      total:       data.total,
      grade:       data.grade,
      gradeLabel:  data.gradeLabel,
      breakdown:   data.breakdown,
      hasShort:    data.hasShort || false,
      released:    data.released || false,
      date:        data.date || new Date().toLocaleDateString('en-GB')
    }).save();
    res.status(201).json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Release a result
app.put('/api/results/:id/release', async (req, res) => {
  try {
    const result = await Result.findOneAndUpdate(
      { id: req.params.id },
      { released: true },
      { new: true }
    );
    if (!result) return res.status(404).json({ error: 'Result not found' });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Release all results for a student's exam
app.put('/api/results/release-all', async (req, res) => {
  try {
    const { ids } = req.body;
    await Result.updateMany({ id: { $in: ids } }, { released: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// EXTRA QUESTIONS (trainer-added)
// ═══════════════════════════════════════════════════

app.get('/api/questions', async (req, res) => {
  try {
    const { course, exam } = req.query;
    const filter = {};
    if (course) filter.course = course;
    if (exam)   filter.exam   = exam;
    const questions = await Question.find(filter).sort({ createdAt: 1 });
    res.json(questions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions', async (req, res) => {
  try {
    const q = await new Question({
      id:       'q' + Date.now(),
      course:   req.body.course,
      exam:     req.body.exam,
      type:     req.body.type,
      question: req.body.question,
      scenario: req.body.scenario || null,
      options:  req.body.options  || [],
      correct:  req.body.correct,
      marks:    req.body.marks    || 1
    }).save();
    res.status(201).json(q);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    await Question.findOneAndDelete({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk import from CSV
app.post('/api/questions/bulk', async (req, res) => {
  try {
    const { questions } = req.body;
    let added = 0;
    for (const q of questions) {
      try {
        await new Question({ id: 'q' + Date.now() + Math.random().toString(36).slice(2), ...q }).save();
        added++;
      } catch (_) {}
    }
    res.json({ ok: true, added });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════

app.get('/api/settings', async (req, res) => {
  try {
    let settings = await Settings.findById('singleton');
    if (!settings) settings = await new Settings({ _id: 'singleton' }).save();
    res.json(settings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', async (req, res) => {
  try {
    const updated = await Settings.findByIdAndUpdate(
      'singleton',
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// FEES & PAYMENTS
// ═══════════════════════════════════════════════════

// Record a payment for a student
app.post('/api/students/:code/payment', async (req, res) => {
  try {
    const { amount, total, method, sendSms } = req.body;
    const student = await Student.findOne({ code: req.params.code });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Update total fee if changed
    student.totalFee = total || student.totalFee;

    const paidBefore = student.payments.reduce((a, p) => a + (p.amount || 0), 0);
    const paidTotal  = paidBefore + Number(amount);
    const balance    = student.totalFee - paidTotal;

    const entry = {
      amount:    Number(amount),
      date:      new Date().toLocaleDateString('en-GB'),
      total:     student.totalFee,
      balance,
      method:    method || 'Cash',
      smsStatus: sendSms ? 'sending' : 'skipped'
    };

    student.payments.push(entry);
    await student.save();

    // Send SMS
    if (sendSms && student.phone) {
      const cs  = student.courses && student.courses.length ? student.courses : [student.course];
      const msg = `Hello ${student.name}, NkaySolutions Tech Academy has received ${fmtGHS(amount)} for ${cs[0] || 'your course'}. Total Paid: ${fmtGHS(paidTotal)}. Balance: ${fmtGHS(balance)}. Thank you!`;
      sendSMS(student.phone, msg).then(ok => {
        const idx = student.payments.length - 1;
        Student.findOneAndUpdate(
          { code: student.code },
          { $set: { [`payments.${idx}.smsStatus`]: ok ? 'sent' : 'failed' } }
        ).exec();
      });
    }

    res.json({ ok: true, student, balance, paidTotal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// FULL DATA LOAD (for portal init)
// ═══════════════════════════════════════════════════
app.get('/api/load', async (req, res) => {
  try {
    const [students, results, questions, settings, trainer] = await Promise.all([
      Student.find({ active: true }).sort({ createdAt: 1 }),
      Result.find().sort({ createdAt: -1 }),
      Question.find().sort({ createdAt: 1 }),
      Settings.findById('singleton'),
      Trainer.findById('singleton')
    ]);
    res.json({
      students,
      results,
      questions,
      settings: settings || {},
      trainer:  { username: trainer ? trainer.username : 'trainer' }
      // never send password to client
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`🚀 NTA Exam Backend running on port ${PORT}`);
});
