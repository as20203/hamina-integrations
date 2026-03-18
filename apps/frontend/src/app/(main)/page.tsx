"use client";

import { useEffect, useState } from "react";

type HelloRecord = {
  id: number;
  message: string;
  createdAt: string;
};

const HomePage = () => {
  const [backendMessage, setBackendMessage] = useState("Loading backend...");
  const [latestRecord, setLatestRecord] = useState<HelloRecord | null>(null);
  const [isCreatingRecord, setIsCreatingRecord] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBackendMessage = async () => {
      try {
        const response = await fetch("/api/backend-message");
        if (!response.ok) {
          setBackendMessage("Backend is reachable but returned an error.");
          return;
        }

        const data = (await response.json()) as { message?: string };
        setBackendMessage(data.message || "Hello from backend");
      } catch {
        setBackendMessage("Backend not reachable yet");
      }
    };

    void fetchBackendMessage();
  }, []);

  const createHelloRecord = async () => {
    setIsCreatingRecord(true);
    setError(null);

    try {
      const response = await fetch("/api/hello-record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to create HelloRecord");
      }

      const data = (await response.json()) as { record: HelloRecord };
      setLatestRecord(data.record);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unexpected error";
      setError(message);
    } finally {
      setIsCreatingRecord(false);
    }
  };

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Hello from frontend</h1>
      <p>Monorepo app is running.</p>
      <p>Backend says: {backendMessage}</p>
      <button onClick={createHelloRecord} disabled={isCreatingRecord}>
        {isCreatingRecord ? "Creating..." : "Create HelloRecord"}
      </button>
      {latestRecord && (
        <pre style={{ marginTop: "1rem" }}>
          {JSON.stringify(latestRecord, null, 2)}
        </pre>
      )}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
    </main>
  );
};

export default HomePage;
