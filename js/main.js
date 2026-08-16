import {
  Spring,
  project,
  rubberband,
  nearestSnapPoint,
  VelocityTracker,
  prefersReducedMotion,
  finishOnHide,
} from './fluid.js?v=2';

const HYSTERESIS = 10;
const MOMENTUM_THRESHOLD = 240;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const twoDigits = (value) => String(value).padStart(2, '0');
const momentumDamping = (velocity) => (Math.abs(velocity) > MOMENTUM_THRESHOLD ? 0.86 : 1);
const isPrimaryAction = (event) =>
  event.isPrimary !== false && (event.pointerType !== 'mouse' || event.button === 0);

// ---------------------------------------------------------------------------
// Shared telemetry
// ---------------------------------------------------------------------------

const heroX = document.getElementById('hero-x');
const heroV = document.getElementById('hero-v');
const heroTarget = document.getElementById('hero-target');
const heroIntent = document.getElementById('hero-intent');
const telemetry = document.querySelector('.telemetry');

function syncTelemetry({ x = 0, velocity = 0, target = 0, intent = 'rest', progress = 0 }) {
  heroX.textContent = Number(x).toFixed(2);
  heroV.textContent = String(Math.round(velocity));
  heroTarget.textContent = typeof target === 'number' ? String(Math.round(target)) : target;
  heroIntent.textContent = intent;
  telemetry.style.setProperty('--telemetry-x', `${clamp(progress, 0, 1) * 100}%`);
}

// ---------------------------------------------------------------------------
// Test 02: interruptible bottom sheet
// ---------------------------------------------------------------------------

const sheet = document.getElementById('sheet');
const scrim = document.getElementById('scrim');
const sheetClose = document.getElementById('sheet-close');
const grabber = sheet.querySelector('.sheet-grabber');
const roY = document.getElementById('ro-y');
const roV = document.getElementById('ro-v');
const roTarget = document.getElementById('ro-target');
const roState = document.getElementById('ro-state');
const inertRoots = [document.querySelector('.site-header'), document.querySelector('main'), document.querySelector('.site-footer')];

let closingIntent = false;
let sheetHeight = 0;
let lastFocused = null;

function setSheetState(text) {
  roState.textContent = text;
}

function setBackgroundInert(value) {
  inertRoots.forEach((root) => {
    if (root) root.inert = value;
  });
  document.body.classList.toggle('is-modal-open', value);
  document.documentElement.classList.toggle('is-modal-open', value);
}

function focusableInsideSheet() {
  return [...sheet.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getClientRects().length > 0);
}

const sheetSpring = new Spring({
  damping: 1,
  response: 0.35,
  value: 0,
  onUpdate: (y, velocity) => {
    sheet.style.transform = `translate3d(0, ${y}px, 0)`;
    const progress = sheetHeight ? clamp(1 - y / sheetHeight, 0, 1) : 1;
    scrim.style.opacity = String(progress);
    roY.textContent = String(Math.round(y));
    roV.textContent = String(Math.round(velocity));
    roTarget.textContent = closingIntent ? 'closed' : 'open';
    syncTelemetry({ x: y, velocity, target: sheetSpring.target, intent: closingIntent ? 'closing' : 'open', progress });
  },
  onRest: () => {
    sheetSpring.damping = 1;
    if (closingIntent) {
      closingIntent = false;
      hideSheet();
    } else {
      setSheetState('rest');
      roTarget.textContent = 'open';
    }
  },
});

function showSheet(event) {
  if (!sheet.hidden) return;
  lastFocused = event?.currentTarget || document.activeElement;
  closingIntent = false;
  sheet.hidden = false;
  scrim.hidden = false;
  setBackgroundInert(true);
  sheetHeight = sheet.getBoundingClientRect().height + 2;
  sheetSpring.damping = 1;

  if (prefersReducedMotion()) {
    sheetSpring.setValue(0);
    scrim.style.opacity = '1';
    setSheetState('open');
  } else {
    sheetSpring.setValue(sheetHeight);
    sheetSpring.setTarget(0);
    setSheetState('opening');
  }

  requestAnimationFrame(() => sheetClose.focus({ preventScroll: true }));
}

