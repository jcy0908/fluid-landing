// ==========================================================================
// fluid.hpp — js/fluid.js의 물리를 C++로 옮긴 것. 헤더 온리, 의존성 없음.
//
// 옮긴 것과 옮기지 않은 것을 먼저 밝힌다.
//
//   옮긴 것    스프링 적분, 모멘텀 투영, 러버밴딩, 스냅 선택, 속도 추적.
//              즉 '물리'다. 값이 어떻게 변하는지는 플랫폼과 무관하다.
//
//   뺀 것      requestAnimationFrame, 감시견 타이머, document.hidden 처리.
//              이것들은 물리가 아니라 브라우저에서 시계를 얻는 방법이다.
//              여기서는 호출자가 dt를 넘긴다. 그래야 시계에 기대지 않고
//              결정적으로 검증할 수 있다 — JS 쪽에서는 하기 어려운 일이다.
//
// 값은 js/fluid.js와 같아야 한다. tests/가 그것을 확인한다.
// ==========================================================================

#ifndef FLUID_FLUID_HPP
#define FLUID_FLUID_HPP

// 표준 라이브러리에 기대지 않는다. WebAssembly로 빌드할 때 libc/libc++ 없이
// (-nostdlib -ffreestanding) 컴파일되어야 하기 때문이다. 힙도 쓰지 않는다.
// std::vector를 받는 편의 오버로드만 FLUID_FREESTANDING이 아닐 때 딸려 온다.
#ifndef FLUID_FREESTANDING
#include <cstddef>
#include <vector>
#endif

namespace fluid {

#ifdef FLUID_FREESTANDING
using size_type = unsigned long;
#else
using size_type = std::size_t;
#endif

namespace detail {
inline constexpr double kPi = 3.14159265358979323846;
inline double abs_(double v) { return __builtin_fabs(v); }
inline double min_(double a, double b) { return a < b ? a : b; }
}  // namespace detail

// 프레임 간격의 상한(초). 탭 전환 등으로 크게 튀면 물리가 폭발한다.
inline constexpr double kMaxDt = 1.0 / 30.0;

// 정착 판정. 목표와의 거리도, 속도도 이보다 작아지면 멈춘다.
inline constexpr double kRestEpsilon = 0.05;

/// 감쇠비(damping)와 반응시간(response)으로 정의하는 스프링.
/// Apple이 mass/stiffness/damping 대신 쓰는 두 파라미터를 그대로 따른다.
///
///   damping 1.0  임계 감쇠. 오버슈트 없음. 대부분의 UI 기본값.
///   damping 0.8  살짝 튐. 제스처에 모멘텀이 있었을 때만 쓴다.
///   response     목표에 닿는 속도(초). '지속시간'이 아니다.
class Spring {
 public:
  double damping = 1.0;
  double response = 0.4;

  Spring() = default;
  Spring(double damping_, double response_, double value_ = 0.0, double velocity_ = 0.0)
      : damping(damping_), response(response_), value_(value_), velocity_(velocity_),
        target_(value_) {}

  double value() const { return value_; }
  double velocity() const { return velocity_; }
  double target() const { return target_; }

  /// 목표만 바꾼다. 진행 중이면 현재 값과 속도를 유지한 채 방향만 튼다.
  /// 반전할 때 '벽에 부딪히는' 느낌을 없애는 핵심이다.
  void setTarget(double target) {
    target_ = target;
    animating_ = true;
  }

  void setTarget(double target, double velocity) {
    target_ = target;
    velocity_ = velocity;
    animating_ = true;
  }

  /// 제스처 중에는 스프링을 멈추고 손가락을 1:1로 따라간다.
  void setValue(double value, double velocity = 0.0) {
    stop();
    value_ = value;
    velocity_ = velocity;
  }

  void stop() { animating_ = false; }

  bool isAnimating() const { return animating_; }

  /// 목표값으로 즉시 끝낸다.
  /// 브라우저에서는 탭이 숨겨져 프레임이 오지 않을 때 쓴다. 여기서는
  /// 호출자가 같은 판단을 할 수 있도록 남겨 둔다.
  void finish() {
    if (value_ == target_ && velocity_ == 0.0) return;
    stop();
    value_ = target_;
    velocity_ = 0.0;
  }

