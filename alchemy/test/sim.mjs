// 无头验证：元素树自洽 + 可达性 + 消耗契约 + 熟练度 + 解锁节奏
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeEl() {
  const el = {
    className: '', textContent: '', style: {}, disabled: false, title: '',
    onclick: null, oncontextmenu: null, children: [],
    appendChild(c) { this.children.push(c); },
    classList: { add() {}, remove() {} }
  };
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return _html; },
    set(v) { _html = v; el.children.length = 0; }
  });
  return el;
}

function boot(randomFn) {
  const nodes = new Map();
  const sandbox = {
    console, Date, JSON,
    Math: Object.create(Math),
    document: {
      getElementById(id) { if (!nodes.has(id)) nodes.set(id, makeEl()); return nodes.get(id); },
      createElement() { return makeEl(); },
      addEventListener() {}, querySelector() { return null; }
    },
    setTimeout: () => 0, clearTimeout: () => {},
    addEventListener() {}
  };
  sandbox.window = sandbox;
  sandbox.Math.random = randomFn;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(code, ctx, { filename: 'alchemy' });
  const g = sandbox.window.__AL;
  if (!g) { console.error('FAIL: __AL 未挂载'); process.exit(1); }
  return g;
}

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fails++; } };

const g = boot(() => 0);
const S = g.state;
const E = g.ELEMS, R = g.RECIPES;
const BASE = g.BASE;
const ALL = Object.keys(E);

// ---------------------------------------------------------------- 一、配方自洽
for (const [k, r] of Object.entries(R)) {
  const [a, b] = k.split('+');
  ok(E[a] && E[b], `配方 ${k} 含未知元素`);
  ok(a <= b, `配方 ${k} 键未排序`);
  ok(E[r.element], `配方 ${k} 产物 ${r.element} 不存在`);
}

// ---------------------------------------------------------------- 二、层级规则
const basePairs = new Set();
for (let i = 0; i < BASE.length; i++)
  for (let j = i + 1; j < BASE.length; j++) basePairs.add([BASE[i], BASE[j]].sort().join('+'));

for (const [k, r] of Object.entries(R)) {
  const [a, b] = k.split('+');
  const ta = Math.min(E[a].tier, E[b].tier), tb = Math.max(E[a].tier, E[b].tier);
  const tr = E[r.element].tier;
  if (ta === 0 && tb === 0) {
    ok(basePairs.has(k), `${k} 是基础两两，应该在 ${[...basePairs].join(',')} 里`);
    ok(tr === 1, `${k} 产物应是一级，实际 ${tr}`);
  } else if (ta === 0 && tb === 1) {
    ok(tr === 2 || r.reduce, `${k}（一级+基础）产物应是二级，实际 ${tr}`);
  } else if (ta === 1 && tb === 1) {
    ok(tr === 3, `${k}（一级+一级）产物应是三级，实际 ${tr}`);
  } else {
    ok(false, `${k} 的组合层级不合规：tier ${ta} + ${tb}`);
  }
}
ok(basePairs.size === 6, '基础两两应有 6 组');
for (const p of basePairs) ok(R[p], `基础组合 ${p} 缺配方`);

// ---------------------------------------------------------------- 三、可达性（从基础出发能不能长成整棵树）
const reach = new Set(BASE);
let changed = true;
while (changed) {
  changed = false;
  for (const [k, r] of Object.entries(R)) {
    const [a, b] = k.split('+');
    if (r.reduce) continue;
    if (reach.has(a) && reach.has(b) && !reach.has(r.element)) {
      reach.add(r.element); changed = true;
    }
  }
}
const unreachable = ALL.filter(x => !reach.has(x));
ok(unreachable.length === 0, `这些元素从基础出发造不出来：${unreachable.join(',')}`);
ok(ALL.length === g.ALL_ELEMS, '元素总数对不上');

