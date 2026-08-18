// ==========================================================================
// fluid_wasm.cpp — fluid.hpp를 브라우저에서 쓸 수 있게 감싼 것.
//
// Emscripten을 쓰지 않는다. clang의 wasm32 타깃과 wasm-ld만으로 빌드하며,
// 결과는 .wasm 파일 하나다. 런타임도, 생성된 글루 코드도 없다.
// 저장소의 "외부 라이브러리 최소화"와 같은 이유다.
//
// 힙을 쓰지 않는다. 값을 주고받는 자리는 고정된 스크래치 버퍼 하나뿐이다.
// ==========================================================================

#ifndef FLUID_FREESTANDING
#define FLUID_FREESTANDING
#endif
#include "fluid/fluid.hpp"

namespace {

// [0] 값, [1] 속도, [2..] 스냅 지점 입력
constexpr fluid::size_type kScratchSize = 64;
double g_scratch[kScratchSize] = {};

constexpr fluid::size_type kTrackerCount = 8;
fluid::VelocityTracker g_trackers[kTrackerCount] = {
    fluid::VelocityTracker(100.0), fluid::VelocityTracker(100.0),
    fluid::VelocityTracker(100.0), fluid::VelocityTracker(100.0),
    fluid::VelocityTracker(100.0), fluid::VelocityTracker(100.0),
    fluid::VelocityTracker(100.0), fluid::VelocityTracker(100.0),
};

}  // namespace

extern "C" {

/// 스크래치 버퍼의 주소. JS는 여기에 Float64Array를 얹는다.
double* fluid_scratch() { return g_scratch; }
int fluid_scratch_size() { return static_cast<int>(kScratchSize); }

/// 스프링 한 프레임. 결과는 scratch[0]=값, scratch[1]=속도.
/// 정착했으면 1을 돌려준다.
///
/// 스프링 상태를 wasm 안에 두지 않는 이유: 브라우저 쪽 Spring은 rAF와
/// 가시성 처리를 함께 들고 있어야 하고, 그건 물리가 아니다. 여기서는
/// 순수한 적분 한 걸음만 맡는다.
int fluid_spring_step(double value, double velocity, double target,
                      double damping, double response, double dt) {
  fluid::Spring s(damping, response, value, velocity);
  s.setTarget(target, velocity);
  const bool rested = s.step(dt);
  g_scratch[0] = s.value();
  g_scratch[1] = s.velocity();
  return rested ? 1 : 0;
}

double fluid_project(double velocity, double decelerationRate) {
  return fluid::project(velocity, decelerationRate);
}

double fluid_rubberband(double overshoot, double dimension, double constant) {
  return fluid::rubberband(overshoot, dimension, constant);
}

/// 스냅 지점은 scratch[2]부터 count개를 읽는다.
double fluid_nearest_snap(double projected, int count) {
  if (count < 0) count = 0;
  const fluid::size_type n = static_cast<fluid::size_type>(count);
  if (n + 2 > kScratchSize) return projected;
  return fluid::nearestSnapPoint(projected, g_scratch + 2, n);
}

void fluid_tracker_reset(int id) {
  if (id < 0 || static_cast<fluid::size_type>(id) >= kTrackerCount) return;
  g_trackers[id].reset();
}

void fluid_tracker_add(int id, double position, double timeMs) {
  if (id < 0 || static_cast<fluid::size_type>(id) >= kTrackerCount) return;
  g_trackers[id].add(position, timeMs);
}

double fluid_tracker_velocity(int id) {
  if (id < 0 || static_cast<fluid::size_type>(id) >= kTrackerCount) return 0.0;
  return g_trackers[id].velocity();
}

}  // extern "C"
