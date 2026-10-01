import type { PowerCard } from "./types";

const cards: PowerCard[] = [
  {
    id: "reactor-boost",
    name: "反应堆增压",
    cost: 3,
    type: "discard",
    text: "立即获得 2 点能量和 1 点胜利分。",
    accent: "cyan",
    effects: [
      { kind: "gain", resource: "energy", amount: 2 },
      { kind: "gain", resource: "vp", amount: 1 }
    ]
  },
  {
    id: "skyline-collapse",
    name: "天际线坍塌",
    cost: 4,
    type: "discard",
    text: "所有其他怪兽失去 2 点生命。",
    accent: "magenta",
    effects: [{ kind: "damageOthers", amount: 2 }]
  },
  {
    id: "orbital-strike",
    name: "轨道打击",
    cost: 4,
    type: "discard",
    text: "选择一名怪兽，使其失去 3 点生命。",
    accent: "magenta",
    effects: [{ kind: "damageTarget", amount: 3 }]
  },
  {
    id: "media-frenzy",
    name: "媒体狂潮",
    cost: 5,
    type: "discard",
    text: "立即获得 4 点胜利分。",
    accent: "amber",
    effects: [{ kind: "gain", resource: "vp", amount: 4 }]
  },
  {
    id: "energy-cache",
    name: "能量储藏",
    cost: 6,
    type: "discard",
    text: "立即获得 7 点能量。",
    accent: "cyan",
    effects: [{ kind: "gain", resource: "energy", amount: 7 }]
  },
  {
    id: "rapid-regrowth",
    name: "高速再生",
    cost: 3,
    type: "discard",
    text: "立即恢复 3 点生命。",
    accent: "lime",
    effects: [{ kind: "gain", resource: "hp", amount: 3 }]
  },
  {
    id: "nuclear-core",
    name: "核能核心",
    cost: 6,
    type: "discard",
    text: "获得 2 点胜利分并恢复 2 点生命。",
    accent: "amber",
    effects: [
      { kind: "gain", resource: "vp", amount: 2 },
      { kind: "gain", resource: "hp", amount: 2 }
    ]
  },
  {
    id: "time-rift",
    name: "时空裂隙",
    cost: 7,
    type: "discard",
    text: "本回合结束后再进行一个回合。",
    accent: "magenta",
    effects: [{ kind: "extraTurn" }]
  },
  {
    id: "second-brain",
    name: "第二脑域",
    cost: 5,
    type: "keep",
    text: "每回合可额外重掷一次。",
    accent: "cyan",
    effects: [{ kind: "passive", passive: "extraReroll", amount: 1 }]
  },
  {
    id: "auxiliary-head",
    name: "辅助头颅",
    cost: 7,
    type: "keep",
    text: "每回合多使用一颗骰子。",
    accent: "lime",
    effects: [{ kind: "passive", passive: "extraDie", amount: 1 }]
  },
  {
    id: "acid-talons",
    name: "酸蚀利爪",
    cost: 6,
    type: "keep",
    text: "结算攻击骰时额外造成 1 点伤害。",
    accent: "lime",
    effects: [{ kind: "passive", passive: "attackBonus", amount: 1 }]
  },
  {
    id: "rapid-cellular",
    name: "细胞迸发",
    cost: 4,
    type: "keep",
    text: "结算治疗骰时额外恢复 1 点生命。",
    accent: "lime",
    effects: [{ kind: "passive", passive: "healBonus", amount: 1 }]
  },
  {
    id: "alien-economy",
    name: "异星代谢",
    cost: 3,
    type: "keep",
    text: "购买卡牌少支付 1 点能量，最低为 1。",
    accent: "cyan",
    effects: [{ kind: "passive", passive: "cardDiscount", amount: 1 }]
  },
  {
    id: "armored-shell",
    name: "装甲外壳",
    cost: 5,
    type: "keep",
    text: "生命上限提高 2，并立即恢复 2 点生命。",
    accent: "amber",
    effects: [
      { kind: "passive", passive: "maxHp", amount: 2 },
      { kind: "gain", resource: "hp", amount: 2 }
    ]
  },
  {
    id: "crown-of-static",
    name: "静电王冠",
    cost: 6,
    type: "keep",
    text: "在东京开始回合时额外获得 1 分。",
    accent: "amber",
    effects: [{ kind: "passive", passive: "tokyoBonus", amount: 1 }]
  },
  {
    id: "kinetic-harvester",
    name: "动能收割器",
    cost: 4,
    type: "keep",
    text: "每次结算至少一个攻击骰时获得 1 点能量。",
    accent: "cyan",
    effects: [{ kind: "passive", passive: "energyOnSmash", amount: 1 }]
  },
  {
    id: "fire-breathing",
    name: "灼热吐息",
    cost: 4,
    type: "keep",
    text: "攻击时，座位相邻的怪兽额外失去 1 点生命。",
    accent: "magenta",
    effects: [{ kind: "passive", passive: "fireBreathing", amount: 1 }]
  },
  {
    id: "toxic-spines",
    name: "剧毒尖刺",
    cost: 6,
    type: "keep",
    text: "被攻击骰命中的怪兽获得 1 个中毒标记。",
    accent: "lime",
    effects: [{ kind: "passive", passive: "poison", amount: 1 }]
  },
  {
    id: "compression-ray",
    name: "压缩射线",
    cost: 6,
    type: "keep",
    text: "被攻击骰命中的怪兽获得 1 个缩小标记。",
    accent: "cyan",
    effects: [{ kind: "passive", passive: "shrink", amount: 1 }]
  },
  {
    id: "victory-broadcast",
    name: "胜利直播",
    cost: 3,
    type: "discard",
    text: "立即获得 2 点胜利分。",
    accent: "amber",
    effects: [{ kind: "gain", resource: "vp", amount: 2 }]
  },
  {
    id: "emergency-battery",
    name: "应急电池",
    cost: 2,
    type: "discard",
    text: "立即获得 3 点能量。",
    accent: "cyan",
    effects: [{ kind: "gain", resource: "energy", amount: 3 }]
  },
  {
    id: "biofoam",
    name: "生物泡沫",
    cost: 2,
    type: "discard",
    text: "立即恢复 2 点生命。",
    accent: "lime",
    effects: [{ kind: "gain", resource: "hp", amount: 2 }]
  },
  {
    id: "city-ransom",
    name: "城市赎金",
    cost: 7,
    type: "discard",
    text: "立即获得 5 点胜利分。",
    accent: "amber",
    effects: [{ kind: "gain", resource: "vp", amount: 5 }]
  },
  {
    id: "shockwave",
    name: "环城冲击波",
    cost: 5,
    type: "discard",
    text: "所有其他怪兽失去 1 点生命，你获得 2 点能量。",
    accent: "magenta",
    effects: [
      { kind: "damageOthers", amount: 1 },
      { kind: "gain", resource: "energy", amount: 2 }
    ]
  }
];

export function createDeck(): PowerCard[] {
  return cards.flatMap((card, index) => [
    { ...card, id: `${card.id}-a-${index}` },
    { ...card, id: `${card.id}-b-${index}` }
  ]);
}
