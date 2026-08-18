// ==========================================================================
// test_fluid.cpp — C++ 구현이 js/fluid.js와 같은 값을 내는지 확인한다.
//
// 기준값(golden.hpp)은 실제 js/fluid.js를 가상 시계로 돌려 뽑은 것이다.
// 재구현본끼리 비교하면 아무것도 증명하지 못하므로, 브라우저에서 돌아가는
// 그 파일을 그대로 쓴다.
//
// 프레임마다 JS가 실제로 사용한 dt를 함께 받아 쓴다. JS는 누적된 시계에서
// dt를 뽑기 때문에 프레임마다 미세하게 다르고, 그것까지 맞춰야 비교가
// 의미를 가진다.
//
// 외부 테스트 프레임워크를 쓰지 않는다 — 저장소의 "의존성 최소화" 원칙과
// 같은 이유다.
// ==========================================================================

#include "fluid/fluid.hpp"
#include "golden.hpp"

#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace {

int g_pass = 0;
int g_fail = 0;

void expectNear(const std::string& what, double got, double want, double tol = 1e-9) {
  const double diff = std::fabs(got - want);
  const double scale = std::fmax(1.0, std::fabs(want));
  if (diff <= tol * scale) {
    ++g_pass;
    return;
  }
  ++g_fail;
  std::printf("  x %s\n      기대 %.17g\n      실제 %.17g\n      차이 %.3g\n",
              what.c_str(), want, got, diff);
}

void expectTrue(const std::string& what, bool cond) {
  if (cond) {
    ++g_pass;
    return;
  }
  ++g_fail;
  std::printf("  x %s\n", what.c_str());
}

/// golden의 한 시나리오를 그대로 재생한다.
/// mutate는 JS의 run()과 같은 자리 — 프레임을 전진시키기 '전'에 불린다.
template <typename Mutate>
void replay(const std::string& name, double damping, double response,
            const double frames[][3], std::size_t n, Mutate mutate) {
  fluid::Spring s(damping, response, 0.0, 0.0);
  mutate(-1, s);  // 루프 전 초기 설정

  int mismatches = 0;
  for (std::size_t i = 0; i < n; ++i) {
    mutate(static_cast<int>(i), s);
    if (s.isAnimating()) s.step(frames[i][2]);

    const double wantValue = frames[i][0];
    const double wantVelocity = frames[i][1];
    if (std::fabs(s.value() - wantValue) > 1e-9 * std::fmax(1.0, std::fabs(wantValue)) ||
        std::fabs(s.velocity() - wantVelocity) > 1e-9 * std::fmax(1.0, std::fabs(wantVelocity))) {
      if (mismatches < 3) {
        std::printf("  x %s 프레임 %zu\n      값   기대 %.17g / 실제 %.17g\n"
                    "      속도 기대 %.17g / 실제 %.17g\n",
                    name.c_str(), i, wantValue, s.value(), wantVelocity, s.velocity());
      }
      ++mismatches;
    }
  }

  if (mismatches == 0) {
    ++g_pass;
    std::printf("  o %s — %zu 프레임 전부 일치\n", name.c_str(), n);
  } else {
    ++g_fail;
    std::printf("  x %s — %d 프레임 불일치\n", name.c_str(), mismatches);
  }
}

}  // namespace

