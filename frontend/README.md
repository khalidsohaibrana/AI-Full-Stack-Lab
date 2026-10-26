# Frontend

React + TypeScript + Vite application for the AI Full-Stack Lab.

## Run

From the repository root:

    npm run dev:frontend

The frontend is available at http://localhost:5173.

Requests to /api are proxied to the backend at http://localhost:3001. The frontend intentionally contains no model-provider API key.

## Current flow

1. The user submits a message.
2. React sends POST /api/chat.
3. The backend calls the model provider.
4. React renders the returned text.

Streaming, conversation state, tool events, and agent traces will be added during the lessons.
