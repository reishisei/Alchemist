// 沙盒 v0.3 无头模拟：15 波、两次加元素、六次强化、城墙胜负
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'sandbox.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeCtx() {
  const noop = () => {};
  const c = {
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 })
  };
  for (const k of ['clearRect','fillRect','strokeRect','beginPath','closePath','arc','arcTo','rect',
    'moveTo','lineTo','stroke','fill','save','restore','translate','rotate','scale','clip',
    'fillText','strokeText','setLineDash','quadraticCurveTo','bezierCurveTo','ellipse','drawImage']) c[k] = noop;
  return c;
}

function makeEl(ctx) {
  const el = {
    className: '', textContent: '', style: {}, children: [],
    getContext: () => ctx,
    addEventListener: () => {},
    appendChild: () => {},
    replaceChildren: () => {},
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 }),
    setAttribute: () => {},
    getAttribute: () => null,
    onclick: null,
    classList: { add() {}, remove() {} }
  };
  let h = '';
  Object.defineProperty(el, 'innerHTML', { get: () => h, set: v => { h = v; } });
  return el;
}

const ctx = makeCtx();
const nodes = new Map();
const el = () => { if (!nodes.has('_')) nodes.set('_', makeEl(ctx)); return nodes.get('_'); };
const document = {
  getElementById(id) { if (!nodes.has(id)) nodes.set(id, makeEl(ctx)); return nodes.get(id); },
  createElement() { return makeEl(ctx); },
  addEventListener() {}
};
const sandbox = {
  console, Math, Date, JSON, URLSearchParams,
  document,
  requestAnimationFrame: () => {},
  setTimeout, clearTimeout,
  addEventListener: () => {},
  removeEventListener: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);
vm.runInContext(code, context, { filename: 'sandbox.html<script>' });

const g = sandbox.window.__CG;
if (!g) { console.error('FAIL: __CG 未挂载'); process.exit(1); }

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fails++; } };
const MAX_FRAMES = 60 * 60 * 30;

const results = [];
for (const element of ['fire', 'water', 'wind', 'earth']) {
  for (const seed of [1, 2, 3]) {
    g.startRun(element, seed);
    const S = g.state;
    let frames = 0, choices = 0, formAt10 = null;
    while (frames < MAX_FRAMES && S.scene !== 'win' && S.scene !== 'lose') {
      if (S.scene === 'choice') {
        if (S.wave >= 10 && formAt10 == null) formAt10 = S.form;
        if (S.choiceType === 'element') {
          g.chooseElement(0);           // 元素按结果等级降序，取最高级
        } else {
          var pref = { dmg: 9, rate: 8, range: 7, splash: 6, pierce: 6, chain: 6,
                       slow: 5, dot: 5, knock: 4, amp: 5, charge: 3, wall: 1 };
          var best = 0, bestScore = -1e9;
          for (var ci = 0; ci < S.choices.length; ci++) {
            var c = S.choices[ci];
            var sc = pref[c.id] || 0;
            if (c.id === 'wall' && S.wall < 55) sc += 100;
            if (c.id === 'wall' && S.wall > 85) sc -= 50;
            if (sc > bestScore) { bestScore = sc; best = ci; }
          }
          g.chooseUpgrade(best);
        }
        choices++;
        continue;
      }
      g.update(1 / 60);
      frames++;
    }
    const row = {
      element, seed, scene: S.scene, wave: S.wave,
      wall: Math.round(S.wall), kills: S.stats.kills,
      form: S.form, tier: g.ELEMS[S.form].tier,
      ults: S.stats.ults, choices,
      time: +(frames / 60).toFixed(1),
      upgrades: S.stats.upgrades.join(' / ')
    };
    results.push(row);
    ok(S.scene === 'win' || S.scene === 'lose', `${element}/${seed} 没有结束`);
    ok(frames < MAX_FRAMES, `${element}/${seed} 超时`);
    ok(Number.isFinite(S.wall), `${element}/${seed} 城墙 NaN`);
    if (S.scene === 'win') ok(S.wave === 15, `${element}/${seed} 赢了但不是 15 波`);
  }
}

console.log(JSON.stringify(results, null, 2));
const wins = results.filter(r => r.scene === 'win').length;
console.log(`--- ${wins}/${results.length} 胜 · 失败 ${results.filter(r => r.scene === 'lose').length}`);
console.log(fails === 0 ? 'PASS 沙盒 15 波流程' : `FAIL ${fails} 项`);
process.exit(fails === 0 ? 0 : 1);
