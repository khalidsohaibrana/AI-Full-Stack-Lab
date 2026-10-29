# AI Full-Stack Lab

A single-repository learning project for becoming an AI-enabled full-stack engineer.

The implementation is intentionally direct: React calls our Node API, and the Node API calls the model provider. We will build agent capabilities ourselves instead of hiding them behind LangChain or LangGraph.

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, TypeScript, Express
- Model access: configurable OpenAI-compatible Chat Completions and embeddings
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

Install these tools for your operating system before setup:

- Git
- Node.js 20.19+; Node.js 22 LTS is recommended
- npm, included with Node.js
- Docker Desktop, including Docker Compose, for PostgreSQL persistence
- Ollama for the default local chat and embedding models

Download pages:

- [Node.js](https://nodejs.org/download/)
- [Git](https://git-scm.com/downloads)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Ollama](https://ollama.com/download)

Check your versions:

```bash
node --version
npm --version
```

## Setup on a new machine

Run these commands from a terminal on macOS, Linux, Windows PowerShell, or
Windows Git Bash. If `cp` is unavailable on Windows, copy
`backend/.env.example` to `backend/.env` using File Explorer instead.

```bash
git clone https://github.com/khalidsohaibrana/AI-Full-Stack-Lab.git
cd "AI-Full-Stack-Lab"
npm install
cp backend/.env.example backend/.env
```

The default template uses local Ollama and PostgreSQL. Install/start Ollama,
then download the exact models configured by the template:

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
ollama list
```

Start the database and apply the schema:

```bash
docker compose up -d postgres
npm run db:migrate --prefix backend
```

Now start the application:

```bash
npm run dev
```

Open http://localhost:5173. If you choose a hosted provider instead, edit
`backend/.env` before starting the backend and follow the provider setup below.

## Provider setup

The backend uses the widely supported OpenAI-compatible Chat Completions API
for chat and keeps chat-model and embedding configuration separate. This makes
it possible to use one provider for chat and another for semantic memory, or
to run both locally with Ollama.

### Option A: local Ollama

Install Ollama from [ollama.com/download](https://ollama.com/download), start
the Ollama application, then download the models:

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
ollama list
```

Use this backend configuration:

```env
AI_PROVIDER=ollama
AI_API_KEY=ollama
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2

AI_EMBEDDING_PROVIDER=openai-compatible
AI_EMBEDDING_API_KEY=ollama
AI_EMBEDDING_BASE_URL=http://localhost:11434/v1
AI_EMBEDDING_MODEL=nomic-embed-text
AI_EMBEDDING_DIMENSIONS=768
```

The `ollama` value is a local placeholder; it is not a secret. Ollama does
not require a hosted API key. Keep the Ollama application running while using
the backend. The embedding model is separate from the chat model and must be
downloaded independently.

Start persistent semantic memory with PostgreSQL and pgvector:

```bash
docker compose up -d postgres
npm run db:migrate --prefix backend
```

Then add these variables to `backend/.env`:

```env
AI_MEMORY_STORE=postgres
AI_MEMORY_DATABASE_URL=postgresql://ai_lab:ai_lab@localhost:5432/ai_fullstack_lab
```

Use `AI_MEMORY_STORE=in-memory` when you want process-local storage for a
quick experiment. In-memory memories disappear when the backend restarts.

### Option B: hosted OpenAI-compatible provider

For Groq, OpenAI, or another compatible provider, set the provider's base URL,
real API key, and model names. For example:

```env
AI_PROVIDER=groq
AI_API_KEY=your_provider_api_key_here
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-20b

AI_EMBEDDING_PROVIDER=openai-compatible
AI_EMBEDDING_API_KEY=your_embedding_provider_key_here
AI_EMBEDDING_BASE_URL=https://api.openai.com/v1
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_EMBEDDING_DIMENSIONS=1536
```

The chat provider and embedding provider do not have to be the same service.
Use the provider's official documentation to confirm that its selected model
supports the API operation used by this project. Never put a hosted API key in
the frontend or commit a `.env` file.

## First-time setup

From the repository root:

```bash
npm install
cp backend/.env.example backend/.env
```

Copy the template and edit `backend/.env`:

```env
AI_PROVIDER=ollama
AI_API_KEY=ollama
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
AI_SYSTEM_INSTRUCTIONS=You are a helpful assistant. Answer clearly and concisely.
AI_CONTEXT_WINDOW_TOKENS=8000
AI_MAX_OUTPUT_TOKENS=1000
AI_CONTEXT_SAFETY_MARGIN_TOKENS=500
AI_TOKEN_ESTIMATOR=character-ratio
AI_CHARS_PER_TOKEN=4
AI_MESSAGE_OVERHEAD_TOKENS=4
AI_CONTEXT_TRUNCATION_STRATEGY=recent-turns
AI_OVERSIZED_MESSAGE_POLICY=reject
AI_EMBEDDING_PROVIDER=openai-compatible
AI_EMBEDDING_API_KEY=ollama
AI_EMBEDDING_BASE_URL=http://localhost:11434/v1
AI_EMBEDDING_MODEL=nomic-embed-text
AI_EMBEDDING_DIMENSIONS=768
AI_MEMORY_RETRIEVAL_ENABLED=true
AI_MEMORY_RETRIEVAL_TOP_K=5
AI_MEMORY_RETRIEVAL_MIN_SIMILARITY=0.55
AI_MEMORY_RETRIEVAL_MIN_IMPORTANCE=0
AI_DEFAULT_USER_ID=local-user
AI_MEMORY_STORE=postgres
AI_MEMORY_DATABASE_URL=postgresql://ai_lab:ai_lab@localhost:5432/ai_fullstack_lab
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
```

The `.env` file is local-only and is ignored by Git. Never put a hosted API
key in the frontend. When switching providers or models, update the chat
variables (`AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`), the
embedding variables, embedding dimensions, storage variables, and context
policy values. The PostgreSQL migration currently uses `vector(768)`, so its
dimension must match the embedding model. The backend calculates
the available input budget as context window minus maximum output minus safety
margin.

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

For Ollama, also verify that the local service and models are available:

```bash
curl http://localhost:11434/api/tags
ollama list
```

Test the chat endpoint:

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Explain the Node.js event loop in one paragraph"}]}'
```

## Quality checks

```bash
npm run build
npm test
npm run evaluate:memory --prefix backend
```

The build checks the backend TypeScript compilation and the frontend TypeScript/Vite production build. The test command verifies context-window truncation, turn preservation, immutability, and oversized-message handling. The memory evaluation uses synthetic data and an isolated in-memory store, so it does not change PostgreSQL.

## Architecture direction

The baseline intentionally keeps the backend small. As the lessons progress, we will separate configuration, routes, model clients, conversation state, tools, the agent loop, planning, retrieval, approvals, checkpointing, and evaluation into explicit modules.

The current chat feature implements short-term conversation memory only: the frontend sends its in-session messages array with every model request. The backend uses a configurable token budget, estimates input tokens, and removes the oldest complete turns when the budget is exceeded. The UI includes a context inspector showing the context window, reserved output, safety margin, estimated input, available input, remaining input, and dropped messages. The estimator and truncation strategy are intentionally provider-neutral and configurable because exact tokenization and context limits vary by model. The conversation transcript is not persisted or summarized yet.

The backend now provides semantic memory with validated records for facts, preferences, and projects, a provider-neutral OpenAI-compatible embedding adapter, configurable in-memory or PostgreSQL/pgvector storage, retrieval context injection, explicit memory writing, and retrieval evaluation. Automatic memory extraction and conflict resolution are not included.

## Git workflow

The default branch is main. Use a descriptive branch for each change, for example:

```bash
git switch -c feat/streaming-responses
```

Keep commits focused, run npm run build, then open a pull request.

See the application-specific guides:

- [Frontend README](frontend/README.md)
- [Backend README](backend/README.md)
