const TITLES: Array<[RegExp, string[]]> = [
  [/explor|search|find/i, ['Detective', 'Scout', 'Sniffer', 'Tracker', 'Sleuth']],
  [/plan|architect/i, ['Professor', 'Architect', 'Strategist', 'Dr.']],
  [/review|audit|security/i, ['Inspector', 'Judge', 'Critic', 'Auditor']],
  [/simplif|refactor|clean/i, ['Tidy', 'Sparkly', 'Neat-o']],
  [/test/i, ['Poker', 'Prodder', 'Lab Rat']],
];
const DEFAULT_TITLES = ['Sir', 'Captain', 'Agent', "Lil'", 'Lady', 'Baron', 'Turbo'];

const NAMES = [
  'Biscuit',
  'Noodle',
  'Pickles',
  'Waffles',
  'Sprout',
  'Nugget',
  'Pudding',
  'Taco',
  'Beans',
  'Muffin',
  'Pretzel',
  'Dumpling',
  'Crumpet',
  'Tater',
  'Gizmo',
  'Wiggles',
  'Bagel',
  'Sushi',
  'Meatball',
  'Pancake',
  'Fuzzbutt',
  'Snickerdoodle',
  'Chonk',
  'Toast',
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic funny name for a sub-agent. The title reflects what kind of
 * work it does ("Detective" for explorers), matched against `hint` (agent
 * type + task description); `taken` avoids two visible
 * minis sharing a name.
 */
export function funnyName(agentId: string, hint: string, taken: Set<string>): string {
  const titles = TITLES.find(([re]) => re.test(hint))?.[1] ?? DEFAULT_TITLES;
  const h = hash(agentId);
  for (let i = 0; i < NAMES.length; i++) {
    const name = `${titles[h % titles.length]} ${NAMES[(h + i) % NAMES.length]}`;
    if (!taken.has(name)) {
      return name;
    }
  }
  return `${titles[0]} ${NAMES[h % NAMES.length]} ${taken.size + 1}`;
}