// ---------------------------------------------------------------- 四、消耗契约
{
  const gF = boot(() => 0.999);
  const SF = gF.state;
  SF.ware = ['fire', 'water', 'earth', 'wind'];
  SF.slots = [0, 1];
  gF.attempt();
  ok(SF.ware.length === 2, `失败应 -2，实际 ${SF.ware.length}`);
  ok(SF.slots[0] === null && SF.slots[1] === null, '失败后台面应清空');

  const gW = boot(() => 0);
  const SW = gW.state;
  SW.ware = ['fire', 'water', 'earth', 'wind', 'ice'];
  SW.slots = [0, 1];
  gW.attempt();
  ok(SW.ware.length === 4, `成功应 -2 +1，实际 ${SW.ware.length}`);
  ok(SW.ware[0] === 'thunder', `产物应落在原位，实际 ${SW.ware.join(',')}`);
}

// ---------------------------------------------------------------- 五、熟练度与还原
{
  const gM = boot(() => 0);
  const SM = gM.state;
  for (let i = 0; i < 5; i++) {
    SM.ware = ['fire', 'water'];
    SM.slots = [0, 1];
    gM.attempt();
  }
  ok(gM.mastOf('thunder') === 100, `炼 5 次应到 100%，实际 ${gM.mastOf('thunder')}`);
  ok(SM.mastered.includes('thunder'), '满 100% 应进 mastered');
  ok(SM.known.includes('thunder'), '炼出来应进图鉴');
}

// ---------------------------------------------------------------- 六、阶级
{
  const gR = boot(() => 0);
  const SR = gR.state;
  ok(gR.rankOf().name === '见习魔法师', '初始应见习');
  SR.known = ['fire','water','wind','earth','thunder','blast','metal'];
  ok(gR.rankOf().name === '中级魔法师', `4基础+3新发现应为中级，实际 ${gR.rankOf().name}`);
  SR.known = SR.known.concat(['ice','poison','sand','glass','mud']);
  ok(gR.discovered ? true : true, '');
  ok(gR.rankOf().name === '高级魔法师', `4基础+7新发现应为高级，实际 ${gR.rankOf().name}`);
}

// ---------------------------------------------------------------- 七、解锁节奏
const g2 = boot(Math.random);
const S2 = g2.state;

function bestPair() {
  for (let i = 0; i < S2.ware.length; i++) {
    for (let j = i + 1; j < S2.ware.length; j++) {
      const a = S2.ware[i], b = S2.ware[j];
      const r = g2.RECIPES[a < b ? a + '+' + b : b + '+' + a];
      if (!r || r.reduce) continue;
      if (!S2.known.includes(r.element)) return { i, j };
      if (!S2.mastered.includes(r.element)) return { i, j };
    }
  }
  return null;
}

let acts = 0, marks = 0, last = 0;
const target = new Set(ALL);
while (acts < 4000 && S2.known.length < ALL.length) {
  const mv = bestPair();
  if (mv) {
    S2.slots = [mv.i, mv.j];
    g2.attempt();
    acts++;
    if (S2.known.length > last) { marks++; last = S2.known.length; }
  } else if (S2.ware.length < g2.WARE_CAP - 4) {
    g2.refresh(); acts++;
  } else {
    const idx = S2.ware.findIndex(x => BASE.includes(x));
    g2.discard(idx >= 0 ? idx : 0);
    acts++;
  }
}

console.log(fails === 0
  ? `PASS  元素 ${ALL.length} · 配方 ${Object.keys(R).length} 条 · 全部可达`
  : `FAIL  ${fails} 项`);
console.log(`节奏：${acts} 次操作 → 发现 ${S2.known.length}/${ALL.length} 种，掌握 ${S2.mastered.length}；平均 ${marks ? (acts / marks).toFixed(1) : '—'} 次/种`);
if (S2.known.length < ALL.length) {
  console.log('  未完成：缺', ALL.filter(x => !S2.known.includes(x)).join(',') || '—');
}
process.exit(fails === 0 ? 0 : 1);
