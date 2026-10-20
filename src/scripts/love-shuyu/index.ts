// /love-shuyu/ 入口：把倒计时、银河带、时间线与明信片翻面串起来。

import { createMusic } from './audio';
import { FINAL_STAR_S } from './band';
import { startBirthdayWatch, startCountdown } from './countdown';
import { clamp, reduceMotion, requireElement } from './dom';
import { createGalaxy, type ScreenMask } from './galaxy';
import { createLantern3D, type Lantern3DController } from './lantern3d';
import { createWishLyrics } from './lyrics';
import { createPostcard } from './postcard';
import { createTimeline } from './timeline';
import { startViewportInsets } from './viewport';
import { createWishStage } from './wish';
import { timelineNodes } from '../../data/love-shuyu-timeline';

// 浏览器默认会在刷新后恢复旧滚动位置；隐藏页每次载入都应从第一幕开始。
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const resetToActOne = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
resetToActOne();
window.addEventListener('pageshow', resetToActOne);

const data = document.body.dataset;

startCountdown({
  startUtcMs: Number(data.startUtc),
  endUtcMs: Number(data.endUtc),
  birthdayMonth: Number(data.birthdayMonth),
  birthdayDay: Number(data.birthdayDay),
  progressPrefix: data.progressPrefix ?? '',
  idleText: data.idleText ?? '',
  birthdayText: data.birthdayText ?? '',
});

startBirthdayWatch({
  birthdayMonth: Number(data.birthdayMonth),
  birthdayDay: Number(data.birthdayDay),
  idleText: data.idleText ?? '',
  birthdayText: data.birthdayText ?? '',
});

const canvas = requireElement<HTMLCanvasElement>('galaxy');
const actOne = requireElement<HTMLElement>('act-one');
const scrollHint = requireElement<HTMLDivElement>('scroll-hint');
const ambientSky = requireElement<HTMLDivElement>('ambient-sky');
const memoryStream = requireElement<HTMLElement>('memory-stream');
const memoryPhotos = Array.from(memoryStream.querySelectorAll<HTMLImageElement>('[data-memory-src]'));
const wishButton = requireElement<HTMLButtonElement>('wish-button');
const wishButtonText = requireElement<HTMLSpanElement>('wish-button-text');

let timeline: ReturnType<typeof createTimeline> | null = null;
let scrollProgress = 0;
let memoryPhotosLoaded = false;

const updateMemoryStream = () => {
  // 先在画面外安静挂载图片，等滚到银河末端才让双轨照片带从底部浮出。
  if (!memoryPhotosLoaded && scrollProgress > 0.68) {
    memoryPhotosLoaded = true;
    memoryPhotos.forEach((photo) => {
      const source = photo.dataset.memorySrc;
      if (source) photo.src = source;
    });
  }

  /*
    不用固定的“滚动到 80% 就出现”：那会在生日入口刚从底部进场时
    把文案盖住。这里量取文案真实位置与照片带最终顶边：只有“文案已在屏内，
    且下方留出了足够空间”后才开始淡入。
  */
  const streamStyle = getComputedStyle(memoryStream);
  const bottomGap = Number.parseFloat(streamStyle.bottom) || 18;
  /*
    量的是 getBoundingClientRect，坐标系必须跟着**布局视口**走，不能用
    window.innerHeight：手机上工具栏展开时 innerHeight 是可见高度，
    而这一层是固定层、按布局视口铺满，两者差着一整条工具栏。
    用 clientHeight 才和 rect 同一个坐标系；桌面上两者本来就相等。
  */
  const layerHeight = document.documentElement.clientHeight;
  const restingTop = layerHeight - bottomGap - memoryStream.offsetHeight;
  const labelRect = wishButtonText.getBoundingClientRect();
  const clearance = restingTop - labelRect.bottom;
  const labelHasArrived =
    scrollProgress > 0.82 &&
    !wishButton.classList.contains('is-offscreen') &&
    labelRect.top >= 0 &&
    labelRect.bottom <= layerHeight;
  const reveal = labelHasArrived ? clamp((clearance - 18) / 84, 0, 1) : 0;
  memoryStream.style.setProperty('--memory-reveal', reveal.toFixed(3));
  memoryStream.style.setProperty('--memory-rise', `${((1 - reveal) * 18).toFixed(1)}px`);
  memoryStream.classList.toggle('is-active', reveal > 0.02 && !reduceMotion.matches);
};

