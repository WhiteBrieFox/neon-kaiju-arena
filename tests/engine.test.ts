import { describe, expect, it } from "vitest";
import {
  createGame,
  dispatch,
  forceStateForTest,
  leavePlayer,
  removeBot
} from "../src/shared/engine";
import { getSkillChoices } from "../src/shared/skills";
import type { DieFace, GameState, MonsterId } from "../src/shared/types";

function makeGame(count = 2, seed = 42) {
  const monsters: MonsterId[] = [
    "voltclaw",
    "apex",
    "cosmocat",
    "mechazero",
    "cratercrab",
    "rockethop"
  ];
  return createGame(
    "game-test",
    "ABCDE",
    Array.from({ length: count }, (_, index) => ({
      id: `p${index + 1}`,
      name: `玩家${index + 1}`,
      monster: monsters[index],
      isHost: index === 0
    })),
    seed
  );
}

function dice(...values: DieFace[]) {
  return values.map((face, id) => ({ id, face, locked: false, resolved: false }));
}

function resolveAll(state: GameState, playerId: string) {
  const faces = [...new Set(state.dice.filter((die) => !die.resolved).map((die) => die.face))];
  for (const face of faces) {
    while (state.phase === "resolving" && state.dice.some((die) => !die.resolved && die.face === face)) {
      dispatch(state, playerId, {
        type: "RESOLVE_FACE",
        face,
        healMode: face === "heal" ? "hp" : undefined
      });
    }
  }
}