function releaseActiveSheetPointer() {
  if (sheetPointerId !== null && sheet.hasPointerCapture?.(sheetPointerId)) {
    sheet.releasePointerCapture(sheetPointerId);
  }
  sheetDragging = false;
  sheetCommitted = false;
  sheetPointerId = null;
}

function hideSheet() {
  releaseActiveSheetPointer();
  sheetSpring.stop();
  sheet.hidden = true;
  scrim.hidden = true;
  sheet.style.transform = '';
  scrim.style.opacity = '';
  setSheetState('rest');
  setBackgroundInert(false);
  const focusTarget = lastFocused;
  lastFocused = null;
  focusTarget?.focus?.({ preventScroll: true });
}

function closeSheet(velocity = 0) {
  if (prefersReducedMotion()) {
    hideSheet();
    return;
  }
  closingIntent = true;
  sheetSpring.damping = momentumDamping(velocity);
  setSheetState('closing');
  roTarget.textContent = 'closed';
  sheetSpring.setTarget(sheetHeight, velocity);
}

function openSheet(velocity = 0) {
  closingIntent = false;
  roTarget.textContent = 'open';
  if (prefersReducedMotion()) {
    sheetSpring.setValue(0);
    setSheetState('open');
    return;
  }
  sheetSpring.damping = momentumDamping(velocity);
  setSheetState('redirecting');
  sheetSpring.setTarget(0, velocity);
}

document.querySelectorAll('[data-open-sheet]').forEach((button) => {
  button.addEventListener('click', showSheet);
});
sheetClose.addEventListener('click', () => closeSheet());
scrim.addEventListener('click', () => closeSheet());

