import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BookOpen,
  Bot,
  Bolt,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Crown,
  Dices,
  DoorOpen,
  Heart,
  LogIn,
  LogOut,
  Layers3,
  Radio,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  ShoppingCart,
  Skull,
  Sparkles,
  Swords,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientGameState,
  ClientToServerEvents,
  CommandEnvelope,
  DieFace,
  GameCommand,
  MonsterSkill,
  MonsterId,
  PlayerState,
  PowerCard,
  RoomIdentity,
  ServerToClientEvents,
  SocketAck
} from "../shared/types";
import { MONSTERS } from "../shared/types";
import { getSkillChoices } from "../shared/skills";
import { getCardCost } from "../shared/engine";

const STORAGE_KEY = "neon-kaiju-session";
const AUDIO_ENABLED_KEY = "neon-kaiju-audio-enabled";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type MonsterArtVariant = "portrait" | "full";
type CombatVfxKind = "electric" | "explosion" | "impact";
type SoundEffect = "attack" | "dice" | "heal";

const socket: GameSocket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionDelayMax: 2000
});

const MONSTER_ASSETS: Record<
  MonsterId,
  { full: string; portrait: string; spriteIndex: number }
> = {
  voltclaw: {
    full: "/voltclaw-full.png",
    portrait: "/voltclaw-portrait.png",
    spriteIndex: 0
  },
  apex: {
    full: "/iron-gorilla-full.png",
    portrait: "/iron-gorilla-portrait.png",
    spriteIndex: 1
  },
  cosmocat: {
    full: "/astral-cat-full.png",
    portrait: "/astral-cat-portrait.png",
    spriteIndex: 2
  },
  mechazero: {
    full: "/unit-zero-full.png",
    portrait: "/unit-zero-portrait.png",
    spriteIndex: 3
  },
  cratercrab: {
    full: "/magma-crab-full.png",
    portrait: "/magma-crab-portrait.png",
    spriteIndex: 4
  },
  rockethop: {
    full: "/rocket-penguin-full.png",
    portrait: "/rocket-penguin-portrait.png",
    spriteIndex: 5
  }
};

const VFX_ASSETS: Record<CombatVfxKind, string> = {
  electric: "/electric-vfx-sheet.png",
  explosion: "/explosion-vfx-sheet.png",
  impact: "/impact-vfx-sheet.png"
};

const AUDIO_ASSETS = {
  menu: "/audio/menu-rain-tactics.m4a",
  game: "/audio/game-tokyo-undercurrent.m4a",
  attack: "/audio/claw-attack-a.wav",
  dice: "/audio/dice-hit-a.wav",
  heal: "/audio/heal-a.wav"
} as const;

const RANDOM_NAME_PREFIXES = [
  "暴走",
  "闪电",
  "铁拳",
  "迷你",
  "午夜",
  "熔岩",
  "霓虹",
  "冷面",
  "无敌",
  "火箭",
  "超凶",
  "东京"
];

const RANDOM_NAME_SUFFIXES = [
  "团子",
  "队长",
  "爪爪",
  "大王",
  "阿怪",
  "布丁",
  "头槌",
  "饭团",
  "小炮",
  "猛男",
  "喵王",
  "蟹老板"
];

function randomPlayerName(previous = "") {
  const combinations = RANDOM_NAME_PREFIXES.length * RANDOM_NAME_SUFFIXES.length;
  for (let attempt = 0; attempt < combinations; attempt += 1) {
    const prefix =
      RANDOM_NAME_PREFIXES[Math.floor(Math.random() * RANDOM_NAME_PREFIXES.length)];
    const suffix =
      RANDOM_NAME_SUFFIXES[Math.floor(Math.random() * RANDOM_NAME_SUFFIXES.length)];
    const candidate = `${prefix}${suffix}`;
    if (candidate !== previous) return candidate;
  }
  return "暴走团子";
}

function useGameAudio(state: ClientGameState | null) {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem(AUDIO_ENABLED_KEY) !== "false"
  );
  const enabledRef = useRef(enabled);
  const unlockedRef = useRef(false);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<Record<SoundEffect, HTMLAudioElement> | null>(null);
  const previousStateRef = useRef<ClientGameState | null>(null);
  const bgmSource = state && state.phase !== "lobby" ? AUDIO_ASSETS.game : AUDIO_ASSETS.menu;

  const playEffect = useCallback((effect: SoundEffect) => {
    if (!enabledRef.current || !unlockedRef.current) return;
    const source = sfxRef.current?.[effect];
    if (!source) return;
    const sound = source.cloneNode() as HTMLAudioElement;
    sound.volume = effect === "attack" ? 0.72 : 0.62;
    void sound.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    const bgm = new Audio();
    bgm.loop = true;
    bgm.preload = "auto";
    bgm.volume = 0.2;
    bgmRef.current = bgm;
    sfxRef.current = {
      attack: new Audio(AUDIO_ASSETS.attack),
      dice: new Audio(AUDIO_ASSETS.dice),
      heal: new Audio(AUDIO_ASSETS.heal)
    };
    Object.values(sfxRef.current).forEach((sound) => {
      sound.preload = "auto";
    });

    const unlock = () => {
      unlockedRef.current = true;
      if (enabledRef.current) void bgm.play().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      bgm.pause();
      bgmRef.current = null;
      sfxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;
    if (!bgm.src.endsWith(bgmSource)) {
      bgm.src = bgmSource;
      bgm.currentTime = 0;
    }
    if (enabled && unlockedRef.current) void bgm.play().catch(() => undefined);
    else bgm.pause();
  }, [bgmSource, enabled]);

  useEffect(() => {
    enabledRef.current = enabled;
    localStorage.setItem(AUDIO_ENABLED_KEY, String(enabled));
  }, [enabled]);

  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = state;
    if (!state || !previous || state.id !== previous.id || state.revision === previous.revision) {
      return;
    }

    if (
      state.currentPlayerId === previous.currentPlayerId &&
      state.rollCount > previous.rollCount
    ) {
      playEffect("dice");
    }

    if (
      state.players.some((player) => {
        const oldPlayer = previous.players.find((item) => item.id === player.id);
        return oldPlayer && player.hp > oldPlayer.hp;
      })
    ) {
      playEffect("heal");
    }

    const lastLogId = previous.log.at(-1)?.id ?? 0;
    if (state.log.some((entry) => entry.id > lastLogId && /受到.+的攻击/.test(entry.text))) {
      playEffect("attack");
    }
  }, [playEffect, state]);

  return {
    enabled,
    toggle: () => setEnabled((current) => !current)
  };
}

