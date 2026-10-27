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

const starterPrompts = [
  "Explain what an AI agent is",
  "What is the Node.js event loop?",
  "How does function calling work?",
];

function createId() {
  return crypto.randomUUID();
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
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
        body: JSON.stringify({ messages: conversation }),
      });
      const data = await result.json();

      if (!result.ok) {
        throw new Error(data.error ?? "The assistant could not respond.");
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: data.text, pending: false }
            : message,
        ),
      );
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
    setDraft("");
    composerRef.current?.focus();
  }

  async function copyMessage(content: string) {
    await navigator.clipboard.writeText(content);
  }

  return (
    <main className="chat-shell">
      <header className="app-header">
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
      </section>

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
            className="send-button"
            type="submit"
            disabled={isSending || !draft.trim()}
            aria-label="Send message"
          >
            {isSending ? "..." : "↑"}
          </button>
        </div>
      </form>
    </main>
  );
}

export default App;
