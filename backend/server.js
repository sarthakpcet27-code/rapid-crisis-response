require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { classifyIncident } = require('./geminiService');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/classify', async (req, res) => {
  try {
    const { description, floor, crisisType } = req.body;
    const result = await classifyIncident(description, floor, crisisType);
    res.json(result);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulate', async (req, res) => {
  try {
    const scenarios = {
      fire:     { description:'Smoke smell floor 3 room 302', floor:'3', room:'302', crisisType:'fire' },
      medical:  { description:'Guest collapsed in lobby unconscious', floor:'1', room:'Lobby', crisisType:'medical' },
      security: { description:'Aggressive intruder at main entrance', floor:'G', room:'Entrance', crisisType:'security' }
    };
    const scene = scenarios[req.body.type] || scenarios.fire;
    const ai    = await classifyIncident(scene.description, scene.floor, scene.crisisType);
    res.json({ ...scene, ...ai });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT, () =>
  console.log(`✅ Backend running on port ${process.env.PORT}`));