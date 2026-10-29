# Long-Term Semantic Memory Plan

This plan follows the original learning sequence. Each milestone introduces
one responsibility and keeps provider, storage, and retrieval concerns
separate.

## Current status

Completed through milestone 2.7:

- [x] 2.1 Memory contract
- [x] 2.2 Embedding adapter
- [x] 2.3 In-memory vector store
- [x] 2.4 Retrieval and context injection
- [x] 2.5 Memory writing
- [x] 2.6 Persistent storage with PostgreSQL and pgvector
- [x] 2.7 Memory and retrieval evaluation

## Completed milestones

### 2.1 Memory contract

Define and validate durable memory records for facts, preferences, and
projects. Every record is scoped to a user and can retain source-conversation,
importance, and timestamp metadata.

### 2.2 Embedding adapter

Define a provider-neutral embedding interface and implement an
OpenAI-compatible adapter. Keep embedding credentials, endpoint, model, and
dimensions independent from chat configuration. Validate inputs and provider
responses without making embedding calls part of the chat route yet.

### 2.3 In-memory vector store

Store memory records with vectors in process memory. Implement cosine
similarity, top-k ranking, user isolation, metadata filters, upsert behavior,
dimension validation, and defensive copies. This store is intentionally
temporary and resets when the backend restarts.

## Remaining milestones

### 2.4 Retrieval and context injection

Completed. The retrieval service embeds the latest user query, searches the
in-memory store, applies configured filters, formats selected memories as
untrusted reference context, and returns retrieval metadata. The chat route
passes the augmented instructions through the existing context-window manager.

Retrieval safely skips itself when disabled or when embedding configuration is
missing. It does not create or persist memories.

### 2.5 Memory writing

Completed. POST /api/memories validates an explicit memory input, generates a
deterministic id, creates its embedding, and stores the record and vector in
the in-memory store. Repeating the same user, type, and content updates the
existing record. Automatic extraction and conflict resolution are not included.

### 2.6 Persistent storage with PostgreSQL and pgvector

Completed. A PostgreSQL vector-store implementation now preserves the existing
vector-store interface. The migration creates the pgvector extension, memory
table, user/importance indexes, and a 768-dimensional embedding column for
the local `nomic-embed-text` model. Storage is selected with `AI_MEMORY_STORE`,
so the in-memory implementation remains useful for tests and local learning.
PostgreSQL persistence survives backend restarts; the embedding dimension must
match the migration when switching models.

### 2.7 Memory and retrieval evaluation

Completed. The evaluation harness uses synthetic memories and queries to
measure hit rate, recall at k, precision at k, and user isolation. It uses an
isolated in-memory store, so it can run against the configured embedding model
without changing persistent application data. Retrieval is evaluated separately
from final answer quality so threshold and ranking failures remain observable.

## Guardrails for the sequence

- Do not add LangChain, LangGraph, or another agent framework.
- Keep chat and embedding providers independently configurable.
- Keep the vector-store interface independent from its storage implementation.
- Do not add persistent storage before retrieval behavior is observable in memory.
- Do not inject retrieved memories into chat until retrieval results are tested.
- Preserve metadata and user boundaries at every storage and retrieval layer.
