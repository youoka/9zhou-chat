import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

// Keep track of all active sessions
const activeSessions = new Map<string, {createdAt: number}>();

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  onStart() {
    // Add this room to the active sessions list
    const room = this.ctx.id.name;
    // Only track rooms with valid names
    if (room) {
      activeSessions.set(room, {createdAt: Date.now()});
      console.log("Room started:", room);
      console.log("Active sessions:", Array.from(activeSessions.keys()));
    }
  }

  onClose() {
    // Remove this room from the active sessions list
    const room = this.ctx.id.name;
    if (room) {
      activeSessions.delete(room);
      console.log("Room closed:", room);
      console.log("Active sessions:", Array.from(activeSessions.keys()));
    }
  }

  onConnect(connection: Connection) {
    const room = this.ctx.id.name;
    if (room) {
      console.log("Client connected to room:", room);
    }
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message)
    );
  }

  saveMessage(message: ChatMessage) {
    // check if the message already exists
    const existingMessage = this.messages.find((m) => m.id === message.id);
    if (existingMessage) {
      this.messages = this.messages.map((m) => {
        if (m.id === message.id) {
          return message;
        }
        return m;
      });
    } else {
      this.messages.push(message);
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content) VALUES ('${
        message.id
      }', '${message.user}', '${message.role}', ${JSON.stringify(
        message.content
      )}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
        message.content
      )}`
    );
  }

  onMessage(connection: Connection, message: WSMessage) {
    // let's broadcast the raw message to everyone else
    this.broadcast(message);

    // let's update our local messages store
    const parsed = JSON.parse(message as string) as Message;
    if (parsed.type === "add" || parsed.type === "update") {
      this.saveMessage(parsed);
    }
  }
}

// Export the active sessions for the admin dashboard
export function getActiveSessions() {
  return Array.from(activeSessions.keys());
}

export default {
  async fetch(request, env) {
    // Handle request for active sessions
    const url = new URL(request.url);
    if (url.pathname === "/api/sessions") {
      return new Response(JSON.stringify(getActiveSessions()), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;