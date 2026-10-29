# Backend

Node.js + TypeScript + Express API for the AI Full-Stack Lab.

Use the repository root [README](../README.md) for complete setup on a new
machine, including Node.js, Ollama, Docker Desktop, PostgreSQL, and provider
configuration.

## Run

From this directory, install dependencies and create the local environment file:

    cp .env.example .env

Set the provider, credentials, model, and context policy in .env, then run:

    npm run dev

The API is available at http://localhost:3001.

The configuration supports local Ollama and hosted OpenAI-compatible providers.
Chat uses the widely supported OpenAI-compatible Chat Completions API, and
embeddings use the OpenAI-compatible embeddings API.
Change `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` for the chat
model. Context settings are also environment-driven because context limits and
output budgets vary by model.

### Local Ollama

Install Ollama, start it, and download both models:

    ollama pull llama3.2
    ollama pull nomic-embed-text
    ollama list

Then use these values in `.env`:

    AI_PROVIDER=ollama
    AI_API_KEY=ollama
    AI_BASE_URL=http://localhost:11434/v1
    AI_MODEL=llama3.2

    AI_EMBEDDING_PROVIDER=openai-compatible
    AI_EMBEDDING_API_KEY=ollama
    AI_EMBEDDING_BASE_URL=http://localhost:11434/v1
    AI_EMBEDDING_MODEL=nomic-embed-text
    AI_EMBEDDING_DIMENSIONS=768

The `ollama` API-key value is only a local placeholder. It is accepted by the
OpenAI client while Ollama runs locally and does not represent a secret. Keep
the Ollama application running. Check it with:

    curl http://localhost:11434/api/tags

### Hosted providers

For a hosted provider, replace the chat and embedding settings with the
provider's real API keys, base URLs, and model names. Chat and embeddings are
independent, so they may use different providers. Confirm that the selected
provider supports the API operation and model before configuring it. Keep all
keys in `.env`; never expose them in the frontend.

The root README contains copy-paste configurations for Ollama and hosted
providers.

## Persistent semantic memory

The in-memory store is useful for learning retrieval, but it disappears when
the backend restarts. To persist memories, start PostgreSQL with pgvector from
the repository root:

    docker compose up -d postgres
    npm run db:migrate --prefix backend

Configure the backend:

    AI_MEMORY_STORE=postgres
    AI_MEMORY_DATABASE_URL=postgresql://ai_lab:ai_lab@localhost:5432/ai_fullstack_lab

The migration uses `vector(768)` because `nomic-embed-text` produces 768
dimensions. When switching embedding models, the database vector dimension and
`AI_EMBEDDING_DIMENSIONS` must match. The retrieval and memory-writing services
do not change because they depend on the vector-store interface, not the
database implementation.

To return to process-local storage:

    AI_MEMORY_STORE=in-memory

The current context policy is:

    AI_CONTEXT_WINDOW_TOKENS=8000
    AI_MAX_OUTPUT_TOKENS=1000
    AI_CONTEXT_SAFETY_MARGIN_TOKENS=500

The backend uses configurable token estimation:

    AI_TOKEN_ESTIMATOR=character-ratio
    AI_CHARS_PER_TOKEN=4
    AI_MESSAGE_OVERHEAD_TOKENS=4
    AI_CONTEXT_TRUNCATION_STRATEGY=recent-turns
    AI_OVERSIZED_MESSAGE_POLICY=reject

Embedding configuration is separate from chat configuration:

For local Ollama:

    AI_EMBEDDING_PROVIDER=openai-compatible
    AI_EMBEDDING_API_KEY=ollama
    AI_EMBEDDING_BASE_URL=http://localhost:11434/v1
    AI_EMBEDDING_MODEL=nomic-embed-text

For a hosted embedding provider, replace the key, base URL, and model with
that provider's values:

    AI_EMBEDDING_PROVIDER=openai-compatible
    AI_EMBEDDING_API_KEY=your_embedding_provider_key_here
    AI_EMBEDDING_BASE_URL=https://api.openai.com/v1
    AI_EMBEDDING_MODEL=text-embedding-3-small
    AI_EMBEDDING_DIMENSIONS=
    AI_MEMORY_RETRIEVAL_ENABLED=true
    AI_MEMORY_RETRIEVAL_TOP_K=5
    AI_MEMORY_RETRIEVAL_MIN_SIMILARITY=0.55
    AI_MEMORY_RETRIEVAL_MIN_IMPORTANCE=0
    AI_DEFAULT_USER_ID=local-user

The available input budget is calculated as:

    context window - maximum output - safety margin

The context policy is implemented through pure backend modules. The character-ratio estimator is intentionally transparent and provider-neutral; it is not exact provider tokenization. The truncation strategy and oversized-message policy are configurable for future providers and models. Summarization is not included.

If the environment variables are missing, the backend still starts and logs a configuration warning. GET /api/health reports aiConfigured: false, while POST /api/chat returns HTTP 503 with setup instructions.

## Endpoints

GET /api/health returns a basic service health response:

    {
      "ok": true,
      "service": "ai-fullstack-lab-backend",
      "provider": "ollama",
      "model": "llama3.2",
      "aiConfigured": true,
      "configValid": true,
      "context": {
        "contextWindowTokens": 8000,
        "maxOutputTokens": 1000,
        "contextSafetyMarginTokens": 500,
        "availableInputTokens": 6500,
        "tokenEstimator": "character-ratio",
        "truncationStrategy": "recent-turns",
        "oversizedMessagePolicy": "reject"
      },
      "storage": {
        "provider": "postgres",
        "configured": true,
        "configValid": true,
        "storedMemories": 0
      }
    }