const cutoutCache = new Map<string, Promise<string>>();

function removeBakedCheckerboard(source: string) {
  const cached = cutoutCache.get(source);
  if (cached) return cached;

  const result = new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        resolve(source);
        return;
      }

      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = pixels;
      const visited = new Uint8Array(width * height);
      const queue = new Int32Array(width * height);
      let head = 0;
      let tail = 0;

      const isBackground = (index: number) => {
        const offset = index * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        return (red + green + blue) / 3 > 214 && max - min < 24;
      };
      const enqueue = (index: number) => {
        if (visited[index] || !isBackground(index)) return;
        visited[index] = 1;
        queue[tail++] = index;
      };

      for (let x = 0; x < width; x += 1) {
        enqueue(x);
        enqueue((height - 1) * width + x);
      }
      for (let y = 1; y < height - 1; y += 1) {
        enqueue(y * width);
        enqueue(y * width + width - 1);
      }

      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) enqueue(index - 1);
        if (x < width - 1) enqueue(index + 1);
        if (y > 0) enqueue(index - width);
        if (y < height - 1) enqueue(index + width);
      }

      for (let index = 0; index < visited.length; index += 1) {
        if (visited[index]) data[index * 4 + 3] = 0;
      }
      context.putImageData(pixels, 0, 0);
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : source), "image/png");
    };
    image.onerror = () => resolve(source);
    image.src = source;
  });

  cutoutCache.set(source, result);
  return result;
}

function useCutoutAsset(source: string | null) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResolved(null);
    if (source) {
      void removeBakedCheckerboard(source).then((asset) => {
        if (active) setResolved(asset);
      });
    }
    return () => {
      active = false;
    };
  }, [source]);

  return resolved;
}

