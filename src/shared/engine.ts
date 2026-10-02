import { createDeck } from "./cards";
import type {
  CardEffect,
  ClientGameState,
  DieFace,
  DieState,
  GameCommand,
  GameState,
  MonsterId,
  PlayerState,
  PowerCard
} from "./types";

export class RuleError extends Error {}

const faces: DieFace[] = [1, 2, 3, "energy", "smash", "heal"];

function nextRandom(state: GameState): number {
  let x = state.rngState | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rngState = x >>> 0;
  return state.rngState / 0x1_0000_0000;
}

function shuffle<T>(state: GameState, values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function log(
  state: GameState,
  text: string,
  tone: "neutral" | "good" | "danger" | "energy" = "neutral"
) {
  state.log.push({
    id: (state.log.at(-1)?.id ?? 0) + 1,
    text,
    tone
  });
  state.log = state.log.slice(-80);
}

function player(state: GameState, playerId: string): PlayerState {
  const result = state.players.find((item) => item.id === playerId);
  if (!result) throw new RuleError("玩家不存在");
  return result;
}

function currentPlayer(state: GameState): PlayerState {
  if (!state.currentPlayerId) throw new RuleError("当前没有行动玩家");
  return player(state, state.currentPlayerId);
}

function assertTurn(state: GameState, playerId: string) {
  if (state.currentPlayerId !== playerId) throw new RuleError("还没有轮到你");
  if (!player(state, playerId).alive) throw new RuleError("已淘汰玩家不能行动");
}

function passiveAmount(target: PlayerState, passive: Extract<CardEffect, { kind: "passive" }>["passive"]) {
  return target.cards.reduce(
    (sum, card) =>
      sum +
      card.effects.reduce(
        (cardSum, effect) =>
          effect.kind === "passive" && effect.passive === passive
            ? cardSum + effect.amount
            : cardSum,
        0
      ),
    0
  );
}

function isInTokyo(state: GameState, playerId: string) {
  return state.tokyoCity === playerId || state.tokyoBay === playerId;
}

function refillMarket(state: GameState) {
  while (state.market.length < 3 && state.deck.length > 0) {
    const card = state.deck.shift();
    if (card) state.market.push(card);
  }
}

function closeTokyoBayIfNeeded(state: GameState) {
  const alive = state.players.filter((item) => item.alive).length;
  if (alive > 4 || !state.tokyoBay) return;
  const bayPlayer = player(state, state.tokyoBay);
  if (!state.tokyoCity) {
    state.tokyoCity = bayPlayer.id;
    log(state, `${bayPlayer.name} 从东京湾转移到东京城`);
  } else {
    log(state, `${bayPlayer.name} 因东京湾关闭而离开东京`);
  }
  state.tokyoBay = null;
}

function eliminate(state: GameState, target: PlayerState) {
  if (!target.alive || target.hp > 0) return;
  target.hp = 0;
  target.alive = false;
  target.energy = 0;
  target.cards = [];
  target.poison = 0;
  target.shrink = 0;
  if (state.tokyoCity === target.id) state.tokyoCity = null;
  if (state.tokyoBay === target.id) state.tokyoBay = null;
  state.pendingYields = state.pendingYields.filter((id) => id !== target.id);
  log(state, `${target.name} 被淘汰`, "danger");
  closeTokyoBayIfNeeded(state);
}

function loseHp(state: GameState, target: PlayerState, amount: number, reason: string) {
  if (!target.alive || amount <= 0) return;
  target.hp = Math.max(0, target.hp - amount);
  log(state, `${target.name} ${reason}，失去 ${amount} 点生命`, "danger");
  eliminate(state, target);
}

function gain(
  state: GameState,
  target: PlayerState,
  resource: "hp" | "energy" | "vp",
  amount: number
) {
  if (resource === "hp") target.hp = Math.min(target.maxHp, target.hp + amount);
  if (resource === "energy") target.energy += amount;
  if (resource === "vp") target.vp += amount;
  const labels = { hp: "生命", energy: "能量", vp: "胜利分" };
  log(state, `${target.name} 获得 ${amount} 点${labels[resource]}`, resource === "energy" ? "energy" : "good");
}

function activeDiceCount(state: GameState, target: PlayerState) {
  const bonus = passiveAmount(target, "extraDie");
  return Math.max(1, 6 + bonus - target.shrink);
}

function maxRollCount(target: PlayerState) {
  return 3 + passiveAmount(target, "extraReroll");
}

function makeDice(count: number): DieState[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    face: 1 as const,
    locked: false,
    resolved: false
  }));
}

