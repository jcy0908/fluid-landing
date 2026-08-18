# FLUID MOTION / STUDY 01

사용자가 모션 도중 마음을 바꿀 때 현재 위치와 속도를 어떻게 보존할지 탐구한 브라우저 인터랙션 스터디입니다.

Apple의 *Designing Fluid Interfaces* 전체를 복제한 키트가 아니라, interruption/redirection, one-to-one tracking, momentum projection에서 선택한 원리를 웹 포인터 입력으로 번역한 개인 실험입니다. 바텀 시트와 가로 트랙 두 장면에서 위치·속도·목표·의도를 분리해 관찰합니다.

## 질문

> 부드러움은 프레임레이트나 이징의 문제가 아니라, 사용자가 모션 도중 마음을 바꿀 때 현재 위치와 속도를 보존하며 통제권을 즉시 돌려주는 능력인가?

처음에는 애니메이션을 더 매끄럽게 만드는 법을 물었습니다. 그러나 진행 중인 움직임에 새 입력이 들어오는 반례를 두고, 문제를 모션의 외관에서 통제권의 연속성으로 바꿨습니다.

## 선택한 모델

이 프로토타입은 현재값과 추정 속도, 목표를 하나의 모델에서 직접 관찰하기 위해 JS 스프링을 사용합니다.

CSS transition과 Web Animations도 실행 중 retarget, pause, reverse가 가능합니다. JS만이 가능한 해법이라는 뜻은 아닙니다. 이 실험에서는 다음 상태를 명시적으로 드러내고 서로 넘겨주기 위해 선택했습니다.

- `position`: 지금 화면에 보이는 값
- `velocity`: 최근 포인터 이력에서 추정한 속도
- `target`: 다음에 정착할 좌표
- `intent`: 열기·닫기처럼 좌표만으로는 설명되지 않는 사용자 의도

## 두 개의 실험

### 01. Momentum track

잡은 지점을 보존해 1:1로 추적하고, 손을 놓으면 현재 위치와 추정 속도에서 예상 도착점을 계산해 가장 가까운 스냅 포인트를 선택합니다. 움직이는 중 다시 잡으면 화면에 보이는 현재 좌표가 새 입력의 출발점이 됩니다.

### 02. Interruptible sheet

닫히는 시트를 다시 잡으면 진행 중인 스프링을 멈추고 `closingIntent`를 철회합니다. 목표 좌표와 닫기 의도를 분리하지 않으면 재그랩 뒤 원위치에 도착했을 때 이미 철회된 닫힘이 다시 실행될 수 있습니다.

```js
function onSheetPointerDown(event) {
  sheetSpring.stop();
  closingIntent = false;
  sheetGrabOffset = event.clientY - sheetSpring.value;
}
```

## 제작자가 정한 값

아래 값은 플랫폼의 보편 법칙이 아니라 이 프로토타입을 위해 조절한 선택입니다.

| 항목 | 값 | 역할 |
| --- | ---: | --- |
| 포인터 이력 | 100ms | 오래된 이동 샘플 제거 |
| 히스테리시스 | 10 CSS px | 탭과 드래그의 근사 경계 |
| 시트 닫힘 임계 | 높이의 40% | 투영 위치에서 닫힘 판단 |
| 러버밴드 상수 | 0.55 | 경계 밖 저항 |
| 기본 damping | 1.0 | 오버슈트 없는 기본 모션 |
| momentum damping | 0.86 | `|v| > 240px/s`일 때만 허용하는 탄성 |

## 실패 조건에서 고친 것

- 움직이는 요소를 10px 미만으로 재그랩해도 중간 좌표에 영구 정지하지 않게 했습니다.
- 속도를 읽는 순간에도 100ms보다 오래된 샘플을 제거합니다.
- 감쇠를 타이머로 되돌리지 않고 각 상태 전환과 정착 시점에 지정합니다.
- 30fps 아래에서 단순 `dt` 제한 때문에 슬로모션이 되지 않도록 경과 시간을 60Hz 이하의 하위 단계로 적분합니다.
- 다이얼로그는 초기 포커스, 포커스 순환, 배경 `inert`, 스크롤 잠금, `Esc`, 호출자 포커스 복원을 지원합니다.
- Reduced Motion에서도 직접 추적과 키보드 통제권은 유지하고 관성·탄성만 제거합니다.

