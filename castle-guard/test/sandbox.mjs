// 沙盒 v0.4 无头模拟：水系起手、15 波、每波奖励、5 层印记、领域
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'sandbox.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeCtx() {
  const noop = () => {};
  const c = { createLinearGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }) };
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

const PREF = {
  stack: 12, proc: 11, procDur: 10, perhit: 9, decay: 4,
  domainPower: 12, domainCd: 11, domainRadius: 9,
  dmg: 8, rate: 7, range: 6, charge: 5, wall: 1
};

function pickUpgrade(S) {
  let best = 0, bestScore = -1e9;
  for (let i = 0; i < S.choices.length; i++) {
    const c = S.choices[i];
    let sc = PREF[c.id] || 0;
    if (c.id === 'wall' && S.wall < 55) sc += 100;
    if (c.id === 'wall' && S.wall > 90) sc -= 40;
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  return best;
}

const results = [];
for (const seed of [1, 2, 3]) {
  g.startRun('water', seed);
  const S = g.state;
  let frames = 0, choices = 0, formAfter5 = null, domainAfter10 = null;

  while (frames < MAX_FRAMES && S.scene !== 'win' && S.scene !== 'lose') {
    if (S.scene === 'choice') {
      if (S.choiceType === 'element') {
        const idx = S.choices.findIndex(c => c.base === 'wind');
        g.chooseElement(idx >= 0 ? idx : 0);
        formAfter5 = S.form;
      } else if (S.choiceType === 'domain') {
        const idx = S.choices.findIndex(c => !c.skip && g.DOMAINS[c.result]);
        g.chooseDomain(idx >= 0 ? idx : 0);
        domainAfter10 = S.domain;
      } else {
        g.chooseUpgrade(pickUpgrade(S));
      }
      choices++;
      continue;
    }
    g.update(1 / 60);
    frames++;
  }

  const row = {
    seed, scene: S.scene, wave: S.wave, wall: Math.round(S.wall),
    kills: S.stats.kills, form: S.form, domain: S.domain,
    choices, time: +(frames / 60).toFixed(1),
    upgrades: S.stats.upgrades.join(' / ')
  };
  results.push(row);
  ok(S.scene === 'win' || S.scene === 'lose', `seed ${seed} 没有结束`);
  ok(frames < MAX_FRAMES, `seed ${seed} 超时`);
  ok(Number.isFinite(S.wall), `seed ${seed} 城墙 NaN`);
  ok(S.form === 'ice', `seed ${seed} 元素应进化成冰，实际 ${S.form}`);
  ok(S.domain === 'frost', `seed ${seed} 领域应为霜雷，实际 ${S.domain}`);
  ok(choices === 14, `seed ${seed} 应有 14 次奖励，实际 ${choices}`);
  if (S.scene === 'win') ok(S.wave === 15, `seed ${seed} 赢了但不是 15 波`);
}

console.log(JSON.stringify(results, null, 2));
const wins = results.filter(r => r.scene === 'win').length;
console.log(`--- ${wins}/${results.length} 胜 · 失败 ${results.filter(r => r.scene === 'lose').length}`);
console.log(fails === 0 ? 'PASS 沙盒 v0.4 流程' : `FAIL ${fails} 项`);
process.exit(fails === 0 ? 0 : 1);