function startTurn(state: GameState, target: PlayerState) {
  state.currentPlayerId = target.id;
  state.phase = "rolling";
  state.rollCount = 0;
  state.maxRolls = maxRollCount(target);
  state.dice = makeDice(activeDiceCount(state, target));
  state.pendingYields = [];
  state.resumePhase = null;
  if (isInTokyo(state, target.id)) {
    const base = state.twoPlayerVariant && state.players.filter((item) => item.alive).length === 2 ? 1 : 2;
    gain(state, target, "vp", base + passiveAmount(target, "tokyoBonus"));
  }
  log(state, `第 ${state.round} 轮：${target.name} 的回合`);
}

function enterTokyo(state: GameState, target: PlayerState) {
  if (!target.alive || isInTokyo(state, target.id)) return;
  const alive = state.players.filter((item) => item.alive).length;
  let entered = false;
  if (!state.tokyoCity) {
    state.tokyoCity = target.id;
    entered = true;
    log(state, `${target.name} 占领东京城`, "good");
  } else if (alive >= 5 && !state.tokyoBay) {
    state.tokyoBay = target.id;
    entered = true;
    log(state, `${target.name} 占领东京湾`, "good");
  }
  if (entered) {
    if (state.twoPlayerVariant && alive === 2) gain(state, target, "energy", 1);
    else gain(state, target, "vp", 1);
  }
}

function allDiceResolved(state: GameState) {
  return state.dice.every((die) => die.resolved);
}

function markFaceResolved(state: GameState, face: DieFace, oneOnly = false) {
  const matching = state.dice.filter((die) => !die.resolved && die.face === face);
  if (oneOnly) {
    if (matching[0]) matching[0].resolved = true;
  } else {
    matching.forEach((die) => {
      die.resolved = true;
    });
  }
  return oneOnly ? Math.min(1, matching.length) : matching.length;
}

function finishResolutionIfReady(state: GameState) {
  if (!allDiceResolved(state) || state.pendingYields.length > 0) return;
  enterTokyo(state, currentPlayer(state));
  state.phase = "buying";
}

function attackTargets(state: GameState, attackerId: string) {
  if (isInTokyo(state, attackerId)) {
    return state.players.filter((item) => item.alive && !isInTokyo(state, item.id));
  }
  return state.players.filter((item) => item.alive && isInTokyo(state, item.id));
}

function applyAttack(state: GameState, attacker: PlayerState, count: number) {
  if (count <= 0) return;
  const total = count + passiveAmount(attacker, "attackBonus");
  const targets = attackTargets(state, attacker.id);
  targets.forEach((target) => loseHp(state, target, total, `受到 ${attacker.name} 的攻击`));

  if (passiveAmount(attacker, "energyOnSmash") > 0 && targets.length > 0) {
    gain(state, attacker, "energy", passiveAmount(attacker, "energyOnSmash"));
  }
  if (passiveAmount(attacker, "poison") > 0) {
    targets.filter((target) => target.alive).forEach((target) => {
      target.poison += passiveAmount(attacker, "poison");
      log(state, `${target.name} 获得中毒标记`, "danger");
    });
  }
  if (passiveAmount(attacker, "shrink") > 0) {
    targets.filter((target) => target.alive).forEach((target) => {
      target.shrink += passiveAmount(attacker, "shrink");
      log(state, `${target.name} 获得缩小标记`, "danger");
    });
  }
  if (passiveAmount(attacker, "fireBreathing") > 0) {
    const alive = state.players.filter((item) => item.alive);
    const index = alive.findIndex((item) => item.id === attacker.id);
    const neighbors = new Set<string>();
    if (alive.length === 2) {
      neighbors.add(alive[(index + 1) % alive.length].id);
    } else if (alive.length > 2) {
      neighbors.add(alive[(index - 1 + alive.length) % alive.length].id);
      neighbors.add(alive[(index + 1) % alive.length].id);
    }
    neighbors.forEach((id) =>
      loseHp(state, player(state, id), passiveAmount(attacker, "fireBreathing"), "受到灼热吐息")
    );
  }

  state.pendingYields = targets
    .filter((target) => target.alive && isInTokyo(state, target.id))
    .map((target) => target.id);
  if (state.pendingYields.length > 0) {
    state.resumePhase = "resolving";
    state.phase = "yielding";
  }
}