document.addEventListener('keydown', (event) => {
  if (sheet.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    releaseActiveSheetPointer();
    closeSheet();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusables = focusableInsideSheet();
  if (!focusables.length) {
    event.preventDefault();
    sheet.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

document.addEventListener('focusin', (event) => {
  if (!sheet.hidden && !sheet.contains(event.target)) sheetClose.focus({ preventScroll: true });
});

const sheetTracker = new VelocityTracker();
let sheetDragging = false;
let sheetCommitted = false;
let sheetPointerId = null;
let sheetGrabOffset = 0;
let sheetWasAnimating = false;

function onSheetPointerDown(event) {
  if (!isPrimaryAction(event) || sheetDragging) return;
  if (event.target.closest('button, a, input, select, textarea')) return;
  if (event.pointerType === 'touch' && !event.target.closest('.sheet-grabber')) return;

  sheetDragging = true;
  sheetCommitted = false;
  sheetPointerId = event.pointerId;
  sheetWasAnimating = sheetSpring.isAnimating;
  sheetSpring.stop();
  sheetSpring.damping = 1;
  closingIntent = false;

  sheetGrabOffset = event.clientY - sheetSpring.value;
  sheetTracker.reset();
  sheetTracker.add(event.clientY);
  sheet.setPointerCapture?.(event.pointerId);
  setSheetState('grabbed');
}

function onSheetPointerMove(event) {
  if (!sheetDragging || event.pointerId !== sheetPointerId) return;
  const raw = event.clientY - sheetGrabOffset;
  if (!sheetCommitted && Math.abs(raw - sheetSpring.value) < HYSTERESIS) return;
  sheetCommitted = true;
  sheetTracker.add(event.clientY);

  const y = raw < 0 ? -rubberband(-raw, sheetHeight || 400) : raw;
  sheetSpring.setValue(y, sheetTracker.velocity);
  setSheetState('tracking');
}

function endSheetDrag(event, cancelled = false) {
  if (!sheetDragging || event.pointerId !== sheetPointerId) return;
  sheetDragging = false;
  if (sheet.hasPointerCapture?.(event.pointerId)) sheet.releasePointerCapture(event.pointerId);
  sheetPointerId = null;

  if (cancelled || !sheetCommitted) {
    // 재그랩 자체를 닫기 의도의 철회로 본다. 움직이는 시트를 탭만 해도
    // 중간 좌표에 얼어붙지 않고 열린 상태로 돌아간다.
    if (sheetWasAnimating || Math.abs(sheetSpring.value) > 0.05) openSheet(0);
    else setSheetState('rest');
    return;
  }

  sheetTracker.add(event.clientY);
  const velocity = sheetTracker.velocity;
  const projected = sheetSpring.value + project(velocity);
  const shouldClose = projected > sheetHeight * 0.4;
  if (shouldClose) closeSheet(velocity);
  else openSheet(velocity);
}

sheet.addEventListener('pointerdown', onSheetPointerDown);
sheet.addEventListener('pointermove', onSheetPointerMove);
sheet.addEventListener('pointerup', (event) => endSheetDrag(event));
sheet.addEventListener('pointercancel', (event) => endSheetDrag(event, true));

// ---------------------------------------------------------------------------
// Test 01: momentum track
// ---------------------------------------------------------------------------

const carousel = document.getElementById('carousel');
const track = document.getElementById('carousel-track');
const hint = document.getElementById('carousel-hint');
const trackVelocity = document.getElementById('track-velocity');
const cards = [...track.children];

carousel.setAttribute('tabindex', '0');
carousel.setAttribute('role', 'region');
carousel.setAttribute('aria-roledescription', '가로 모션 실험');
carousel.setAttribute('aria-label', '드래그하거나 좌우 화살표 키로 이동하는 모멘텀 트랙');

let snapPoints = [0];
let trackIndex = 0;

function measureTrack() {
  if (!cards.length) return;
  const styles = getComputedStyle(track);
  const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
  const step = cards[0].offsetWidth + gap;
  const maxScroll = Math.max(0, track.scrollWidth - carousel.clientWidth);
  snapPoints = [...new Set(cards.map((_, index) => -Math.min(index * step, maxScroll)))];
  trackIndex = clamp(trackIndex, 0, snapPoints.length - 1);
}

function updateTrackStatus() {
  hint.textContent = `${twoDigits(trackIndex + 1)} / ${twoDigits(snapPoints.length)}`;
}

const trackSpring = new Spring({
  damping: 1,
  response: 0.4,
  value: 0,
  onUpdate: (x, velocity) => {
    track.style.transform = `translate3d(${x}px, 0, 0)`;
    trackVelocity.textContent = `${Math.round(velocity)} px/s`;
    const min = Math.abs(snapPoints[snapPoints.length - 1] || 0);
    syncTelemetry({ x, velocity, target: trackSpring.target, intent: 'track', progress: min ? Math.abs(x) / min : 0 });
  },
  onRest: () => {
    trackSpring.damping = 1;
    trackVelocity.textContent = '0 px/s';
  },
});

const cardTracker = new VelocityTracker();
let cardDragging = false;
let cardCommitted = false;
let cardPointerId = null;
let cardGrabOffset = 0;
let cardResumeTarget = 0;

track.addEventListener('pointerdown', (event) => {
  if (!isPrimaryAction(event) || cardDragging) return;
  cardDragging = true;
  cardCommitted = false;
  cardPointerId = event.pointerId;
  cardResumeTarget = trackSpring.target;
  trackSpring.stop();
  trackSpring.damping = 1;
  cardGrabOffset = event.clientX - trackSpring.value;
  cardTracker.reset();
  cardTracker.add(event.clientX);
  track.setPointerCapture?.(event.pointerId);
});

track.addEventListener('pointermove', (event) => {
  if (!cardDragging || event.pointerId !== cardPointerId) return;
  const raw = event.clientX - cardGrabOffset;
  if (!cardCommitted && Math.abs(raw - trackSpring.value) < HYSTERESIS) return;
  cardCommitted = true;
  cardTracker.add(event.clientX);

  const min = snapPoints[snapPoints.length - 1];
  const max = snapPoints[0];
  let x = raw;
  if (x > max) x = max + rubberband(x - max, carousel.clientWidth);
  else if (x < min) x = min - rubberband(min - x, carousel.clientWidth);
  trackSpring.setValue(x, cardTracker.velocity);
});

function endCardDrag(event, cancelled = false) {
  if (!cardDragging || event.pointerId !== cardPointerId) return;
  cardDragging = false;
  if (track.hasPointerCapture?.(event.pointerId)) track.releasePointerCapture(event.pointerId);
  cardPointerId = null;

  if (cancelled || !cardCommitted) {
    if (prefersReducedMotion()) trackSpring.setValue(cardResumeTarget);
    else trackSpring.setTarget(cardResumeTarget);
    return;
  }

  cardTracker.add(event.clientX);
  const velocity = cardTracker.velocity;
  const projected = trackSpring.value + project(velocity);
  const target = nearestSnapPoint(projected, snapPoints);
  trackIndex = Math.max(0, snapPoints.indexOf(target));
  trackSpring.damping = momentumDamping(velocity);

  if (prefersReducedMotion()) trackSpring.setValue(target);
  else trackSpring.setTarget(target, velocity);
  updateTrackStatus();
}

track.addEventListener('pointerup', (event) => endCardDrag(event));
track.addEventListener('pointercancel', (event) => endCardDrag(event, true));

carousel.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  trackIndex = clamp(trackIndex + (event.key === 'ArrowRight' ? 1 : -1), 0, snapPoints.length - 1);
  const target = snapPoints[trackIndex];
  trackSpring.damping = 1;
  if (prefersReducedMotion()) trackSpring.setValue(target);
  else trackSpring.setTarget(target);
  updateTrackStatus();
});

// ---------------------------------------------------------------------------
// Editable spring instrument
// ---------------------------------------------------------------------------

const stage = document.getElementById('instrument-stage');
const mass = document.getElementById('stage-mass');
const controls = document.getElementById('instrument-controls');
const dampingInput = document.getElementById('damping');
const responseInput = document.getElementById('response');
const velocityInput = document.getElementById('initial-velocity');
const dampingOut = document.getElementById('damping-out');
const responseOut = document.getElementById('response-out');
const velocityOut = document.getElementById('velocity-out');
const instrumentX = document.getElementById('instrument-x');
const instrumentV = document.getElementById('instrument-v');
const instrumentTarget = document.getElementById('instrument-target');
const instrumentStatus = document.getElementById('instrument-status');
const instrumentLive = document.getElementById('instrument-live');

let stageMax = 0;

const instrumentSpring = new Spring({
  damping: Number(dampingInput.value),
  response: Number(responseInput.value),
  value: 0,
  onUpdate: (x, velocity) => {
    mass.style.setProperty('--mass-x', `${clamp(x, -24, stageMax + 24)}px`);
    instrumentX.textContent = x.toFixed(2);
    instrumentV.textContent = String(Math.round(velocity));
    syncTelemetry({ x, velocity, target: instrumentSpring.target, intent: 'instrument', progress: stageMax ? x / stageMax : 0 });
  },
  onRest: () => {
    instrumentStatus.textContent = 'rest';
    instrumentLive.textContent = `${instrumentTarget.textContent} 목표에 정착했습니다.`;
  },
});

function measureInstrument() {
  const wasTargetB = instrumentTarget.textContent === 'B';
  const wasAnimating = instrumentSpring.isAnimating;
  const previousMax = stageMax;
  const previousVelocity = instrumentSpring.velocity;
  stageMax = Math.max(0, stage.clientWidth - mass.offsetWidth);
  const ratio = previousMax ? instrumentSpring.value / previousMax : 0;
  const velocityScale = previousMax ? stageMax / previousMax : 1;
  const target = wasTargetB ? stageMax : 0;
  const velocity = previousVelocity * velocityScale;
  instrumentSpring.setValue(clamp(ratio * stageMax, 0, stageMax), velocity);
  instrumentSpring.target = target;
  instrumentTarget.textContent = target === 0 ? 'A' : 'B';
  if (wasAnimating && !prefersReducedMotion()) instrumentSpring.setTarget(target, velocity);
}

function syncControlOutputs() {
  dampingOut.textContent = Number(dampingInput.value).toFixed(2);
  responseOut.textContent = `${Number(responseInput.value).toFixed(2)}s`;
  velocityOut.textContent = `${Number(velocityInput.value)} px/s`;
  instrumentSpring.damping = Number(dampingInput.value);
  instrumentSpring.response = Number(responseInput.value);
}

function launchInstrument() {
  syncControlOutputs();
  const wasAnimating = instrumentSpring.isAnimating;
  const nextTarget = instrumentSpring.target > stageMax / 2 ? 0 : stageMax;
  // 정지 상태의 첫 Launch에만 슬라이더 속도를 주입한다. 진행 중 Reverse는
  // 기존 속도를 보존한 채 목표만 바꾸는 것이 이 실험의 핵심이다.
  const velocity = wasAnimating ? undefined : Number(velocityInput.value);
  instrumentTarget.textContent = nextTarget === 0 ? 'A' : 'B';
  instrumentStatus.textContent = 'running';
  instrumentLive.textContent = `${instrumentTarget.textContent} 목표로 움직입니다.`;
  if (prefersReducedMotion()) {
    instrumentSpring.setValue(nextTarget);
    instrumentStatus.textContent = 'rest';
  } else {
    instrumentSpring.setTarget(nextTarget, velocity);
  }
}

controls.addEventListener('input', syncControlOutputs);
document.getElementById('instrument-launch').addEventListener('click', launchInstrument);
mass.addEventListener('click', launchInstrument);
controls.addEventListener('reset', (event) => {
  event.preventDefault();
  dampingInput.value = '1';
  responseInput.value = '0.4';
  velocityInput.value = '900';
  syncControlOutputs();
  instrumentSpring.setValue(0);
  instrumentTarget.textContent = 'A';
  instrumentStatus.textContent = 'ready';
  instrumentLive.textContent = '스프링 실험을 초기화했습니다.';
});

// ---------------------------------------------------------------------------
// Immediate visual feedback and section state
// ---------------------------------------------------------------------------

document.querySelectorAll('button, .button-link, .hero-links a, .wordmark').forEach((element) => {
  element.addEventListener('pointerdown', () => element.classList.add('is-pressed'));
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) =>
    element.addEventListener(type, () => element.classList.remove('is-pressed'))
  );
});

