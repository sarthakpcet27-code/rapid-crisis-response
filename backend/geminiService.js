require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const classifyIncident = async (description, floor, type) => {
  const prompt = `
You are an emergency AI for a hotel in India.
Analyze this crisis and return ONLY valid JSON, nothing else.

Crisis: "${description}"
Floor: "${floor}"
Type: "${type}"

Return EXACTLY this JSON:
{
  "crisis_type": "fire|medical|security|flood|other",
  "severity": "RED|YELLOW|GREEN",
  "affected_zone": "which floors or areas",
  "sop": ["step 1","step 2","step 3","step 4","step 5","step 6"],
  "notify": ["fire_brigade|ambulance|police|manager"],
  "summary": "one plain English sentence for staff"
}
`;
  const result = await model.generateContent(prompt);
  const text   = result.response.text();
  const clean  = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
};

module.exports = { classifyIncident };