function applyCardEffect(
  state: GameState,
  buyer: PlayerState,
  effect: CardEffect,
  targetId?: string
) {
  if (effect.kind === "gain") {
    if (effect.resource === "hp" && !buyer.alive) return;
    gain(state, buyer, effect.resource, effect.amount);
  } else if (effect.kind === "damageOthers") {
    state.players
      .filter((item) => item.alive && item.id !== buyer.id)
      .forEach((target) => loseHp(state, target, effect.amount, `受到${buyer.name}的卡牌伤害`));
  } else if (effect.kind === "damageTarget") {
    if (!targetId || targetId === buyer.id) throw new RuleError("请选择其他存活怪兽");
    const target = player(state, targetId);
    if (!target.alive) throw new RuleError("目标已经被淘汰");
    loseHp(state, target, effect.amount, `受到${buyer.name}的卡牌伤害`);
  } else if (effect.kind === "extraTurn") {
    state.extraTurn = true;
  } else if (effect.kind === "passive" && effect.passive === "maxHp") {
    buyer.maxHp += effect.amount;
  }
}

function hasTargetEffect(card: PowerCard) {
  return card.effects.some((effect) => effect.kind === "damageTarget");
}

function winnerCheck(state: GameState) {
  const alive = state.players.filter((item) => item.alive);
  if (alive.length === 0) {
    state.phase = "finished";
    state.winnerIds = [];
    log(state, "所有怪兽同时被淘汰，本局无人获胜", "danger");
    return true;
  }
  const scoringWinners = alive.filter((item) => item.vp >= 20);
  if (scoringWinners.length > 0 || alive.length === 1) {
    state.phase = "finished";
    state.winnerIds = scoringWinners.length > 0 ? scoringWinners.map((item) => item.id) : [alive[0].id];
    log(
      state,
      `${state.winnerIds.map((id) => player(state, id).name).join("、")} 赢得对局！`,
      "good"
    );
    return true;
  }
  return false;
}

export function createGame(
  id: string,
  code: string,
  players: Array<Pick<PlayerState, "id" | "name" | "monster" | "isHost">>,
  seed = Date.now()
): GameState {
  const state: GameState = {
    id,
    code,
    revision: 0,
    phase: "lobby",
    round: 1,
    players: players.map((item) => ({
      ...item,
      ready: item.monster !== null,
      hp: 10,
      maxHp: 10,
      vp: 0,
      energy: 0,
      alive: true,
      connected: true,
      cards: [],
      poison: 0,
      shrink: 0
    })),
    currentPlayerId: null,
    firstPlayerId: null,
    tokyoCity: null,
    tokyoBay: null,
    twoPlayerVariant: true,
    dice: [],
    rollCount: 0,
    maxRolls: 3,
    deck: [],
    discard: [],
    market: [],
    pendingYields: [],
    resumePhase: null,
    winnerIds: [],
    extraTurn: false,
    log: [],
    rngState: seed >>> 0 || 1
  };
  return state;
}

export function addPlayer(
  state: GameState,
  data: Pick<PlayerState, "id" | "name" | "monster" | "isHost">
) {
  if (state.phase !== "lobby") throw new RuleError("游戏已经开始");
  if (state.players.length >= 6) throw new RuleError("房间已满");
  if (data.monster && state.players.some((item) => item.monster === data.monster)) {
    throw new RuleError("这个怪兽已经被选择");
  }
  state.players.push({
    ...data,
    ready: data.monster !== null,
    hp: 10,
    maxHp: 10,
    vp: 0,
    energy: 0,
    alive: true,
    connected: true,
    cards: [],
    poison: 0,
    shrink: 0
  });
  state.revision += 1;
  log(state, `${data.name} 加入了房间`);
}

export function setConnected(state: GameState, playerId: string, connected: boolean) {
  const target = state.players.find((item) => item.id === playerId);
  if (!target) return;
  target.connected = connected;
  if (!connected && state.phase === "lobby") target.ready = false;
  state.revision += 1;
}

