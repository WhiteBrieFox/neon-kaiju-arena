import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
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
  Radio,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  ShoppingCart,
  Skull,
  Sparkles,
  Swords,
  Users,
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
  MonsterId,
  PlayerState,
  PowerCard,
  RoomIdentity,
  ServerToClientEvents,
  SocketAck
} from "../shared/types";
import { MONSTERS } from "../shared/types";

const STORAGE_KEY = "neon-kaiju-session";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const socket: GameSocket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionDelayMax: 2000
});

function monsterById(id: MonsterId) {
  return MONSTERS.find((monster) => monster.id === id) ?? MONSTERS[0];
}

function MonsterArt({
  monster,
  size = 92,
  defeated = false
}: {
  monster: MonsterId;
  size?: number;
  defeated?: boolean;
}) {
  return (
    <svg
      className={`monster-art ${defeated ? "is-defeated" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-label={monsterById(monster).name}
    >
      <use href={`/monsters.svg#${monster}`} />
    </svg>
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
  isSelf
}: {
  player: PlayerState;
  active: boolean;
  inTokyo: boolean;
  isSelf: boolean;
}) {
  const monster = monsterById(player.monster);
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
        <MonsterArt monster={player.monster} size={64} defeated={!player.alive} />
        <span className={`connection-dot ${player.connected ? "" : "offline"}`} />
      </div>
      <div className="player-info">
        <div className="player-name-row">
          <strong>{player.name}</strong>
          {player.isHost && <Crown size={13} aria-label="房主" />}
          {isSelf && <span className="you-tag">你</span>}
        </div>
        <span className="monster-title">{monster.name}</span>
        <div className="stats-row">
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
            <MonsterArt monster={player.monster} size={126} />
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
  affordable,
  disabled,
  onBuy
}: {
  card: PowerCard;
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
          <Bolt size={14} fill="currentColor" /> {card.cost}
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
  onCommand
}: {
  state: ClientGameState;
  identity: RoomIdentity;
  onCommand: (command: GameCommand) => void;
}) {
  const self = state.players.find((item) => item.id === identity.playerId);
  const [variant, setVariant] = useState(true);
  const copyInvite = async () => {
    const url = `${location.origin}?room=${state.code}`;
    await navigator.clipboard.writeText(url);
  };
  return (
    <main className="lobby-screen">
      <div className="lobby-shell">
        <header className="brand-lockup">
          <span className="brand-kicker">NEON DISTRICT // COMBAT LINK</span>
          <h1>怪兽之夜</h1>
          <p>集结完成后，由房主启动东京争夺战。</p>
        </header>
        <section className="room-code-block">
          <span>房间代码</span>
          <strong>{state.code}</strong>
          <button onClick={copyInvite} title="复制邀请链接"><Copy size={18} />复制链接</button>
        </section>
        <section className="lobby-grid">
          {Array.from({ length: 6 }, (_, index) => {
            const participant = state.players[index];
            return participant ? (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.86 }}
                animate={{ opacity: 1, scale: 1 }}
                className="lobby-player"
                key={participant.id}
              >
                <MonsterArt monster={participant.monster} size={118} />
                <strong>{participant.name}</strong>
                <span>{monsterById(participant.monster).name}</span>
                {participant.isHost && <i>HOST</i>}
              </motion.div>
            ) : (
              <div className="lobby-player empty" key={index}>
                <Users size={30} />
                <span>等待玩家</span>
              </div>
            );
          })}
        </section>
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
          {self?.isHost ? (
            <button
              className="primary-action launch"
              disabled={state.players.length < 2}
              onClick={() => onCommand({ type: "START_GAME", twoPlayerVariant: variant })}
            >
              <Swords /> 启动对局
            </button>
          ) : (
            <div className="waiting-label"><Radio size={18} /> 等待房主开始</div>
          )}
        </footer>
      </div>
    </main>
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
              <MonsterArt monster={target.monster} size={54} />
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
  onCommand
}: {
  state: ClientGameState;
  identity: RoomIdentity;
  connected: boolean;
  onCommand: (command: GameCommand) => void;
}) {
  const [targetCard, setTargetCard] = useState<PowerCard | null>(null);
  const self = state.players.find((item) => item.id === identity.playerId)!;
  const current = state.players.find((item) => item.id === state.currentPlayerId);
  const city = state.players.find((item) => item.id === state.tokyoCity);
  const bay = state.players.find((item) => item.id === state.tokyoBay);
  const isTurn = state.currentPlayerId === identity.playerId;
  const mustYield = state.phase === "yielding" && state.pendingYields[0] === identity.playerId;

  const buy = (card: PowerCard) => {
    if (card.effects.some((effect) => effect.kind === "damageTarget")) setTargetCard(card);
    else onCommand({ type: "BUY_CARD", cardId: card.id });
  };

  return (
    <main className="game-screen">
      <header className="game-header">
        <div className="compact-brand">
          <Swords />
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
          />
        ))}
      </section>

      <div className="board-layout">
        <section className="arena">
          <div className="scanline" />
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
            {state.market.map((card) => (
              <CardView
                key={card.id}
                card={card}
                affordable={self.energy >= card.cost}
                disabled={!isTurn || state.phase !== "buying" || self.energy < card.cost}
                onBuy={() => buy(card)}
              />
            ))}
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
              <button className="primary-action" onClick={() => location.reload()}>返回大厅</button>
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
  onEnter: (mode: "create" | "join", name: string, monster: MonsterId, code?: string) => void;
}) {
  const queryRoom = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  const [mode, setMode] = useState<"create" | "join">(queryRoom ? "join" : "create");
  const [name, setName] = useState("");
  const [code, setCode] = useState(queryRoom);
  const [monster, setMonster] = useState<MonsterId>("voltclaw");

  return (
    <main className="welcome-screen">
      <div className="welcome-noise" />
      <section className="welcome-panel">
        <div className="brand-lockup">
          <span className="brand-kicker">LOCAL MULTIPLAYER // 2–6 PLAYERS</span>
          <h1>怪兽之夜</h1>
          <p>掷出你的野心，占领城市核心。</p>
        </div>

        <div className="mode-tabs">
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>
            创建房间
          </button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>
            加入房间
          </button>
        </div>

        <div className="entry-form">
          <label>
            <span>玩家代号</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={18}
              placeholder="输入昵称"
            />
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

        <div className="monster-picker">
          <span>选择怪兽</span>
          <div className="monster-grid">
            {MONSTERS.map((item) => (
              <button
                key={item.id}
                className={monster === item.id ? "selected" : ""}
                style={{ "--monster-color": item.colors[0] } as React.CSSProperties}
                onClick={() => setMonster(item.id)}
              >
                <MonsterArt monster={item.id} size={88} />
                <strong>{item.name}</strong>
                <small>{item.title}</small>
                {monster === item.id && <Check className="selected-check" />}
              </button>
            ))}
          </div>
        </div>

        <button
          className="primary-action enter-button"
          disabled={!connected || !name.trim() || (mode === "join" && code.length !== 5)}
          onClick={() => onEnter(mode, name.trim(), monster, code)}
        >
          {mode === "create" ? <Sparkles /> : <LogIn />}
          {mode === "create" ? "建立战斗链路" : "进入战场"}
        </button>
        <div className={`server-indicator ${connected ? "" : "offline"}`}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? "本地服务器在线" : "正在连接本地服务器"}
        </div>
      </section>
      <aside className="welcome-art">
        <div className="hero-monsters">
          <MonsterArt monster="apex" size={330} />
          <MonsterArt monster="voltclaw" size={390} />
          <MonsterArt monster="cosmocat" size={300} />
        </div>
        <div className="hero-copy">
          <span>SEASON 01</span>
          <strong>占领东京</strong>
          <small>20 分，或者成为最后的幸存者。</small>
        </div>
      </aside>
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
  const toastTimer = useRef<number | null>(null);

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
    const onDisconnect = () => setConnected(false);
    const onState = (next: ClientGameState) => setState(next);
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
    monster: MonsterId,
    code?: string
  ) => {
    const event = mode === "create" ? "createRoom" : "joinRoom";
    const payload = mode === "create" ? { name, monster } : { name, monster, code: code! };
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
      if (!identity || !state) return;
      const envelope: CommandEnvelope = {
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        command
      };
      socket.emit("command", envelope, (response) => {
        if (!response.ok) showToast(response.error ?? "操作失败");
      });
    },
    [identity, showToast, state]
  );

  return (
    <>
      {!identity || !state ? (
        <Welcome connected={connected} onEnter={enterRoom} />
      ) : state.phase === "lobby" ? (
        <Lobby state={state} identity={identity} onCommand={sendCommand} />
      ) : (
        <GameBoard
          state={state}
          identity={identity}
          connected={connected}
          onCommand={sendCommand}
        />
      )}
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
