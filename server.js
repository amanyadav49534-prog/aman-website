require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'data', 'db.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

function readDb() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}
function writeDb(db) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
}
function normalize(v) { return String(v || '').toLowerCase().trim(); }
function searchAll(q) {
  const db = readDb();
  const needle = normalize(q);
  const groups = [
    ['rooms', 'room'], ['faculty', 'faculty'], ['events', 'event'],
    ['notices', 'notice'], ['clubs', 'club'], ['resources', 'resource']
  ];
  const results = [];
  for (const [group, type] of groups) {
    for (const item of db[group]) {
      const text = JSON.stringify(item).toLowerCase();
      if (!needle || text.includes(needle)) results.push({ type, ...item });
    }
  }
  return results.slice(0, 20);
}
function localAnswer(q) {
  const s = normalize(q);
  const db = readDb();
  if ((s.includes('robot') || s.includes('r-204')) && s.includes('lab')) {
    const r = db.rooms.find(x => x.id === 'R2');
    return `${r.name} is on floor ${r.floor} of the ${r.building}, next to the Embedded Systems Lab.`;
  }
  if (s.includes('electronic') && s.includes('lab')) {
    const r = db.rooms.find(x => x.id === 'R1');
    return `${r.name} is on floor ${r.floor} of the ${r.building}.`;
  }
  if (s.includes('java') || s.includes('faculty') || s.includes('teacher')) {
    const f = db.faculty[0];
    return `${f.name} teaches ${f.subjects.join(', ')}. Office: ${f.office}.`;
  }
  if (s.includes('event') || s.includes('workshop')) {
    const e = db.events[0];
    return `The next event is ${e.title} on ${e.date} at ${e.time} in ${e.venue}.`;
  }
  if (s.includes('notice')) return `The latest notice is: ${db.notices[0].title}. ${db.notices[0].body}`;
  if (s.includes('club')) return `Popular clubs include ${db.clubs.map(c => c.name).join(' and ')}.`;
  if (s.includes('library')) return 'The Central Library is open until 9:00 PM during assessment week.';
  if (s.includes('bus') || s.includes('transport')) return 'Bus route B-3 now departs at 7:50 AM, effective Monday.';
  return 'I can help with classrooms, faculty, events, clubs, notices, resources and transport. Try a more specific campus question.';
}

function admin(req, res, next) {
  const key = req.header('x-admin-key');
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'CampusAI API', time: new Date().toISOString() }));
app.get('/api/rooms', (req, res) => res.json(readDb().rooms));
app.get('/api/faculty', (req, res) => res.json(readDb().faculty));
app.get('/api/events', (req, res) => res.json(readDb().events));
app.get('/api/notices', (req, res) => res.json(readDb().notices));
app.get('/api/clubs', (req, res) => res.json(readDb().clubs));
app.get('/api/resources', (req, res) => res.json(readDb().resources));
app.get('/api/search', (req, res) => res.json({ query: req.query.q || '', results: searchAll(req.query.q || '') }));

app.post('/api/ask', async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'question is required' });
  const context = searchAll(question).slice(0, 8);

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ answer: localAnswer(question), source: 'campus-database', results: context });
  }

  try {
    const prompt = [
      'You are CampusAI, a helpful college campus assistant.',
      'Answer only from the supplied campus data. If the data does not contain the answer, say you do not have enough campus data.',
      'Be concise and useful. Mention building/floor/date/time when relevant.',
      `Campus data:\n${JSON.stringify(context, null, 2)}`,
      `Student question: ${question}`
    ].join('\n\n');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: prompt,
        max_output_tokens: 300
      })
    });
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
    const data = await response.json();
    const answer = data.output_text || 'I could not generate an answer from the campus data.';
    res.json({ answer, source: 'openai', results: context });
  } catch (err) {
    console.error(err.message);
    res.json({ answer: localAnswer(question), source: 'fallback-campus-database', results: context });
  }
});

// Simple admin CRUD endpoint: POST a new record into one of the supported collections.
app.post('/api/admin/:collection', admin, (req, res) => {
  const allowed = ['rooms', 'faculty', 'events', 'notices', 'clubs', 'resources'];
  const collection = req.params.collection;
  if (!allowed.includes(collection)) return res.status(400).json({ error: 'Invalid collection' });
  const db = readDb();
  const item = req.body;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return res.status(400).json({ error: 'JSON object required' });
  if (!item.id) item.id = `${collection.slice(0, -1).toUpperCase()}-${Date.now()}`;
  db[collection].push(item);
  writeDb(db);
  res.status(201).json(item);
});

// Update/delete admin records by collection and id.
app.put('/api/admin/:collection/:id', admin, (req, res) => {
  const allowed = ['rooms', 'faculty', 'events', 'notices', 'clubs', 'resources'];
  const collection = req.params.collection;
  if (!allowed.includes(collection)) return res.status(400).json({ error: 'Invalid collection' });
  const db = readDb();
  const idx = db[collection].findIndex(x => String(x.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Record not found' });
  db[collection][idx] = { ...db[collection][idx], ...req.body, id: db[collection][idx].id };
  writeDb(db);
  res.json(db[collection][idx]);
});

app.delete('/api/admin/:collection/:id', admin, (req, res) => {
  const allowed = ['rooms', 'faculty', 'events', 'notices', 'clubs', 'resources'];
  const collection = req.params.collection;
  if (!allowed.includes(collection)) return res.status(400).json({ error: 'Invalid collection' });
  const db = readDb();
  const before = db[collection].length;
  db[collection] = db[collection].filter(x => String(x.id) !== String(req.params.id));
  if (db[collection].length === before) return res.status(404).json({ error: 'Record not found' });
  writeDb(db);
  res.status(204).end();
});

app.use((req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`CampusAI running at http://localhost:${PORT}`));