describe("game engine", () => {
  it("starts with official base resources and a three-card market", () => {
    const state = makeGame(3);
    dispatch(state, "p1", { type: "START_GAME" });

    expect(state.players.every((p) => p.hp === 10 && p.vp === 0 && p.energy === 0)).toBe(true);
    expect(state.players.every((p) => p.level === 0)).toBe(true);
    expect(state.market).toHaveLength(3);
    expect(state.skillPool[3]).toHaveLength(3);
    expect(state.skillPool[6]).toHaveLength(3);
    expect(state.skillPool[10]).toHaveLength(3);
    expect(new Set(state.skillPool[3]).size).toBe(3);
    expect(state.phase).toBe("rolling");
    expect(state.currentPlayerId).toBeTruthy();
  });

  it("requires unique monsters and every player to be ready before starting", () => {
    const state = createGame("game-lobby", "ABCDE", [
      { id: "p1", name: "玩家1", monster: null, isHost: true },
      { id: "p2", name: "玩家2", monster: null, isHost: false }
    ]);

    dispatch(state, "p1", { type: "SELECT_MONSTER", monster: "voltclaw" });
    expect(() =>
      dispatch(state, "p2", { type: "SELECT_MONSTER", monster: "voltclaw" })
    ).toThrow("已经被其他玩家选择");

    dispatch(state, "p2", { type: "SELECT_MONSTER", monster: "apex" });
    dispatch(state, "p1", { type: "SET_READY", ready: true });
    expect(() => dispatch(state, "p1", { type: "START_GAME" })).toThrow(
      "所有玩家选择怪兽并准备后才能开始"
    );

    dispatch(state, "p2", { type: "SET_READY", ready: true });
    dispatch(state, "p1", { type: "START_GAME" });
    expect(state.phase).toBe("rolling");
  });

  it("allows only the host to remove bot players from the lobby", () => {
    const state = createGame("game-bots", "ABCDE", [
      { id: "p1", name: "房主", monster: "voltclaw", isHost: true },
      { id: "p2", name: "玩家", monster: "apex", isHost: false },
      {
        id: "bot-1",
        name: "钢牙",
        monster: "mechazero",
        isHost: false,
        isBot: true
      }
    ]);

    expect(() => removeBot(state, "p2", "bot-1")).toThrow("只有房主");
    removeBot(state, "p1", "bot-1");
    expect(state.players.map((player) => player.id)).toEqual(["p1", "p2"]);
  });

  it("removes lobby players and hands host control to another human", () => {
    const state = makeGame(3);
    leavePlayer(state, "p1");

    expect(state.players.map((player) => player.id)).toEqual(["p2", "p3"]);
    expect(state.players.find((player) => player.id === "p2")?.isHost).toBe(true);
  });

  it("hands an active player's monster to a bot when they leave", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    const activePlayerId = state.currentPlayerId!;

    leavePlayer(state, activePlayerId);

    const departed = state.players.find((player) => player.id === activePlayerId);
    expect(departed?.isBot).toBe(true);
    expect(departed?.connected).toBe(true);
    expect(state.phase).not.toBe("finished");
  });

  it("lets triples of ones increase level by two and unlock crossed milestone skills", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    const active = state.currentPlayerId!;
    const actor = state.players.find((player) => player.id === active)!;
    actor.level = 2;
    forceStateForTest(state, {
      phase: "resolving",
      dice: dice(1, 1, 1, "energy", "heal", "smash")
    });

    dispatch(state, active, { type: "RESOLVE_FACE", face: 1 });

    expect(actor.level).toBe(4);
    expect(actor.vp).toBe(1);
    expect(state.phase).toBe("choosingSkill");
    expect(state.pendingSkillTier).toBe(3);

    const skill = getSkillChoices(3, [], state.skillPool[3])[0];
    dispatch(state, active, { type: "CHOOSE_SKILL", skillId: skill.id });

    expect(actor.skills.map((item) => item.id)).toContain(skill.id);
    expect(state.phase).toBe("resolving");
  });

  it("lets triples of twos increase level by one", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    const active = state.currentPlayerId!;
    const actor = state.players.find((player) => player.id === active)!;
    actor.level = 4;
    forceStateForTest(state, {
      phase: "resolving",
      dice: dice(2, 2, 2, "energy", "heal", "smash")
    });

    dispatch(state, active, { type: "RESOLVE_FACE", face: 2 });

    expect(actor.level).toBe(5);
    expect(actor.vp).toBe(2);
    expect(state.phase).toBe("resolving");
    expect(state.pendingSkillTier).toBeNull();
  });

  it("caps evolution at level ten and unlocks the final skill when crossing it", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    const active = state.currentPlayerId!;
    const actor = state.players.find((player) => player.id === active)!;
    actor.level = 9;
    forceStateForTest(state, {
      phase: "resolving",
      dice: dice(1, 1, 1, 1, "energy", "heal")
    });

    dispatch(state, active, { type: "RESOLVE_FACE", face: 1 });

    expect(actor.level).toBe(10);
    expect(actor.vp).toBe(2);
    expect(state.phase).toBe("choosingSkill");
    expect(state.pendingSkillTier).toBe(10);
  });

  it("keeps a strong level ten candidate library", () => {
    const choices = getSkillChoices(10);
    expect(choices).toHaveLength(6);
    expect(
      choices.every(
        (skill) =>
          skill.effects.length > 1 ||
          skill.effects.some(
            (effect) =>
              effect.kind === "passive" &&
              ((effect.passive === "extraDie" && effect.amount >= 2) ||
                (effect.passive === "tokyoBonus" && effect.amount >= 3))
          )
      )
    ).toBe(true);
  });

  it("keeps six distinct effects in each milestone candidate library", () => {
    for (const tier of [3, 6, 10] as const) {
      const choices = getSkillChoices(tier);
      const effectSignatures = choices.map((skill) =>
        skill.effects
          .map((effect) =>
            effect.kind === "passive"
              ? `${effect.kind}:${effect.passive}:${effect.amount}`
              : `${effect.kind}:${"resource" in effect ? effect.resource : ""}:${"amount" in effect ? effect.amount : ""}`
          )
          .join("|")
      );

      expect(choices).toHaveLength(6);
      expect(new Set(effectSignatures).size).toBe(6);
    }
  });

  it("limits each active skill pool to six in a six-player game", () => {
    const state = makeGame(6);
    dispatch(state, "p1", { type: "START_GAME" });

    expect(state.skillPool[3]).toHaveLength(6);
    expect(state.skillPool[6]).toHaveLength(6);
    expect(state.skillPool[10]).toHaveLength(6);
  });

  it("removes claimed skills from the shared pool", () => {
    const state = makeGame(2);
    const claimed = getSkillChoices(3)[0];
    state.players[0].skills.push(claimed);
    forceStateForTest(state, {
      phase: "choosingSkill",
      pendingSkillPlayerId: "p2",
      pendingSkillTier: 3,
      skillPool: { 3: [claimed.id, getSkillChoices(3)[1].id], 6: [], 10: [] }
    });

    expect(getSkillChoices(3, [claimed.id]).some((skill) => skill.id === claimed.id)).toBe(false);
    expect(() =>
      dispatch(state, "p2", { type: "CHOOSE_SKILL", skillId: claimed.id })
    ).toThrow("已经被其他玩家选择");
  });

  it("continues scoring number triples after reaching maximum level", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    const active = state.currentPlayerId!;
    const actor = state.players.find((player) => player.id === active)!;
    actor.level = 10;
    forceStateForTest(state, {
      phase: "resolving",
      dice: dice(2, 2, 2, 2, "energy", "heal")
    });

    dispatch(state, active, { type: "RESOLVE_FACE", face: 2 });

    expect(actor.level).toBe(10);
    expect(actor.vp).toBe(3);
  });

  it("lets the first player reroll held dice and must enter an empty Tokyo", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    const active = state.currentPlayerId!;
    forceStateForTest(state, {
      dice: dice(1, 1, 1, "energy", "heal", "smash"),
      phase: "resolving",
      rollCount: 1
    });

    resolveAll(state, active);

    expect(state.tokyoCity).toBe(active);
    expect(state.phase).toBe("buying");
    expect(state.players.find((p) => p.id === active)?.vp).toBe(1);
    expect(state.players.find((p) => p.id === active)?.energy).toBe(2);
  });

  it("scores number triples and extras correctly", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    const active = state.currentPlayerId!;
    forceStateForTest(state, {
      dice: dice(2, 2, 2, 2, 1, 3),
      phase: "resolving"
    });

    dispatch(state, active, { type: "RESOLVE_FACE", face: 2 });

    expect(state.players.find((p) => p.id === active)?.vp).toBe(3);
  });

  it("damages every Tokyo occupant and asks each survivor whether to yield", () => {
    const state = makeGame(5);
    dispatch(state, "p1", { type: "START_GAME" });
    forceStateForTest(state, {
      currentPlayerId: "p3",
      phase: "resolving",
      tokyoCity: "p1",
      tokyoBay: "p2",
      dice: dice("smash", "smash", 1, 1, 2, 3)
    });

    dispatch(state, "p3", { type: "RESOLVE_FACE", face: "smash" });

    expect(state.players[0].hp).toBe(8);
    expect(state.players[1].hp).toBe(8);
    expect(state.pendingYields).toEqual(["p1", "p2"]);
    expect(state.phase).toBe("yielding");
    expect(state.log.find((entry) => entry.kind === "attack")).toMatchObject({
      actorId: "p3",
      targetIds: ["p1", "p2"],
      round: 1,
      phase: "resolving"
    });

    dispatch(state, "p1", { type: "YIELD_TOKYO", yield: true });
    dispatch(state, "p2", { type: "YIELD_TOKYO", yield: false });
    expect(state.tokyoCity).toBeNull();
    expect(state.tokyoBay).toBe("p2");
  });

  it("closes Tokyo Bay immediately when only four monsters remain", () => {
    const state = makeGame(5);
    dispatch(state, "p1", { type: "START_GAME" });
    forceStateForTest(state, {
      currentPlayerId: "p3",
      phase: "resolving",
      tokyoCity: "p1",
      tokyoBay: "p2",
      dice: dice("smash", "smash", "smash", 1, 2, 3)
    });
    state.players[1].hp = 3;

    dispatch(state, "p3", { type: "RESOLVE_FACE", face: "smash" });

    expect(state.players[1].alive).toBe(false);
    expect(state.tokyoBay).toBeNull();
    expect(state.players.filter((p) => p.alive)).toHaveLength(4);
  });

  it("uses energy instead of victory points when entering Tokyo in the two-player variant", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME", twoPlayerVariant: true });
    const active = state.currentPlayerId!;
    forceStateForTest(state, {
      phase: "resolving",
      dice: dice(1, 2, 3, "heal", "heal", "heal")
    });

    resolveAll(state, active);
    const target = state.players.find((p) => p.id === active)!;

    expect(target.energy).toBe(1);
    expect(target.vp).toBe(0);
  });

  it("does not let a monster win if poison eliminates it at end of turn", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    forceStateForTest(state, {
      currentPlayerId: "p1",
      phase: "buying"
    });
    state.players[0].vp = 20;
    state.players[0].hp = 1;
    state.players[0].poison = 1;

    dispatch(state, "p1", { type: "END_TURN" });

    expect(state.players[0].alive).toBe(false);
    expect(state.phase).toBe("finished");
    expect(state.winnerIds).toEqual(["p2"]);
  });

  it("rejects illegal out-of-turn actions", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    const inactive = state.players.find((p) => p.id !== state.currentPlayerId)!;

    expect(() => dispatch(state, inactive.id, { type: "ROLL_DICE" })).toThrow("还没有轮到你");
  });

  it("prevents healing dice from restoring health inside Tokyo", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    forceStateForTest(state, {
      currentPlayerId: "p1",
      tokyoCity: "p1",
      phase: "resolving",
      dice: dice("heal", 1, 1, 2, 2, 3)
    });
    state.players[0].hp = 5;

    dispatch(state, "p1", { type: "RESOLVE_FACE", face: "heal", healMode: "hp" });

    expect(state.players[0].hp).toBe(5);
  });

  it("allows healing dice to remove status tokens outside Tokyo", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    forceStateForTest(state, {
      currentPlayerId: "p1",
      tokyoCity: "p2",
      phase: "resolving",
      dice: dice("heal", "heal", 1, 2, 3, "energy")
    });
    state.players[0].poison = 1;
    state.players[0].shrink = 1;

    dispatch(state, "p1", { type: "RESOLVE_FACE", face: "heal", healMode: "poison" });
    dispatch(state, "p1", { type: "RESOLVE_FACE", face: "heal", healMode: "shrink" });

    expect(state.players[0].poison).toBe(0);
    expect(state.players[0].shrink).toBe(0);
  });

  it("purchases a discard card, pays energy and refills the market", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    forceStateForTest(state, { currentPlayerId: "p1", phase: "buying" });
    const card = state.market.find((item) => item.type === "discard") ?? state.market[0];
    card.type = "discard";
    card.effects = [{ kind: "gain", resource: "vp", amount: 2 }];
    state.players[0].energy = 20;
    const beforeDeck = state.deck.length;

    dispatch(state, "p1", { type: "BUY_CARD", cardId: card.id });

    expect(state.players[0].vp).toBe(2);
    expect(state.market).toHaveLength(3);
    expect(state.deck.length).toBe(beforeDeck - 1);
    expect(state.discard.some((item) => item.id === card.id)).toBe(true);
    expect(state.log.at(-1)).toMatchObject({
      kind: "card",
      actorId: "p1",
      phase: "buying"
    });
    expect(state.log.at(-1)?.detail).toContain(card.text);
  });

  it("applies energy circuit discount when purchasing cards", () => {
    const state = makeGame(2);
    dispatch(state, "p1", { type: "START_GAME" });
    forceStateForTest(state, { currentPlayerId: "p1", phase: "buying" });
    const actor = state.players[0];
    const discountSkill = getSkillChoices(3).find((skill) =>
      skill.effects.some(
        (effect) => effect.kind === "passive" && effect.passive === "cardDiscount"
      )
    )!;
    const card = state.market[0];
    card.cost = 7;
    card.type = "discard";
    card.effects = [];
    actor.skills.push(discountSkill);
    actor.energy = 6;

    dispatch(state, "p1", { type: "BUY_CARD", cardId: card.id });

    expect(actor.energy).toBe(0);
    expect(state.discard.some((item) => item.id === card.id)).toBe(true);
  });

  it("produces identical opening states from the same random seed", () => {
    const a = makeGame(4, 20261001);
    const b = makeGame(4, 20261001);

    dispatch(a, "p1", { type: "START_GAME" });
    dispatch(b, "p1", { type: "START_GAME" });

    expect(a.currentPlayerId).toBe(b.currentPlayerId);
    expect(a.market.map((card) => card.id)).toEqual(b.market.map((card) => card.id));
    expect(a.rngState).toBe(b.rngState);
  });
});
