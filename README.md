# Epifi Assessment — Deployed Endpoints

This repository contains a simple notes application with a backend API and a Next.js frontend.


Deployed services

- **Backend base URL:** https://epifi-assessment.onrender.com
- **Example backend endpoint (login):** https://epifi-assessment.onrender.com/v1/api/login
- **Frontend URL:** https://epifi-assessment.vercel.app/

Note about email

- **Mail service:** The deployed backend cannot send email because Render blocks outbound SMTP on port 587. Email delivery from the deployed app will not work using SMTP on that port.


Start the project

Using Docker Compose (recommended for quick setup)

1. From the project root, build and start both services:

```bash
docker-compose up --build
```

2. Stop and remove containers:

```bash
docker-compose down
```

Run locally (manual development)

- Backend:

```bash
cd backend
npm install
# start in development (if defined) or run directly
npm run dev
# or
node src/index.js
```

- Frontend:

```bash
cd frontend
npm install
npm run dev
```
