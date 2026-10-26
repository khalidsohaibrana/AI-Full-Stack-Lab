# Backend

Node.js + TypeScript + Express API for the AI Full-Stack Lab.

## Run

Create the local environment file:

    cp .env.example .env

Set OPENAI_API_KEY and an available OPENAI_MODEL in .env, then run:

    npm run dev

The API is available at http://localhost:3001.

## Endpoints

GET /api/health returns a basic service health response.

POST /api/chat accepts:

    { "message": "Explain event loops simply" }

and returns:

    { "text": "..." }

## Why Express instead of NestJS?

NestJS provides a structured architecture with modules, providers, controllers, and dependency injection. That is valuable for large teams and long-lived services.

This learning project starts with Express because it is minimal and flexible. Fewer abstractions make the HTTP lifecycle, middleware, routing, request validation, model calls, and manual dependency composition visible while we learn how agents actually work.

We can later build a second branch that ports this backend to NestJS and compare the architectures.
