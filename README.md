# AI Full-Stack Lab

A single-repository learning project for becoming an AI-enabled full-stack engineer.

The implementation is intentionally direct: React calls our Node API, and the Node API calls the model provider. We will build agent capabilities ourselves instead of hiding them behind LangChain or LangGraph.

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, TypeScript, Express
- Model access: official OpenAI JavaScript SDK
- Package manager: npm

## Repository layout

```text
AI Full-Stack Lab/
├── frontend/   React user interface
├── backend/    Express API and model integration
├── package.json
└── README.md
```

## Prerequisites

- Node.js 20.19+; Node.js 22 LTS is recommended
- npm
- An API key and model name available to your model provider account

Check your versions:

```bash
node --version
npm --version
```

## First-time setup

From the repository root:

```bash
npm install
cp backend/.env.example backend/.env
```

Edit backend/.env:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=your_available_model_name
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
```

The .env file is local-only and is ignored by Git. Never put the API key in the frontend.

## Run the application

From the repository root:

```bash
npm run dev
```

This starts:

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

You can also run them independently:

```bash
npm run dev:frontend
npm run dev:backend
```

## Verify the setup

Check that the backend is running:

```bash
curl http://localhost:3001/api/health
```

With valid environment variables, aiConfigured should be true. Without them, the backend still starts, reports aiConfigured false, and returns HTTP 503 from /api/chat with setup instructions.

Test the chat endpoint:

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Explain the Node.js event loop in one paragraph"}'
```

## Quality checks

```bash
npm run build
```

The build checks the backend TypeScript compilation and the frontend TypeScript/Vite production build.

## Architecture direction

The baseline intentionally keeps the backend small. As the lessons progress, we will separate configuration, routes, model clients, conversation state, tools, the agent loop, planning, retrieval, approvals, checkpointing, and evaluation into explicit modules.

## Git workflow

The default branch is main. Use a descriptive branch for each change, for example:

```bash
git switch -c feat/streaming-responses
```

Keep commits focused, run npm run build, then open a pull request.

See the application-specific guides:

- [Frontend README](frontend/README.md)
- [Backend README](backend/README.md)
