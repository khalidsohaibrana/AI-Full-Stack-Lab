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
AI_AGENT_MAX_ITERATIONS=5
AI_AGENT_MAX_TOOL_CALLS=10
AI_AGENT_TOOL_TIMEOUT_MS=10000
AI_AGENT_MAX_TOOL_RESULT_CHARS=8000
AI_PLANNING_ENABLED=false
AI_PLANNER_MAX_STEPS=8
AI_PLANNER_MAX_REPLANS=2
AI_PLANNER_MAX_STEP_RETRIES=1
AI_PLANNER_MAX_GENERATION_ATTEMPTS=2
AI_GEOCODING_BASE_URL=https://nominatim.openstreetmap.org/search
AI_WEATHER_BASE_URL=https://api.open-meteo.com/v1/forecast
AI_ROUTING_BASE_URL=https://router.project-osrm.org
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

The current chat feature implements short-term conversation memory: the frontend sends its in-session messages array with every model request. The backend uses a configurable token budget, estimates input tokens, and removes the oldest complete turns when the budget is exceeded. The UI includes a context inspector showing the context window, reserved output, safety margin, estimated input, available input, remaining input, and dropped messages. The estimator and truncation strategy are intentionally provider-neutral and configurable because exact tokenization and context limits vary by model.

Chat history is persisted separately from semantic memory. Successful turns are
stored as exact user/assistant messages in PostgreSQL when
`AI_MEMORY_STORE=postgres`, or in process memory when `AI_MEMORY_STORE=in-memory`.
The left feature sidebar lists previous chat threads and opens their complete
transcripts. Run `npm run db:migrate --prefix backend` after cloning or when
updating the database schema. Chat history uses the same configurable storage
selection but does not embed or automatically convert transcript messages into
long-term memories.

The backend now provides semantic memory with validated records for facts, preferences, and projects, a provider-neutral OpenAI-compatible embedding adapter, configurable in-memory or PostgreSQL/pgvector storage, retrieval context injection, explicit memory writing, and retrieval evaluation. Automatic memory extraction and conflict resolution are not included.

The current agent loop provides provider-neutral tool contracts, a tool
registry, calculator/current-time/memory-search tools, validated tool calls,
bounded execution, tool-result messages, and frontend execution metadata. Its
limits are configurable through the `AI_AGENT_*` variables in
`backend/.env.example`.

Part 4 adds an opt-in planning path. Enable it with the `Plan first` control in
the frontend or send `planning: true` to `/api/chat`. The planner returns a
validated structured plan, the executor runs registered tools with bounded
retries, and a replanner can revise the plan within configured limits. See
[docs/part-4-planning-plan.md](docs/part-4-planning-plan.md).

It also includes weather and directions tools. The defaults use OpenStreetMap
Nominatim for place lookup, Open-Meteo for weather, and OSRM for route
calculations; directions include a Google Maps directions URL. Configure
compatible providers with the `AI_*_BASE_URL`
variables. Current location is sent only after the user explicitly grants
browser permission.

To show an embedded Google Maps directions preview in the chat, copy
`frontend/.env.example` to `frontend/.env`, set
`VITE_GOOGLE_MAPS_API_KEY`, enable the Google Maps Embed API, restrict the key
by HTTP referrer, and restart the frontend. The backend never receives this
frontend embed key.

### Get a Google Maps Embed API key

1. Open [Google Maps Platform > Keys & Credentials](https://console.cloud.google.com/google/maps-apis/credentials).
2. Create or select a Google Cloud project.
3. Make sure billing is enabled for the project. Google documents the Embed
   API as having no charge for typical embed requests, but a billing-enabled
   Cloud project and valid key are still required.
4. Open [API Library](https://console.cloud.google.com/apis/library) and enable
   **Maps Embed API** for the project.
5. Return to **Keys & Credentials**, select **Create credentials → API key**.
6. Restrict the key:
   - Application restriction: **Websites (HTTP referrers)**
   - Website restriction: `http://localhost:5173/*`
   - API restriction: **Restrict key → Maps Embed API**
7. Copy the key into the local frontend environment file:

       cp frontend/.env.example frontend/.env

       VITE_GOOGLE_MAPS_API_KEY=your_key_here

8. Restart Vite after changing the file:

       npm run dev:frontend

The key is intentionally used by the browser to load the map, so it is not a
private backend secret. Referrer and API restrictions are essential. Never put
the key in Git, and never put a hosted model or database credential in the
frontend environment.

## Git workflow

The default branch is main. Use a descriptive branch for each change, for example:

```bash
git switch -c feat/streaming-responses
```

Keep commits focused, run npm run build, then open a pull request.

See the application-specific guides:

- [Frontend README](frontend/README.md)
- [Backend README](backend/README.md)
