# Setup Guide — from zero to a running exam platform

This guide takes you from an empty machine to a deployed system on Vercel. Do the parts in order. Estimated time: **60–90 minutes** the first time.

> **Accounts you need (all have free tiers):** Google account, [Firebase](https://console.firebase.google.com), [GitHub](https://github.com), [Vercel](https://vercel.com), and a code-execution provider (Part 3).
> **Software:** [Node.js 20+](https://nodejs.org), [Git](https://git-scm.com).

---

## Part 1 — Firebase project

### 1.1 Create the project
1. Open the [Firebase console](https://console.firebase.google.com) → **Add project** → name it (e.g. `exam-platform`). Google Analytics is optional; turn it off.
2. Wait for it to finish, then open the project.

### 1.2 Enable Google sign-in
1. **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Google** → **Enable**. Choose a *Project support email* → **Save**.
3. Do **not** enable any other provider — the backend rejects non-Google tokens.

### 1.3 Create Firestore
1. **Build → Firestore Database → Create database**.
2. Pick a location close to your users (it **cannot be changed later**).
3. Choose **Production mode** → **Create**. (Our rules are deployed in Part 2.)

### 1.4 Enable Cloud Storage (webcam snapshots)
1. **Build → Storage → Get started** → **Production mode** → pick the same location → **Done**.
2. Firebase may ask you to upgrade to the **Blaze (pay-as-you-go)** plan to create a bucket. That is normal; a small exam's usage costs cents, and you can set a budget alert. If you don't want snapshots, you can skip Storage and turn off *Require webcam* in every exam.

### 1.5 Register the web app (client config)
1. Project overview → **gear icon → Project settings → General** → *Your apps* → **`</>` (Web)**.
2. Nickname `exam-client` → **Register app** (skip hosting).
3. Copy the `firebaseConfig` values — you need `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` for `client/.env`.

### 1.6 Create the server credential
1. **Project settings → Service accounts → Generate new private key → Generate key**. A JSON file downloads.
2. From that JSON you need three values for `server/.env`: `project_id`, `client_email`, `private_key`.
3. **Keep this file secret.** Never commit it (it is git-ignored, but don't keep copies in the repo folder).

---

## Part 2 — Deploy Firestore/Storage rules and indexes

The rules are what stop candidates from reading answer keys or editing their own attempt. **The app will not work without them.**

```bash
npm install -g firebase-tools
firebase login
cd Online-Examination-System          # repo root (contains firebase.json)
firebase use --add                    # select your project, alias: default
firebase deploy --only firestore,storage
```

- If the CLI asks to grant a role so Storage rules can read Firestore (`firebaserules.firestore`), answer **Yes**.
- If a deploy of Storage fails with *"bucket not found"*, finish step 1.4 first.

---

## Part 3 — Code execution provider (for coding questions)

Candidate code runs in a remote sandbox — never on your server. Choose **one**.

### Option A — Judge0 on RapidAPI (fastest to start)
1. Go to [Judge0 CE on RapidAPI](https://rapidapi.com/judge0-official/api/judge0-ce) → **Subscribe to Test** (pick a plan).
2. Copy your **X-RapidAPI-Key**.
3. In `server/.env` set:
   ```
   EXECUTION_PROVIDER=judge0
   JUDGE0_URL=https://judge0-ce.p.rapidapi.com
   JUDGE0_RAPIDAPI_KEY=<your key>
   JUDGE0_RAPIDAPI_HOST=judge0-ce.p.rapidapi.com
   ```
> ⚠️ The free plan has a **very small daily quota**. Each "Run" and each graded submission consumes calls. For a real class, use a paid plan or self-host.

### Option B — Self-hosted Judge0 (recommended for real exams)
1. On a Linux VPS with Docker, follow the [Judge0 CE deployment guide](https://github.com/judge0/judge0/blob/master/CHANGELOG.md#deployment-procedure) (Judge0 1.13 needs cgroup v1 — Ubuntu 20.04/22.04 work well).
2. Set `AUTHN_TOKEN` in `judge0.conf`, and put Judge0 behind HTTPS.
3. In `server/.env`:
   ```
   EXECUTION_PROVIDER=judge0
   JUDGE0_URL=https://judge0.your-domain.com
   JUDGE0_AUTH_HEADER=X-Auth-Token
   JUDGE0_AUTH_TOKEN=<your AUTHN_TOKEN>
   ```
   (leave the RapidAPI variables empty).

### Option C — Piston
Self-host [Piston](https://github.com/engineer-man/piston), install the language runtimes you need, then set `EXECUTION_PROVIDER=piston` and `PISTON_URL=https://piston.your-domain.com`. The public emkc.org instance is no longer open to everyone.

> It must be reachable from the internet if the API runs on Vercel. `localhost` only works while developing locally.

---

## Part 4 — Run it locally

### 4.1 Get the code
```bash
git clone https://github.com/DarshanSamuel/Online-Examination-System.git
cd Online-Examination-System
```

### 4.2 Configure the server
```bash
cd server
copy .env.example .env        # macOS/Linux: cp .env.example .env
npm install
```
Edit `server/.env`:

| Variable | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `project_id` from the service-account JSON |
| `FIREBASE_CLIENT_EMAIL` | `client_email` from the JSON |
| `FIREBASE_PRIVATE_KEY` | `private_key` from the JSON, **on one line with the literal `\n` sequences kept**, wrapped in double quotes |
| `EXAMINER_EMAILS` | **your Google email** (comma-separate several). People on this list become examiners on first sign-in |
| `CORS_ORIGINS` | `http://localhost:5173` |
| `EXECUTION_PROVIDER` + provider vars | from Part 3 |

Example private key line:
```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

Run the tests and start the API:
```bash
npm test          # 13 tests should pass
npm run dev       # → "Exam API listening" on port 8080
```
Check `http://localhost:8080/healthz` → `{"ok":true}`.

### 4.3 Configure the client
In a **second terminal**:
```bash
cd client
copy .env.example .env
npm install
```
Edit `client/.env`:
```
VITE_API_URL=http://localhost:8080/api
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
```bash
npm run dev       # → http://localhost:5173
```
`localhost` is already an authorized domain for Firebase Auth.

### 4.4 First sign-in (becomes your examiner account)
1. **Keep the server running**, open `http://localhost:5173`, click **Continue with Google** using the email you put in `EXAMINER_EMAILS`.
2. You land on the **Exams** dashboard. (If you land on a candidate page: your email isn't in `EXAMINER_EMAILS`, or you signed in before adding it. Fix with `cd server && npm run set-role -- you@gmail.com examiner`, then **sign out and in**.)

---

## Part 5 — Create and run your first exam

### 5.1 Build the question bank (examiner)
**Question bank → New question**
- **MCQ:** add options, tick the correct one.
- **Numerical:** correct value + tolerance (*absolute* ± amount, or *relative* fraction).
- **Coding:** prompt, starter code per language, **public** tests (candidates see these and can run them) and **hidden** tests (grading only), comparison mode, CPU/memory limits. Weight controls partial credit.

Create at least 2–3 questions of different types.

### 5.2 Create the exam
**Exams → New exam**
1. Title, instructions, duration, opening/closing times.
2. **Sections**: pick the questions for each pool and the **draw count** — each candidate gets a different random subset (and shuffled MCQ options).
3. Proctoring options (max warnings, snapshot interval, fullscreen/webcam/mic, allowed languages, whether to show scores).
4. **Create draft**, then on the exam page click **Publish**.

### 5.3 Assign candidates
Exam page → **Candidates** tab → paste Google emails → **Assign**.

### 5.4 Take the exam (candidate)
Use a **different Google account** in another browser profile or an incognito window (an examiner account can't take exams).
1. Sign in → the exam appears under **My exams** → **Start**.
2. Allow camera and microphone, pass the system check, accept the terms → **Start exam** (enters fullscreen).
3. Try answering, switching tabs (a warning appears), refreshing (progress and timer persist), and **Submit**.

### 5.5 Review (examiner)
Exam page:
- **Results** — live stats, score distribution, CSV export. Click **Review** on a candidate.
- **Review → Answers** (grading detail), **Proctoring** (event log), **Snapshots**, **Code replay** (scrub or play back typing; pastes and large insertions are marked).
- **Plagiarism** tab → **Run check** after grading finishes.
- **Regrade** if you edit a test case; **Terminate** to force-submit a live attempt.

*(Optional shortcut: `cd server && npm run seed:demo -- examiner@gmail.com candidate@gmail.com` creates a ready-made demo exam.)*

---

## Part 6 — Push to GitHub

```bash
cd Online-Examination-System
git add .
git commit -m "Your message"
git push
```
Check `git status` first — there must be **no** `.env` or service-account JSON in the list.

---

## Part 7 — Deploy to Vercel

You create **two Vercel projects from the same GitHub repo**: the API (`server`) and the web app (`client`).

### 7.1 Deploy the API
1. Vercel dashboard → **Add New → Project** → import `Online-Examination-System`.
2. **Root Directory:** `server`. Framework preset: **Other**. Leave build settings (they come from `server/vercel.json`).
3. **Environment variables** (Production):

   | Name | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` | from the service-account JSON |
   | `FIREBASE_PRIVATE_KEY` | the private key with literal `\n` sequences |
   | `EXAMINER_EMAILS` | your email(s) |
   | `EXECUTION_PROVIDER` + provider vars | from Part 3 (must be a **public** URL) |
   | `CORS_ORIGINS` | your client URL, e.g. `https://exam-client.vercel.app` (fill in after 7.2, then redeploy) |
   | `ENABLE_SWEEPER` | `false` |
   | `CRON_SECRET` | a long random string (32+ chars) |

4. **Deploy.** Test `https://<api>.vercel.app/healthz` → `{"ok":true}`.

### 7.2 Deploy the web app
1. **Add New → Project** → same repo → **Root Directory:** `client` (Vite is auto-detected).
2. **Environment variables:**
   - `VITE_API_URL` = `https://<api>.vercel.app/api`
   - the six `VITE_FIREBASE_*` values from 1.5
3. **Deploy**, note the URL.

### 7.3 Wire them together
1. API project → set `CORS_ORIGINS` to the client URL exactly (no trailing slash; comma-separate to add a custom domain) → **Redeploy**.
2. Firebase console → **Authentication → Settings → Authorized domains → Add domain** → your client domain (e.g. `exam-client.vercel.app`). **Without this, Google sign-in fails with `auth/unauthorized-domain`.**
3. Open the client URL, sign in with your examiner email.

### 7.4 The background sweeper (important)
The API finalizes abandoned attempts and retries failed grading through `/api/internal/sweep`, which Vercel Cron calls (configured in `server/vercel.json`).
- **Hobby plan:** Vercel only allows **daily** cron jobs, so the default is once a day. For tighter timing, use a free pinger such as [cron-job.org](https://cron-job.org) to send `GET https://<api>.vercel.app/api/internal/sweep` every minute with the header `Authorization: Bearer <CRON_SECRET>`.
- **Pro plan:** change the schedule in `server/vercel.json` to `* * * * *` and redeploy.
- Normal submissions are graded immediately; the sweeper is the safety net for closed laptops and grading failures.

### 7.5 Production checklist
- [ ] Rules deployed (Part 2) and `EXAMINER_EMAILS` correct.
- [ ] Judge0/Piston is a paid or self-hosted instance able to handle your peak (everyone submitting at once).
- [ ] Webcam & mic need **HTTPS** — Vercel provides it.
- [ ] Run a full dry-run with 2–3 test candidates, including a forced network drop (DevTools → Offline) and a refresh mid-exam.
- [ ] Set a Firebase budget alert (Billing → Budgets).
- [ ] Tell candidates to use desktop Chrome/Edge/Firefox and to close other apps.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `auth/unauthorized-domain` | Add the domain in Firebase → Authentication → Settings → Authorized domains |
| `auth/invalid-api-key`, blank page | `client/.env` missing/typo; restart `npm run dev` after editing |
| Browser console: **CORS** error | `CORS_ORIGINS` doesn't exactly match the client URL; redeploy the API |
| Lands on candidate view as examiner | Email not in `EXAMINER_EMAILS` when you first signed in → run `npm run set-role -- email examiner`, sign out/in |
| `Missing or insufficient permissions` in dashboard | Rules not deployed, or role claim not in your token → sign out and in |
| API 401 `UNAUTHENTICATED` on Vercel | Bad `FIREBASE_PRIVATE_KEY` formatting — keep literal `\n`, no stray quotes/spaces |
| API fails to start: "Invalid environment configuration" | A required variable (e.g. `FIREBASE_PROJECT_ID`) is missing |
| Console: *"The query requires an index"* | Click the link in the error to create it, or `firebase deploy --only firestore:indexes` |
| `NOT_ASSIGNED` / exam not listed | Candidate must sign in with the **same email** you assigned; exam must be published |
| `EXAM_NOT_OPEN` / `EXAM_CLOSED` | Check the exam's opens/closes times |
| "Run tests" returns errors / 429 | Execution provider quota exhausted or URL unreachable from the API |
| Camera/mic check fails | Browser permission blocked (click the lock icon → allow), no HTTPS, or another app is using the camera |
| Snapshots show "unavailable" | Storage rules not deployed or Storage not enabled; the examiner must own the exam |
| Deploy error about cron frequency | Hobby plan — keep the daily schedule (7.4) |
| Scores stay "grading…" | Execution provider down; fix it then press **Regrade**, or wait for the sweeper |

## Limits & honest caveats
- Browser-based proctoring is a **deterrent plus evidence trail**, not an impenetrable lock — a determined user with a second device can cheat. The platform's strength is that grading, timing and warnings are enforced **server-side**, and examiners get snapshots, event logs, replay and similarity reports to investigate.
- Rate limiting uses in-memory counters, so on serverless each instance counts separately; add a shared store (e.g. Upstash Redis) if you need strict global limits.
- Keystroke replay is evidence, not proof: lost chunks (e.g. closed tab) produce a partial replay, which the viewer flags.