const header = document.getElementById('site-header');
let scrollTicking = false;
function syncHeader() {
  header.classList.toggle('is-overlapping', window.scrollY > 4);
  scrollTicking = false;
}
addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(syncHeader);
}, { passive: true });

const navLinks = [...document.querySelectorAll('.site-nav a')];
if ('IntersectionObserver' in window) {
  const navObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => {
      if (link.hash === `#${visible.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-15% 0px -70%', threshold: [0, 0.25, 0.75] });
  navLinks
    .map((link) => document.querySelector(link.hash))
    .filter(Boolean)
    .forEach((section) => navObserver.observe(section));
}

// ---------------------------------------------------------------------------
// Initialization and environment changes
// ---------------------------------------------------------------------------

function measureAll() {
  measureTrack();
  trackSpring.setValue(snapPoints[trackIndex] ?? 0);
  updateTrackStatus();
  measureInstrument();
  if (!sheet.hidden) sheetHeight = sheet.getBoundingClientRect().height + 2;
}

measureAll();
syncControlOutputs();
syncHeader();
syncTelemetry({});

let resizeFrame = null;
addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(measureAll);
});

const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
reducedMotionQuery.addEventListener?.('change', () => {
  if (reducedMotionQuery.matches) {
    [sheetSpring, trackSpring, instrumentSpring].filter((spring) => spring.isAnimating).forEach((spring) => spring.finish());
  }
});

const colorSchemeQuery = matchMedia('(prefers-color-scheme: dark)');
const themeColor = document.querySelector('meta[name="theme-color"]');
const syncThemeColor = () => themeColor?.setAttribute('content', colorSchemeQuery.matches ? '#141513' : '#f0efea');
colorSchemeQuery.addEventListener?.('change', syncThemeColor);
syncThemeColor();

finishOnHide(sheetSpring, trackSpring, instrumentSpring);
grabber.setAttribute('aria-hidden', 'true');
