import type { MonsterSkill, SkillTier } from "./types";

const skills: MonsterSkill[] = [
  {
    id: "voltclaw-ion-talons",
    tier: 3,
    name: "离子利爪",
    text: "攻击骰额外造成 1 点伤害。",
    effects: [{ kind: "passive", passive: "attackBonus", amount: 1 }]
  },
  {
    id: "voltclaw-charge-glands",
    tier: 3,
    name: "蓄电腺体",
    text: "攻击命中时额外获得 1 点能量。",
    effects: [{ kind: "passive", passive: "energyOnSmash", amount: 1 }]
  },
  {
    id: "voltclaw-overclock",
    tier: 6,
    name: "神经超频",
    text: "每回合可额外重掷两次。",
    effects: [{ kind: "passive", passive: "extraReroll", amount: 2 }]
  },
  {
    id: "voltclaw-electric-regrowth",
    tier: 6,
    name: "电流再生",
    text: "每颗治疗骰额外恢复 2 点生命。",
    effects: [{ kind: "passive", passive: "healBonus", amount: 2 }]
  },
  {
    id: "voltclaw-thunder-avatar",
    tier: 10,
    name: "雷霆化身",
    text: "永久增加 2 颗骰子。",
    effects: [{ kind: "passive", passive: "extraDie", amount: 2 }]
  },
  {
    id: "voltclaw-grid-sovereign",
    tier: 10,
    name: "电网主宰",
    text: "在东京开始回合时额外获得 3 分；攻击命中时额外获得 1 点能量。",
    effects: [
      { kind: "passive", passive: "tokyoBonus", amount: 3 },
      { kind: "passive", passive: "energyOnSmash", amount: 1 }
    ]
  },
  {
    id: "apex-reinforced-hide",
    tier: 3,
    name: "强化皮层",
    text: "生命上限提高 2，并恢复 2 点生命。",
    effects: [
      { kind: "passive", passive: "maxHp", amount: 2 },
      { kind: "gain", resource: "hp", amount: 2 }
    ]
  },
  {
    id: "apex-kinetic-core",
    tier: 6,
    name: "动能核心",
    text: "攻击命中时额外获得 2 点能量。",
    effects: [{ kind: "passive", passive: "energyOnSmash", amount: 2 }]
  },
  {
    id: "apex-titan-arms",
    tier: 10,
    name: "泰坦巨臂",
    text: "永久增加 1 颗骰子，且攻击骰额外造成 2 点伤害。",
    effects: [
      { kind: "passive", passive: "extraDie", amount: 1 },
      { kind: "passive", passive: "attackBonus", amount: 2 }
    ]
  },
  {
    id: "apex-urban-tyrant",
    tier: 10,
    name: "都市暴君",
    text: "在东京开始回合时额外获得 3 分；生命上限提高 4，并恢复 4 点生命。",
    effects: [
      { kind: "passive", passive: "tokyoBonus", amount: 3 },
      { kind: "passive", passive: "maxHp", amount: 4 },
      { kind: "gain", resource: "hp", amount: 4 }
    ]
  },
  {
    id: "cosmocat-precognition",
    tier: 3,
    name: "灵能预知",
    text: "每回合可额外重掷一次。",
    effects: [{ kind: "passive", passive: "extraReroll", amount: 1 }]
  },
  {
    id: "cosmocat-stellar-cells",
    tier: 3,
    name: "星质细胞",
    text: "每颗治疗骰额外恢复 1 点生命。",
    effects: [{ kind: "passive", passive: "healBonus", amount: 1 }]
  },
  {
    id: "cosmocat-gravity-claw",
    tier: 6,
    name: "引力爪痕",
    text: "攻击骰额外造成 2 点伤害。",
    effects: [{ kind: "passive", passive: "attackBonus", amount: 2 }]
  },
  {
    id: "cosmocat-dimensional-body",
    tier: 6,
    name: "维度躯体",
    text: "生命上限提高 4，并恢复 4 点生命。",
    effects: [
      { kind: "passive", passive: "maxHp", amount: 4 },
      { kind: "gain", resource: "hp", amount: 4 }
    ]
  },
  {
    id: "cosmocat-throne-resonance",
    tier: 10,
    name: "王座共鸣",
    text: "在东京开始回合时额外获得 3 分，且每回合可额外重掷一次。",
    effects: [
      { kind: "passive", passive: "tokyoBonus", amount: 3 },
      { kind: "passive", passive: "extraReroll", amount: 1 }
    ]
  },
  {
    id: "cratercrab-eruption-breath",
    tier: 6,
    name: "喷发吐息",
    text: "攻击时相邻怪兽额外失去 2 点生命。",
    effects: [{ kind: "passive", passive: "fireBreathing", amount: 2 }]
  },
  {
    id: "cratercrab-multi-arm",
    tier: 10,
    name: "多臂灾变",
    text: "永久增加 1 颗骰子；攻击时相邻怪兽额外失去 2 点生命。",
    effects: [
      { kind: "passive", passive: "extraDie", amount: 1 },
      { kind: "passive", passive: "fireBreathing", amount: 2 }
    ]
  },
  {
    id: "universal-energy-routing",
    tier: 3,
    name: "能量回路",
    text: "购买能量卡牌时费用减少 1 点。",
    effects: [{ kind: "passive", passive: "cardDiscount", amount: 1 }]
  }
];

export function getSkillChoices(
  tier: SkillTier,
  claimedSkillIds: Iterable<string> = [],
  poolSkillIds?: Iterable<string>
) {
  const claimed = new Set(claimedSkillIds);
  const pool = poolSkillIds ? new Set(poolSkillIds) : null;
  return skills.filter(
    (skill) =>
      skill.tier === tier &&
      !claimed.has(skill.id) &&
      (!pool || pool.has(skill.id))
  );
}

export function getSkillById(skillId: string) {
  return skills.find((skill) => skill.id === skillId);
}
