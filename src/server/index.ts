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
  leavePlayer,
  removeBot,
  RuleError,
  setConnected,
  toClientState
} from "../shared/engine";
import { chooseBotCommand } from "../shared/bot";
import type {
  ClientToServerEvents,
  CommandEnvelope,
  GameState,
  MonsterId,
  RoomIdentity,
  ServerToClientEvents,
  SocketAck
} from "../shared/types";
import { MONSTERS } from "../shared/types";

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
  botTimer?: ReturnType<typeof setTimeout>;
}

const rooms = new Map<string, Room>();
const socketIdentity = new Map<string, RoomIdentity>();
const botNames = ["钢牙", "小核弹", "夜行者", "重拳", "电光仔", "冰箱王"];

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

function actingBot(state: GameState) {
  if (state.phase === "yielding") {
    return state.players.find(
      (item) => item.id === state.pendingYields[0] && item.isBot
    );
  }
  return state.players.find(
    (item) => item.id === state.currentPlayerId && item.isBot
  );
}

function scheduleBotAction(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: Room
) {
  if (room.botTimer || !actingBot(room.state)) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = undefined;
    const bot = actingBot(room.state);
    if (!bot) return;
    const command = chooseBotCommand(room.state, bot.id);
    if (!command) return;

    try {
      const next = cloneGame(room.state);
      dispatch(next, bot.id, command);
      room.state = next;
      emitState(io, room);
      scheduleBotAction(io, room);
    } catch (error) {
      console.error(`Bot action failed in room ${room.state.code}:`, error);
    }
  }, 700);
}

function roomForSocket(socketId: string) {
  const identity = socketIdentity.get(socketId);
  if (!identity) throw new RuleError("请先加入房间");
  const room = rooms.get(identity.roomCode);
  if (!room) throw new RuleError("房间不存在");
  return { identity, room };
}

function nextBotIdentity(state: GameState) {
  const selected = new Set(state.players.map((item) => item.monster));
  const monster = MONSTERS.find((item) => !selected.has(item.id))?.id;
  if (!monster) throw new RuleError("没有可用的怪兽");
  const usedNames = new Set(state.players.map((item) => item.name));
  const baseName = botNames.find((name) => !usedNames.has(name)) ?? `人机${state.players.length}`;
  return { name: baseName, monster: monster as MonsterId };
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

  socket.on("addBot", (ack: (response: SocketAck) => void) => {
    try {
      const { identity, room } = roomForSocket(socket.id);
      const actor = room.state.players.find((item) => item.id === identity.playerId);
      if (!actor?.isHost) throw new RuleError("只有房主可以添加人机");
      const bot = nextBotIdentity(room.state);
      addPlayer(room.state, {
        id: randomUUID(),
        name: bot.name,
        monster: bot.monster,
        isHost: false,
        isBot: true
      });
      ack({ ok: true });
      emitState(io, room);
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "添加人机失败" });
    }
  });

  socket.on("removeBot", (raw, ack: (response: SocketAck) => void) => {
    try {
      const data = z.object({ playerId: z.string().uuid() }).parse(raw);
      const { identity, room } = roomForSocket(socket.id);
      removeBot(room.state, identity.playerId, data.playerId);
      ack({ ok: true });
      emitState(io, room);
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "移除人机失败" });
    }
  });

  socket.on("leaveRoom", (ack: (response: SocketAck) => void) => {
    try {
      const { identity, room } = roomForSocket(socket.id);
      room.sessions.delete(identity.playerId);
      socketIdentity.delete(socket.id);
      socket.leave(identity.roomCode);

      if (room.sessions.size === 0) {
        if (room.botTimer) clearTimeout(room.botTimer);
        rooms.delete(identity.roomCode);
      } else {
        leavePlayer(room.state, identity.playerId);
        emitState(io, room);
        scheduleBotAction(io, room);
      }
      ack({ ok: true });
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "退出房间失败" });
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
      scheduleBotAction(io, room);
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