/** 第一幕内容随滚动淡出，让位给时间线。 */
const actOneOpacity = () => 1 - clamp((scrollProgress - 0.015) / 0.085, 0, 1);

const collectMasks = (): ScreenMask[] => {
  const masks: ScreenMask[] = [];
  // 星门穿越期间 DOM 覆盖层已经淡掉，再压暗就只剩一块跟着相机跑的暗斑。
  if (document.documentElement.classList.contains('is-warping')) return masks;
  const opacity = actOneOpacity();
  if (opacity > 0.02) {
    const rect = actOne.getBoundingClientRect();
    masks.push({
      left: rect.left - 32,
      top: rect.top - 24,
      width: rect.width + 64,
      height: rect.height + 48,
      // 压暗强度跟着淡出走，第一幕退场时银河自然亮回来。
      strength: 0.78 * opacity,
    });
  }
  return masks.concat(timeline?.masks() ?? []);
};

const sync = () => {
  const opacity = actOneOpacity();
  actOne.style.opacity = String(opacity);
  actOne.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
  timeline?.update();
  updateMemoryStream();
  galaxy.setMasks(collectMasks());
};

// 心跳波抵达尽头那颗星时让它闪一下。星本身有一条常驻的 pulse 动画，
// 闪光因此挂在 ::after 上：重叠两条动画会互相打断，看起来像掉帧。
const FLARE_MS = 900;
let flareTimer = 0;

const flareStar = () => {
  window.clearTimeout(flareTimer);
  wishButton.classList.remove('is-flare');
  // 强制回流，否则连续两次触发时动画不会重播。
  void wishButton.offsetWidth;
  wishButton.classList.add('is-flare');
  flareTimer = window.setTimeout(() => wishButton.classList.remove('is-flare'), FLARE_MS);
};

let galaxyFailed = false;
let galaxy: ReturnType<typeof createGalaxy>;

try {
  galaxy = createGalaxy(canvas, { onSync: sync, onPulseArrive: flareStar });
} catch (error) {
  // WebGL2 不可用：退到静态 CSS 深空，时间线仍以纯 DOM 可读。
  console.error('[love-shuyu] WebGL 初始化失败，使用静态降级', error);
  document.documentElement.classList.add('webgl-fallback');
  galaxyFailed = true;
  galaxy = {
    resize: () => {},
    setScroll: () => {},
    setMasks: () => {},
    setWarp: () => {},
    replayIntro: () => Promise.resolve(),
    project: () => ({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, depth: 0, onScreen: true }),
    pulseS: () => -1,
    start: () => {},
    stop: () => {},
    ready: Promise.resolve(),
  };
}

timeline = createTimeline(galaxy, timelineNodes);

// 自动播放被拦下时，第一幕里才出现那个轻轻摇晃的音符；成功自动播放则永不出现。
const musicHint = requireElement<HTMLButtonElement>('music-hint');
let musicHintTimer = 0;

const music = createMusic({
  sky: requireElement<HTMLAudioElement>('music-sky'),
  wish: requireElement<HTMLAudioElement>('music-wish'),
  pull: requireElement<HTMLAudioElement>('sfx-pull'),
  page: requireElement<HTMLAudioElement>('sfx-page'),
  onBlocked: () => {
    window.clearTimeout(musicHintTimer);
    musicHint.classList.remove('is-leaving');
    musicHint.hidden = false;
  },
  onPlaying: () => {
    if (musicHint.hidden) return;
    musicHint.classList.add('is-leaving');
    // 等淡出走完再真正隐藏，不做硬切。
    musicHintTimer = window.setTimeout(() => {
      musicHint.hidden = true;
    }, 560);
  },
});

let lantern: Lantern3DController = { start: () => {}, stop: () => {}, resize: () => {}, pull: () => {} };
try {
  lantern = createLantern3D();
} catch (error) {
  // 独立降级：纸灯 WebGL 失败不影响主银河，保留静态八面轮廓与拉绳。
  console.error('[love-shuyu] 八面灯 WebGL 初始化失败，使用静态降级', error);
  requireElement<HTMLDivElement>('lantern-stage').classList.add('lantern-webgl-fallback');
}

