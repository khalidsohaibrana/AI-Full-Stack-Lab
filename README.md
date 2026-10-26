# AI Full-Stack Lab

A single-repository learning project for becoming an AI-enabled full-stack engineer.

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, TypeScript, Express
- Model access: official OpenAI JavaScript SDK
- Agent implementation: built from first principles; no LangChain or LangGraph

## Repository layout

```text
frontend/   React user interface
backend/    Express API and model integration
```

## Prerequisites

- Node.js 20.19+ (Node.js 22 LTS recommended)
- npm
- An API key for the model provider

## Setup

```bash
npm install
cp backend/.env.example backend/.env
```

Edit `backend/.env` and provide `OPENAI_API_KEY` and an available `OPENAI_MODEL`.

Start both applications:

```bash
npm run dev
```

The frontend runs at http://localhost:5173 and the backend runs at http://localhost:3001.

See the individual READMEs for app-specific details:

- [Frontend README](frontend/README.md)
- [Backend README](backend/README.md)

## Learning direction

The project will progressively add conversation state, streaming, tool calling, the agent loop, retrieval, planning, delegation, approvals, checkpointing, and evaluation—while keeping the underlying mechanics visible in our own code.
