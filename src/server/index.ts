import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Server } from "socket.io";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  addPlayer,
  cloneGame,
  createGame,
  dispatch,
  RuleError,
  setConnected,
  toClientState
} from "../shared/engine";
import type {
  ClientToServerEvents,
  CommandEnvelope,
  GameState,
  RoomIdentity,
  ServerToClientEvents,
  SocketAck
} from "../shared/types";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const app = Fastify({ logger: false });

interface PlayerSession {
  playerId: string;
  token: string;
}

interface Room {
  state: GameState;
  sessions: Map<string, PlayerSession>;
  commandIds: Set<string>;
}

const rooms = new Map<string, Room>();
const socketIdentity = new Map<string, RoomIdentity>();

const playerInputSchema = z.object({
  name: z.string().trim().min(1).max(18)
});

const joinInputSchema = playerInputSchema.extend({
  code: z.string().trim().length(5).transform((value) => value.toUpperCase())
});

const resumeSchema = z.object({
  roomCode: z.string().length(5),
  playerId: z.string().uuid(),
  token: z.string().min(32)
});

const commandSchema = z.object({
  commandId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  command: z.object({ type: z.string() }).passthrough()
});

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function token() {
  return randomBytes(32).toString("base64url");
}

function emitState(io: Server<ClientToServerEvents, ServerToClientEvents>, room: Room) {
  io.to(room.state.code).emit("state", toClientState(room.state));
}

app.get("/health", async () => ({ ok: true, rooms: rooms.size }));

const distPath = join(fileURLToPath(new URL("../../", import.meta.url)), "dist");
if (process.env.NODE_ENV === "production" && existsSync(distPath)) {
  await app.register(fastifyStatic, {
    root: distPath,
    wildcard: false
  });
  app.setNotFoundHandler((_request, reply) => reply.sendFile("index.html"));
}

await app.ready();

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: true },
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 10_000,
  pingTimeout: 20_000
});

io.on("connection", (socket) => {
  socket.on("createRoom", (raw, ack) => {
    try {
      const data = playerInputSchema.parse(raw);
      const code = roomCode();
      const playerId = randomUUID();
      const session = { playerId, token: token() };
      const state = createGame(randomUUID(), code, [
        { id: playerId, name: data.name, monster: null, isHost: true }
      ]);
      const room: Room = {
        state,
        sessions: new Map([[playerId, session]]),
        commandIds: new Set()
      };
      rooms.set(code, room);
      const identity = { roomCode: code, ...session };
      socketIdentity.set(socket.id, identity);
      socket.join(code);
      ack({ ok: true, data: identity });
      emitState(io, room);
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "创建房间失败" });
    }
  });

  socket.on("joinRoom", (raw, ack) => {
    try {
      const data = joinInputSchema.parse(raw);
      const room = rooms.get(data.code);
      if (!room) throw new RuleError("房间不存在");
      const playerId = randomUUID();
      const session = { playerId, token: token() };
      addPlayer(room.state, {
        id: playerId,
        name: data.name,
        monster: null,
        isHost: false
      });
      room.sessions.set(playerId, session);
      const identity = { roomCode: data.code, ...session };
      socketIdentity.set(socket.id, identity);
      socket.join(data.code);
      ack({ ok: true, data: identity });
      emitState(io, room);
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "加入房间失败" });
    }
  });

  socket.on("resumeRoom", (raw, ack) => {
    try {
      const identity = resumeSchema.parse(raw);
      const room = rooms.get(identity.roomCode);
      const session = room?.sessions.get(identity.playerId);
      if (!room || !session || session.token !== identity.token) {
        throw new RuleError("房间或重连凭证已失效");
      }
      socketIdentity.set(socket.id, identity);
      socket.join(identity.roomCode);
      setConnected(room.state, identity.playerId, true);
      ack({ ok: true, data: identity });
      emitState(io, room);
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "重连失败" });
    }
  });

  socket.on("command", (raw, ack: (response: SocketAck) => void) => {
    const identity = socketIdentity.get(socket.id);
    if (!identity) {
      ack({ ok: false, error: "请先加入房间" });
      return;
    }
    const room = rooms.get(identity.roomCode);
    if (!room) {
      ack({ ok: false, error: "房间不存在" });
      return;
    }

    try {
      const envelope = commandSchema.parse(raw) as CommandEnvelope;
      if (room.commandIds.has(envelope.commandId)) {
        ack({ ok: true });
        return;
      }
      if (envelope.expectedRevision !== room.state.revision) {
        throw new RuleError("状态已更新，请重试");
      }
      const next = cloneGame(room.state);
      dispatch(next, identity.playerId, envelope.command);
      room.state = next;
      room.commandIds.add(envelope.commandId);
      if (room.commandIds.size > 1000) {
        room.commandIds = new Set([...room.commandIds].slice(-500));
      }
      ack({ ok: true });
      emitState(io, room);
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      ack({ ok: false, error: message });
      socket.emit("error", message);
      emitState(io, room);
    }
  });

  socket.on("disconnect", () => {
    const identity = socketIdentity.get(socket.id);
    if (!identity) return;
    socketIdentity.delete(socket.id);
    const room = rooms.get(identity.roomCode);
    if (!room) return;

    const stillConnected = [...socketIdentity.values()].some(
      (item) => item.roomCode === identity.roomCode && item.playerId === identity.playerId
    );
    if (!stillConnected) {
      setConnected(room.state, identity.playerId, false);
      emitState(io, room);
    }
  });
});

await app.listen({ port, host });

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((item) => item?.family === "IPv4" && !item.internal)
  .map((item) => `http://${item?.address}:${port}`);

console.log(`Neon Kaiju Arena server: http://localhost:${port}`);
addresses.forEach((address) => console.log(`LAN: ${address}`));
