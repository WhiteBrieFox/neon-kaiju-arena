import { getCardCost } from "./engine";
import { getSkillChoices } from "./skills";
import type {
  DieFace,
  GameCommand,
  GameState,
  PlayerState,
  PowerCard
} from "./types";

function inTokyo(state: GameState, playerId: string) {
  return state.tokyoCity === playerId || state.tokyoBay === playerId;
}

function shouldHoldDie(state: GameState, bot: PlayerState, face: DieFace) {
  if (face === "smash") return true;
  if (face === "energy") return bot.energy < 7;
  if (face === "heal") {
    return !inTokyo(state, bot.id) && (bot.hp < bot.maxHp || bot.poison > 0 || bot.shrink > 0);
  }

  const numberCounts = new Map<number, number>();
  state.dice.forEach((die) => {
    if (typeof die.face === "number") {
      numberCounts.set(die.face, (numberCounts.get(die.face) ?? 0) + 1);
    }
  });
  const bestCount = Math.max(...numberCounts.values(), 0);
  return (numberCounts.get(face) ?? 0) === bestCount && bestCount >= 2;
}

function healMode(bot: PlayerState): "hp" | "poison" | "shrink" {
  if (bot.poison > 0) return "poison";
  if (bot.shrink > 0) return "shrink";
  return "hp";
}

function cardValue(state: GameState, bot: PlayerState, card: PowerCard) {
  return card.effects.reduce((score, effect) => {
    if (effect.kind === "gain" && effect.resource === "vp") {
      return score + effect.amount * 3;
    }
    if (effect.kind === "gain" && effect.resource === "energy") {
      return score + effect.amount * 0.8;
    }
    if (effect.kind === "gain" && effect.resource === "hp") {
      return score + Math.min(effect.amount, bot.maxHp - bot.hp) * 1.5;
    }
    if (effect.kind === "damageOthers") {
      return score + effect.amount * Math.max(1, state.players.filter((item) => item.alive).length - 1);
    }
    if (effect.kind === "damageTarget") return score + effect.amount * 1.8;
    if (effect.kind === "extraTurn") return score + 7;
    if (effect.kind === "passive") return score + 4 + effect.amount;
    return score;
  }, 0);
}

function bestTarget(state: GameState, botId: string) {
  return state.players
    .filter((item) => item.id !== botId && item.alive)
    .sort((left, right) => right.vp - left.vp || left.hp - right.hp)[0];
}

export function chooseBotCommand(state: GameState, botId: string): GameCommand | null {
  const bot = state.players.find((item) => item.id === botId);
  if (!bot?.isBot || !bot.alive || state.phase === "finished") return null;

  if (state.phase === "yielding") {
    if (state.pendingYields[0] !== botId) return null;
    return {
      type: "YIELD_TOKYO",
      yield: bot.hp <= 4 && bot.vp < 18
    };
  }

  if (state.phase === "choosingSkill") {
    if (state.pendingSkillPlayerId !== botId || !state.pendingSkillTier) {
      return null;
    }
    const claimedSkillIds = state.players.flatMap((player) =>
      player.skills.map((skill) => skill.id)
    );
    const choice = getSkillChoices(
      state.pendingSkillTier,
      claimedSkillIds,
      state.skillPool[state.pendingSkillTier]
    )[0];
    return choice ? { type: "CHOOSE_SKILL", skillId: choice.id } : null;
  }

  if (state.currentPlayerId !== botId) return null;

  if (state.phase === "rolling") {
    if (state.rollCount === 0) return { type: "ROLL_DICE" };
    if (state.rollCount >= state.maxRolls) return { type: "FINISH_ROLLING" };

    const dieToHold = state.dice.find(
      (die) => !die.locked && shouldHoldDie(state, bot, die.face)
    );
    if (dieToHold) return { type: "TOGGLE_DIE", dieId: dieToHold.id };
    if (state.dice.every((die) => die.locked)) {
      return { type: "FINISH_ROLLING" };
    }
    return { type: "ROLL_DICE" };
  }

  if (state.phase === "resolving") {
    const unresolved = state.dice.filter((die) => !die.resolved);
    const priorities: DieFace[] =
      bot.hp <= 5
        ? ["heal", "smash", "energy", 3, 2, 1]
        : ["smash", "energy", 3, 2, 1, "heal"];
    const face = priorities.find((item) => unresolved.some((die) => die.face === item));
    if (face === undefined) return null;
    return {
      type: "RESOLVE_FACE",
      face,
      healMode: face === "heal" ? healMode(bot) : undefined
    };
  }

  if (state.phase === "buying") {
    const affordable = state.market
      .filter((card) => getCardCost(bot, card) <= bot.energy)
      .map((card) => ({
        card,
        score: cardValue(state, bot, card) - getCardCost(bot, card) * 0.35
      }))
      .sort((left, right) => right.score - left.score);
    const choice = affordable[0];
    if (choice && choice.score >= 2) {
      const needsTarget = choice.card.effects.some(
        (effect) => effect.kind === "damageTarget"
      );
      const target = needsTarget ? bestTarget(state, botId) : undefined;
      if (!needsTarget || target) {
        return {
          type: "BUY_CARD",
          cardId: choice.card.id,
          targetId: target?.id
        };
      }
    }
    return { type: "END_TURN" };
  }

  return null;
}