export function dispatch(state: GameState, playerId: string, command: GameCommand): GameState {
  if (state.phase === "finished") throw new RuleError("游戏已经结束");
  const actor = player(state, playerId);

  if (command.type === "SELECT_MONSTER") {
    if (state.phase !== "lobby") throw new RuleError("游戏已经开始");
    if (
      state.players.some(
        (item) => item.id !== actor.id && item.monster === command.monster
      )
    ) {
      throw new RuleError("这个怪兽已经被其他玩家选择");
    }
    actor.monster = command.monster;
    actor.ready = false;
    log(state, `${actor.name} 选择了新的怪兽`);
  } else if (command.type === "SET_READY") {
    if (state.phase !== "lobby") throw new RuleError("游戏已经开始");
    if (command.ready && !actor.monster) throw new RuleError("请先选择怪兽");
    actor.ready = command.ready;
    log(state, `${actor.name}${command.ready ? "已准备" : "取消准备"}`);
  } else if (command.type === "START_GAME") {
    if (!actor.isHost) throw new RuleError("只有房主可以开始游戏");
    if (state.phase !== "lobby") throw new RuleError("游戏已经开始");
    if (state.players.length < 2) throw new RuleError("至少需要两名玩家");
    if (state.players.some((item) => !item.connected)) {
      throw new RuleError("请等待所有玩家重新连接");
    }
    if (state.players.some((item) => !item.monster || !item.ready)) {
      throw new RuleError("所有玩家选择怪兽并准备后才能开始");
    }
    state.twoPlayerVariant = state.players.length === 2 && command.twoPlayerVariant !== false;
    state.deck = shuffle(state, createDeck());
    refillMarket(state);

    let candidates = state.players.map((item) => item.id);
    while (candidates.length > 1) {
      const rolls = candidates.map((id) => ({
        id,
        attacks: Array.from({ length: 6 }, () => faces[Math.floor(nextRandom(state) * faces.length)])
          .filter((face) => face === "smash").length
      }));
      const best = Math.max(...rolls.map((roll) => roll.attacks));
      candidates = rolls.filter((roll) => roll.attacks === best).map((roll) => roll.id);
    }
    state.firstPlayerId = candidates[0];
    log(state, `${player(state, candidates[0]).name} 赢得先手`);
    startTurn(state, player(state, candidates[0]));
  } else if (command.type === "ROLL_DICE") {
    assertTurn(state, playerId);
    if (state.phase !== "rolling") throw new RuleError("当前不能掷骰");
    if (state.rollCount >= state.maxRolls) throw new RuleError("本回合掷骰次数已用完");
    state.dice.forEach((die) => {
      if (!die.locked) die.face = faces[Math.floor(nextRandom(state) * faces.length)];
    });
    state.rollCount += 1;
    log(state, `${actor.name} 第 ${state.rollCount} 次掷骰`);
  } else if (command.type === "TOGGLE_DIE") {
    assertTurn(state, playerId);
    if (state.phase !== "rolling" || state.rollCount === 0) throw new RuleError("当前不能保留骰子");
    const die = state.dice.find((item) => item.id === command.dieId);
    if (!die) throw new RuleError("骰子不存在");
    die.locked = !die.locked;
  } else if (command.type === "FINISH_ROLLING") {
    assertTurn(state, playerId);
    if (state.phase !== "rolling" || state.rollCount === 0) throw new RuleError("请先掷骰");
    state.phase = "resolving";
    state.dice.forEach((die) => {
      die.locked = false;
    });
    log(state, `${actor.name} 开始结算骰子`);
  } else if (command.type === "RESOLVE_FACE") {
    assertTurn(state, playerId);
    if (state.phase !== "resolving") throw new RuleError("当前不能结算骰子");
    const available = state.dice.filter((die) => !die.resolved && die.face === command.face);
    if (available.length === 0) throw new RuleError("没有可结算的该类骰子");

    if (command.face === 1 || command.face === 2 || command.face === 3) {
      const count = markFaceResolved(state, command.face);
      if (count >= 3) gain(state, actor, "vp", command.face + count - 3);
      else log(state, `${actor.name} 的 ${count} 个数字 ${command.face} 未形成组合`);
    } else if (command.face === "energy") {
      gain(state, actor, "energy", markFaceResolved(state, "energy"));
    } else if (command.face === "smash") {
      const count = markFaceResolved(state, "smash");
      applyAttack(state, actor, count);
    } else {
      markFaceResolved(state, "heal", true);
      if (command.healMode === "poison" && actor.poison > 0 && !isInTokyo(state, actor.id)) {
        actor.poison -= 1;
        log(state, `${actor.name} 移除 1 个中毒标记`, "good");
      } else if (command.healMode === "shrink" && actor.shrink > 0 && !isInTokyo(state, actor.id)) {
        actor.shrink -= 1;
        log(state, `${actor.name} 移除 1 个缩小标记`, "good");
      } else if (!isInTokyo(state, actor.id)) {
        gain(state, actor, "hp", 1 + passiveAmount(actor, "healBonus"));
      } else {
        log(state, `${actor.name} 在东京内，治疗骰没有效果`);
      }
    }
    finishResolutionIfReady(state);
  } else if (command.type === "YIELD_TOKYO") {
    if (state.phase !== "yielding" || state.pendingYields[0] !== playerId) {
      throw new RuleError("当前不需要你决定是否撤离");
    }
    if (command.yield) {
      if (state.tokyoCity === playerId) state.tokyoCity = null;
      if (state.tokyoBay === playerId) state.tokyoBay = null;
      log(state, `${actor.name} 撤离东京`, "danger");
    } else {
      log(state, `${actor.name} 坚守东京`);
    }
    state.pendingYields.shift();
    if (state.pendingYields.length === 0) {
      state.phase = state.resumePhase ?? "resolving";
      state.resumePhase = null;
      finishResolutionIfReady(state);
    }
  } else if (command.type === "BUY_CARD") {
    assertTurn(state, playerId);
    if (state.phase !== "buying") throw new RuleError("当前不能购买卡牌");
    const cardIndex = state.market.findIndex((card) => card.id === command.cardId);
    if (cardIndex < 0) throw new RuleError("卡牌已经不在市场");
    const card = state.market[cardIndex];
    if (hasTargetEffect(card) && !command.targetId) throw new RuleError("这张牌需要选择目标");
    const cost = Math.max(1, card.cost - passiveAmount(actor, "cardDiscount"));
    if (actor.energy < cost) throw new RuleError("能量不足");
    actor.energy -= cost;
    state.market.splice(cardIndex, 1);
    if (card.type === "keep") actor.cards.push(card);
    card.effects.forEach((effect) => applyCardEffect(state, actor, effect, command.targetId));
    if (card.type === "discard") state.discard.push(card);
    refillMarket(state);
    log(state, `${actor.name} 购买了「${card.name}」`, "energy");
  } else if (command.type === "SWEEP_MARKET") {
    assertTurn(state, playerId);
    if (state.phase !== "buying") throw new RuleError("当前不能刷新市场");
    if (actor.energy < 2) throw new RuleError("刷新市场需要 2 点能量");
    actor.energy -= 2;
    state.discard.push(...state.market);
    state.market = [];
    refillMarket(state);
    log(state, `${actor.name} 刷新了卡牌市场`, "energy");
  } else if (command.type === "END_TURN") {
    assertTurn(state, playerId);
    if (state.phase !== "buying") throw new RuleError("当前不能结束回合");
    if (actor.poison > 0) loseHp(state, actor, actor.poison, "受到中毒伤害");
    if (winnerCheck(state)) {
      state.revision += 1;
      return state;
    }
    if (state.extraTurn && actor.alive) {
      state.extraTurn = false;
      state.round += 1;
      startTurn(state, actor);
    } else {
      const currentIndex = state.players.findIndex((item) => item.id === playerId);
      let nextIndex = currentIndex;
      do {
        nextIndex = (nextIndex + 1) % state.players.length;
      } while (!state.players[nextIndex].alive);
      if (nextIndex <= currentIndex) state.round += 1;
      startTurn(state, state.players[nextIndex]);
    }
  }

  state.revision += 1;
  return state;
}

export function toClientState(state: GameState): ClientGameState {
  const { deck, rngState: _rngState, ...visible } = state;
  return {
    ...structuredClone(visible),
    deckSize: deck.length
  };
}

export function forceStateForTest(state: GameState, patch: Partial<GameState>) {
  Object.assign(state, patch);
  return state;
}

export function cloneGame(state: GameState) {
  return structuredClone(state);
}

export function getPassiveAmount(target: PlayerState, passive: Parameters<typeof passiveAmount>[1]) {
  return passiveAmount(target, passive);
}

export function getCardCost(target: PlayerState, card: PowerCard) {
  return Math.max(1, card.cost - passiveAmount(target, "cardDiscount"));
}
