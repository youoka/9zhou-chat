import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

// Session tracker class to keep track of all active sessions across instances
export class SessionTracker extends Server<Env> {
  static options = { hibernate: true };
  
  onStart() {
    // Initialize sessions table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS sessions (room TEXT PRIMARY KEY, created_at INTEGER)`
    );
  }
  
  // Add a session to the tracker
  async addSession(room: string) {
    if (room) {
      this.ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO sessions (room, created_at) VALUES ('${room}', ${Date.now()})`
      );
    }
  }
  
  // Remove a session from the tracker
  async removeSession(room: string) {
    if (room) {
      this.ctx.storage.sql.exec(
        `DELETE FROM sessions WHERE room = '${room}'`
      );
    }
  }
  
  // Get all active sessions
  async getActiveSessions() {
    try {
      const result = this.ctx.storage.sql.exec(`SELECT room FROM sessions`).toArray();
      return result.map((row: any) => row.room);
    } catch (error) {
      console.error("Error fetching active sessions:", error);
      return [];
    }
  }
}

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  async onStart() {
    // Add this room to the active sessions list
    const room = this.ctx.id.name;
    // Only track rooms with valid names
    if (room) {
      // Track session in the session tracker
      const trackerId = this.ctx.env.SessionTracker.newUniqueId();
      const tracker = this.ctx.env.SessionTracker.get(trackerId);
      await tracker.addSession(room);
      
      console.log("Room started:", room);
    }
    
    // this is where you can initialize things that need to be done before the server starts
    // for example, load previous messages from a database or a service

    // create the messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT)`
    );

    // load the messages from the database
    this.messages = this.ctx.storage.sql
      .exec(`SELECT * FROM messages`)
      .toArray() as ChatMessage[];
  }

  async onClose() {
    // Remove this room from the active sessions list
    const room = this.ctx.id.name;
    if (room) {
      // Remove session from tracker
      const trackerId = this.ctx.env.SessionTracker.newUniqueId();
      const tracker = this.ctx.env.SessionTracker.get(trackerId);
      await tracker.removeSession(room);
      
      console.log("Room closed:", room);
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

export default {
  async fetch(request, env) {
    // Handle request for active sessions
    const url = new URL(request.url);
    if (url.pathname === "/api/sessions") {
      // Get sessions from the session tracker
      const trackerId = env.SessionTracker.newUniqueId();
      const tracker = env.SessionTracker.get(trackerId);
      const sessions = await tracker.getActiveSessions();
      
      return new Response(JSON.stringify(sessions), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;