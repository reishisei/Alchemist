// 无头验证：元素树自洽 + 可达性 + 消耗契约 + 选系/本系无限 + 熟练度上限 + 保底 + 阶级
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

// ---------------------------------------------------------------- 四、选系与无限供应
{
  const g0 = boot(() => 0);
  const S0 = g0.state;
  ok(S0.school === null, '开局应还没选系');
  g0.refresh();
  ok(S0.ware.length === 0, '没选系时刷新不应给材料');
  S0.ware = ['fire', 'water'];
  S0.slots = [g0.wareSlot(0), g0.wareSlot(1)];
  g0.attempt();
  ok(S0.ware.length === 2, '没选系时不应能合成');

}

{
  const g1 = boot(() => 0);
  const S1 = g1.state;
  g1.chooseSchool('fire');
  ok(S1.school === 'fire', '选系后 school 应为 fire');
  ok(!S1.ware.includes('fire'), '本系元素不应出现在外系仓库');
  ok(g1.poolIds().every(id => id !== 'fire'), '随机池不应抽到本系元素');
  ok(S1.ware.length === 4, `选系应给 4 个外系材料，实际 ${S1.ware.length}`);
}

// ---------------------------------------------------------------- 五、消耗契约（本系 ∞ 不计费）
{
  const ga = boot(() => 0);
  const SA = ga.state;
  ga.chooseSchool('fire');
  SA.ware = ['water'];
  SA.slots = [ga.schoolSlot(), ga.wareSlot(0)];
  ga.attempt();
  ok(SA.ware.length === 1, `本系 ∞ + 外系：应只消耗外系（-1 +1），实际 ${SA.ware.length}`);
  ok(SA.ware[0] === 'thunder', `产物应落在被消耗的格位，实际 ${SA.ware.join(',')}`);

  // 仓库满时，本系 ∞ 不占容量，合成不应溢出
  const gb = boot(() => 0);
  const SB = gb.state;
  gb.chooseSchool('fire');
  SB.ware = Array(gb.WARE_CAP).fill('water');
  SB.slots = [gb.schoolSlot(), gb.wareSlot(0)];
  gb.attempt();
  ok(SB.ware.length === gb.WARE_CAP, `满仓下本系 ∞ 合成应保持 ${gb.WARE_CAP}，实际 ${SB.ware.length}`);

  // 本系 + 本系没有配方
  const gc = boot(() => 0);
  const SC = gc.state;
  gc.chooseSchool('fire');
  SC.slots = [gc.schoolSlot(), gc.schoolSlot()];
  ok(gc.pairOf() === null, '本系 + 本系不应有配方');
  gc.attempt();
  ok(SC.ware.length === 4, '无配方时不应消耗任何东西');

  // 失败仍然 -2（外系在本系以外照常扣）
  const gd = boot(() => 0.999);
  const SD = gd.state;
  gd.chooseSchool('fire');
  SD.ware = ['water', 'earth'];
  SD.slots = [gd.wareSlot(0), gd.wareSlot(1)];
  gd.attempt();
  ok(SD.ware.length === 0, `失败应 -2，实际 ${SD.ware.length}`);
  ok(SD.slots[0] === null && SD.slots[1] === null, '失败后台面应清空');
}

// ---------------------------------------------------------------- 六、熟练度上限
{
  // 本系参与 → 85 封顶，且永远不能「掌握」
  const g85 = boot(() => 0);
  const S85 = g85.state;
  g85.chooseSchool('fire');
  ok(g85.capForPair('fire', 'water', 'fire') === 85, '本系+外系 上限应为 85');
  ok(g85.capForPair('fire', 'fire', 'fire') === 50, '双本系 上限应为 50');
  ok(g85.capForPair('water', 'wind', 'fire') === 100, '双外系 上限应为 100');
  ok(g85.capOfElement('thunder') === 85, '电（火+水）在火系下上限应为 85');
  ok(g85.capOfElement('ice') === 100, '冰（水+风）在火系下上限应为 100');
  ok(g85.capOfElement('thunder', 'wind') === 100, '电在风系下上限应为 100');

  for (let i = 0; i < 10; i++) {
    S85.ware = ['water'];
    S85.slots = [g85.schoolSlot(), g85.wareSlot(0)];
    g85.attempt();
  }
  ok(g85.mastOf('thunder') === 85, `火系炼电应停在 85%，实际 ${g85.mastOf('thunder')}`);
  ok(!S85.mastered.includes('thunder'), '85% 封顶不应进 mastered');
  S85.slots = [g85.schoolSlot(), g85.wareSlot(0)];
  S85.ware = ['water'];
  ok(g85.rateOf(g85.pairOf()) === 85, '封顶后成功率应锁在 85%');

  // 双外系 → 可以 100% 掌握
  const g100 = boot(() => 0);
  const S100 = g100.state;
  g100.chooseSchool('wind');
  for (let i = 0; i < 5; i++) {
    S100.ware = ['water', 'fire'];
    S100.slots = [g100.wareSlot(0), g100.wareSlot(1)];
    g100.attempt();
  }
  ok(g100.mastOf('thunder') === 100, `风系炼电应能到 100%，实际 ${g100.mastOf('thunder')}`);
  ok(S100.mastered.includes('thunder'), '100% 应进 mastered');
  S100.known = ['fire', 'water', 'wind', 'earth', 'thunder', 'ice', 'sand']; // 中级才抽得到一级
  ok(g100.poolIds().includes('thunder'), '掌握的元素应进随机池');
}

