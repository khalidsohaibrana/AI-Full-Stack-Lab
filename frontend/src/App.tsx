import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
  retryContent?: string;
};

type Conversation = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type ContextMetadata = {
  contextWindowTokens: number;
  maxOutputTokens: number;
  contextSafetyMarginTokens: number;
  estimator: string;
  instructionsTokens: number;
  messageTokens: number;
  estimatedInputTokens: number;
  availableInputTokens: number;
  remainingInputTokens: number;
  withinBudget: boolean;
  strategy: string;
  wasTruncated: boolean;
  receivedMessages: number;
  sentMessages: number;
  droppedMessages: number;
  droppedTokens: number;
};

type RetrievalMetadata = {
  enabled: boolean;
  reason: string;
  userId: string;
  query: string;
  resultCount: number;
  results: Array<{ memoryId: string; similarity: number }>;
};

type AgentEvent = {
  type: string;
  iteration?: number;
  name?: string;
  isError?: boolean;
  reason?: string;
  output?: unknown;
};

type AgentMetadata = {
  iterations: number;
  toolCalls: number;
  events: AgentEvent[];
};

type PlanningMetadata = {
  enabled: boolean;
  goal?: string;
  steps?: Array<{ id: string; description: string; action: string; status: string }>;
  events?: Array<{ type: string; stepId?: string; action?: string; error?: string }>;
  replans?: number;
};

type DirectionsOutput = {
  origin?: { name?: string; latitude?: number; longitude?: number };
  destination?: { name?: string; latitude?: number; longitude?: number };
  googleMapsUrl?: string;
  distanceKm?: number;
  durationMinutes?: number;
};

type MemoryType = "fact" | "preference" | "project";
type CurrentLocation = { latitude: number; longitude: number };
type MemoryRecord = {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  createdAt: string;
  updatedAt: string;
};

const starterPrompts = [
  "Explain what an AI agent is",
  "What is the Node.js event loop?",
  "How does function calling work?",
];

function createId() {
  return crypto.randomUUID();
}

function formatApiError(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (!payload || typeof payload !== "object") return fallback;

  const body = payload as Record<string, unknown>;
  const errorValue = body.error;
  const message = typeof errorValue === "string"
    ? errorValue
    : errorValue && typeof errorValue === "object" && typeof (errorValue as Record<string, unknown>).message === "string"
      ? (errorValue as Record<string, unknown>).message as string
      : "";
  const details = Array.isArray(body.details)
    ? body.details.filter((item): item is string => typeof item === "string").join("; ")
    : typeof body.details === "string"
      ? body.details
      : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (message && details) return `${message}: ${details}`;
  return message || details || code || fallback;
}

function formatAgentEvent(event: AgentEvent): string {
  if (event.type === "started") return "Agent started";
  if (event.type === "tool_selected") return "Selected tool";
  if (event.type === "tool_completed") {
    return event.isError ? "Tool failed" : "Tool completed";
  }
  if (event.type === "finished") return "Final answer generated";
  if (event.type === "stopped") return `Agent stopped: ${event.reason ?? "unknown reason"}`;
  return event.type.replaceAll("_", " ");
}

function getDirectionsOutput(agent: AgentMetadata | null): DirectionsOutput | null {
  const event = agent?.events.find(
    (candidate) => candidate.type === "tool_completed" && candidate.name === "get_directions" && !candidate.isError,
  );
  return event?.output && typeof event.output === "object"
    ? (event.output as DirectionsOutput)
    : null;
}

function buildGoogleMapsEmbedUrl(apiKey: string, directions: DirectionsOutput): string {
  const origin = directions.origin?.latitude !== undefined && directions.origin.longitude !== undefined
    ? `${directions.origin.latitude},${directions.origin.longitude}`
    : directions.origin?.name ?? "";
  const destination = directions.destination?.latitude !== undefined && directions.destination.longitude !== undefined
    ? `${directions.destination.latitude},${directions.destination.longitude}`
    : directions.destination?.name ?? "";
  const url = new URL("https://www.google.com/maps/embed/v1/directions");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  return url.toString();
}

