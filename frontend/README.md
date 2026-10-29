# Frontend

React + TypeScript + Vite application for the AI Full-Stack Lab.

## Run

From the repository root:

    npm run dev:frontend

The frontend is available at http://localhost:5173.

Requests to /api are proxied to the backend at http://localhost:3001. The frontend intentionally contains no model-provider API key.

## Google Maps preview

Directions can show an embedded Google Maps preview when the Google Maps Embed
API is enabled. Copy the example environment file, add a browser-restricted
key, and restart Vite:

    cp frontend/.env.example frontend/.env

Set `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`. Restrict the key by HTTP
referrer in Google Cloud Console and enable the Maps Embed API. The frontend
also keeps the normal Google Maps directions link available when no embed key
is configured.

### Create the key

1. Open [Google Maps Platform > Keys & Credentials](https://console.cloud.google.com/google/maps-apis/credentials).
2. Select or create a Google Cloud project and ensure billing is enabled.
3. In [API Library](https://console.cloud.google.com/apis/library), enable
   **Maps Embed API**.
4. Create an API key under **Create credentials → API key**.
5. Restrict it to:
   - Website referrer: `http://localhost:5173/*`
   - API: **Maps Embed API**
6. Add it to `frontend/.env`:

       VITE_GOOGLE_MAPS_API_KEY=your_key_here

The browser-visible key is expected for Maps Embed API, but it must be
restricted. Do not use a model-provider, database, or other server secret in
this file.

## Current flow

1. The user submits a message.
2. React sends POST /api/chat and receives a conversation ID.
3. The backend calls the model provider and stores the successful turn.
4. React renders the returned text.
5. The left feature sidebar lists saved chat threads and loads an exact
   transcript from the backend when the user reopens one.

The chat displays context, agent tool events, optional directions previews, and
the distinction between short-term messages, exact chat history, and semantic
memory.

Use the `Plan first` control in the composer to compare the explicit planning
path with the default reactive direct loop. The planning view shows the goal,
step statuses, tools used, and replan count without showing hidden reasoning.