## 접근성과 입력

- Pointer Events의 primary pointer와 마우스 왼쪽 버튼만 제스처로 받습니다.
- 가로 트랙은 `←` `→` 키로도 이동합니다.
- 모달이 열리면 배경은 포커스와 보조기술 탐색에서 제외됩니다.
- `prefers-reduced-motion`, `prefers-color-scheme`, `prefers-contrast`를 반영합니다.
- `prefers-reduced-transparency`에서는 글래스 효과를 불투명 표면으로 바꿉니다.
- 작은 높이 화면에서는 시트 콘텐츠를 스크롤할 수 있고, 터치 드래그는 손잡이에서 시작합니다.

## 웹 구현 원칙

- 본문 전체를 완성된 HTML로 먼저 제공하고 JavaScript는 상태·제스처·스크롤 문맥만 보강합니다.
- 시스템/SF 계열 글꼴 스택을 사용해 외부 글꼴 요청과 레이아웃 이동을 없앴습니다.
- sticky chrome, 섹션 진행 표시, hero의 미세한 깊이 변화는 하나의 `requestAnimationFrame` 스크롤 루프에서 CSS 변수로 전달합니다.
- JavaScript가 꺼져도 케이스 스터디는 모두 읽을 수 있고, 가로 트랙은 native overflow와 scroll snap으로 탐색할 수 있습니다.
- 무거운 프레임워크·3D·모션 라이브러리 없이 브라우저 기본 기능과 기존 스프링 엔진만 사용합니다.

## 미완의 지점

이 프로토타입은 자연스럽다는 가설을 구현했을 뿐, 다른 사용자에게 더 자연스럽다는 것을 검증하지 못했습니다. 상수에는 공식 자료, 플랫폼 관습, 감각적 튜닝이 섞여 있으며 고주사율 기기·멀티터치·보조기술 사용자에 대한 실제 사용성 연구는 아직 하지 않았습니다. 실제 제품 캐러셀이라면 native scroll-snap이 접근성과 견고성 면에서 더 나을 수 있습니다.

## 실행

ES Modules를 사용하므로 `file://`로 직접 열지 말고 로컬 HTTP 서버에서 실행합니다.

```bash
python3 -m http.server 4200
```

그 뒤 <http://localhost:4200>을 엽니다. 빌드 과정, JavaScript 패키지 의존성, 외부 글꼴 요청은 없습니다. 글꼴은 Apple 기기에서 SF Pro·Apple SD Gothic Neo를 우선하고 다른 운영체제에서는 각 시스템 UI 글꼴로 대체됩니다.

## 파일

```text
index.html       케이스 스터디 구조와 두 실험의 마크업
css/style.css    기술 에디토리얼 디자인 시스템과 반응형 규칙
js/fluid.js      스프링, 투영, 러버밴드, 속도 추적
js/main.js       시트, 가로 트랙, 모션 계기판, 접근성 상태
```

## 제작 정보와 AI 사용

- 기획·요구사항·최종 판단: 정찬용
- 초기 구현 협업: Claude Opus 5
- 구조·카피·코드 확장 보조: OpenAI Codex
- 생성형 AI 사용 범위: 공식 자료 구조화, 문장 제안, 코드 작성·리뷰·테스트 보조

프로젝트의 방향 선택과 최종 승인 주체는 정찬용입니다.

## References

- [Apple — Designing Fluid Interfaces, WWDC18](https://developer.apple.com/videos/play/wwdc2018/803/)
- [W3C — Pointer Events](https://www.w3.org/TR/pointerevents/)
- [CSSWG — CSS Transitions](https://drafts.csswg.org/css-transitions/)
- [W3C — Web Animations](https://www.w3.org/TR/web-animations-1/)
