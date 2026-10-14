# CableConnect deployment

This project contains:

- `Frontend/`: React + Vite application deployed to Vercel.
- `Backend/`: Express API, MongoDB integration, TextBee integration, and the
  Asia/Kolkata reminder scheduler deployed to Render.

The current application does not use administrator authentication or sessions.
Do not add backend credentials to `VITE_*` variables.

## 1. MongoDB Atlas

1. Create or select the Atlas cluster that contains the existing CableConnect
   data.
2. Add the Render outbound network access required by your Atlas plan. For a
   quick deployment, Atlas may use `0.0.0.0/0`; restrict this further when
   your production network policy allows.
3. Copy the existing connection string into Render as `MONGO_URI`.
   Do not commit it.

## 2. Render backend

Create a Web Service from this repository with:

- Root directory: `Backend`
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Plan: an always-on plan such as Render Starter

Set these environment variables in Render:

```text
MONGO_URI=<MongoDB Atlas connection string>
FRONTEND_ORIGIN=https://<your-vercel-project>.vercel.app
TEXTBEE_API_KEY=<TextBee API key>
TEXTBEE_DEVICE_ID=<TextBee device ID>
```

Render supplies `PORT`. The backend also accepts a local fallback of `5000`.
Never put MongoDB or TextBee values in frontend variables.

The reminder job is scheduled by `node-cron` at 09:00
`Asia/Kolkata`. On startup at or after 09:00 IST, it checks MongoDB for that
IST date's run record and recovers the overdue run only if it is not already
completed. The scheduled execution and startup recovery share a MongoDB-backed
claim, preventing duplicate daily runs across normal restarts and concurrent
backend instances. An in-progress claim expires after five minutes without a
renewal, allowing a later process to recover work if the previous process
stopped unexpectedly. If startup finds a non-expired claim, it retries when
that claim expires; an active run renews its claim while it is working.

This does not replace an always-on Render service: if the service is down at
09:00, the run occurs only when it starts again that same IST calendar day.
A sleeping/free web service cannot guarantee prompt execution. If TextBee
accepts an SMS but the process crashes before the matching customer
notification flag is saved, a recovered run may send that SMS again; the SMS
provider and MongoDB update cannot be made one atomic transaction. Existing
customer flags prevent repeats for sends whose status was saved successfully.

Verify:

```text
https://<your-render-service>.onrender.com/health
```

## 3. Vercel frontend

Import the repository into Vercel with:

- Root directory: `Frontend`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

Set this Vercel environment variable for Production, Preview, and
Development as needed:

```text
VITE_API_BASE_URL=https://<your-render-service>.onrender.com
```

The Vercel rewrite in `Frontend/vercel.json` serves `index.html` for client
navigation and refreshes.

After the Vercel URL is known, set the exact URL (including `https://` and
without a trailing slash) as Render's `FRONTEND_ORIGIN`, then redeploy the
backend. The backend uses that origin for CORS in production and allows
requests without an Origin header for health checks and server-to-server
tools.

## 4. Local development

Backend:

```powershell
cd Backend
Copy-Item .env.example .env
npm install
npm start
```

Frontend:

```powershell
cd Frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

For local frontend development, set `VITE_API_BASE_URL=http://localhost:5000`
in `Frontend/.env.local`.

## 5. Validation checklist

- `/health` reports `status: "ok"` and a connected database.
- Dashboard expiry data loads from the Render API.
- Customer create, edit, delete, and recharge operations work.
- Settings and SMS templates load and save.
- TextBee credentials are present only in Render backend variables.
- The 3-day, 2-day, and 1-day reminder categories retain their existing
  duplicate-prevention flags.
- Render logs show `Reminder scheduler registered (cron: 0 9 * * *,
  timezone: Asia/Kolkata)` after the database connects. On startup after 09:00,
  verify either the recovery claim/completion logs or an already-completed
  skip. At the normal 09:00 execution, verify the claim, eligibility counts,
  per-type send-result, and completion logs. The logs do not include phone
  numbers, customer names, API keys, or connection strings.