// 点击音符本身就是一次用户激活，audio.ts 挂在 window 捕获阶段的一次性手势监听
// 会先接住它并起播，成功后走 onPlaying 撤下按钮。这里刻意不自己抢先淡出：
// 万一那次播放仍被拒，按钮必须留在原地可点，而不是变成一个透明的死区。

// 祝福页自己的两幕（灯 → 信）。onExit 是信末那枚银河印记。
const wishLyrics = createWishLyrics();
const wishStage = createWishStage({
  onExit: () => postcard.close(),
  onPull: () => {
    wishLyrics.stop();
    // 先让 canvas 内的真实立体拉绳完成一次下拉回弹，
    // 灯飞离视口后再停渲染，避免拉绳在首帧冻住。
    lantern.pull();
    window.setTimeout(() => lantern.stop(), 1240);
    music.pull();
  },
  onPageTurn: () => music.turnPage(),
});

const postcard = createPostcard({
  // 音乐的交叉淡入淡出与转场同时起步，切到位时正好换完。
  onTransitionStart: (target) => {
    timeline?.closePanel();
    if (target === 'wish') {
      // 趁正面还没换走先归位：每次进祝福页都从第一幕的灯开始。
      wishStage.reset();
      wishLyrics.reset();
      music.toWish();
      return;
    }
    music.toSky();
    // 回程要先把银河跑起来：相机从星门退回原位这一段必须真的在渲染。
    galaxy.resize();
    galaxy.start();
  },
  // 银河此刻已被祝福页完全盖住，停掉渲染循环省电。
  onOpened: () => {
    galaxy.stop();
    lantern.start();
    wishLyrics.start();
  },
  onClosed: () => {
    wishLyrics.reset();
    lantern.stop();
    galaxy.resize();
    galaxy.start();
  },
  setWarp: (progress) => galaxy.setWarp(progress),
  gatePoint: () => galaxy.project(FINAL_STAR_S),
  galaxyPoint: (s) => galaxy.project(s),
  // 回程落点是主界面**最开始的状态**：滚动回顶，并重新锁住等待开场聚拢。
  resetToStart: () => {
    resetToActOne();
    readScroll();
    if (!reduceMotion.matches && !galaxyFailed) {
      document.documentElement.classList.add('is-intro');
    }
  },
  replayIntro: () => galaxy.replayIntro(),
  onIntroDone: () => {
    document.documentElement.classList.remove('is-intro');
    // 解锁后立刻重读一次，避免锁定期间的滚动被吞掉。
    readScroll();
  },
});

const readScroll = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  scrollProgress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  galaxy.setScroll(scrollProgress);
  // 远天视差：整片虚拟天幕在全程滚动里只上移 1.2 屏，比银河的 4.8 屏慢得多，
  // 星点因此读作远天而不是钉在视口上的贴图，两幕看到的也是不同的星。
  ambientSky.style.setProperty('--sky-drift', String(scrollProgress));
  scrollHint.classList.toggle('is-hidden', scrollProgress > 0.01);
  updateMemoryStream();
  // 减弱动效下没有渲染循环，滚动时手动同步一次 DOM。
  if (reduceMotion.matches || galaxyFailed) sync();
};

window.addEventListener('scroll', readScroll, { passive: true });

// 手机浏览器工具栏挡住的那一条量出来交给 CSS：信纸的翻页折角靠它躲开工具栏。
// 高度一变，信纸的页数也要重算。
startViewportInsets(() => wishStage.relayout());

let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    galaxy.resize();
    lantern.resize();
    // 视口变了，信纸的栏宽与页数都要重算，否则翻页会横移到错的位置。
    wishStage.relayout();
    readScroll();
    sync();
  }, 150);
});

document.addEventListener('visibilitychange', () => {
  if (postcard.isOpen() || postcard.isBusy()) return;
  if (document.hidden) galaxy.stop();
  else galaxy.start();
});

// 开场：锁住滚动直到粒子聚拢播完。减弱动效下 ready 立即 resolve，不锁。
if (!reduceMotion.matches && !galaxyFailed) {
  document.documentElement.classList.add('is-intro');
}

readScroll();
galaxy.start();
sync();

void galaxy.ready.then(() => {
  document.documentElement.classList.remove('is-intro');
  // 解锁后立刻重读一次，避免锁定期间的滚动被吞掉。
  readScroll();
});
