# IntervAI

AI-powered mock interview preparation platform.

## Overview

IntervAI lets a candidate upload their resume, pick a target role/difficulty, and go through a live, voice-based mock interview. The AI asks questions, listens to spoken answers via real-time transcription, evaluates each answer, and asks adaptive follow-up questions — then gives structured, measurable feedback at the end.

## Tech Stack

- **Frontend**: Next.js (App Router) + React, TypeScript, Tailwind CSS, Axios
- **Backend**: Node.js, Express.js, Zod, WebSocket
- **Database**: PostgreSQL on Neon (serverless), Drizzle ORM
- **AI**: Google Gemini API (primary) + OpenRouter (fallback) + deterministic scoring (last resort)
- **Speech-to-Text**: Deepgram (real-time streaming)
- **Auth**: Clerk (JWT-based)
- **Resume Processing**: Multer → Cloudinary → pdf-parse / Mammoth
- **Payments**: Razorpay + Subscriptions + Webhooks
- **Analytics**: Recharts
- **Deployment**: Frontend on Vercel, Backend on Render

## Monorepo Structure

```
packages/
├── backend/   # Express.js API server
└── frontend/  # Next.js web application
```

## Development

```bash
npm install          # Install all workspace dependencies
npm run dev          # Start both frontend and backend in dev mode
```
