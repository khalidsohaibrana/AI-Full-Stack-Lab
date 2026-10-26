import { useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const result = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? "Request failed");

      setAnswer(data.text);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <p className="eyebrow">AI FULL-STACK LAB</p>
      <h1>Build an agent from first principles.</h1>
      <p className="intro">React → Express → model API</p>

      <form onSubmit={submitMessage} className="chat-form">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask something..."
          rows={6}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Thinking..." : "Send message"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {answer && (
        <section className="answer">
          <p className="eyebrow">ASSISTANT</p>
          <p>{answer}</p>
        </section>
      )}
    </main>
  );
}

export default App;
