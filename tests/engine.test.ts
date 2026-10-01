import { describe, expect, it } from "vitest";
import { createGame, dispatch, forceStateForTest } from "../src/shared/engine";
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
    expect(state.market).toHaveLength(3);
    expect(state.phase).toBe("rolling");
    expect(state.currentPlayerId).toBeTruthy();
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
