import { describe, expect, it } from "vitest";
import { chooseBotCommand } from "../src/shared/bot";
import { createDeck } from "../src/shared/cards";
import { createGame, dispatch, forceStateForTest } from "../src/shared/engine";
import type { DieFace, GameState } from "../src/shared/types";

function makeBotGame() {
  return createGame(
    "bot-game",
    "ABCDE",
    [
      { id: "human", name: "玩家", monster: "voltclaw", isHost: true },
      {
        id: "bot",
        name: "钢牙",
        monster: "apex",
        isHost: false,
        isBot: true
      }
    ],
    42
  );
}

function dice(...faces: DieFace[]) {
  return faces.map((face, id) => ({ id, face, locked: false, resolved: false }));
}

describe("bot decisions", () => {
  it("rolls first and keeps useful dice before rerolling", () => {
    const state = makeBotGame();
    forceStateForTest(state, {
      phase: "rolling",
      currentPlayerId: "bot",
      rollCount: 0,
      maxRolls: 3,
      dice: dice(1, 1, "smash", "energy", 2, "heal")
    });

    expect(chooseBotCommand(state, "bot")).toEqual({ type: "ROLL_DICE" });
    state.rollCount = 1;
    expect(chooseBotCommand(state, "bot")).toEqual({
      type: "TOGGLE_DIE",
      dieId: 0
    });
  });

  it("prioritizes healing when badly hurt", () => {
    const state = makeBotGame();
    const bot = state.players.find((player) => player.id === "bot")!;
    bot.hp = 3;
    forceStateForTest(state, {
      phase: "resolving",
      currentPlayerId: "bot",
      dice: dice("energy", "heal", "smash")
    });

    expect(chooseBotCommand(state, "bot")).toEqual({
      type: "RESOLVE_FACE",
      face: "heal",
      healMode: "hp"
    });
  });

  it("targets the leading opponent when buying an attack card", () => {
    const state = makeBotGame();
    const bot = state.players.find((player) => player.id === "bot")!;
    const human = state.players.find((player) => player.id === "human")!;
    bot.energy = 10;
    human.vp = 12;
    const attack = createDeck().find((card) =>
      card.effects.some((effect) => effect.kind === "damageTarget")
    )!;
    forceStateForTest(state, {
      phase: "buying",
      currentPlayerId: "bot",
      market: [attack]
    } as Partial<GameState>);

    expect(chooseBotCommand(state, "bot")).toEqual({
      type: "BUY_CARD",
      cardId: attack.id,
      targetId: "human"
    });
  });

  it("leaves Tokyo at critical health", () => {
    const state = makeBotGame();
    const bot = state.players.find((player) => player.id === "bot")!;
    bot.hp = 3;
    forceStateForTest(state, {
      phase: "yielding",
      tokyoCity: "bot",
      pendingYields: ["bot"]
    });

    expect(chooseBotCommand(state, "bot")).toEqual({
      type: "YIELD_TOKYO",
      yield: true
    });
  });

  it("can complete a full turn without getting stuck", () => {
    const state = makeBotGame();
    dispatch(state, "human", { type: "START_GAME" });
    forceStateForTest(state, {
      currentPlayerId: "bot",
      phase: "rolling",
      rollCount: 0,
      maxRolls: 3,
      dice: dice(1, 1, 1, 1, 1, 1)
    });

    let actions = 0;
    while (
      actions < 50 &&
      state.phase !== "finished" &&
      (state.currentPlayerId === "bot" ||
        (state.phase === "yielding" && state.pendingYields[0] === "bot"))
    ) {
      const command = chooseBotCommand(state, "bot");
      expect(command).not.toBeNull();
      dispatch(state, "bot", command!);
      actions += 1;
    }

    expect(actions).toBeGreaterThan(0);
    expect(actions).toBeLessThan(50);
    expect(state.currentPlayerId).toBe("human");
  });
});
