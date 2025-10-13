import { createRoot } from "react-dom/client";
import React, { useState, useEffect } from "react";

// Simple dashboard to show active sessions
function AgentDashboard() {
  const [sessions, setSessions] = useState<string[]>([]);

  // Fetch active sessions from the server
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await fetch("/api/sessions");
        const data = await response.json();
        console.log("Fetched sessions:", data);
        setSessions(data);
      } catch (error) {
        console.error("Failed to fetch sessions:", error);
        // Fallback to dummy data if API fails
        const dummySessions = ["session-1", "session-2", "session-3"];
        setSessions(dummySessions);
      }
    };

    fetchSessions();
    
    // Refresh session list every 5 seconds
    const interval = setInterval(fetchSessions, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="agent-dashboard container">
      <h4>Active Chat Sessions</h4>
      <table className="u-full-width">
        <thead>
          <tr>
            <th>Session ID</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session}>
              <td>{session}</td>
              <td>Active</td>
              <td>
                <button className="button-primary" onClick={() => {
                  window.open(`/${session}`, '_blank');
                }}>
                  Join
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sessions.length === 0 && (
        <p>No active sessions. Open a new chat room to see it appear here.</p>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("agent-root")!).render(<AgentDashboard />);