function DirectionsPreview({
  directions,
  apiKey,
}: {
  directions: DirectionsOutput;
  apiKey?: string;
}) {
  return (
    <section className="maps-preview inline-directions" aria-label="Directions preview">
      <div className="maps-preview-header">
        <div>
          <span>Directions</span>
          <p>
            {directions.origin?.name ?? "Origin"} → {directions.destination?.name ?? "Destination"}
          </p>
        </div>
        {directions.distanceKm !== undefined && (
          <strong>
            {directions.distanceKm} km · {directions.durationMinutes} min
          </strong>
        )}
      </div>
      {apiKey && directions.origin && directions.destination ? (
        <iframe
          title="Google Maps directions"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={buildGoogleMapsEmbedUrl(apiKey, directions)}
        />
      ) : (
        <p className="maps-help">
          Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to embed the map here.
        </p>
      )}
      {directions.googleMapsUrl && (
        <a href={directions.googleMapsUrl} target="_blank" rel="noreferrer">
          Open in Google Maps ↗
        </a>
      )}
    </section>
  );
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [contextMetadata, setContextMetadata] =
    useState<ContextMetadata | null>(null);
  const [retrievalMetadata, setRetrievalMetadata] =
    useState<RetrievalMetadata | null>(null);
  const [agentMetadata, setAgentMetadata] = useState<AgentMetadata | null>(null);
  const [planningMetadata, setPlanningMetadata] = useState<PlanningMetadata | null>(null);
  const [isPlanningEnabled, setIsPlanningEnabled] = useState(false);
  const [userId, setUserId] = useState("local-user");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryType, setMemoryType] = useState<MemoryType>("preference");
  const [memoryImportance, setMemoryImportance] = useState("0.8");
  const [memoryStatus, setMemoryStatus] = useState<string | null>(null);
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [isMemoryDrawerOpen, setIsMemoryDrawerOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationRecords, setConversationRecords] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>([]);
  const [memoryPanelError, setMemoryPanelError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<CurrentLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState("Location not shared");
  const directionsOutput = getDirectionsOutput(agentMetadata);
  const plannedToolCalls = planningMetadata?.steps?.filter((step) => step.status === "completed").length ?? 0;
  const visibleToolCalls = planningMetadata?.enabled ? plannedToolCalls : agentMetadata?.toolCalls ?? 0;
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function sendMessage(content: string, addUserMessage = true) {
    const trimmedContent = content.trim();
    if (!trimmedContent || isSending) return;

    const conversation = [
      ...messages
        .filter((message) => !message.pending && !message.error)
        .map(({ role, content: messageContent }) => ({
          role,
          content: messageContent,
        })),
      ...(addUserMessage
        ? [{ role: "user" as const, content: trimmedContent }]
        : []),
    ];

    if (addUserMessage) {
      setMessages((current) => [
        ...current,
        { id: createId(), role: "user", content: trimmedContent },
      ]);
      setDraft("");
    }

    const assistantId = createId();
    setMessages((current) => [
      ...current,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        pending: true,
      },
    ]);
    setIsSending(true);

    try {
      const result = await fetch(apiBaseUrl + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation,
          userId,
          conversationId,
          planning: isPlanningEnabled,
          currentLocation,
        }),
      });
      const data = (await result.json()) as {
        text?: string;
        error?: unknown;
        details?: unknown;
        code?: unknown;
        context?: ContextMetadata;
        retrieval?: RetrievalMetadata;
        agent?: AgentMetadata;
        conversationId?: string;
        planning?: PlanningMetadata;
      };

      if (!result.ok) {
        throw new Error(formatApiError(data, "The assistant could not respond."));
      }

      setContextMetadata(data.context ?? null);
      setRetrievalMetadata(data.retrieval ?? null);
      setAgentMetadata(data.agent ?? null);
      setPlanningMetadata(data.planning ?? null);
      setConversationId(data.conversationId ?? conversationId);

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: data.text ?? "", pending: false }
            : message,
        ),
      );
      if (isMemoryDrawerOpen) void loadConversations();
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  error instanceof Error
                    ? error.message
                    : "The assistant could not respond.",
                pending: false,
                error: true,
                retryContent: trimmedContent,
              }
            : message,
        ),
      );
    } finally {
      setIsSending(false);
    }
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  function retryMessage(message: Message) {
    if (!message.retryContent) return;

    setMessages((current) => current.filter((item) => item.id !== message.id));
    void sendMessage(message.retryContent, false);
  }

  function startNewChat() {
    setMessages([]);
    setConversationId(null);
    setDraft("");
    setContextMetadata(null);
    setRetrievalMetadata(null);
    setAgentMetadata(null);
    setPlanningMetadata(null);
    composerRef.current?.focus();
  }

  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = memoryContent.trim();
    const importance = Number(memoryImportance);

    if (!content || !Number.isFinite(importance)) return;

    setIsSavingMemory(true);
    setMemoryStatus(null);

    try {
      const result = await fetch(apiBaseUrl + "/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          content,
          type: memoryType,
          importance,
        }),
      });
      const data = (await result.json()) as {
        error?: string;
        memory?: { id: string };
      };

      if (!result.ok) {
        throw new Error(data.error ?? "The memory could not be saved.");
      }

      setMemoryContent("");
      setMemoryStatus(`Saved ${data.memory?.id ?? "memory"}.`);
      await loadMemories();
    } catch (error) {
      setMemoryStatus(
        error instanceof Error ? error.message : "The memory could not be saved.",
      );
    } finally {
      setIsSavingMemory(false);
    }
  }

  async function loadMemories() {
    setIsLoadingMemories(true);
    setMemoryPanelError(null);

    try {
      const result = await fetch(`${apiBaseUrl}/memories?userId=${encodeURIComponent(userId)}`);
      const data = (await result.json()) as { memories?: MemoryRecord[]; error?: string };
      if (!result.ok) throw new Error(data.error ?? "Memories could not be loaded.");
      setMemoryRecords(data.memories ?? []);
    } catch (error) {
      setMemoryPanelError(error instanceof Error ? error.message : "Memories could not be loaded.");
    } finally {
      setIsLoadingMemories(false);
    }
  }

  async function loadConversations() {
    setIsLoadingConversations(true);
    setHistoryError(null);

    try {
      const result = await fetch(`${apiBaseUrl}/conversations?userId=${encodeURIComponent(userId)}`);
      const data = (await result.json()) as { conversations?: Conversation[]; error?: string };
      if (!result.ok) throw new Error(data.error ?? "Chat history could not be loaded.");
      setConversationRecords(data.conversations ?? []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Chat history could not be loaded.");
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function openConversation(record: Conversation) {
    setHistoryError(null);
    try {
      const result = await fetch(
        `${apiBaseUrl}/conversations/${encodeURIComponent(record.id)}/messages?userId=${encodeURIComponent(userId)}`,
      );
      const data = (await result.json()) as {
        messages?: Array<{ id: string; role: "user" | "assistant"; content: string }>;
        error?: string;
      };
      if (!result.ok) throw new Error(data.error ?? "Chat could not be opened.");
      setConversationId(record.id);
      setMessages(
        (data.messages ?? []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })),
      );
      setContextMetadata(null);
      setRetrievalMetadata(null);
      setAgentMetadata(null);
      setPlanningMetadata(null);
      setIsMemoryDrawerOpen(false);
      composerRef.current?.focus();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Chat could not be opened.");
    }
  }

  function toggleMemoryDrawer() {
    const nextOpen = !isMemoryDrawerOpen;
    setIsMemoryDrawerOpen(nextOpen);
    if (nextOpen) {
      void loadMemories();
      void loadConversations();
    }
  }

  async function copyMessage(content: string) {
    await navigator.clipboard.writeText(content);
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not supported by this browser");
      return;
    }

    setLocationStatus("Requesting permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("Location ready for this chat");
      },
      () => setLocationStatus("Location permission was not granted"),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  return (
    <main className="chat-shell">
      <header className="app-header">
        <button
          className="memory-drawer-button hamburger-button"
          type="button"
          onClick={toggleMemoryDrawer}
          aria-label={isMemoryDrawerOpen ? "Close feature menu" : "Open feature menu"}
          aria-expanded={isMemoryDrawerOpen}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
        <div className="brand">
          <span className="brand-mark">AI</span>
          <div>
            <p className="brand-name">AI Full-Stack Lab</p>
            <p className="brand-subtitle">Learn by building the agent</p>
          </div>
        </div>
        <button className="new-chat-button" type="button" onClick={startNewChat}>
          <span aria-hidden="true">+</span>
          New chat
        </button>
      </header>

      {isMemoryDrawerOpen && (
        <aside className="memory-drawer" aria-label="Learning features">
          <div className="memory-drawer-header">
            <div>
              <p className="eyebrow">LEARNING LAB</p>
              <h2>Agent features</h2>
            </div>
            <button type="button" onClick={toggleMemoryDrawer} aria-label="Close memory explorer">×</button>
          </div>
          <nav className="feature-menu" aria-label="Agent features menu">
            <button type="button" onClick={() => document.getElementById("chat-history")?.scrollIntoView({ behavior: "smooth" })}>
              <span>Chat threads</span><small>{conversationRecords.length}</small>
            </button>
            <button type="button" onClick={() => document.getElementById("short-term-memory")?.scrollIntoView({ behavior: "smooth" })}>
              <span>Short-term memory</span><small>{messages.filter((message) => !message.pending && !message.error).length}</small>
            </button>
            <button type="button" onClick={() => document.getElementById("semantic-memory")?.scrollIntoView({ behavior: "smooth" })}>
              <span>Long-term semantic memory</span><small>{memoryRecords.length}</small>
            </button>
            <button type="button" onClick={() => document.getElementById("context-window")?.scrollIntoView({ behavior: "smooth" })}>
              <span>Context window</span><small>{contextMetadata ? "Ready" : "—"}</small>
            </button>
            <button type="button" onClick={() => document.getElementById("agent-execution")?.scrollIntoView({ behavior: "smooth" })}>
              <span>Agent loop & tools</span><small>{agentMetadata ? visibleToolCalls : "—"}</small>
            </button>
          </nav>
          <section id="chat-history" className="memory-layer">
            <div className="memory-layer-header">
              <div>
                <h3>Chat history</h3>
                <p>Exact conversations saved in the configured history store.</p>
              </div>
              <strong>{conversationRecords.length}</strong>
            </div>
            {historyError && <p className="memory-panel-error">{historyError}</p>}
            {isLoadingConversations && <p className="memory-empty">Loading chats…</p>}
            {!isLoadingConversations && conversationRecords.length === 0 && !historyError && (
              <p className="memory-empty">No previous chats yet.</p>
            )}
            <div className="conversation-history-list">
              {conversationRecords.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={"conversation-history-item" + (conversation.id === conversationId ? " is-active" : "")}
                  onClick={() => void openConversation(conversation)}
                >
                  <strong>{conversation.title}</strong>
                  <small>{new Date(conversation.updatedAt).toLocaleString()}</small>
                </button>
              ))}
            </div>
          </section>
          <section id="short-term-memory" className="memory-layer">
            <div className="memory-layer-header">
              <div>
                <h3>Short-term memory</h3>
                <p>Current conversation sent with each model request.</p>
              </div>
              <strong>{messages.filter((message) => !message.pending && !message.error).length}</strong>
            </div>
            {messages.length === 0 ? (
              <p className="memory-empty">No messages in this chat yet.</p>
            ) : (
              <ol className="short-term-list">
                {messages.filter((message) => !message.pending && !message.error).map((message) => (
                  <li key={message.id}>
                    <span>{message.role}</span>
                    <p>{message.content}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section id="semantic-memory" className="memory-layer">
            <div className="memory-layer-header">
              <div>
                <h3>Long-term semantic memory</h3>
                <p>Records stored with embeddings in the configured vector store.</p>
              </div>
              <button type="button" onClick={() => void loadMemories()} disabled={isLoadingMemories}>
                {isLoadingMemories ? "…" : "Refresh"}
              </button>
            </div>
            {memoryPanelError && <p className="memory-panel-error">{memoryPanelError}</p>}
            {!isLoadingMemories && memoryRecords.length === 0 && !memoryPanelError && (
              <p className="memory-empty">No saved memories for {userId}.</p>
            )}
            <div className="memory-record-list">
              {memoryRecords.map((memory) => (
                <article key={memory.id} className="memory-record">
                  <div>
                    <span className="memory-record-type">{memory.type}</span>
                    <span className="memory-record-importance">importance {memory.importance}</span>
                  </div>
                  <p>{memory.content}</p>
                  <small>{new Date(memory.updatedAt).toLocaleString()}</small>
                </article>
              ))}
            </div>
          </section>
        </aside>
      )}

      <section className="conversation" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">✦</span>
            <p className="eyebrow">AGENT WORKSPACE</p>
            <h1>What should we learn today?</h1>
            <p className="empty-copy">
              Ask a question and we’ll use this workspace to understand what
              happens behind an AI agent.
            </p>
            <div className="starter-prompts">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                >
                  {prompt}
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <article
                className={"message-row " + message.role}
                key={message.id}
              >
                <div className="message-avatar" aria-hidden="true">
                  {message.role === "user" ? "You" : "AI"}
                </div>
                <div className={"message-card" + (message.error ? " has-error" : "")}>
                  <div className="message-meta">
                    <span>{message.role === "user" ? "You" : "Assistant"}</span>
                    {message.pending && <span className="message-status">Thinking</span>}
                  </div>
                  {message.pending ? (
                    <div className="typing-indicator" aria-label="Assistant is thinking">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : message.role === "assistant" && !message.error ? (
                    <div className="markdown-content">
                      <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                    </div>
                  ) : (
                    <p className="message-text">{message.content}</p>
                  )}
                  {!message.pending && (
                    <div className="message-actions">
                      {message.error && (
                        <button type="button" onClick={() => retryMessage(message)}>
                          Retry
                        </button>
                      )}
                      {message.role === "assistant" && !message.error && (
                        <button type="button" onClick={() => void copyMessage(message.content)}>
                          Copy
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
        {directionsOutput && (
          <DirectionsPreview directions={directionsOutput} apiKey={googleMapsApiKey} />
        )}
      </section>

      <details className="memory-panel">
        <summary>
          <span>Long-term memory</span>
          <span className="memory-panel-hint">Write explicitly · retrieve automatically</span>
        </summary>
        <form className="memory-form" onSubmit={saveMemory}>
          <label>
            User scope
            <input value={userId} onChange={(event) => setUserId(event.target.value)} />
          </label>
          <label>
            Memory
            <textarea
              value={memoryContent}
              onChange={(event) => setMemoryContent(event.target.value)}
              placeholder="The user prefers TypeScript."
              rows={2}
            />
          </label>
          <div className="memory-form-row">
            <label>
              Type
              <select value={memoryType} onChange={(event) => setMemoryType(event.target.value as MemoryType)}>
                <option value="fact">Fact</option>
                <option value="preference">Preference</option>
                <option value="project">Project</option>
              </select>
            </label>
            <label>
              Importance
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={memoryImportance}
                onChange={(event) => setMemoryImportance(event.target.value)}
              />
            </label>
            <button className="memory-save-button" type="submit" disabled={isSavingMemory || !memoryContent.trim()}>
              {isSavingMemory ? "Saving…" : "Save memory"}
            </button>
          </div>
          <p className="memory-help">Memories are explicit in this lesson. They are embedded and stored in memory for this backend process.</p>
          {memoryStatus && <p className="memory-status">{memoryStatus}</p>}
        </form>
      </details>

      {contextMetadata && (
        <details id="context-window" className="context-inspector" open>
          <summary>
            <span>Context window</span>
            <span
              className={
                "context-badge" +
                (contextMetadata.wasTruncated ? " is-truncated" : "")
              }
            >
              {contextMetadata.wasTruncated ? "Truncated" : "Within budget"}
            </span>
          </summary>
          <div className="context-grid">
            <div>
              <span>Context window</span>
              <strong>{contextMetadata.contextWindowTokens} tokens</strong>
            </div>
            <div>
              <span>Reserved output</span>
              <strong>{contextMetadata.maxOutputTokens} tokens</strong>
            </div>
            <div>
              <span>Safety margin</span>
              <strong>
                {contextMetadata.contextSafetyMarginTokens} tokens
              </strong>
            </div>
            <div>
              <span>Estimated input</span>
              <strong>{contextMetadata.estimatedInputTokens} tokens</strong>
            </div>
            <div>
              <span>Available budget</span>
              <strong>{contextMetadata.availableInputTokens} tokens</strong>
            </div>
            <div>
              <span>Messages sent</span>
              <strong>
                {contextMetadata.sentMessages} / {contextMetadata.receivedMessages}
              </strong>
            </div>
            <div>
              <span>Remaining input</span>
              <strong>{contextMetadata.remainingInputTokens} tokens</strong>
            </div>
            <div>
              <span>Dropped messages</span>
              <strong>{contextMetadata.droppedMessages}</strong>
            </div>
            <div>
              <span>Strategy</span>
              <strong>{contextMetadata.strategy}</strong>
            </div>
            <div>
              <span>Estimator</span>
              <strong>{contextMetadata.estimator}</strong>
            </div>
          </div>
          {retrievalMetadata && (
            <div className="retrieval-summary">
              <span>Memory retrieval</span>
              <strong>
                {retrievalMetadata.resultCount > 0
                  ? `${retrievalMetadata.resultCount} match${retrievalMetadata.resultCount === 1 ? "" : "es"}`
                  : retrievalMetadata.reason.replaceAll("_", " ")}
              </strong>
            </div>
          )}
          {agentMetadata && (
            <div id="agent-execution" className="agent-summary">
              <div className="agent-summary-header">
                <span>Agent execution</span>
                <strong>
                  {agentMetadata.iterations} iteration{agentMetadata.iterations === 1 ? "" : "s"}
                  {visibleToolCalls > 0
                    ? ` · ${visibleToolCalls} ${planningMetadata?.enabled ? "planned " : ""}tool call${visibleToolCalls === 1 ? "" : "s"}`
                    : " · no tools used"}
                </strong>
              </div>
              <ol className="agent-events">
                {agentMetadata.events
                  .filter((event) => event.type !== "iteration_started")
                  .map((event, index) => (
                    <li key={`${event.type}-${index}`}>
                      <span>{formatAgentEvent(event)}</span>
                      {event.name && <code>{event.name}</code>}
                    </li>
                  ))}
              </ol>
            </div>
          )}
          {planningMetadata?.enabled && (
            <div className="planning-summary">
              <div className="agent-summary-header">
                <span>Execution plan</span>
                <strong>{planningMetadata.replans ?? 0} replans</strong>
              </div>
              <p>{planningMetadata.goal}</p>
              <ol className="planning-steps">
                {planningMetadata.steps?.map((step) => (
                  <li key={step.id} className={step.status}>
                    <span>{step.status === "completed" ? "✓" : step.status === "failed" ? "!" : "·"}</span>
                    <div><strong>{step.description}</strong><small>{step.action} · {step.status}</small></div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </details>
      )}

      <form className="composer" onSubmit={submitMessage}>
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Message the learning agent..."
          rows={1}
          disabled={isSending}
          aria-label="Message"
        />
        <div className="composer-footer">
          <span>Enter to send · Shift + Enter for a new line</span>
          <button
            className="location-button"
            type="button"
            onClick={requestCurrentLocation}
            aria-label="Share current location"
          >
            {currentLocation ? "Location ready" : "Use current location"}
          </button>
          <button
            className={"location-button planning-toggle" + (isPlanningEnabled ? " is-active" : "")}
            type="button"
            onClick={() => setIsPlanningEnabled((enabled) => !enabled)}
            aria-pressed={isPlanningEnabled}
          >
            {isPlanningEnabled ? "Plan first" : "Direct loop"}
          </button>
          <button
            className="send-button"
            type="submit"
            disabled={isSending || !draft.trim()}
            aria-label="Send message"
          >
            {isSending ? "..." : "↑"}
          </button>
        </div>
        <p className="location-status" aria-live="polite">{locationStatus}</p>
      </form>
    </main>
  );
}

export default App;
