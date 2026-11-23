// 无头模拟：把 index.html 里的脚本抽出来，在 node 里跑一遍，验证逻辑不炸、能通关/能失败。
// 用法：node test/sim.js [策略]   策略 = bot | idle | random
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeCtx() {
  const noop = () => {};
  const ctx = {
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
  };
  for (const k of ['clearRect','fillRect','strokeRect','beginPath','closePath','arc','arcTo','rect',
    'moveTo','lineTo','stroke','fill','save','restore','translate','rotate','scale','clip',
    'fillText','strokeText','setLineDash','quadraticCurveTo','bezierCurveTo','ellipse','drawImage']) {
    ctx[k] = noop;
  }
  return ctx;
}

function makeEl() {
  const el = {
    className: '', innerHTML: '', textContent: '',
    getContext: () => ctx, querySelectorAll: () => [],
    addEventListener: () => {}, appendChild: () => {}, setAttribute: () => {},
    style: {}, onclick: null,
    replaceChildren() {},
  };
  return el;
}

const ctx = makeCtx();
const sandbox = {
  console,
  Math, Date, JSON,
  document: { getElementById: () => makeEl(), createElement: () => makeEl(),
              addEventListener: () => {} },
  location: { search: '' },
  URLSearchParams,
  requestAnimationFrame: () => {},
  setTimeout, clearTimeout,
  addEventListener: () => {},
  removeEventListener: () => {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);
vm.runInContext(code, context, { filename: 'index.html<script>' });

const g = sandbox.window.__CG;
if (!g) { console.error('FAIL: __CG 未挂载'); process.exit(1); }

const strategy = process.argv[2] || 'bot';
const DT = 1 / 60;
const MAX_SECONDS = 900;

let frames = 0;
const log = [];
let lastLevel = -1;

g.resetGame();
g.startLevel(0);

const SEQ = ['charge', 'multi', 'pierce', 'range'];

while (frames < MAX_SECONDS * 60) {
  const S = g.getState();

  if (S.scene === 'upgrade') {
    const id = SEQ[(S.level) % SEQ.length];
    g.applyUpgrade(id);
    log.push(`[通关] 第 ${S.level + 1} 关  城墙 ${Math.round(S.wall)}  用时 ${S.t.toFixed(1)}s  击杀 ${S.stats.kills}`);
    g.startLevel(S.level + 1);
    continue;
  }
  if (S.scene === 'lose') {
    log.push(`[失败] 第 ${S.level + 1} 关  城墙 0  用时 ${S.t.toFixed(1)}s  击杀 ${S.stats.kills}`);
    break;
  }
  if (S.scene === 'win') {
    log.push(`[通关全部] 剩余城墙 ${Math.round(S.wall)}  击杀 ${S.stats.kills}`);
    break;
  }
  if (S.scene !== 'play') break;

  if (strategy === 'bot' || strategy === 'nocraft') {
    // 1. 集火最靠下的一路
    let best = null;
    for (const m of S.monsters) if (!best || m.y > best.y) best = m;
    if (best) g.setFocus(best.lane);

    // 2. 按威胁合成
    if (strategy === 'bot' && !S.channel) {
      const has = (tp) => S.monsters.filter(m => m.type === tp).length >= 2;
      const aff = (id) => {
        const f = { light: { earth: 1, fire: 1 }, scorch: { fire: 1, wind: 1 }, mud: { water: 1, earth: 1 } }[id];
        return Object.keys(f).every(k => (S.elems[k] || 0) >= f[k]);
      };
      if (has('phantom') && S.fx.light <= 0 && aff('light')) g.tryCraft('light');
      else if (has('regen') && S.fx.scorch <= 0 && aff('scorch')) g.tryCraft('scorch');
      else if (has('runner') && S.fx.mud <= 0 && aff('mud')) g.tryCraft('mud');
    }
  }

  g.update(DT);
  frames++;
}

const S = g.getState();
const summary = {
  strategy,
  frames,
  scene: S.scene,
  level: S.level + 1,
  wall: Math.round(S.wall),
  kills: S.stats.kills,
  shots: S.stats.shots,
  hits: S.stats.hits,
  dodged: S.stats.dodged,
  healed: Math.round(S.stats.healed),
  reach: S.stats.reach,
  elems: S.elems,
};
console.log(log.join('\n'));
console.log('---');
console.log(JSON.stringify(summary, null, 2));