POST /api/chat accepts the current in-session conversation:

    {
      "messages": [
        { "role": "user", "content": "Explain event loops simply" }
      ]
    }

and returns HTTP 200:

    {
      "text": "...",
      "context": {
        "estimator": "character-ratio",
        "instructionsTokens": 12,
        "messageTokens": 24,
        "estimatedInputTokens": 36,
        "availableInputTokens": 6500,
        "remainingInputTokens": 6464,
        "withinBudget": true,
        "wasTruncated": false,
        "receivedMessages": 1,
        "sentMessages": 1,
        "droppedMessages": 0,
        "droppedTokens": 0
      }
    }

When the conversation exceeds the configured input budget, the backend removes the oldest complete turns first. It preserves the newest user turn and never sends a partial user/assistant turn. If the newest individual message cannot fit, it returns HTTP 400 with a context-window error instead of calling the provider.

The backend is currently stateless between requests. The client sends the current messages array on every request; the backend does not persist it in a database.

## Semantic-memory contract

The first long-term semantic-memory milestone defines the domain contract without adding a database or embedding provider yet.

Memory types currently supported:

    fact
    preference
    project

A memory record contains:

    {
      "id": "memory_123",
      "userId": "user_42",
      "content": "The user prefers TypeScript.",
      "type": "preference",
      "importance": 0.8,
      "sourceConversationId": "conversation_9",
      "createdAt": "2026-10-28T10:00:00.000Z",
      "updatedAt": "2026-10-28T10:00:00.000Z"
    }

The contract separates a durable memory from the current conversation transcript. Every memory is scoped to a user, has a bounded importance score, and can reference the conversation that produced it. Validation lives in a pure module shared by the HTTP and storage layers.

The memory contract does not decide when memories are written or how they are
retrieved. Those responsibilities are implemented by separate services.

## Embedding adapter

The provider-neutral embedding boundary is used by memory storage and semantic
search. The adapter accepts one string or a batch of
strings and returns numeric vectors, model metadata, dimensions, and provider
usage when available.

The current implementation is an OpenAI-compatible adapter. It can point at a
compatible provider by changing its own API key, base URL, model, and optional
dimensions without changing memory code. The adapter is injected with a small
API interface in tests, so response mapping and validation can be verified
without making network requests.

The adapter validates non-empty input, rejects non-numeric vectors, rejects
inconsistent vector dimensions, supports batching, and maps token usage into
provider-neutral names. It does not write memories or store vectors; the
retrieval service composes it with the vector store.

## In-memory vector store

The store keeps memory records together with their embedding vectors in a
small in-memory vector store. It implements cosine similarity search without a
vector-database dependency so the retrieval mechanics remain visible.

The store:

    - ranks matches by cosine similarity
    - enforces one vector dimension per store
    - isolates results by userId
    - supports topK, type, importance, and similarity filters
    - supports upsert by memory id
    - copies records and vectors to protect internal state

This store is intentionally process-local and disappears when the backend
restarts. PostgreSQL/pgvector persistence is a future extension. The store does
not call the embedding provider itself; retrieval composes the provider and
store separately.

## Retrieval and context injection

The chat request now runs the latest user message through the retrieval service
before calling the model. When configured and populated, the service embeds
the query, searches the configured vector store, applies the configured top-k,
similarity, importance, and user filters, then adds the selected memories to
the model instructions inside a clearly marked reference block.

The existing context-window manager receives the augmented instructions, so
retrieved memory consumes the same input budget as other instructions. The
chat response includes retrieval metadata with the user scope, result count,
memory ids, similarity scores, and whether retrieval was disabled,
unconfigured, empty, or successful.

If embeddings are not configured, retrieval is skipped and normal chat still
works. The explicit memory-writing path populates the selected vector store.

## Memory writing

POST /api/memories explicitly writes one memory into the configured vector
store. It validates the memory input, generates a deterministic id from the
user, type, and normalized content, creates an embedding, and stores the
record with its vector.

Example request:

    {
      "userId": "user-1",
      "content": "The user prefers TypeScript.",
      "type": "preference",
      "importance": 0.9
    }

The endpoint returns HTTP 201 with the stored memory. Repeating the same user,
type, and content updates the existing record instead of creating a duplicate.
Different content remains a separate memory, so conflicting facts are not
silently merged. Memory writing requires embedding configuration; invalid
input returns HTTP 400, missing embedding configuration returns HTTP 503, and
embedding failures return HTTP 502.

Only user and assistant roles are supported at this stage. Invalid input returns HTTP 400. Missing model configuration returns HTTP 503. Provider failures return HTTP 500.

## Why Express instead of NestJS?

NestJS provides a structured architecture with modules, providers, controllers, and dependency injection. That is valuable for large teams and long-lived services.

This learning project starts with Express because it is minimal and flexible. Fewer abstractions make the HTTP lifecycle, middleware, routing, request validation, model calls, and manual dependency composition visible while we learn how agents actually work.

We can later build a second branch that ports this backend to NestJS and compare the architectures.

## Development checks

From the repository root:

    npm run build
    npm test
    npm run evaluate:memory

The backend build runs TypeScript compilation and writes generated files to backend/dist. The test command runs the context-manager and semantic-memory tests with Node's built-in test runner through tsx. The evaluation command reports retrieval hit rate, recall, precision, and user isolation using synthetic data without modifying PostgreSQL. Generated files and node_modules are ignored by Git.
