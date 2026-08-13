import {
  Spring,
  project,
  rubberband,
  nearestSnapPoint,
  VelocityTracker,
  prefersReducedMotion,
  finishOnHide,
} from './fluid.js';

// ==========================================================================
// 1. 바텀 시트 — 잡아서 내릴 수 있고, 닫히는 중에도 다시 잡힌다
// ==========================================================================

const sheet = document.getElementById('sheet');
const scrim = document.getElementById('scrim');
const grabber = sheet.querySelector('.sheet-grabber');
const roY = document.getElementById('ro-y');
const roV = document.getElementById('ro-v');
const roState = document.getElementById('ro-state');

const HYSTERESIS = 10; // 탭과 드래그를 가르는 최소 이동(px)

// '닫으려는 의도'는 목표값 비교가 아니라 명시적 플래그로 둔다.
// 사용자가 닫히는 중에 다시 잡으면 의도는 사라지고, 놓을 때 다시 정해진다.
let closingIntent = false;
let sheetHeight = 0;
let lastFocused = null;

function setState(text) {
  roState.textContent = text;
}

const sheetSpring = new Spring({
  damping: 1,
  response: 0.35,
  value: 0,
  onUpdate: (y, v) => {
    sheet.style.transform = `translate3d(0, ${y}px, 0)`;
    // 시트가 내려간 만큼 스크림도 함께 옅어진다 — 진행이 계속 보여야 한다
    const progress = sheetHeight ? Math.max(0, Math.min(1, 1 - y / sheetHeight)) : 1;
    scrim.style.opacity = String(progress);
    roY.textContent = `${Math.round(y)}px`;
    roV.textContent = `${Math.round(v)}px/s`;
  },
  onRest: () => {
    if (closingIntent) {
      closingIntent = false;
      hideSheet();
    } else {
      setState('정지');
    }
  },
});

function showSheet() {
  if (!sheet.hidden) return;
  lastFocused = document.activeElement;
  closingIntent = false;
  sheet.hidden = false;
  scrim.hidden = false;
  sheetHeight = sheet.offsetHeight;

  if (prefersReducedMotion()) {
    // 움직임 대신 즉시 제자리에 — 크로스페이드는 CSS가 담당한다
    sheetSpring.setValue(0);
    scrim.style.opacity = '1';
  } else {
    // 아래에서 올라오고, 닫힐 때도 같은 길로 내려간다 (경로 대칭)
    sheetSpring.setValue(sheetHeight);
    sheetSpring.setTarget(0);
    setState('여는 중');
  }
  sheet.focus({ preventScroll: true });
}

function hideSheet() {
  sheet.hidden = true;
  scrim.hidden = true;
  sheet.style.transform = '';
  setState('정지');
  lastFocused?.focus?.({ preventScroll: true });
}

function closeSheet(velocity) {
  if (prefersReducedMotion()) {
    hideSheet();
    return;
  }
  closingIntent = true;
  setState('닫는 중');
  sheetSpring.setTarget(sheetHeight, velocity);
}

function openSheet(velocity) {
  closingIntent = false;
  setState('되돌아가는 중');
  sheetSpring.setTarget(0, velocity);
}

document.querySelectorAll('[data-open-sheet]').forEach((btn) => {
  btn.addEventListener('click', showSheet);
});
document.getElementById('sheet-close').addEventListener('click', () => closeSheet());
scrim.addEventListener('click', () => closeSheet());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !sheet.hidden) closeSheet();
});

// ---- 제스처 ----------------------------------------------------------------

const tracker = new VelocityTracker();
let dragging = false;
let committed = false;
let grabOffset = 0; // 잡은 지점을 기억한다 — 중앙으로 튀면 환상이 깨진다

function onPointerDown(e) {
  if (prefersReducedMotion()) return;
  if (e.target.closest('.sheet-close')) return; // 버튼 누르는 건 드래그가 아니다

  dragging = true;
  committed = false;

  // 핵심: 닫히는 중이든 열리는 중이든, 지금 '화면에 보이는 값'을 그대로 넘겨받는다.
  // 진행 중인 모션을 멈추고 그 지점에서 손가락이 이어받는다.
  sheetSpring.stop();
  closingIntent = false; // 다시 잡았으므로 닫으려던 의도는 무효

  grabOffset = e.clientY - sheetSpring.value;
  tracker.reset();
  tracker.add(e.clientY);
  sheet.setPointerCapture?.(e.pointerId);
  setState('잡는 중');
}

function onPointerMove(e) {
  if (!dragging) return;

  const raw = e.clientY - grabOffset;
  if (!committed && Math.abs(raw - sheetSpring.value) < HYSTERESIS) return;
  committed = true;

  tracker.add(e.clientY);

  // 위로는 거의 따라가지 않는다. 딱 멈추면 고장 난 것처럼 보이므로 저항만 준다.
  const y = raw < 0 ? -rubberband(-raw, sheetHeight || 400) : raw;
  sheetSpring.setValue(y, tracker.velocity);
  setState('따라오는 중');
}

function onPointerUp(e) {
  if (!dragging) return;
  dragging = false;
  sheet.releasePointerCapture?.(e.pointerId);
  if (!committed) return;

  const velocity = tracker.velocity;
  // 놓은 지점이 아니라 '가고 있던 곳'으로 판단한다
  const projected = sheetSpring.value + project(velocity);
  const shouldClose = projected > sheetHeight * 0.4;

  // 던진 동작이었으니 약간의 탄성을 허용한다 (모멘텀이 있을 때만)
  sheetSpring.damping = 0.85;
  if (shouldClose) closeSheet(velocity);
  else openSheet(velocity);

  // 다음 모션은 다시 임계 감쇠로 — 오버슈트는 던졌을 때만 어울린다
  setTimeout(() => {
    sheetSpring.damping = 1;
  }, 700);
}