  /// 한 프레임 전진시킨다. dt는 초 단위이며 내부에서 상한이 걸린다.
  /// 정착했으면 true를 돌려준다(JS의 onRest에 해당).
  bool step(double dt) {
    if (!animating_) return false;

    dt = detail::min_(dt, kMaxDt);

    const double omega = (2.0 * detail::kPi) / response;  // 고유 진동수
    const double zeta = damping;
    const double x = value_ - target_;

    // 감쇠 조화 진동자의 반음시적(semi-implicit) 적분 — 안정적이다
    const double accel = -omega * omega * x - 2.0 * zeta * omega * velocity_;
    velocity_ += accel * dt;
    value_ += velocity_ * dt;

    if (detail::abs_(value_ - target_) < kRestEpsilon && detail::abs_(velocity_) < kRestEpsilon) {
      value_ = target_;
      velocity_ = 0.0;
      animating_ = false;
      return true;
    }
    return false;
  }

 private:
  double value_ = 0.0;
  double velocity_ = 0.0;
  double target_ = 0.0;
  bool animating_ = false;
};

/// 모멘텀 투영 — 놓은 지점이 아니라 '가고 있던 곳'을 계산한다.
/// Apple 샘플 코드의 지수 감쇠 형태. 교과서의 v²/(2a)가 아니다.
inline double project(double velocity, double decelerationRate = 0.998) {
  return ((velocity / 1000.0) * decelerationRate) / (1.0 - decelerationRate);
}

/// 경계 너머로는 점점 덜 따라간다 — 딱 멈추면 고장 난 것처럼 보인다.
inline double rubberband(double overshoot, double dimension, double constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * detail::abs_(overshoot));
}

/// 여러 스냅 지점 중 투영 지점에 가장 가까운 곳을 고른다.
/// 동률이면 앞의 것을 유지한다 — JS의 reduce와 같은 순서다.
inline double nearestSnapPoint(double projected, const double* points, size_type count) {
  if (points == nullptr || count == 0) return projected;
  double best = points[0];
  for (size_type i = 1; i < count; ++i) {
    if (detail::abs_(points[i] - projected) < detail::abs_(best - projected)) best = points[i];
  }
  return best;
}

#ifndef FLUID_FREESTANDING
inline double nearestSnapPoint(double projected, const std::vector<double>& points) {
  return nearestSnapPoint(projected, points.data(), points.size());
}
#endif

/// 최근 포인터 이동에서 속도(px/s)를 뽑는다.
/// 마지막 한 점만 쓰면 값이 튄다 — 짧은 이력의 평균을 쓴다.
///
/// JS와 달리 시각을 인자로 받는다. 주변 시계에 기대지 않기 위해서다.
class VelocityTracker {
 public:
  /// 100ms 이력이면 60fps에서 6~7개면 충분하다. 힙을 쓰지 않으려고
  /// 고정 크기 링 버퍼를 쓰고, 넘치면 가장 오래된 것부터 버린다.
  static constexpr size_type kCapacity = 32;

  explicit VelocityTracker(double historyMs = 100.0) : historyMs_(historyMs) {}

  void add(double position, double timeMs) {
    if (count_ == kCapacity) pop_();
    samples_[(head_ + count_) % kCapacity] = {position, timeMs};
    ++count_;
    while (count_ > 2 && timeMs - front_().time > historyMs_) pop_();
  }

  double velocity() const {
    if (count_ < 2) return 0.0;
    const Sample& first = front_();
    const Sample& last = samples_[(head_ + count_ - 1) % kCapacity];
    const double dt = (last.time - first.time) / 1000.0;
    if (dt <= 0.0) return 0.0;
    return (last.position - first.position) / dt;
  }

  void reset() {
    head_ = 0;
    count_ = 0;
  }

 private:
  struct Sample {
    double position;
    double time;
  };

  const Sample& front_() const { return samples_[head_]; }
  void pop_() {
    head_ = (head_ + 1) % kCapacity;
    --count_;
  }

  double historyMs_;
  Sample samples_[kCapacity] = {};
  size_type head_ = 0;
  size_type count_ = 0;
};

}  // namespace fluid

#endif  // FLUID_FLUID_HPP
