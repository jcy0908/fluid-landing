// ==========================================================================
// throw.cpp — 던진 카드가 어디에 멈추는지 터미널에 그린다.
//
// 놓은 지점이 아니라 '가고 있던 곳'으로 간다는 것을 눈으로 보기 위한 예제다.
// 같은 속도라도 감속률에 따라 도달점이 달라진다.
// ==========================================================================

#include "fluid/fluid.hpp"

#include <cstdio>
#include <string>
#include <vector>

namespace {

constexpr int kWidth = 64;   // 트랙 폭(칸)
constexpr double kTrack = 900.0;  // 트랙 폭(px)

std::string row(double value, double landing) {
  std::string line(kWidth, ' ');
  const auto put = [&](double px, char c) {
    int i = static_cast<int>((px / kTrack) * (kWidth - 1) + 0.5);
    if (i < 0) i = 0;
    if (i >= kWidth) i = kWidth - 1;
    line[static_cast<std::size_t>(i)] = c;
  };
  put(landing, '|');  // 투영된 도달점
  put(value, 'O');    // 지금 위치
  return line;
}

void demo(const char* label, double releaseVelocity, double deceleration) {
  const double start = 120.0;
  const double landing = start + fluid::project(releaseVelocity, deceleration);

  fluid::Spring s(0.85, 0.4, start, 0.0);
  s.setTarget(landing, releaseVelocity);

  std::printf("\n%s — 놓은 속도 %.0f px/s, 감속률 %.3f\n", label, releaseVelocity, deceleration);
  std::printf("  투영 도달점 %.1f px (놓은 자리에서 %+.1f)\n\n", landing, landing - start);

  int frame = 0;
  while (s.isAnimating() && frame < 240) {
    s.step(1.0 / 60.0);
    if (frame % 6 == 0) std::printf("  %s\n", row(s.value(), landing).c_str());
    ++frame;
  }
  std::printf("  %s\n", row(s.value(), landing).c_str());
  std::printf("\n  %d 프레임(%.2f초) 만에 %.1f px에 정착\n", frame, frame / 60.0, s.value());
}

}  // namespace

int main() {
  std::printf("\nO = 카드, | = 속도로 예측한 도달점\n");
  demo("살짝 밀기", 400.0, 0.998);
  demo("세게 던지기", 1400.0, 0.998);
  demo("세게 던지기 (빠릿한 감속)", 1400.0, 0.990);
  std::printf("\n같은 속도라도 감속률이 낮으면 덜 미끄러진다.\n\n");
  return 0;
}
