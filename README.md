# Online Examination System

A secure, proctored exam platform supporting **MCQ**, **numerical** and **coding** questions, with a server-authoritative timer and grading, anti-cheat tooling, keystroke replay and code-plagiarism detection.

| Layer | Tech |
| --- | --- |
| Frontend (`client/`) | React 19 + Vite + TypeScript, Tailwind CSS v4, Zustand, Monaco Editor |
| Backend (`server/`) | Node.js + Express 5 + TypeScript, Zod validation, Firebase Admin SDK |
| Data & auth | Firebase Firestore, Cloud Storage, Firebase Auth (Google OAuth only) |
| Code execution | Judge0 or Piston (sandboxed, server-side only) |
| Hosting | Vercel (two projects: `client` and `server`) |

## Features

**Examiner** — question bank (MCQ / numerical with tolerance / coding with public + hidden tests), exam builder with random-draw pools and shuffling, candidate assignment, live results & statistics, CSV export, per-question grading breakdown, proctoring event log, webcam snapshot gallery, **keystroke replay** with paste detection, **plagiarism reports**, regrade and force-terminate.

**Candidate** — assigned-exam dashboard, pre-exam system check (camera, mic, browser), locked-down exam room, Monaco editor with sandboxed test runs, offline-tolerant autosave, result page (if released).

**Security model** — candidates never write to Firestore directly. The API owns the clock, the random question draw, warning counting, auto-submit and grading; hidden tests and answer keys never reach the browser. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Repository layout

```
client/    React app (candidate exam room + examiner dashboard)
server/    Express API (grading, attempts, proctoring, plagiarism)
firebase/  Firestore rules, indexes, Storage rules
docs/      ARCHITECTURE.md, SETUP_GUIDE.md
```

## Getting started

Follow **[`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)** — it covers Firebase, the code-execution provider, local development, Vercel deployment and troubleshooting step by step.

Quick local run (after configuring both `.env` files):

```bash
cd server && npm install && npm run dev      # http://localhost:8080
cd client && npm install && npm run dev      # http://localhost:5173
```

## Scripts

| Where | Command | Purpose |
| --- | --- | --- |
| `server` | `npm run dev` | API with hot reload |
| `server` | `npm test` | Grading + plagiarism unit tests |
| `server` | `npm run set-role -- <email> examiner` | Grant a role to an existing user |
| `server` | `npm run seed:demo -- <examiner> <candidate>` | Create a demo exam |
| `client` | `npm run dev` / `npm run build` | Dev server / production build |