// ---------------------------------------------------------------- 七、连败保底
{
  const gp = boot(() => 0.999);
  const SP = gp.state;
  gp.chooseSchool('fire');
  SP.known = ['fire', 'water', 'wind', 'earth', 'blast', 'ice', 'sand']; // 中级，电不再被锁
  SP.ware = ['water', 'water', 'water'];
  for (let i = 0; i < 2; i++) {
    SP.slots = [gp.schoolSlot(), gp.wareSlot(0)];
    gp.attempt();
  }
  ok(SP.fails === 2, `应累计 2 次失败，实际 ${SP.fails}`);
  ok(gp.mastOf('thunder') === 58, `失败两次应 50+4+4=58%，实际 ${gp.mastOf('thunder')}`);
  ok(!SP.known.includes('thunder'), '前两次应失败');

  SP.slots = [gp.schoolSlot(), gp.wareSlot(0)];
  gp.attempt();
  ok(SP.known.includes('thunder'), '第 3 次应保底成功');
  ok(SP.fails === 0, '成功后失败计数应清零');
  ok(SP.ware.length === 1 && SP.ware[0] === 'thunder', `成功应 -2 +1，实际 ${SP.ware.join(',')}`);
}

// ---------------------------------------------------------------- 八、还原
{
  const gr = boot(() => 0);
  const SR = gr.state;
  gr.chooseSchool('water');
  SR.ware = ['fire', 'ice'];
  SR.slots = [gr.wareSlot(0), gr.wareSlot(1)];
  gr.attempt();
  ok(SR.ware.length === 0, `还原产物是本系 ∞，不应入库，实际 ${SR.ware.join(',')}`);
  ok(SR.log[0] && SR.log[0].type === 'reduce', '还原应记进合成列表');

  SR.ware = ['fire', 'ice'];
  SR.slots = [gr.wareSlot(0), gr.wareSlot(1)];
  ok(gr.rateOf(gr.pairOf()) === 75, '还原成功率应固定 75%');
}

// ---------------------------------------------------------------- 九、阶级
{
  const gR = boot(() => 0);
  const SR = gR.state;
  ok(gR.rankOf().name === '见习魔法师', '初始应见习');
  SR.known = ['fire', 'water', 'wind', 'earth', 'thunder', 'blast', 'metal'];
  ok(gR.rankOf().name === '中级魔法师', `4基础+3新发现应为中级，实际 ${gR.rankOf().name}`);
  SR.known = SR.known.concat(['ice', 'poison', 'sand', 'glass', 'mud']);
  ok(gR.rankOf().name === '高级魔法师', `4基础+7新发现应为高级，实际 ${gR.rankOf().name}`);
}

// ---------------------------------------------------------------- 十、全流程节奏（真随机，模拟玩家）
const g2 = boot(Math.random);
const S2 = g2.state;
g2.chooseSchool('fire');

function recipeKeyOf(pid) {
  for (const [k, r] of Object.entries(g2.RECIPES)) if (r.element === pid && !r.reduce) return k;
  return null;
}
// 这个产物还值得炼吗：没见过，或它是某个没见过的元素的原料、且手头没有
function worth(pid) {
  if (!S2.known.includes(pid)) return true;
  if (S2.ware.includes(pid)) return false;
  return ALL.some(u => !S2.known.includes(u) && (recipeKeyOf(u) || '').split('+').includes(pid));
}
function moves() {
  const out = [];
  for (let i = 0; i < S2.ware.length; i++) {
    const a = S2.school, b = S2.ware[i];
    const r = g2.RECIPES[a < b ? a + '+' + b : b + '+' + a];
    if (r && !r.reduce && worth(r.element)) out.push([{ src: 'school' }, { src: 'ware', i }]);
  }
  for (let i = 0; i < S2.ware.length; i++) {
    for (let j = i + 1; j < S2.ware.length; j++) {
      const a = S2.ware[i], b = S2.ware[j];
      const r = g2.RECIPES[a < b ? a + '+' + b : b + '+' + a];
      if (r && !r.reduce && worth(r.element)) out.push([{ src: 'ware', i }, { src: 'ware', i: j }]);
    }
  }
  return out;
}

let acts = 0, marks = 0, last = 4;
while (acts < 4000 && S2.known.length < ALL.length) {
  const mv = moves();
  if (mv.length) {
    S2.slots = mv[Math.floor(Math.random() * mv.length)];
    g2.attempt(); acts++;
    if (S2.known.length > last) { marks++; last = S2.known.length; }
  } else if (S2.ware.length < g2.WARE_CAP - 4) {
    g2.refresh(); acts++;
  } else {
    // 丢一个"当前没用"的材料，优先丢基础
    let idx = S2.ware.findIndex(id => BASE.includes(id) && id !== S2.school);
    if (idx < 0) idx = 0;
    g2.discard(idx); acts++;
  }
}

console.log(fails === 0
  ? `PASS  元素 ${ALL.length} · 配方 ${Object.keys(R).length} 条 · 全部可达 · 选系/上限/保底`
  : `FAIL  ${fails} 项`);
console.log(`节奏：${acts} 次操作 → 发现 ${S2.known.length}/${ALL.length} 种，掌握 ${S2.mastered.length}；平均 ${marks ? (acts / marks).toFixed(1) : '—'} 次/种`);
if (S2.known.length < ALL.length) {
  console.log('  未完成：缺', ALL.filter(x => !S2.known.includes(x)).join(',') || '—');
}
process.exit(fails === 0 ? 0 : 1);
