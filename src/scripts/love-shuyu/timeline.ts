// 第二幕：沿银河带排布的 11 个节点。
//
// 节点是真实 <button>（键盘、aria、展开层都靠它），但位置完全由 band.ts 的曲线
// 经相机投影得出——曲线是唯一真相源，DOM 只跟随，不另算一套坐标。

import {
  CAMERA_FOV,
  CAMERA_LEAD_Y,
  CAMERA_TRAVEL,
  FINAL_STAR_S,
  bandPoint,
  desktopBand,
  nodeS,
  portraitBand,
} from './band';
import { clamp, reduceMotion, requireElement } from './dom';
import type { GalaxyController, ScreenMask } from './galaxy';
import { formatRange, formatStart, type TimelineNode } from '../../data/love-shuyu-timeline';

type MilestoneKind = 'first' | 'confession' | 'distance';

/** 只标记站主指定的三个视觉里程碑，不改变时间线内容数据。 */
const milestoneByStart: Partial<Record<string, MilestoneKind>> = {
  '2025-08-10': 'first',
  '2025-10-03': 'confession',
  '2026-04-27': 'distance',
};

/** 自绘四芒星，避免直接使用会随字体变化的 ✦ 字符。 */
const starShape = (className = 'node-star-shape') => `
  <svg class="${className}" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
    <path d="M12 0C13.1 7.7 16.3 10.9 24 12C16.3 13.1 13.1 16.3 12 24C10.9 16.3 7.7 13.1 0 12C7.7 10.9 10.9 7.7 12 0Z" />
  </svg>`;

const nodeStarMarkup = (milestone?: MilestoneKind) => {
  let decoration = '';
  if (milestone === 'first') {
    decoration = `
      <span class="milestone-spark milestone-spark-a"></span>
      <span class="milestone-spark milestone-spark-b"></span>`;
  } else if (milestone === 'confession') {
    decoration = starShape('milestone-twin');
  } else if (milestone === 'distance') {
    decoration = `
      <span class="milestone-orbit">
        <span class="milestone-orbit-dot milestone-orbit-dot-a"></span>
        <span class="milestone-orbit-dot milestone-orbit-dot-b"></span>
      </span>`;
  }

  return `<span class="node-star-mark" aria-hidden="true">
    ${starShape()}${decoration}
    ${milestone ? '<span class="milestone-echo"></span>' : ''}
  </span>`;
};

export interface TimelineController {
  /** 每帧同步节点位置与点亮状态。 */
  update: () => void;
  /** 当前需要让银河压暗的区域：展开的卡片。 */
  masks: () => ScreenMask[];
  closePanel: () => void;
}

