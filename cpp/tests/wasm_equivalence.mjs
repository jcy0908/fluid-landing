// ==========================================================================
// wasm_equivalence.mjs — js/fluid.js와 js/fluid-wasm.js가 같은 값을 내는가.
//
// cpp/tests/test_fluid.cpp는 네이티브 C++가 원본 JS와 같은지를 본다.
// 이 파일은 그 C++를 wasm으로 빌드해 브라우저에 실어도 값이 그대로인지를
// 본다. 사이트를 wasm 쪽으로 바꿔 끼워도 움직임이 달라지지 않아야 한다.
//
//   node cpp/tests/wasm_equivalence.mjs
// ==========================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const wasmPath = fileURLToPath(new URL('../../js/fluid.wasm', import.meta.url));

// 브라우저 환경을 최소한으로 흉내 낸다. 시계는 우리가 쥔다.
let clock = 0;
let pending = null;
globalThis.performance = { now: () => clock };
globalThis.requestAnimationFrame = (cb) => ((pending = cb), 1);
globalThis.cancelAnimationFrame = () => (pending = null);
globalThis.fetch = async () =>
  new Response(readFileSync(wasmPath), { headers: { 'Content-Type': 'application/wasm' } });

const js = await import('../../js/fluid.js');
const wa = await import('../../js/fluid-wasm.js');
await wa.loadFluidWasm();

const DT = 1000 / 60;

/** 한 모듈의 Spring으로 시나리오를 돌려 프레임 기록을 얻는다. */
function run(mod, opts, frames, mutate) {
  clock = 0;
  pending = null;
  const s = new mod.Spring(opts);
  const out = [];
  mutate(-1, s);
  for (let i = 0; i < frames; i += 1) {
    mutate(i, s);
    if (!pending) {
      out.push([s.value, s.velocity]);
      continue;
    }
    clock += DT;
    const cb = pending;
    pending = null;
    cb(clock);
    out.push([s.value, s.velocity]);
  }
  return out;
}

const scenarios = [
  {
    name: '임계 감쇠 0 → 100',
    opts: { damping: 1, response: 0.4, value: 0 },
    mutate: (i, s) => { if (i === -1) s.setTarget(100); },
  },
  {
    name: '던진 뒤 (속도 인계 + 탄성)',
    opts: { damping: 0.8, response: 0.3, value: 0 },
    mutate: (i, s) => { if (i === -1) s.setTarget(100, 800); },
  },
  {
    name: '가는 중에 목표 반전',
    opts: { damping: 1, response: 0.4, value: 0 },
    mutate: (i, s) => {
      if (i === -1) s.setTarget(200);
      if (i === 15) s.setTarget(-50);
    },
  },
  {
    name: '붙잡았다 놓기',
    opts: { damping: 1, response: 0.35, value: 0 },
    mutate: (i, s) => {
      if (i === -1) s.setTarget(300);
      if (i === 10) s.setValue(120, 0);
      if (i === 14) s.setValue(150, 900);
      if (i === 15) s.setTarget(400, 900);
    },
  },
];

let pass = 0;
let fail = 0;
const TOL = 1e-9;

console.log('\njs/fluid.js ↔ js/fluid-wasm.js 동등성\n');

for (const sc of scenarios) {
  const a = run(js, sc.opts, 60, sc.mutate);
  const b = run(wa, sc.opts, 60, sc.mutate);
  let bad = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let k = 0; k < 2; k += 1) {
      const scale = Math.max(1, Math.abs(a[i][k]));
      if (Math.abs(a[i][k] - b[i][k]) > TOL * scale) {
        if (bad < 3) {
          console.log(`  x ${sc.name} 프레임 ${i} ${k ? '속도' : '값'}`);
          console.log(`      js   ${a[i][k]}`);
          console.log(`      wasm ${b[i][k]}`);
        }
        bad += 1;
      }
    }
  }
  if (bad === 0) {
    pass += 1;
    console.log(`  o ${sc.name} — 60 프레임 전부 일치`);
  } else {
    fail += 1;
    console.log(`  x ${sc.name} — ${bad}건 불일치`);
  }
}

console.log('\n순수 함수\n');

const near = (what, got, want) => {
  const scale = Math.max(1, Math.abs(want));
  if (Math.abs(got - want) <= TOL * scale) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`  x ${what}: js ${want} / wasm ${got}`);
  }
};

for (const v of [0, 120, -340, 1500, 42.5]) near(`project(${v})`, wa.project(v), js.project(v));
console.log('  o 모멘텀 투영 5개');

for (const [o, d] of [[10, 400], [120, 400], [-80, 320], [500, 200], [0, 100]]) {
  near(`rubberband(${o},${d})`, wa.rubberband(o, d), js.rubberband(o, d));
}
console.log('  o 러버밴딩 5개');

const points = [0, -287, -574, -861, -993];
for (const p of [-10, -300, -700, -2000, 50]) {
  near(`nearestSnapPoint(${p})`, wa.nearestSnapPoint(p, points), js.nearestSnapPoint(p, points));
}
console.log('  o 스냅 선택 5개');

{
  clock = 0;
  const t1 = new js.VelocityTracker(100);
  const t2 = new wa.VelocityTracker();
  for (const [pos, time] of [[0, 0], [10, 16], [24, 32], [45, 48], [72, 64], [110, 80]]) {
    clock = time;
    t1.add(pos);
    t2.add(pos);
  }
  near('VelocityTracker.velocity', t2.velocity, t1.velocity);
  console.log('  o 속도 추적');
}

console.log(`\n통과 ${pass} / 실패 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