function CutoutImage({
  src,
  alt,
  className
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const cutout = useCutoutAsset(src);
  return cutout ? <img className={className} src={cutout} alt={alt} draggable={false} /> : null;
}

function monsterById(id: MonsterId) {
  return MONSTERS.find((monster) => monster.id === id) ?? MONSTERS[0];
}

function playerMonster(player: PlayerState): MonsterId {
  return player.monster ?? "voltclaw";
}

function MonsterArt({
  monster,
  size = 92,
  defeated = false,
  variant = "portrait"
}: {
  monster: MonsterId;
  size?: number;
  defeated?: boolean;
  variant?: MonsterArtVariant;
}) {
  const source = MONSTER_ASSETS[monster][variant];
  const cutout = useCutoutAsset(variant === "full" ? source : null);
  return (
    <img
      className={`monster-art monster-art-${variant} ${defeated ? "is-defeated" : ""}`}
      src={variant === "full" ? cutout ?? undefined : source}
      width={size}
      height={size}
      alt={monsterById(monster).name}
      draggable={false}
    />
  );
}

function CombatVfx({
  kind,
  monster,
  effectKey
}: {
  kind: CombatVfxKind;
  monster: MonsterId;
  effectKey: number;
}) {
  const sheet = useCutoutAsset(VFX_ASSETS[kind]);
  const spriteIndex = MONSTER_ASSETS[monster].spriteIndex;
  const column = spriteIndex % 3;
  const row = Math.floor(spriteIndex / 3);

  if (!sheet) return null;
  return (
    <motion.div
      key={effectKey}
      className={`combat-vfx combat-vfx-${kind}`}
      style={{
        backgroundImage: `url("${sheet}")`,
        backgroundPosition: `${column * 50}% ${row * 100}%`
      }}
      initial={{ opacity: 0, scale: 0.35, rotate: kind === "impact" ? -12 : 0 }}
      animate={{ opacity: [0, 1, 0.82, 0], scale: [0.35, 1.05, 1.22, 1.45] }}
      transition={{ duration: 0.78, ease: "easeOut" }}
    />
  );
}

function Stat({
  icon,
  value,
  tone,
  label
}: {
  icon: React.ReactNode;
  value: number;
  tone: "hp" | "vp" | "energy";
  label: string;
}) {
  return (
    <div className={`stat stat-${tone}`} title={label}>
      {icon}
      <strong>{value}</strong>
    </div>
  );
}

function PlayerPanel({
  player,
  active,
  inTokyo,
  isSelf,
  onInspect
}: {
  player: PlayerState;
  active: boolean;
  inTokyo: boolean;
  isSelf: boolean;
  onInspect: () => void;
}) {
  const selectedMonster = playerMonster(player);
  const monster = monsterById(selectedMonster);
  return (
    <motion.article
      layout
      className={[
        "player-panel",
        active ? "is-active" : "",
        inTokyo ? "is-tokyo" : "",
        !player.alive ? "is-out" : ""
      ].join(" ")}
      style={{ "--monster-color": monster.colors[0] } as React.CSSProperties}
    >
      <div className="player-avatar">
        <MonsterArt monster={selectedMonster} size={70} defeated={!player.alive} />
        <span className={`connection-dot ${player.connected ? "" : "offline"}`} />
      </div>
      <div className="player-info">
        <div className="player-name-row">
          <strong>{player.name}</strong>
          {player.isHost && <Crown size={13} aria-label="房主" />}
          {player.isBot && <span className="bot-tag">AI</span>}
          {isSelf && <span className="you-tag">你</span>}
        </div>
        <span className="monster-title">{monster.name}</span>
        <div className="stats-row">
          <span className="level-stat">LV.{player.level}</span>
          <Stat icon={<Heart size={14} />} value={player.hp} tone="hp" label="生命" />
          <Stat icon={<Crown size={14} />} value={player.vp} tone="vp" label="胜利分" />
          <Stat icon={<Bolt size={14} />} value={player.energy} tone="energy" label="能量" />
        </div>
        {(player.poison > 0 || player.shrink > 0) && (
          <div className="token-row">
            {player.poison > 0 && <span className="token poison">毒 ×{player.poison}</span>}
            {player.shrink > 0 && <span className="token shrink">缩 ×{player.shrink}</span>}
          </div>
        )}
      </div>
      <button
        type="button"
        className="player-loadout-button"
        onClick={onInspect}
        title={`查看${player.name}的能力`}
        aria-label={`查看${player.name}的能力`}
      >
        <Layers3 />
        <span>{player.skills.length + player.cards.length}</span>
      </button>
      {active && <motion.span layoutId="active-turn" className="turn-pulse" />}
    </motion.article>
  );
}

function DieIcon({ face }: { face: DieFace }) {
  if (face === "energy") return <Bolt size={30} />;
  if (face === "smash") return <Swords size={30} />;
  if (face === "heal") return <Heart size={30} />;
  return <span className="die-number">{face}</span>;
}

function DiceTray({
  state,
  isTurn,
  onCommand
}: {
  state: ClientGameState;
  isTurn: boolean;
  onCommand: (command: GameCommand) => void;
}) {
  const canToggle = isTurn && state.phase === "rolling" && state.rollCount > 0;
  const unresolvedFaces = useMemo(
    () => [...new Set(state.dice.filter((die) => !die.resolved).map((die) => die.face))],
    [state.dice]
  );
  return (
    <section className="dice-console">
      <div className="dice-header">
        <div>
          <span className="eyebrow">战斗控制台</span>
          <h2>
            {state.phase === "rolling" && (isTurn ? "选择命运" : "等待掷骰")}
            {state.phase === "resolving" && (isTurn ? "选择结算顺序" : "正在结算")}
            {state.phase === "choosingSkill" && "怪兽正在进化"}
            {state.phase === "yielding" && "东京攻防决策"}
            {state.phase === "buying" && (isTurn ? "整备与升级" : "对手正在购买")}
          </h2>
        </div>
        <div className="roll-meter">
          {Array.from({ length: state.maxRolls }, (_, index) => (
            <span key={index} className={index < state.rollCount ? "filled" : ""} />
          ))}
        </div>
      </div>

      <div className="dice-row">
        {state.dice.map((die, index) => (
          <motion.button
            key={die.id}
            type="button"
            className={`die face-${die.face} ${die.locked ? "locked" : ""} ${
              die.resolved ? "resolved" : ""
            }`}
            disabled={!canToggle || die.resolved}
            onClick={() => onCommand({ type: "TOGGLE_DIE", dieId: die.id })}
            animate={
              state.phase === "rolling" && state.rollCount > 0 && !die.locked
                ? { rotate: [0, 7, -5, 0], y: [0, -5, 2, 0] }
                : {}
            }
            transition={{ delay: index * 0.035, duration: 0.45 }}
            aria-label={`${String(die.face)}${die.locked ? "，已保留" : ""}`}
          >
            <DieIcon face={die.face} />
            {die.locked && <span className="lock-mark"><Check size={11} /></span>}
          </motion.button>
        ))}
      </div>

      <div className="action-row">
        {state.phase === "rolling" && isTurn && (
          <>
            <button
              className="primary-action"
              onClick={() => onCommand({ type: "ROLL_DICE" })}
              disabled={state.rollCount >= state.maxRolls}
            >
              {state.rollCount === 0 ? <Dices /> : <RotateCcw />}
              {state.rollCount === 0 ? "掷骰" : `重掷 ${state.maxRolls - state.rollCount > 0 ? "" : "已用尽"}`}
            </button>
            <button
              className="secondary-action"
              onClick={() => onCommand({ type: "FINISH_ROLLING" })}
              disabled={state.rollCount === 0}
            >
              <Check /> 开始结算
            </button>
          </>
        )}
        {state.phase === "resolving" && isTurn && (
          <div className="resolve-actions">
            {unresolvedFaces.map((face) => (
              <button
                className={`resolve-chip face-${face}`}
                key={face}
                onClick={() =>
                  onCommand({
                    type: "RESOLVE_FACE",
                    face,
                    healMode: face === "heal" ? "hp" : undefined
                  })
                }
              >
                <DieIcon face={face} />
                结算
              </button>
            ))}
          </div>
        )}
        {state.phase === "buying" && isTurn && (
          <button className="primary-action end-turn" onClick={() => onCommand({ type: "END_TURN" })}>
            结束回合 <ChevronRight />
          </button>
        )}
        {!isTurn && state.phase !== "yielding" && (
          <div className="waiting-label">
            <Radio size={18} /> 同步对局中
          </div>
        )}
      </div>
    </section>
  );
}

function TokyoSlot({
  label,
  player,
  variant
}: {
  label: string;
  player?: PlayerState;
  variant: "city" | "bay";
}) {
  return (
    <div className={`tokyo-slot ${variant}`}>
      <div className="slot-label">
        <CircleDot size={14} />
        {label}
      </div>
      <AnimatePresence mode="wait">
        {player ? (
          <motion.div
            key={player.id}
            className="tokyo-monster"
            initial={{ scale: 0.4, y: 35, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 1.4, opacity: 0, filter: "blur(8px)" }}
            transition={{ type: "spring", stiffness: 230, damping: 18 }}
          >
            <MonsterArt monster={playerMonster(player)} size={210} variant="full" />
            <strong>{player.name}</strong>
            <span>{player.hp} HP</span>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="slot-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span>等待占领</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CardView({
  card,
  cost,
  affordable,
  disabled,
  onBuy
}: {
  card: PowerCard;
  cost: number;
  affordable: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  return (
    <motion.button
      layout
      whileHover={!disabled ? { y: -7, rotate: -0.6 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      className={`power-card accent-${card.accent}`}
      onClick={onBuy}
      disabled={disabled}
    >
      <div className="card-topline">
        <span className="card-type">{card.type === "keep" ? "持续" : "立即"}</span>
        <span className={`card-cost ${affordable ? "" : "unaffordable"}`}>
          {cost < card.cost && <del>{card.cost}</del>}
          <Bolt size={14} fill="currentColor" /> {cost}
        </span>
      </div>
      <h3>{card.name}</h3>
      <p>{card.text}</p>
      <span className="buy-label">
        <ShoppingCart size={15} /> 购买
      </span>
    </motion.button>
  );
}

function Lobby({
  state,
  identity,
  actionPending,
  onCommand,
  onAddBot,
  onRemoveBot,
  onLeave
}: {
  state: ClientGameState;
  identity: RoomIdentity;
  actionPending: boolean;
  onCommand: (command: GameCommand) => void;
  onAddBot: () => void;
  onRemoveBot: (playerId: string) => void;
  onLeave: () => void;
}) {
  const self = state.players.find((item) => item.id === identity.playerId);
  const [variant, setVariant] = useState(true);
  const selectedMonsters = new Map(
    state.players
      .filter((participant) => participant.monster)
      .map((participant) => [participant.monster!, participant])
  );
  const allReady =
    state.players.length >= 2 &&
    state.players.every(
      (participant) => participant.connected && participant.monster && participant.ready
    );
  const copyInvite = async () => {
    const url = `${location.origin}?room=${state.code}`;
    await navigator.clipboard.writeText(url);
  };
  return (
    <main className="lobby-screen">
      <div className="lobby-shell">
        <header className="lobby-header">
          <div className="lobby-brand">
            <CutoutImage src="/game-logo.png" alt="怪兽之夜" />
            <div>
              <span className="brand-kicker">COMBAT ASSEMBLY</span>
              <strong>东京作战集结区</strong>
            </div>
          </div>
          <section className="room-code-block">
            <span>房间代码</span>
            <strong>{state.code}</strong>
            <button onClick={copyInvite} title="复制邀请链接">
              <Copy size={17} />
              <span>复制链接</span>
            </button>
            <button
              className="leave-room-button"
              onClick={onLeave}
              title="退出房间"
              aria-label="退出房间"
            >
              <LogOut size={17} />
              <span>退出</span>
            </button>
          </section>
        </header>
        <div className="lobby-workspace">
          <section className="roster-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">ROOM ROSTER</span>
                <h2>作战成员</h2>
              </div>
              {self?.isHost && (
                <button
                  className="add-bot-button"
                  onClick={onAddBot}
                  disabled={actionPending || state.players.length >= 6}
                >
                  <UserPlus size={15} />
                  添加人机
                </button>
              )}
              <span className="player-count"><Users size={15} /> {state.players.length} / 6</span>
            </div>
            <div className="lobby-grid">
              {Array.from({ length: 6 }, (_, index) => {
                const participant = state.players[index];
                if (!participant) {
                  return (
                    <div className="lobby-player empty" key={index}>
                      <Users size={26} />
                      <span>等待玩家加入</span>
                    </div>
                  );
                }
                const monster = participant.monster
                  ? monsterById(participant.monster)
                  : null;
                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={[
                      "lobby-player",
                      participant.id === identity.playerId ? "is-self" : "",
                      participant.ready ? "is-ready" : ""
                    ].join(" ")}
                    style={
                      monster
                        ? ({ "--monster-color": monster.colors[0] } as React.CSSProperties)
                        : undefined
                    }
                    key={participant.id}
                  >
                    <div className="lobby-player-art">
                      {participant.monster ? (
                        <MonsterArt monster={participant.monster} size={150} variant="full" />
                      ) : (
                        <CircleDot size={35} />
                      )}
                    </div>
                    <div className="lobby-player-copy">
                      <div>
                        <strong>{participant.name}</strong>
                        {participant.isHost && <Crown size={13} aria-label="房主" />}
                        {participant.isBot && (
                          <span className="bot-tag"><Bot size={11} /> AI</span>
                        )}
                      </div>
                      <span>{monster ? monster.name : "正在选择怪兽"}</span>
                    </div>
                    <div className={`ready-state ${participant.ready ? "ready" : ""}`}>
                      {participant.ready ? <Check size={13} /> : <Clock3 size={13} />}
                      {participant.ready ? "已准备" : "未准备"}
                    </div>
                    {self?.isHost && participant.isBot && (
                      <button
                        className="remove-bot-button"
                        onClick={() => onRemoveBot(participant.id)}
                        title={`移除${participant.name}`}
                        aria-label={`移除${participant.name}`}
                      >
                        <Trash2 />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </section>

          <aside className="monster-select-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">KAIJU ASSIGNMENT</span>
                <h2>选择你的怪兽</h2>
              </div>
              <span className="selection-step">01 / 02</span>
            </div>
            <div className="lobby-monster-grid">
              {MONSTERS.map((monster) => {
                const owner = selectedMonsters.get(monster.id);
                const selected = self?.monster === monster.id;
                const unavailable = Boolean(owner && owner.id !== self?.id);
                return (
                  <button
                    key={monster.id}
                    className={selected ? "selected" : ""}
                    style={{ "--monster-color": monster.colors[0] } as React.CSSProperties}
                    disabled={actionPending || unavailable}
                    onClick={() =>
                      onCommand({ type: "SELECT_MONSTER", monster: monster.id })
                    }
                    aria-label={monster.name}
                  >
                    <MonsterArt monster={monster.id} size={112} />
                    <span>
                      <strong>{monster.name}</strong>
                      <small>{unavailable ? `${owner?.name} 已选择` : monster.title}</small>
                    </span>
                    {selected && <Check className="selected-check" />}
                  </button>
                );
              })}
            </div>

            <footer className="lobby-actions">
              {state.players.length === 2 && self?.isHost && (
                <label className="variant-toggle">
                  <input
                    type="checkbox"
                    checked={variant}
                    onChange={(event) => setVariant(event.target.checked)}
                  />
                  <span />
                  启用双人推荐规则
                </label>
              )}
              <button
                className={`ready-button ${self?.ready ? "is-ready" : ""}`}
                disabled={actionPending || !self?.monster}
                onClick={() => onCommand({ type: "SET_READY", ready: !self?.ready })}
              >
                {self?.ready ? <RotateCcw /> : <Check />}
                {self?.ready ? "取消准备" : "准备就绪"}
              </button>
              {self?.isHost ? (
                <button
                  className="primary-action launch"
                  disabled={actionPending || !allReady}
                  onClick={() => onCommand({ type: "START_GAME", twoPlayerVariant: variant })}
                >
                  <Swords /> 开始游戏
                </button>
              ) : (
                <div className="waiting-label">
                  <Radio size={18} />
                  {allReady ? "等待房主开始" : "等待全员准备"}
                </div>
              )}
              <p className="lobby-hint">
                {state.players.length < 2
                  ? "至少需要两名玩家"
                  : allReady
                    ? "全员就绪，可以开始"
                    : "每名玩家选择不同怪兽并准备"}
              </p>
            </footer>
          </aside>
        </div>
      </div>
    </main>
  );
}

function PlayerDetailsModal({
  player,
  onClose
}: {
  player: PlayerState;
  onClose: () => void;
}) {
  const monster = monsterById(playerMonster(player));
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        className="player-details-modal"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
      >
        <button className="icon-button modal-close" onClick={onClose} title="关闭"><X /></button>
        <header className="loadout-heading">
          <MonsterArt monster={playerMonster(player)} size={76} />
          <div>
            <span className="eyebrow">LV.{player.level} LOADOUT</span>
            <h2>{player.name}</h2>
            <p>{monster.name} · {monster.title}</p>
          </div>
        </header>
        <section className="loadout-section">
          <h3>进化技能 <span>{player.skills.length}</span></h3>
          <div className="loadout-list">
            {player.skills.length ? player.skills.map((skill) => (
              <article className="loadout-item skill" key={skill.id}>
                <span>LV.{skill.tier}</span>
                <div><strong>{skill.name}</strong><p>{skill.text}</p></div>
              </article>
            )) : <p className="loadout-empty">尚未学习进化技能</p>}
          </div>
        </section>
        <section className="loadout-section">
          <h3>保留卡牌 <span>{player.cards.length}</span></h3>
          <div className="loadout-list">
            {player.cards.length ? player.cards.map((card) => (
              <article className={`loadout-item card accent-${card.accent}`} key={card.id}>
                <span><Bolt size={12} />{card.cost}</span>
                <div><strong>{card.name}</strong><p>{card.text}</p></div>
              </article>
            )) : <p className="loadout-empty">没有保留卡牌</p>}
          </div>
        </section>
      </motion.div>
    </motion.div>
  );
}

function SkillChoiceModal({
  tier,
  poolSkillIds,
  claimedSkillIds,
  onChoose
}: {
  tier: 3 | 6 | 10;
  poolSkillIds: string[];
  claimedSkillIds: string[];
  onChoose: (skill: MonsterSkill) => void;
}) {
  const choices = getSkillChoices(tier, claimedSkillIds, poolSkillIds);
  return (
    <motion.div className="modal-backdrop skill-choice-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        className="skill-choice-modal"
        initial={{ scale: 0.82, y: 30 }}
        animate={{ scale: 1, y: 0 }}
      >
        <span className="eyebrow">SHARED EVOLUTION POOL</span>
        <h2>等级 {tier} · 选择公共技能</h2>
        <p className="skill-pool-status">本局剩余 {choices.length} 个技能，选择后不会补充</p>
        <div className="skill-choice-grid">
          {choices.map((skill) => (
            <button key={skill.id} onClick={() => onChoose(skill)}>
              <span>LV.{tier}</span>
              <Sparkles />
              <strong>{skill.name}</strong>
              <p>{skill.text}</p>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div className="modal-backdrop rules-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="rules-modal" initial={{ scale: 0.94, y: 18 }} animate={{ scale: 1, y: 0 }}>
        <button className="icon-button modal-close" onClick={onClose} title="关闭"><X /></button>
        <span className="eyebrow">COMBAT MANUAL</span>
        <h2>作战规则</h2>
        <div className="rules-grid">
          <section>
            <strong>胜利</strong>
            <p>达到 20 胜利分并存活，或成为最后一只存活的怪兽。</p>
          </section>
          <section>
            <strong>掷骰</strong>
            <p>每回合最多掷 3 次。可保留任意骰子，再重掷其余骰子。</p>
          </section>
          <section>
            <strong>数字与升级</strong>
            <p>三个相同数字可得分；至少三个 1 同时提升 2 级，至少三个 2 同时提升 1 级。</p>
          </section>
          <section>
            <strong>进化技能</strong>
            <p>怪兽从 0 级开始；达到或跨过 3、6、10 级时，从该等级尚未被选走的公共技能中选择一项。</p>
          </section>
          <section>
            <strong>攻击与治疗</strong>
            <p>攻击东京内或东京外的敌人。东京内无法用治疗骰恢复生命。</p>
          </section>
          <section>
            <strong>东京</strong>
            <p>进入东京获得奖励；只有受到攻击骰伤害后，才能选择撤离。</p>
          </section>
          <section>
            <strong>能量卡牌</strong>
            <p>立即卡购买后生效；保留卡持续生效，并对所有玩家公开。</p>
          </section>
          <section>
            <strong>双人规则</strong>
            <p>进入东京获得 1 能量；在东京开始回合获得 1 胜利分。</p>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TargetModal({
  state,
  card,
  selfId,
  onChoose,
  onClose
}: {
  state: ClientGameState;
  card: PowerCard;
  selfId: string;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        className="target-modal"
        initial={{ scale: 0.86, y: 25 }}
        animate={{ scale: 1, y: 0 }}
      >
        <button className="icon-button modal-close" onClick={onClose} title="关闭"><X /></button>
        <span className="eyebrow">选择目标</span>
        <h2>{card.name}</h2>
        <div className="target-list">
          {state.players.filter((p) => p.alive && p.id !== selfId).map((target) => (
            <button key={target.id} onClick={() => onChoose(target.id)}>
              <MonsterArt monster={playerMonster(target)} size={54} />
              <span><strong>{target.name}</strong><small>{target.hp} HP</small></span>
              <ChevronRight />
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function GameBoard({
  state,
  identity,
  connected,
  onCommand,
  onLeave
}: {
  state: ClientGameState;
  identity: RoomIdentity;
  connected: boolean;
  onCommand: (command: GameCommand) => void;
  onLeave: () => void;
}) {
  const [targetCard, setTargetCard] = useState<PowerCard | null>(null);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const self = state.players.find((item) => item.id === identity.playerId)!;
  const current = state.players.find((item) => item.id === state.currentPlayerId);
  const city = state.players.find((item) => item.id === state.tokyoCity);
  const bay = state.players.find((item) => item.id === state.tokyoBay);
  const isTurn = state.currentPlayerId === identity.playerId;
  const mustYield = state.phase === "yielding" && state.pendingYields[0] === identity.playerId;
  const mustChooseSkill =
    state.phase === "choosingSkill" &&
    state.pendingSkillPlayerId === identity.playerId &&
    state.pendingSkillTier;
  const inspectedPlayer = state.players.find((player) => player.id === inspectedPlayerId);
  const latestLog = state.log[state.log.length - 1];
  const [combatVfx, setCombatVfx] = useState<{
    key: number;
    kind: CombatVfxKind;
    monster: MonsterId;
  } | null>(null);
  const seenLogId = useRef(latestLog?.id);

  useEffect(() => {
    if (!latestLog || latestLog.id === seenLogId.current) return;
    seenLogId.current = latestLog.id;

    let kind: CombatVfxKind | null = null;
    if (latestLog.tone === "energy") kind = "electric";
    else if (/攻击|伤害|失去|淘汰|轰击/.test(latestLog.text)) kind = "impact";
    else if (latestLog.tone === "danger") kind = "explosion";
    if (!kind) return;

    setCombatVfx({
      key: latestLog.id,
      kind,
      monster: current ? playerMonster(current) : playerMonster(self)
    });
  }, [current?.monster, latestLog, self.monster]);

  const buy = (card: PowerCard) => {
    if (card.effects.some((effect) => effect.kind === "damageTarget")) setTargetCard(card);
    else onCommand({ type: "BUY_CARD", cardId: card.id });
  };

  return (
    <main className="game-screen">
      <header className="game-header">
        <div className="compact-brand">
          <CutoutImage src="/game-logo.png" alt="" />
          <span><strong>怪兽之夜</strong><small>NEON KAIJU ARENA</small></span>
        </div>
        <div className="turn-banner">
          <span>ROUND {state.round}</span>
          <strong>{current ? `${current.name} 的回合` : "对局结束"}</strong>
        </div>
        <div className="room-status">
          <span className={connected ? "online" : "offline"}>
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
            {connected ? "已同步" : "重连中"}
          </span>
          <code>{state.code}</code>
          <button className="header-icon-button" onClick={onLeave} title="退出对局" aria-label="退出对局">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <section className="player-strip">
        {state.players.map((participant) => (
          <PlayerPanel
            key={participant.id}
            player={participant}
            active={state.currentPlayerId === participant.id}
            inTokyo={participant.id === state.tokyoCity || participant.id === state.tokyoBay}
            isSelf={participant.id === identity.playerId}
            onInspect={() => setInspectedPlayerId(participant.id)}
          />
        ))}
      </section>

      <div className="board-layout">
        <section className="arena">
          <div className="scanline" />
          <AnimatePresence>
            {combatVfx && (
              <CombatVfx
                effectKey={combatVfx.key}
                kind={combatVfx.kind}
                monster={combatVfx.monster}
              />
            )}
          </AnimatePresence>
          <div className="arena-title">
            <span>TOKYO COMBAT ZONE</span>
            <strong>东京争夺区</strong>
          </div>
          <div className="tokyo-slots">
            <TokyoSlot label="东京城" player={city} variant="city" />
            {state.players.filter((item) => item.alive).length >= 5 && (
              <TokyoSlot label="东京湾" player={bay} variant="bay" />
            )}
          </div>
          <div className="arena-rings"><i /><i /><i /></div>
        </section>

        <aside className="market">
          <div className="market-heading">
            <div><span className="eyebrow">升级市场</span><h2>能量卡牌</h2></div>
            <span className="deck-count">{state.deckSize} <small>牌库</small></span>
          </div>
          <div className="card-stack">
            {state.market.map((card) => {
              const cost = getCardCost(self, card);
              return (
                <CardView
                  key={card.id}
                  card={card}
                  cost={cost}
                  affordable={self.energy >= cost}
                  disabled={!isTurn || state.phase !== "buying" || self.energy < cost}
                  onBuy={() => buy(card)}
                />
              );
            })}
          </div>
          <button
            className="sweep-button"
            disabled={!isTurn || state.phase !== "buying" || self.energy < 2}
            onClick={() => onCommand({ type: "SWEEP_MARKET" })}
          >
            <RefreshCcw size={17} /> 刷新市场 <span><Bolt size={13} />2</span>
          </button>
        </aside>
      </div>

      <div className="bottom-layout">
        <DiceTray state={state} isTurn={isTurn} onCommand={onCommand} />
        <aside className="combat-log">
          <div className="log-title"><Activity size={16} />战况记录</div>
          <div className="log-list">
            {[...state.log].reverse().slice(0, 5).map((entry) => (
              <motion.p
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                key={entry.id}
                className={entry.tone}
              >
                {entry.text}
              </motion.p>
            ))}
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {mustYield && (
          <motion.div
            className="decision-bar"
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
          >
            <ShieldAlert />
            <div><strong>东京正在燃烧</strong><span>你受到攻击，是否撤离？</span></div>
            <button onClick={() => onCommand({ type: "YIELD_TOKYO", yield: false })}>坚守</button>
            <button className="danger" onClick={() => onCommand({ type: "YIELD_TOKYO", yield: true })}>
              <DoorOpen size={17} /> 撤离
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inspectedPlayer && (
          <PlayerDetailsModal
            player={inspectedPlayer}
            onClose={() => setInspectedPlayerId(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mustChooseSkill && (
          <SkillChoiceModal
            tier={mustChooseSkill}
            poolSkillIds={state.skillPool[mustChooseSkill]}
            claimedSkillIds={state.players.flatMap((player) =>
              player.skills.map((skill) => skill.id)
            )}
            onChoose={(skill) => onCommand({ type: "CHOOSE_SKILL", skillId: skill.id })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {state.phase === "finished" && (
          <motion.div className="victory-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
              <Crown />
              <span>战斗结束</span>
              <h1>
                {state.winnerIds.length
                  ? `${state.winnerIds.map((id) => state.players.find((p) => p.id === id)?.name).join("、")} 获胜`
                  : "东京化为废墟"}
              </h1>
              <p>{state.winnerIds.length ? "新的城市霸主已经诞生" : "没有怪兽活着离开"}</p>
              <button className="primary-action" onClick={onLeave}>返回首页</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {targetCard && (
          <TargetModal
            state={state}
            card={targetCard}
            selfId={identity.playerId}
            onClose={() => setTargetCard(null)}
            onChoose={(targetId) => {
              onCommand({ type: "BUY_CARD", cardId: targetCard.id, targetId });
              setTargetCard(null);
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function Welcome({
  connected,
  onEnter
}: {
  connected: boolean;
  onEnter: (mode: "create" | "join", name: string, code?: string) => void;
}) {
  const queryRoom = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  const [mode, setMode] = useState<"create" | "join">(queryRoom ? "join" : "create");
  const [name, setName] = useState("");
  const [code, setCode] = useState(queryRoom);

  return (
    <main className="welcome-screen">
      <div className="welcome-noise" />
      <section className="welcome-content">
        <div className="brand-lockup">
          <span className="brand-kicker">LOCAL MULTIPLAYER // 2–6 PLAYERS</span>
          <CutoutImage className="game-logo" src="/game-logo.png" alt="怪兽之夜" />
          <p>巨兽已抵达东京。建立房间，召集你的对手。</p>
        </div>

        <div className="welcome-controls">
          <div className="mode-tabs">
            <button
              className={`art-button create ${mode === "create" ? "active" : ""}`}
              onClick={() => setMode("create")}
            >
              <Sparkles />
              <span><strong>创建房间</strong><small>CREATE ROOM</small></span>
            </button>
            <button
              className={`art-button join ${mode === "join" ? "active" : ""}`}
              onClick={() => setMode("join")}
            >
              <LogIn />
              <span><strong>加入房间</strong><small>JOIN ROOM</small></span>
            </button>
          </div>

          <div className="entry-form">
            <label>
              <span>玩家代号</span>
              <div className="name-input-row">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={18}
                  placeholder="输入昵称"
                />
                <button
                  type="button"
                  className="random-name-button"
                  onClick={() => setName((current) => randomPlayerName(current))}
                  title="随机生成昵称"
                  aria-label="随机生成昵称"
                >
                  <Dices />
                </button>
              </div>
            </label>
            {mode === "join" && (
              <label>
                <span>房间代码</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  maxLength={5}
                  placeholder="ABCDE"
                  className="room-input"
                />
              </label>
            )}
          </div>

          <button
            className={`enter-button art-button ${mode}`}
            disabled={!connected || !name.trim() || (mode === "join" && code.length !== 5)}
            onClick={() => onEnter(mode, name.trim(), code)}
          >
            {mode === "create" ? <Sparkles /> : <LogIn />}
            <span>
              <strong>{mode === "create" ? "建立作战房间" : "进入作战房间"}</strong>
              <small>{mode === "create" ? "OPEN COMBAT LINK" : "CONNECT TO ROOM"}</small>
            </span>
          </button>
          <div className={`server-indicator ${connected ? "" : "offline"}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connected ? "作战服务器在线" : "正在连接作战服务器"}
          </div>
        </div>
      </section>
      <div className="hero-copy">
        <span>TOKYO // NIGHT 01</span>
        <strong>占领东京</strong>
        <small>20 分，或者成为最后的幸存者。</small>
      </div>
    </main>
  );
}

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [identity, setIdentity] = useState<RoomIdentity | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as RoomIdentity) : null;
    } catch {
      return null;
    }
  });
  const [state, setState] = useState<ClientGameState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const audio = useGameAudio(state);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as RoomIdentity;
        socket.emit("resumeRoom", parsed, (response) => {
          if (!response.ok) {
            localStorage.removeItem(STORAGE_KEY);
            setIdentity(null);
            setState(null);
          }
        });
      }
    };
    const onDisconnect = () => {
      setConnected(false);
      setActionPending(false);
    };
    const onState = (next: ClientGameState) => {
      setState(next);
      setActionPending(false);
    };
    const onError = (message: string) => showToast(message);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("state", onState);
    socket.on("error", onError);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state", onState);
      socket.off("error", onError);
    };
  }, [showToast]);

  const enterRoom = (
    mode: "create" | "join",
    name: string,
    code?: string
  ) => {
    const event = mode === "create" ? "createRoom" : "joinRoom";
    const payload = mode === "create" ? { name } : { name, code: code! };
    socket.emit(event as "createRoom", payload as never, (response: SocketAck<RoomIdentity>) => {
      if (!response.ok || !response.data) {
        showToast(response.error ?? "无法进入房间");
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(response.data));
      setIdentity(response.data);
    });
  };

  const sendCommand = useCallback(
    (command: GameCommand) => {
      if (!identity || !state || actionPending) return;
      setActionPending(true);
      const envelope: CommandEnvelope = {
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        command
      };
      socket.emit("command", envelope, (response) => {
        if (!response.ok) {
          setActionPending(false);
          showToast(response.error ?? "操作失败");
        }
      });
    },
    [actionPending, identity, showToast, state]
  );

  const addBot = useCallback(() => {
    if (actionPending) return;
    setActionPending(true);
    socket.emit("addBot", (response) => {
      if (!response.ok) {
        setActionPending(false);
        showToast(response.error ?? "添加人机失败");
      }
    });
  }, [actionPending, showToast]);

  const removeBotPlayer = useCallback(
    (playerId: string) => {
      if (actionPending) return;
      setActionPending(true);
      socket.emit("removeBot", { playerId }, (response) => {
        if (!response.ok) {
          setActionPending(false);
          showToast(response.error ?? "移除人机失败");
        }
      });
    },
    [actionPending, showToast]
  );

  const leaveRoom = useCallback(() => {
    if (
      state &&
      state.phase !== "lobby" &&
      state.phase !== "finished" &&
      !window.confirm("退出后将由人机接管你的怪兽，确定退出？")
    ) {
      return;
    }
    socket.emit("leaveRoom", (response) => {
      if (!response.ok) {
        showToast(response.error ?? "退出房间失败");
        return;
      }
      localStorage.removeItem(STORAGE_KEY);
      history.replaceState({}, "", location.pathname);
      setIdentity(null);
      setState(null);
    });
  }, [showToast, state?.phase]);

  return (
    <>
      <div className="global-controls">
        <button
          type="button"
          className="rules-toggle"
          onClick={() => setRulesOpen(true)}
        >
          <BookOpen />
          <span>规则</span>
        </button>
        <button
          type="button"
          className="audio-toggle"
          onClick={audio.toggle}
          title={audio.enabled ? "关闭声音" : "开启声音"}
          aria-label={audio.enabled ? "关闭声音" : "开启声音"}
          aria-pressed={audio.enabled}
        >
          {audio.enabled ? <Volume2 /> : <VolumeX />}
        </button>
      </div>
      {!identity || !state ? (
        <Welcome connected={connected} onEnter={enterRoom} />
      ) : state.phase === "lobby" ? (
        <Lobby
          state={state}
          identity={identity}
          actionPending={actionPending}
          onCommand={sendCommand}
          onAddBot={addBot}
          onRemoveBot={removeBotPlayer}
          onLeave={leaveRoom}
        />
      ) : (
        <GameBoard
          state={state}
          identity={identity}
          connected={connected}
          onCommand={sendCommand}
          onLeave={leaveRoom}
        />
      )}
      <AnimatePresence>
        {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
          >
            <ShieldAlert size={18} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
