# CampusAI — Full Stack Campus Assistant

A responsive campus-assistant frontend plus a Node.js/Express backend.

## Features
- REST APIs for rooms, faculty, events, notices, clubs and resources
- `/api/search?q=...` full-text style search across campus data
- `/api/ask` AI assistant endpoint with a safe database-grounded context
- Optional OpenAI integration through environment variables
- JSON datastore in `data/db.json` so it is easy to edit for a college demo
- Admin CRUD endpoints protected by `x-admin-key`
- Frontend served by the same Express server
- AI fallback works even without an API key

## Run locally
1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `ADMIN_API_KEY` to a private value.
6. Optional: add `OPENAI_API_KEY` and set `OPENAI_MODEL`.
7. Run `npm start`.
8. Open `http://localhost:3000`.

## API examples
GET `/api/rooms`
GET `/api/faculty`
GET `/api/events`
GET `/api/notices`
GET `/api/clubs`
GET `/api/resources`
GET `/api/search?q=robotics`
POST `/api/ask` with `{ "question": "Where is Robotics Lab?" }`

Admin example:
`POST /api/admin/notices` with header `x-admin-key: YOUR_KEY` and a JSON notice.

## Production upgrade
For a real college deployment, replace `data/db.json` with PostgreSQL/MySQL, add student/admin authentication (JWT/OAuth), role-based access control, file storage, audit logs, rate limiting, and HTTPS.
