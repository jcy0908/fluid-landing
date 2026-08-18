# fluid (C++)

`js/fluid.js`의 물리를 C++로 옮긴 헤더 온리 라이브러리. 의존성이 없다.

## 왜 다시 쓰는가

같은 것을 두 번 만드는 일에는 대개 이유가 없다. 여기서는 두 가지가 있다.

**하나.** 스프링·모멘텀 투영·러버밴딩은 브라우저의 기능이 아니라 물리다.
라이브러리를 가져다 쓴 것과 원리를 아는 것은 다르고, 플랫폼을 바꿔 다시
써 보면 그 차이가 드러난다.

**둘.** JS 구현은 `requestAnimationFrame`에 묶여 있어 값을 검증하기 어렵다.
여기서는 호출자가 `dt`를 넘기므로 결정적으로 돌릴 수 있다. 그래서 이
저장소는 **두 구현이 같은 값을 내는지 실제로 확인한다.**

## 옮긴 것과 옮기지 않은 것

| | |
| --- | --- |
| 옮김 | 스프링 적분, 모멘텀 투영, 러버밴딩, 스냅 선택, 속도 추적 |
| 뺌 | `requestAnimationFrame`, 감시견 타이머, `document.hidden` 처리 |

뺀 것들은 물리가 아니라 **브라우저에서 시계를 얻는 방법**이다. C++ 쪽에서는
호출자가 시계를 쥔다.

## 동등성 검증

기준값은 재구현본이 아니라 **실제로 배포되는 `js/fluid.js`** 에서 나온다.
`cpp/tools/gen_golden.mjs`가 그 파일을 그대로 `import`하고 시계만 가상으로
바꿔 끼운 뒤, 프레임마다 값·속도·`dt`를 기록한다.

`dt`까지 기록하는 이유가 있다. JS는 누적된 시계에서 `dt`를 뽑기 때문에
프레임마다 미세하게 다르다(`0.016666666666666666` vs `…663`). 그것까지
맞추지 않으면 비교가 의미를 잃는다.

네 가지 시나리오를 60프레임씩, 총 240프레임을 대조한다.

| 시나리오 | 확인하는 것 |
| --- | --- |
| 임계 감쇠 0 → 100 | 기본 UI 스프링, 오버슈트 없음 |
| 던진 뒤 | 시작 속도 인계와 탄성 |
| 가는 중에 목표 반전 | 값이 끊기지 않고 이어지는가 |
| 붙잡았다 놓기 | `setValue` 1:1 추적 → 속도 인계 |

여기에 순수 함수(투영·러버밴딩·스냅 선택·속도 추적)와 경계 동작을 더해
**28개 항목**을 확인한다.

```
fluid.hpp ↔ js/fluid.js 동등성

  o 임계 감쇠 0 → 100 — 60 프레임 전부 일치
  o 던진 뒤 (속도 인계 + 탄성) — 60 프레임 전부 일치
  o 가는 중에 목표 반전 — 60 프레임 전부 일치
  o 붙잡았다 놓기 — 60 프레임 전부 일치
  ...
통과 28 / 실패 0
```

허용 오차는 상대 `1e-9`다.

## 브라우저에서 쓰기 — WebAssembly

같은 코드를 wasm으로 빌드해 사이트가 실제로 그것을 쓴다.

```bash
sh cpp/wasm/build.sh   # → js/fluid.wasm (5.4KB)
```

**Emscripten이 필요 없다.** clang의 wasm32 타깃과 `wasm-ld`만 쓴다. 런타임도,
생성된 글루 코드도 없다. `-nostdlib -ffreestanding`으로 빌드되며 힙을 쓰지
않는다 — 값을 주고받는 자리는 고정 스크래치 버퍼 하나뿐이다.

`js/fluid-wasm.js`가 `js/fluid.js`와 **같은 API**를 내주므로 사이트는 import만
바꾸면 된다. 받지 못하면 JS 구현으로 되돌아가고 움직임은 달라지지 않는다.

경계는 이렇다.

| | |
| --- | --- |
| wasm (C++) | 스프링 적분, 모멘텀 투영, 러버밴딩, 스냅 선택, 속도 추적 |
| JS | `requestAnimationFrame`, 감시견, `document.hidden`, 콜백 |

물리는 플랫폼과 무관하고, 시계를 얻는 방법은 플랫폼에 달렸다.

### 검증이 두 겹이다

```
네이티브 C++ ↔ 원본 JS   28개   cpp/tests/test_fluid.cpp
wasm        ↔ 원본 JS   20개   cpp/tests/wasm_equivalence.mjs
```

두 번째 테스트는 `js/fluid.js`와 `js/fluid-wasm.js`를 같은 가상 시계로
돌려 프레임마다 대조한다. 사이트를 wasm 쪽으로 바꿔 끼워도 움직임이
달라지지 않는다는 뜻이다.

```bash
node cpp/tests/wasm_equivalence.mjs
```

## 빌드

```bash
cd cpp
cmake -B build && cmake --build build
ctest --test-dir build --output-on-failure
```

기준값을 다시 만들려면 (`js/fluid.js`를 고친 뒤):

```bash
node cpp/tools/gen_golden.mjs > cpp/tests/golden.hpp
```

## 쓰는 법

```cpp
#include "fluid/fluid.hpp"

fluid::Spring s(/*damping=*/1.0, /*response=*/0.4);
s.setTarget(100.0);

while (s.isAnimating()) {
  const bool rested = s.step(1.0 / 60.0);
  draw(s.value());
  if (rested) break;
}
```

던진 뒤에는 속도를 물려주고, 놓은 지점이 아니라 가고 있던 곳으로 보낸다.

```cpp
const double landing = current + fluid::project(releaseVelocity);
s.setTarget(fluid::nearestSnapPoint(landing, snapPoints), releaseVelocity);
```

경계 밖에서는 딱 멈추지 않는다.

```cpp
if (x > maxX) x = maxX + fluid::rubberband(x - maxX, trackWidth);
```

## 예제

```bash
./build/throw_example
```

던진 카드가 어디에 멈추는지 터미널에 그린다. `O`가 카드, `|`가 속도로
예측한 도달점이다. 같은 속도라도 감속률이 낮으면 덜 미끄러진다.

## 파일

```
include/fluid/fluid.hpp   라이브러리 전부 (헤더 온리)
tests/test_fluid.cpp      동등성 테스트. 외부 프레임워크 없음
tests/golden.hpp          자동 생성 — 손으로 고치지 않는다
tools/gen_golden.mjs      실제 js/fluid.js로 기준값을 만든다
examples/throw.cpp        모멘텀 투영을 눈으로 보는 예제
wasm/fluid_wasm.cpp       브라우저용 래퍼 (힙 없음)
wasm/build.sh             Emscripten 없이 .wasm을 만든다
tests/wasm_equivalence.mjs  wasm ↔ 원본 JS 대조
```

빌드 산출물은 `js/fluid.wasm`이고 `js/fluid-wasm.js`가 그것을 감싼다.
