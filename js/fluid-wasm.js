// ==========================================================================
// fluid-wasm.js — fluid.js와 같은 API. 물리만 WebAssembly가 맡는다.
//
// 무엇을 어디에 두었는지가 이 파일의 전부다.
//
//   wasm(C++)  스프링 적분 한 걸음, 모멘텀 투영, 러버밴딩, 스냅 선택,
//              속도 추적. 값이 어떻게 변하는지 — 즉 물리.
//
//   JS         requestAnimationFrame, 감시견, document.hidden, 콜백.
//              브라우저에서 시계를 얻고 화면에 반영하는 방법.
//
// 경계를 이렇게 그은 이유는 물리가 플랫폼과 무관하기 때문이다. 같은 물리가
// cpp/tests에서는 네이티브로, 여기서는 wasm으로 돌고, 두 경로 모두 원본
// fluid.js와 같은 값을 낸다는 것을 테스트가 확인한다.
//
// 모듈은 5KB 남짓이고 Emscripten 런타임이 없다.
// ==========================================================================

const WASM_URL = new URL('./fluid.wasm', import.meta.url);

let mod = null; // { exports, scratch: Float64Array }

/** wasm을 한 번만 받아 온다. 실패하면 호출자가 JS 구현으로 되돌아갈 수 있다. */
export async function loadFluidWasm() {
  if (mod) return mod;
  // instantiateStreaming은 서버가 application/wasm을 주지 않으면 거부한다.
  // 그럴 때는 받아 둔 바이트로 다시 시도한다 — 실패할 이유가 MIME뿐이면
  // 사용자가 대가를 치를 이유가 없다.
  const response = await fetch(WASM_URL);
  if (!response.ok) throw new Error(`fluid.wasm ${response.status}`);

  let instance;
  if (typeof WebAssembly.instantiateStreaming === 'function') {
    try {
      ({ instance } = await WebAssembly.instantiateStreaming(response.clone(), {}));
    } catch (err) {
      ({ instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {}));
    }
  } else {
    ({ instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {}));
  }

  const exports = instance.exports;
  const base = exports.fluid_scratch();
  const size = exports.fluid_scratch_size();
  mod = {
    exports,
    scratch: new Float64Array(exports.memory.buffer, base, size),
  };
  return mod;
}

export const isReady = () => mod !== null;

// --------------------------------------------------------------------------
// 순수 함수 — 원본과 같은 이름, 같은 기본값
// --------------------------------------------------------------------------

export function project(velocity, decelerationRate = 0.998) {
  return mod.exports.fluid_project(velocity, decelerationRate);
}

export function rubberband(overshoot, dimension, constant = 0.55) {
  return mod.exports.fluid_rubberband(overshoot, dimension, constant);
}

export function nearestSnapPoint(projected, points) {
  const n = Math.min(points.length, mod.scratch.length - 2);
  for (let i = 0; i < n; i += 1) mod.scratch[2 + i] = points[i];
  return mod.exports.fluid_nearest_snap(projected, n);
}

// --------------------------------------------------------------------------
// Spring — 겉모습은 fluid.js와 같다. 적분 한 줄만 wasm으로 넘어간다.
// --------------------------------------------------------------------------

export class Spring {
  constructor({ damping = 1, response = 0.4, value = 0, velocity = 0, onUpdate, onRest } = {}) {
    this.damping = damping;
    this.response = response;
    this.value = value;
    this.velocity = velocity;
    this.target = value;
    this.onUpdate = onUpdate;
    this.onRest = onRest;
    this._raf = null;
    this._last = 0;
  }

  get isAnimating() {
    return this._raf !== null;
  }

  setTarget(target, velocity) {
    this.target = target;
    if (typeof velocity === 'number') this.velocity = velocity;
    this._start();
  }

  setValue(value, velocity = 0) {
    this.stop();
    this.value = value;
    this.velocity = velocity;
    this.onUpdate?.(this.value, this.velocity);
  }

  stop() {
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  finish() {
    if (this.value === this.target && this.velocity === 0) return;
    this.stop();
    this.value = this.target;
    this.velocity = 0;
    this.onUpdate?.(this.value, 0);
    this.onRest?.();
  }

  _start() {
    if (this._raf !== null) return;
    if (typeof document !== 'undefined' && document.hidden) {
      this.finish();
      return;
    }

    this._last = performance.now();

    let sawFrame = false;
    const watchdog = setTimeout(() => {
      if (!sawFrame) this.finish();
    }, 1000);

    const step = (now) => {
      sawFrame = true;
      clearTimeout(watchdog);
      const dt = (now - this._last) / 1000; // 상한은 wasm 쪽에서 건다
      this._last = now;

      // ↓ 여기가 C++로 넘어가는 유일한 지점이다
      const rested = mod.exports.fluid_spring_step(
        this.value, this.velocity, this.target, this.damping, this.response, dt
      );
      this.value = mod.scratch[0];
      this.velocity = mod.scratch[1];

      this.onUpdate?.(this.value, this.velocity);

      if (rested) {
        this.value = this.target;
        this.velocity = 0;
        this.onUpdate?.(this.value, 0);
        this._raf = null;
        this.onRest?.();
        return;
      }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
}

// --------------------------------------------------------------------------
// VelocityTracker — 표본 이력은 wasm이 들고 있다
// --------------------------------------------------------------------------

let nextTrackerId = 0;

export class VelocityTracker {
  constructor() {
    // wasm 쪽 풀은 8개다. 이 페이지가 동시에 쓰는 수보다 넉넉하다.
    this.id = nextTrackerId++ % 8;
    mod.exports.fluid_tracker_reset(this.id);
  }

  add(position) {
    mod.exports.fluid_tracker_add(this.id, position, performance.now());
  }

  get velocity() {
    return mod.exports.fluid_tracker_velocity(this.id);
  }

  reset() {
    mod.exports.fluid_tracker_reset(this.id);
  }
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function finishOnHide(...springs) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) springs.forEach((s) => s.finish());
  });
}