sheet.addEventListener('pointerdown', onPointerDown);
sheet.addEventListener('pointermove', onPointerMove);
sheet.addEventListener('pointerup', onPointerUp);
sheet.addEventListener('pointercancel', onPointerUp);

// ==========================================================================
// 2. 카드 — 끌었다 놓으면 '가고 있던 곳'으로 간다
// ==========================================================================

const carousel = document.getElementById('carousel');
const track = document.getElementById('carousel-track');
const hint = document.getElementById('carousel-hint');
const cards = [...track.children];

let snapPoints = [];
let index = 0;

function measure() {
  if (!cards.length) {
    snapPoints = [0];
    return;
  }
  const styles = getComputedStyle(track);
  const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
  const step = cards[0].offsetWidth + gap;
  const maxScroll = Math.max(0, track.scrollWidth - carousel.clientWidth);
  snapPoints = cards.map((_, i) => -Math.min(i * step, maxScroll));
  // 중복 스냅 지점 제거 (끝에서 여러 카드가 같은 위치가 될 수 있다)
  snapPoints = [...new Set(snapPoints)];
}

const trackSpring = new Spring({
  damping: 1,
  response: 0.4,
  value: 0,
  onUpdate: (x) => {
    track.style.transform = `translate3d(${x}px, 0, 0)`;
  },
});

function updateHint() {
  // 카운터는 카드 수가 아니라 '실제로 멈출 수 있는 자리'의 수를 센다.
  // 끝에서는 여러 카드가 같은 위치에 머무르므로 둘이 어긋난다.
  hint.textContent = `${index + 1} / ${snapPoints.length}`;
}

const cardTracker = new VelocityTracker();
let cardDragging = false;
let cardCommitted = false;
let cardGrabOffset = 0;

track.addEventListener('pointerdown', (e) => {
  if (prefersReducedMotion()) return;
  cardDragging = true;
  cardCommitted = false;
  trackSpring.stop(); // 진행 중이어도 즉시 손가락에 넘긴다
  cardGrabOffset = e.clientX - trackSpring.value;
  cardTracker.reset();
  cardTracker.add(e.clientX);
  track.setPointerCapture?.(e.pointerId);
});

track.addEventListener('pointermove', (e) => {
  if (!cardDragging) return;
  const raw = e.clientX - cardGrabOffset;
  if (!cardCommitted && Math.abs(raw - trackSpring.value) < HYSTERESIS) return;
  cardCommitted = true;
  cardTracker.add(e.clientX);

  const min = snapPoints[snapPoints.length - 1];
  const max = snapPoints[0];
  let x = raw;
  // 양 끝에서는 딱 멈추지 않고 저항이 커진다
  if (x > max) x = max + rubberband(x - max, carousel.clientWidth);
  else if (x < min) x = min - rubberband(min - x, carousel.clientWidth);

  trackSpring.setValue(x, cardTracker.velocity);
});

function endCardDrag(e) {
  if (!cardDragging) return;
  cardDragging = false;
  track.releasePointerCapture?.(e.pointerId);
  if (!cardCommitted) return;

  const velocity = cardTracker.velocity;
  const projected = trackSpring.value + project(velocity);
  const target = nearestSnapPoint(projected, snapPoints);
  index = Math.max(0, snapPoints.indexOf(target));

  trackSpring.damping = 0.85; // 던졌으니 약간의 탄성
  trackSpring.setTarget(target, velocity);
  setTimeout(() => {
    trackSpring.damping = 1;
  }, 700);
  updateHint();
}

track.addEventListener('pointerup', endCardDrag);
track.addEventListener('pointercancel', endCardDrag);

// 키보드로도 넘길 수 있어야 한다 — 제스처만으로 갇히지 않도록
carousel.setAttribute('tabindex', '0');
carousel.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  index = Math.max(0, Math.min(snapPoints.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)));
  if (prefersReducedMotion()) trackSpring.setValue(snapPoints[index]);
  else trackSpring.setTarget(snapPoints[index]);
  updateHint();
});

// ==========================================================================
// 3. 즉각 반응 — 누르는 순간 반응한다
// ==========================================================================

document
  .querySelectorAll('button, .hero-links a, .wordmark')
  .forEach((el) => {
    el.addEventListener('pointerdown', () => el.classList.add('is-pressed'));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) =>
      el.addEventListener(evt, () => el.classList.remove('is-pressed'))
    );
  });

// ==========================================================================
// 4. 스크롤 엣지 — 1px 실선 대신, 겹칠 때만 경계가 생긴다
// ==========================================================================

const header = document.getElementById('site-header');
let ticking = false;
const syncHeader = () => {
  header.classList.toggle('is-overlapping', window.scrollY > 4);
  ticking = false;
};
addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(syncHeader);
  },
  { passive: true }
);

// ==========================================================================
// 초기화
// ==========================================================================

measure();
updateHint();
addEventListener('resize', () => {
  measure();
  sheetHeight = sheet.hidden ? sheetHeight : sheet.offsetHeight;
  trackSpring.setValue(snapPoints[Math.min(index, snapPoints.length - 1)] ?? 0);
});

// 탭이 숨겨지면 진행 중인 모션을 즉시 끝낸다 — 화면 밖에 얼어붙지 않도록
finishOnHide(sheetSpring, trackSpring);

// 손잡이는 시트 전체가 잡힌다는 걸 알리는 표시일 뿐, 실제 판정은 시트가 한다
grabber.setAttribute('aria-hidden', 'true');