int main() {
  std::printf("\nfluid.hpp ↔ js/fluid.js 동등성\n\n");

  replay("임계 감쇠 0 → 100", golden::k_critical_0_to_100_damping,
         golden::k_critical_0_to_100_response, golden::k_critical_0_to_100,
         golden::k_critical_0_to_100_n, [](int i, fluid::Spring& s) {
           if (i == -1) s.setTarget(100.0);
         });

  replay("던진 뒤 (속도 인계 + 탄성)", golden::k_bouncy_with_handoff_damping,
         golden::k_bouncy_with_handoff_response, golden::k_bouncy_with_handoff,
         golden::k_bouncy_with_handoff_n, [](int i, fluid::Spring& s) {
           if (i == -1) s.setTarget(100.0, 800.0);
         });

  replay("가는 중에 목표 반전", golden::k_reverse_midflight_damping,
         golden::k_reverse_midflight_response, golden::k_reverse_midflight,
         golden::k_reverse_midflight_n, [](int i, fluid::Spring& s) {
           if (i == -1) s.setTarget(200.0);
           if (i == 15) s.setTarget(-50.0);
         });

  replay("붙잡았다 놓기", golden::k_grab_then_release_damping,
         golden::k_grab_then_release_response, golden::k_grab_then_release,
         golden::k_grab_then_release_n, [](int i, fluid::Spring& s) {
           if (i == -1) s.setTarget(300.0);
           if (i == 10) s.setValue(120.0, 0.0);
           if (i == 14) s.setValue(150.0, 900.0);
           if (i == 15) s.setTarget(400.0, 900.0);
         });

  std::printf("\n순수 함수\n\n");

  for (std::size_t i = 0; i < golden::kProjectN; ++i) {
    expectNear("project(" + std::to_string(golden::kProjectIn[i]) + ")",
               fluid::project(golden::kProjectIn[i]), golden::kProjectOut[i]);
  }
  std::printf("  o 모멘텀 투영 %zu개\n", golden::kProjectN);

  for (std::size_t i = 0; i < golden::kRubberN; ++i) {
    expectNear("rubberband", fluid::rubberband(golden::kRubberIn[i][0], golden::kRubberIn[i][1]),
               golden::kRubberOut[i]);
  }
  std::printf("  o 러버밴딩 %zu개\n", golden::kRubberN);

  std::vector<double> points(golden::kSnapPoints, golden::kSnapPoints + golden::kSnapPointsN);
  for (std::size_t i = 0; i < golden::kSnapN; ++i) {
    expectNear("nearestSnapPoint", fluid::nearestSnapPoint(golden::kSnapProbe[i], points),
               golden::kSnapExpect[i]);
  }
  std::printf("  o 스냅 선택 %zu개\n", golden::kSnapN);

  {
    fluid::VelocityTracker t(100.0);
    for (std::size_t i = 0; i < golden::kTrackN; ++i) {
      t.add(golden::kTrackSamples[i][0], golden::kTrackSamples[i][1]);
    }
    expectNear("VelocityTracker.velocity", t.velocity(), golden::kTrackVelocity);
    std::printf("  o 속도 추적\n");
  }

  std::printf("\n경계 동작\n\n");
  {
    fluid::Spring s(1.0, 0.4, 0.0, 0.0);
    expectTrue("멈춰 있으면 step은 아무 일도 하지 않는다", !s.step(golden::kDt) && s.value() == 0.0);

    s.setTarget(100.0);
    s.finish();
    expectTrue("finish는 목표로 즉시 보낸다", s.value() == 100.0 && s.velocity() == 0.0);
    expectTrue("finish 뒤에는 멈춘다", !s.isAnimating());

    fluid::Spring big(1.0, 0.4, 0.0, 0.0);
    big.setTarget(100.0);
    big.step(10.0);  // 탭 복귀 등으로 크게 튄 프레임
    fluid::Spring clamped(1.0, 0.4, 0.0, 0.0);
    clamped.setTarget(100.0);
    clamped.step(fluid::kMaxDt);
    expectNear("큰 dt는 1/30초로 잘린다", big.value(), clamped.value());

    fluid::VelocityTracker empty(100.0);
    expectTrue("표본이 없으면 속도는 0", empty.velocity() == 0.0);
    empty.add(10.0, 5.0);
    expectTrue("표본이 하나면 속도는 0", empty.velocity() == 0.0);
    empty.add(20.0, 5.0);
    expectTrue("시간이 흐르지 않았으면 속도는 0", empty.velocity() == 0.0);

    expectNear("빈 스냅 목록은 투영값을 그대로", fluid::nearestSnapPoint(42.0, {}), 42.0);
  }
  std::printf("  o 경계 %d건\n", 9);

  std::printf("\n통과 %d / 실패 %d\n\n", g_pass, g_fail);
  return g_fail == 0 ? 0 : 1;
}
