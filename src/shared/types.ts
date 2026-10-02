export type DieFace = 1 | 2 | 3 | "energy" | "smash" | "heal";
export type GamePhase =
  | "lobby"
  | "rolling"
  | "resolving"
  | "yielding"
  | "buying"
  | "finished";

export type MonsterId =
  | "voltclaw"
  | "apex"
  | "cosmocat"
  | "mechazero"
  | "cratercrab"
  | "rockethop";

export type CardEffect =
  | { kind: "gain"; resource: "hp" | "energy" | "vp"; amount: number }
  | { kind: "damageOthers"; amount: number }
  | { kind: "damageTarget"; amount: number }
  | { kind: "extraTurn" }
  | {
      kind: "passive";
      passive:
        | "extraDie"
        | "extraReroll"
        | "attackBonus"
        | "healBonus"
        | "cardDiscount"
        | "maxHp"
        | "tokyoBonus"
        | "energyOnSmash"
        | "fireBreathing"
        | "poison"
        | "shrink";
      amount: number;
    };

export interface PowerCard {
  id: string;
  name: string;
  cost: number;
  type: "keep" | "discard";
  text: string;
  accent: "cyan" | "magenta" | "lime" | "amber";
  effects: CardEffect[];
}

export interface DieState {
  id: number;
  face: DieFace;
  locked: boolean;
  resolved: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  monster: MonsterId | null;
  ready: boolean;
  hp: number;
  maxHp: number;
  vp: number;
  energy: number;
  alive: boolean;
  connected: boolean;
  isHost: boolean;
  cards: PowerCard[];
  poison: number;
  shrink: number;
}

export interface GameLogEntry {
  id: number;
  tone: "neutral" | "good" | "danger" | "energy";
  text: string;
}

export interface GameState {
  id: string;
  code: string;
  revision: number;
  phase: GamePhase;
  round: number;
  players: PlayerState[];
  currentPlayerId: string | null;
  firstPlayerId: string | null;
  tokyoCity: string | null;
  tokyoBay: string | null;
  twoPlayerVariant: boolean;
  dice: DieState[];
  rollCount: number;
  maxRolls: number;
  deck: PowerCard[];
  discard: PowerCard[];
  market: PowerCard[];
  pendingYields: string[];
  resumePhase: GamePhase | null;
  winnerIds: string[];
  extraTurn: boolean;
  log: GameLogEntry[];
  rngState: number;
}

export type ClientGameState = Omit<GameState, "deck" | "rngState"> & {
  deckSize: number;
};

export type GameCommand =
  | { type: "SELECT_MONSTER"; monster: MonsterId }
  | { type: "SET_READY"; ready: boolean }
  | { type: "START_GAME"; twoPlayerVariant?: boolean }
  | { type: "ROLL_DICE" }
  | { type: "TOGGLE_DIE"; dieId: number }
  | { type: "FINISH_ROLLING" }
  | {
      type: "RESOLVE_FACE";
      face: DieFace;
      healMode?: "hp" | "poison" | "shrink";
      targetId?: string;
    }
  | { type: "YIELD_TOKYO"; yield: boolean }
  | { type: "BUY_CARD"; cardId: string; targetId?: string }
  | { type: "SWEEP_MARKET" }
  | { type: "END_TURN" };

export interface CommandEnvelope {
  commandId: string;
  expectedRevision: number;
  command: GameCommand;
}

export interface RoomIdentity {
  roomCode: string;
  playerId: string;
  token: string;
}

export interface SocketAck<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ServerToClientEvents {
  state: (state: ClientGameState) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  createRoom: (
    data: { name: string },
    ack: (response: SocketAck<RoomIdentity>) => void
  ) => void;
  joinRoom: (
    data: { code: string; name: string },
    ack: (response: SocketAck<RoomIdentity>) => void
  ) => void;
  resumeRoom: (
    data: RoomIdentity,
    ack: (response: SocketAck<RoomIdentity>) => void
  ) => void;
  command: (
    data: CommandEnvelope,
    ack: (response: SocketAck) => void
  ) => void;
}

export const MONSTERS: Array<{
  id: MonsterId;
  name: string;
  title: string;
  colors: [string, string];
}> = [
  { id: "voltclaw", name: "伏特爪", title: "霓虹猎手", colors: ["#22d3ee", "#0e7490"] },
  { id: "apex", name: "铁拳猿", title: "都市暴君", colors: ["#ff3b3b", "#991b1b"] },
  { id: "cosmocat", name: "星界猫", title: "心灵风暴", colors: ["#b56cff", "#6d28d9"] },
  { id: "mechazero", name: "零号机", title: "钢铁意志", colors: ["#8bff3d", "#3f8f1f"] },
  { id: "cratercrab", name: "熔岩蟹", title: "地核怒火", colors: ["#ff7a1a", "#b9380b"] },
  { id: "rockethop", name: "火箭企鹅", title: "极地王牌", colors: ["#ffd43b", "#b77900"] }
];