export const createTimeline = (
  galaxy: GalaxyController,
  nodes: TimelineNode[],
): TimelineController => {
  const layer = requireElement<HTMLDivElement>('timeline-nodes');
  const panel = requireElement<HTMLDivElement>('node-panel');
  const panelDate = requireElement<HTMLParagraphElement>('node-panel-date');
  const panelPlace = requireElement<HTMLSpanElement>('node-panel-place');
  const panelPhoto = requireElement<HTMLImageElement>('node-panel-photo');
  const panelBody = requireElement<HTMLParagraphElement>('node-panel-body');
  const panelClose = requireElement<HTMLButtonElement>('node-panel-close');
  const star = requireElement<HTMLButtonElement>('wish-button');

  const isPortrait = window.innerHeight > window.innerWidth * 1.1;
  const useStackedPanel = isPortrait || window.innerWidth < 720;
  const config = isPortrait ? portraitBand : desktopBand;
  panel.classList.add(useStackedPanel ? 'is-mobile-panel' : 'is-desktop-panel');

  let openIndex = -1;
  let panelHideTimer = 0;
  let panelAnimationRun = 0;
  let nodeLaunchRun = 0;
  let openRun = 0;
  // 程序化滚动期间必须挡掉「滚动即收起」，否则让位滚动会把自己刚开的卡片关掉。
  let programmaticScroll = false;

  // 必须与 CSS 的 --t-close 逐个对上，否则退场动画会被提前截断。
  // 里程碑节点整体放慢约 15%（方案 D）。
  const closeMs = (milestone: boolean) => {
    if (useStackedPanel) return milestone ? 530 : 460;
    return milestone ? 550 : 480;
  };

  interface NodeView {
    button: HTMLButtonElement;
    s: number;
    lit: boolean;
    milestone: boolean;
  }

  const views: NodeView[] = nodes.map((node, index) => {
    const milestone = milestoneByStart[node.start];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `node${milestone ? ` is-milestone milestone-${milestone}` : ''}`;
    button.id = `node-${node.id}`;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'node-panel');
    button.innerHTML = `${nodeStarMarkup(milestone)}<span class="node-date">${formatStart(node.start)}</span>`;
    button.addEventListener('click', () => toggle(index));
    // 键盘走到画面外的节点时，把它滚到画面中央，否则焦点落在看不见的地方。
    button.addEventListener('focus', () => {
      if (!views[index].lit) scrollToS(views[index].s);
    });
    // 指针点在被 pointer-events 关掉的节点上不会触发，这里只服务键盘。
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') scrollToS(views[index].s);
    });
    if (milestone) {
      button.addEventListener('animationend', (event) => {
        if ((event.target as HTMLElement).classList.contains('milestone-echo')) {
          button.classList.remove('is-heart-echo');
        }
      });
    }
    layer.append(button);
    return { button, s: nodeS(index, nodes.length), lit: false, milestone: Boolean(milestone) };
  });

  let previousPulseS = -1;

  /** 心跳波越过里程碑时只留一圈短余辉；波被节流跳跃时不补播。 */
  const syncMilestoneEchoes = () => {
    const pulseS = galaxy.pulseS();
    if (reduceMotion.matches || pulseS < 0) {
      previousPulseS = -1;
      return;
    }

    const fromS = previousPulseS < 0 ? 0 : previousPulseS;
    const advanced = pulseS - fromS;
    if (advanced >= 0 && advanced < 0.18) {
      for (const view of views) {
        if (!view.milestone || view.s <= fromS || view.s > pulseS) continue;
        view.button.classList.remove('is-heart-echo');
        // 连续两轮之间即使上一次动画因标签页隐藏而未派发 animationend，也能重播。
        void view.button.offsetWidth;
        view.button.classList.add('is-heart-echo');
      }
    }
    previousPulseS = pulseS;
  };

  /** 让曲线上的 s 停在视口中央所需的滚动位置。 */
  const scrollToS = (s: number) => {
    const worldY = bandPoint(s, config).y;
    const progress = clamp((CAMERA_LEAD_Y - worldY) / CAMERA_TRAVEL, 0, 1);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: progress * max, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  };

  const placePanel = (index: number) => {
    const projected = galaxy.project(views[index].s);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const gap = 24;
    panel.style.removeProperty('width');

    let boxLeft = 0;
    let boxTop = 0;

    if (useStackedPanel) {
      // 竖屏：卡片横向铺满安全区，纵向贴着节点。
      // 居中用显式 left 算，不用 translateX(-50%)——transform 要留给收回星点的动效。
      if (panel.dataset.side !== 'below') panel.dataset.side = 'below';
      boxLeft = Math.round((width - panel.offsetWidth) * 0.5);
      boxTop = clamp(projected.y + 28, 16, Math.max(16, height - panel.offsetHeight - 16));
      panel.style.left = `${boxLeft}px`;
      panel.style.top = `${boxTop}px`;
    } else {
      // 桌面：按完整按钮（含日期）的边界选边，而不是只看星星中心。
      // 优先使用银河另一侧的留白；空间不足时换边或收窄卡片，始终保留 gap。
      const nodeRect = views[index].button.getBoundingClientRect();
      const leftSpace = nodeRect.left - gap - 16;
      const rightSpace = width - 16 - nodeRect.right - gap;
      const preferredSide = projected.x > width * 0.5 ? 'left' : 'right';
      const preferredSpace = preferredSide === 'left' ? leftSpace : rightSpace;
      const otherSpace = preferredSide === 'left' ? rightSpace : leftSpace;
      const side = preferredSpace >= 240 || preferredSpace >= otherSpace
        ? preferredSide
        : preferredSide === 'left' ? 'right' : 'left';
      const available = Math.max(220, side === 'left' ? leftSpace : rightSpace);
      const panelWidth = Math.min(340, available);
      panel.style.width = `${panelWidth}px`;
      if (panel.dataset.side !== side) panel.dataset.side = side;
      const left = side === 'left'
        ? nodeRect.left - panelWidth - gap
        : nodeRect.right + gap;
      const top = clamp(projected.y - panel.offsetHeight * 0.5, 16, Math.max(16, height - panel.offsetHeight - 16));
      boxLeft = left;
      boxTop = top;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.setProperty('--panel-bridge', `${gap}px`);
      panel.style.setProperty('--panel-anchor-y', `${clamp(projected.y - top, 12, panel.offsetHeight - 12)}px`);
    }

    // 「从星点长出、被星点收回」全靠这个变换原点：把它钉在节点星的中心上，
    // 之后卡片只要缩放就会自然朝节点收拢，不需要另算位移向量。
    // 原点允许落在卡片盒子之外，这正是桌面端侧挂时需要的。
    // 必须用刚写下的布局坐标算，不能用 getBoundingClientRect——后者含动画中的
    // 缩放，逐帧回读会让原点自己追着自己跑。
    panel.style.transformOrigin =
      `${(projected.x - boxLeft).toFixed(1)}px ${(projected.y - boxTop).toFixed(1)}px`;
  };

  const finishPanelClose = () => {
    panel.hidden = true;
    panel.classList.remove('is-open', 'is-closing', 'is-measuring');
  };

  /**
   * 世界单位 → 屏幕像素的纵向比例。相机 z 恒为 0，视距就是节点自身的 |z|；
   * 有了它才能把「卡片还差多少像素才放得下」换算成要滚多远。
   */
  const pixelsPerWorldY = (s: number) => {
    const distance = Math.max(1, Math.abs(bandPoint(s, config).z));
    return window.innerHeight / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * distance);
  };

  /**
   * 缓动的程序化滚动。不用 `behavior: 'smooth'`：它没有结束事件，
   * 而这里必须等滚动真正停下、节点投影稳定之后才能定位并播放入场动画。
   */
  const scrollByPixels = (delta: number, done: () => void) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const from = window.scrollY;
    const to = clamp(from + delta, 0, Math.max(0, max));
    const distance = to - from;
    if (Math.abs(distance) < 1 || reduceMotion.matches) {
      if (Math.abs(distance) >= 1) window.scrollTo({ top: to, behavior: 'auto' });
      done();
      return;
    }

    // 让位滚动要「适当」：短距离干脆，长距离也压在 620ms 内，不能让人等卡片。
    const duration = clamp(240 + Math.abs(distance) * 1.15, 240, 620);
    const startedAt = performance.now();
    programmaticScroll = true;

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(scrollGuard);
      programmaticScroll = false;
      done();
    };

    // 兜底：rAF 在后台标签页会被节流甚至完全停掉，而卡片是在滚动结束的回调里
    // 才现身的——只靠帧循环的话，切走再切回之前卡片会一直卡在隐身量高的状态。
    // 定时器在同样情形下仍会派发，所以到点直接落位并放行。
    const scrollGuard = window.setTimeout(() => {
      if (settled) return;
      window.scrollTo({ top: to, behavior: 'auto' });
      settle();
    }, duration + 320);

    const frame = (now: number) => {
      if (settled) return;
      const t = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      window.scrollTo({ top: from + distance * eased, behavior: 'auto' });
      if (t < 1) {
        window.requestAnimationFrame(frame);
        return;
      }
      // scroll 事件比 rAF 晚一拍派发，延后一帧解封才挡得住最后那一次。
      window.requestAnimationFrame(settle);
    };
    window.requestAnimationFrame(frame);
  };

  /**
   * 竖屏卡片挂在节点下方，空间不足时会盖住节点本身。
   * 这里先量出卡片实际高度，算出「还差多少像素」，再把页面下滚同样多，
   * 让节点上移、把下方空间让出来；滚完才播放入场动效。
   */
  const makeRoomFor = (index: number, done: () => void) => {
    const projected = galaxy.project(views[index].s);
    const gap = 28;
    const margin = 16;
    const overflow = projected.y + gap + panel.offsetHeight + margin - window.innerHeight;
    if (overflow <= 0) {
      done();
      return;
    }

    // 节点自己也不能被顶出画面：至少留 92px 的顶部余量。
    const lift = Math.min(overflow, Math.max(0, projected.y - 92));
    if (lift < 1) {
      done();
      return;
    }

    // 节点在屏幕上上移 lift 像素 ⇔ 相机下移同样多的世界单位 ⇔ 滚动条前进这些像素。
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const scrollDelta = (lift / pixelsPerWorldY(views[index].s) / CAMERA_TRAVEL) * max;
    scrollByPixels(scrollDelta, done);
  };

  /** 照片没解码完就量高度会量到 0，卡片会被放在错的位置。等一小会儿，超时就按现状量。 */
  const whenPhotoSettled = (done: () => void) => {
    if (panelPhoto.complete && panelPhoto.naturalHeight > 0) {
      done();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      done();
    };
    panelPhoto.addEventListener('load', finish, { once: true });
    panelPhoto.addEventListener('error', finish, { once: true });
    // 图片迟迟不来时不能把卡片一直吊着。
    window.setTimeout(finish, 220);
  };

  const playPanelOpen = (index: number) => {
    panel.classList.remove('is-measuring');
    // 先让卡片有尺寸再定位，否则 getBoundingClientRect 拿到 0。
    placePanel(index);
    // 强制提交初始态，下一帧才能真正播放入场动画。
    void panel.offsetWidth;
    panel.dataset.animationRun = String(++panelAnimationRun);
    panel.classList.add('is-open');
    views[index].button.setAttribute('aria-expanded', 'true');
    views[index].button.classList.add('is-open');
    views[index].button.classList.remove('is-detail-launch');
    void views[index].button.offsetWidth;
    views[index].button.classList.add('is-detail-launch');
    const currentLaunchRun = ++nodeLaunchRun;
    window.setTimeout(() => {
      if (currentLaunchRun === nodeLaunchRun) views[index].button.classList.remove('is-detail-launch');
    }, 560);
    openIndex = index;
  };

  const openPanel = (index: number) => {
    window.clearTimeout(panelHideTimer);
    // 切换节点或在退场中重新打开时，先完整提交一次隐藏态，确保每次都从动画首帧开始。
    panel.hidden = true;
    panel.classList.remove('is-open', 'is-closing', 'is-measuring');
    void panel.offsetWidth;
    const node = nodes[index];
    panel.dataset.nodeId = node.id;
    panelDate.textContent = formatRange(node);
    panelPlace.textContent = node.place;
    panelPhoto.src = node.photo;
    panelPhoto.alt = node.alt;
    panelBody.textContent = node.body;
    // 方案 D：里程碑节点的卡片整体放慢并多一层暖金余晖，由 CSS 变量接管。
    panel.classList.toggle('is-milestone-panel', views[index].milestone);
    panel.hidden = false;

    if (!useStackedPanel) {
      playPanelOpen(index);
      return;
    }

    // 竖屏：先隐身量高度并让位滚动，再播放动效。
    const run = ++openRun;
    panel.classList.add('is-measuring');
    panel.style.top = '0px';
    whenPhotoSettled(() => {
      if (run !== openRun) return;
      makeRoomFor(index, () => {
        if (run !== openRun) return;
        playPanelOpen(index);
      });
    });
  };

  const closePanel = (immediate = false) => {
    // 量高度／让位滚动途中被打断：作废这一轮，把还没现身的卡片直接收掉。
    openRun += 1;
    if (openIndex < 0) {
      if (!panel.hidden && panel.classList.contains('is-measuring')) finishPanelClose();
      return;
    }
    const milestone = views[openIndex].milestone;
    views[openIndex].button.setAttribute('aria-expanded', 'false');
    views[openIndex].button.classList.remove('is-open');
    panel.classList.remove('is-open');
    openIndex = -1;
    window.clearTimeout(panelHideTimer);
    if (immediate || reduceMotion.matches) {
      finishPanelClose();
      return;
    }
    panel.classList.add('is-closing');
    panelHideTimer = window.setTimeout(finishPanelClose, closeMs(milestone));
  };

  const toggle = (index: number) => {
    if (openIndex === index) {
      closePanel();
      return;
    }
    if (openIndex >= 0 || !panel.hidden) closePanel(true);
    openPanel(index);
  };

  panelClose.addEventListener('click', () => {
    const previous = openIndex;
    closePanel();
    if (previous >= 0) views[previous].button.focus();
  });

  document.addEventListener('pointerdown', (event) => {
    if (openIndex < 0 || !(event.target instanceof Element)) return;
    if (event.target.closest('#node-panel, .node')) return;
    closePanel();
  });

  window.addEventListener('scroll', () => {
    // 让位滚动是我们自己发起的，不能让它把刚要展开的卡片收掉。
    if (programmaticScroll) return;
    if (openIndex >= 0) closePanel();
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openIndex >= 0) {
      const previous = openIndex;
      closePanel();
      views[previous].button.focus();
    }
  });

  const update = () => {
    syncMilestoneEchoes();

    const height = window.innerHeight;
    // 点亮带：靠近视口中央的节点才亮起并可读。
    const litRadius = height * 0.42;

    const width = window.innerWidth;
    // 兜底夹紧：极端视口比例下仍可能有节点贴边，标签被切掉。
    // 正常情况下不触发，节点位置仍严格由曲线决定。
    const edge = 76;

    for (const view of views) {
      const projected = galaxy.project(view.s);
      const x = clamp(projected.x, edge, Math.max(edge, width - edge));
      view.button.style.transform = `translate3d(${x}px, ${projected.y}px, 0) translate(-50%, -50%)`;
      const lit = projected.onScreen && Math.abs(projected.y - height * 0.5) < litRadius;
      if (lit !== view.lit) {
        view.lit = lit;
        view.button.classList.toggle('is-lit', lit);
      }
      // 画面外的节点用透明度隐藏，不能用 visibility:hidden——那会把它们移出
      // Tab 序列并让 focus() 失效，键盘用户就再也到不了这些节点。
      view.button.classList.toggle('is-offscreen', !projected.onScreen);
    }

    const starProjection = galaxy.project(FINAL_STAR_S);
    const starX = clamp(starProjection.x, edge, Math.max(edge, width - edge));
    star.style.transform = `translate3d(${starX}px, ${starProjection.y}px, 0) translate(-50%, -50%)`;
    star.classList.toggle('is-offscreen', !starProjection.onScreen);
    star.classList.toggle('is-lit', starProjection.onScreen && Math.abs(starProjection.y - height * 0.5) < litRadius);

    if (openIndex >= 0) placePanel(openIndex);
  };

  const masks = (): ScreenMask[] => {
    // 收起动画尚未结束时继续保留局部压暗，避免卡片淡出途中背景突然跳亮。
    // 量高度阶段卡片还没定位，此时压暗会在错误的位置留一块暗斑。
    if (panel.hidden || panel.classList.contains('is-measuring')) return [];
    const rect = panel.getBoundingClientRect();
    return [
      {
        left: rect.left - 24,
        top: rect.top - 24,
        width: rect.width + 48,
        height: rect.height + 48,
        strength: 0.82,
      },
    ];
  };

  return { update, masks, closePanel };
};
