// ==========================================================================
// gen_golden.mjs — 기준값을 만든다.
//
// 물리를 다시 구현해서 비교하면 아무것도 증명하지 못한다. 그래서 실제로
// 브라우저에서 돌아가는 ../../js/fluid.js를 그대로 import하고, 시계만
// 가상으로 바꿔 끼운다. requestAnimationFrame을 우리가 쥐고 있으므로
// 프레임 간격을 고정할 수 있고, 결과는 매번 같다.
//
//   node cpp/tools/gen_golden.mjs > cpp/tests/golden.hpp
// ==========================================================================

let clock = 0; // ms
let pending = null;

globalThis.performance = { now: () => clock };
globalThis.requestAnimationFrame = (cb) => {
  pending = cb;
  return 1;
};
globalThis.cancelAnimationFrame = () => {
  pending = null;
};

const { Spring, project, rubberband, nearestSnapPoint, VelocityTracker } = await import(
  '../../js/fluid.js'
);

/** 고정 간격으로 n프레임 전진시키며 (value, velocity)를 기록한다. */
function run(spring, frames, dtMs, mutate) {
  const out = [];
  for (let i = 0; i < frames; i += 1) {
    if (mutate) mutate(i, spring);
    if (!pending) {
      // 정착해서 멈춘 상태 — 이후 프레임은 값이 유지된다
      out.push([spring.value, spring.velocity, 0]);
      continue;
    }
    // JS는 누적된 시계에서 dt를 뽑으므로 부동소수 누적 오차가 섞인다.
    // C++가 같은 값을 쓰도록 프레임마다 실제 dt를 함께 기록한다.
    const before = clock;
    clock += dtMs;
    const dt = (clock - before) / 1000;
    const cb = pending;
    pending = null;
    cb(clock);
    out.push([spring.value, spring.velocity, dt]);
  }
  return out;
}

const DT = 1000 / 60;
const cases = [];

// 1. 기본 UI 스프링 — 임계 감쇠, 오버슈트 없음
{
  const s = new Spring({ damping: 1, response: 0.4, value: 0 });
  s.setTarget(100);
  cases.push({ name: 'critical_0_to_100', damping: 1, response: 0.4, frames: run(s, 60, DT) });
}

// 2. 던진 뒤 — 살짝 튀고, 시작 속도를 물려받는다
{
  const s = new Spring({ damping: 0.8, response: 0.3, value: 0 });
  s.setTarget(100, 800);
  cases.push({ name: 'bouncy_with_handoff', damping: 0.8, response: 0.3, frames: run(s, 60, DT) });
}

// 3. 반전 — 가는 중에 목표를 뒤집어도 값이 이어진다
{
  const s = new Spring({ damping: 1, response: 0.4, value: 0 });
  s.setTarget(200);
  const frames = run(s, 60, DT, (i, sp) => {
    if (i === 15) sp.setTarget(-50);
  });
  cases.push({ name: 'reverse_midflight', damping: 1, response: 0.4, frames });
}

// 4. 붙잡았다 놓기 — setValue로 1:1 추적하다 속도를 넘긴다
{
  const s = new Spring({ damping: 1, response: 0.35, value: 0 });
  s.setTarget(300);
  const frames = run(s, 60, DT, (i, sp) => {
    if (i === 10) sp.setValue(120, 0);      // 손가락이 붙잡았다
    if (i === 14) sp.setValue(150, 900);    // 끌고 있다
    if (i === 15) sp.setTarget(400, 900);   // 놓았다 — 속도 인계
  });
  cases.push({ name: 'grab_then_release', damping: 1, response: 0.35, frames });
}

const fmt = (x) => (Object.is(x, -0) ? '0' : x.toPrecision(17));

let out = '';
out += '// 자동 생성 파일 — 손으로 고치지 않는다.\n';
out += '//   node cpp/tools/gen_golden.mjs > cpp/tests/golden.hpp\n';
out += '// 값의 출처는 실제 js/fluid.js이며, 가상 시계로 1/60초씩 전진시킨 결과다.\n';
out += '#ifndef FLUID_TESTS_GOLDEN_HPP\n#define FLUID_TESTS_GOLDEN_HPP\n\n';
out += '#include <cstddef>\n\nnamespace golden {\n\n';
out += 'inline constexpr double kDt = ' + fmt(DT / 1000) + ';\n\n';

for (const c of cases) {
  out += 'inline constexpr double k_' + c.name + '_damping = ' + fmt(c.damping) + ';\n';
  out += 'inline constexpr double k_' + c.name + '_response = ' + fmt(c.response) + ';\n';
  out += 'inline constexpr double k_' + c.name + '[][3] = {\n';
  for (const [v, vel, dt] of c.frames) out += '    {' + fmt(v) + ', ' + fmt(vel) + ', ' + fmt(dt) + '},\n';
  out += '};\n';
  out += 'inline constexpr std::size_t k_' + c.name + '_n = ' + c.frames.length + ';\n\n';
}

// 순수 함수들
const projectCases = [0, 120, -340, 1500, 42.5];
out += 'inline constexpr double kProjectIn[] = {' + projectCases.map(fmt).join(', ') + '};\n';
out += 'inline constexpr double kProjectOut[] = {' + projectCases.map((v) => fmt(project(v))).join(', ') + '};\n';
out += 'inline constexpr std::size_t kProjectN = ' + projectCases.length + ';\n\n';

const rbCases = [[10, 400], [120, 400], [-80, 320], [500, 200], [0, 100]];
out += 'inline constexpr double kRubberIn[][2] = {' + rbCases.map(([a, b]) => '{' + fmt(a) + ', ' + fmt(b) + '}').join(', ') + '};\n';
out += 'inline constexpr double kRubberOut[] = {' + rbCases.map(([a, b]) => fmt(rubberband(a, b))).join(', ') + '};\n';
out += 'inline constexpr std::size_t kRubberN = ' + rbCases.length + ';\n\n';

const snapPoints = [0, -287, -574, -861, -993];
const snapProbes = [-10, -300, -700, -2000, 50];
out += 'inline constexpr double kSnapPoints[] = {' + snapPoints.map(fmt).join(', ') + '};\n';
out += 'inline constexpr std::size_t kSnapPointsN = ' + snapPoints.length + ';\n';
out += 'inline constexpr double kSnapProbe[] = {' + snapProbes.map(fmt).join(', ') + '};\n';
out += 'inline constexpr double kSnapExpect[] = {' + snapProbes.map((p) => fmt(nearestSnapPoint(p, snapPoints))).join(', ') + '};\n';
out += 'inline constexpr std::size_t kSnapN = ' + snapProbes.length + ';\n\n';

// 속도 추적 — 시각을 명시해 결정적으로 만든다
{
  const t = new VelocityTracker(100);
  const samples = [[0, 0], [10, 16], [24, 32], [45, 48], [72, 64], [110, 80]];
  clock = 0;
  for (const [pos, time] of samples) {
    clock = time;
    t.add(pos);
  }
  out += 'inline constexpr double kTrackSamples[][2] = {' + samples.map(([p, tm]) => '{' + fmt(p) + ', ' + fmt(tm) + '}').join(', ') + '};\n';
  out += 'inline constexpr std::size_t kTrackN = ' + samples.length + ';\n';
  out += 'inline constexpr double kTrackVelocity = ' + fmt(t.velocity) + ';\n\n';
}

out += '}  // namespace golden\n\n#endif  // FLUID_TESTS_GOLDEN_HPP\n';
process.stdout.write(out);
