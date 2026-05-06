# RESPONDAI — Emergency SOS & Incident Dashboard

RESPONDAI is a web app designed to help people quickly raise emergency alerts (SOS) and help staff respond with a real-time incident dashboard.

It includes:
- A **Guest / User SOS interface** to report emergencies fast
- A **Staff dashboard** to monitor, triage, and resolve incidents
- Severity/status flows (e.g., **RED / YELLOW / GREEN**, **Active / Resolved**)
- Optional features like **GPS/location**, **silent SOS**, and **chat**

---

## Preview

![RESPONDAI Preview](docs/images/respondai-preview.jpg)

---

## What it does

### Guest SOS Screen
- One-tap **SOS** flow
- Emergency categories (e.g., Fire, Medical, Security, Flood)
- “Silent SOS” mode (designed for discreet alerts)
- Option to share **GPS live location**

### Staff Dashboard
- Summary counters (Active, Critical, Resolved, Total)
- Incident list grouped by priority/status
- Incident details (report, reporter info, location)
- Ability to **resolve** incidents
- Live chat panel (guest ↔ staff)

---

## Core Features

- **SOS reporting** with predefined emergency types
- **Incident management dashboard** for staff
- **Severity tagging** (RED/YELLOW/GREEN)
- **Resolve workflow** to close incidents
- **Location support** (lat/long + open in maps)
- **Live chat** (optional / in-progress depending on build)
- Responsive UI with a dark theme

---

## Tech Stack

> Replace these with your exact stack.

- Frontend: React (Create React App)
- Backend: (add: Node/Express, Firebase, etc.)
- Database: (add)
- Auth: (add)

---

## Getting Started (Local Setup)

> Update these commands if your scripts are different.

### 1) Clone the repo
```bash
git clone <your-repo-url>
cd <your-repo-folder>
```

### 2) Install dependencies
```bash
npm install
```

### 3) Configure environment variables
Create a `.env` file (example keys—replace with real ones):
```bash
REACT_APP_API_URL=
REACT_APP_GOOGLE_MAPS_KEY=
```

### 4) Run the app
```bash
npm start
```

App runs on:
- `http://localhost:3000`

---

## Roadmap

- [ ] Role-based authentication (Guest/Staff)
- [ ] Notifications (SMS/email/push)
- [ ] Offline-first SOS mode
- [ ] Admin panel & analytics
- [ ] Audit logs for incident actions
- [ ] Deployment guide

---

## License

Add a license (MIT/Apache-2.0/etc.) or write: **All rights reserved**.
