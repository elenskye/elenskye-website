// 主界面 ↔ 祝福页的两段转场。**去程与回程是完全不同的两套语言，不许互相借用。**
//
// 去程「星门穿梭」：相机朝星门推进，银河自己的粒子被拉成青绿与暖金的光条
// 从两侧掠过，最后收束进一道暖金光流，祝福页在光流里出现。三层缺一不可——
//   1. WebGL：推进与光条（galaxy.setWarp）
//   2. #gate-flash：暖金光流，遮住换页那一帧
//   3. #face-front / #face-back：在光流最盛时交换
//
// 回程「信纸分解」：整张信纸碎成青绿与暖金的微粒，随后卷成暗中心的圆筒隧道
//（dissolve.ts）；镜头沿隧道穿到最盛时换回正面，粒子**交棒给银河自己的开场
// 聚拢**——落点因此是主界面
// 最开始的状态（滚动回顶、第一幕重新入场），而不是离开时停的地方。
// 回程全程不动相机，**也不带任何加色发光**：光条与暖金光流是去程的语言，
// 回程只有细尘（`#gate-flash` 在这一段自始至终不参与）。
//
// 祝福页内部自己的两幕（灯 → 信）在 wish.ts。
// 页面所有可视层本来就是 fixed（只有一个 spacer 在驱动滚动），因此换页
// 不需要截图，也不需要劫持滚动容器。

import { createLetterDissolve } from './dissolve';
import { clamp, reduceMotion, requireElement } from './dom';

// 进入：0 → WARP_IN_MS 推进，白光在 FLASH_PEAK 达到最盛并在此换页，
// 再用 REVEAL_MS 从白光中落出祝福页。
const WARP_IN_MS = 1150;
const FLASH_PEAK_MS = 1250;
const REVEAL_MS = 700;
// 返回是完全另一套语言：信纸碎成粒子 → 粒子卷成银河隧道 → 沿暗中心穿梭，
// 前 2.6 秒让纸屑完整卷成隧道，后 2.4 秒与银河的原生聚拢逐帧同速；
// 隧道粒子收束到银河投影的同时，WebGL 粒子在下方接管。
const DISSOLVE_MS = 2600;
const HANDOFF_MS = 2400;

export interface PostcardController {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  /** 转场进行中：此时不能让别的逻辑去动相机或滚动。 */
  isBusy: () => boolean;
}

export const createPostcard = (options: {
  /** 转场开始（用户已点下，画面还没变）。音乐在这里开始交叉淡入淡出。 */
  onTransitionStart: (target: 'wish' | 'sky') => void;
  /** 白光最盛、正面已经换成背面之后。 */
  onOpened: () => void;
  /** 已经完全退回主界面之后。 */
  onClosed: () => void;
  /** 驱动 WebGL 的穿越进度。 */
  setWarp: (progress: number) => void;
  /** 星门当前的屏幕坐标，用来定暖金光流的圆心。 */
  gatePoint: () => { x: number; y: number };
  /** 主界面银河曲线的屏幕投影，回程纸尘最终聚合到这里。 */
  galaxyPoint: (s: number) => { x: number; y: number; onScreen: boolean };
  /** 回程：把主界面复位到最开始（滚动回顶、锁住滚动等待开场）。 */
  resetToStart: () => void;
  /** 回程：让银河重播开场聚拢，resolve 时表示已收拢完成。 */
  replayIntro: () => Promise<void>;
  /** 回程：开场聚拢播完，可以解锁滚动了。 */
  onIntroDone: () => void;
}): PostcardController => {
  const root = document.documentElement;
  const front = requireElement<HTMLDivElement>('face-front');
  const back = requireElement<HTMLDivElement>('face-back');
  const flash = requireElement<HTMLDivElement>('gate-flash');
  const dust = requireElement<HTMLCanvasElement>('letter-dust');
  const dissolve = createLetterDissolve({ targetPoint: options.galaxyPoint });
  const trigger = requireElement<HTMLButtonElement>('wish-button');
  // 回程落在页面开头，焦点也该回到那里。绝不能留在祝福页的按钮上：
  // 那棵子树换回正面后是 aria-hidden 的，焦点留在里面读屏会彻底迷路。
  const actOne = requireElement<HTMLElement>('act-one');
  // 祝福页落定后焦点交给第一幕的拉绳：回主界面的入口在第二幕，此刻还不存在。
  const lanternPull = requireElement<HTMLButtonElement>('lantern-pull');

  let open = false;
  let busy = false;
  let transitionFrame = 0;
  let transitionGuard = 0;

  const gateOrCenter = () => {
    const point = options.gatePoint();
    // 星门被滚出视口时（键盘直接触发等情况）退回画面中心，不让白光从屏幕外涨。
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
    }
    return {
      x: clamp(point.x, 0, window.innerWidth),
      y: clamp(point.y, 0, window.innerHeight),
    };
  };

  /** 把白光的圆心钉在星门此刻的屏幕位置上，转场中途不再移动。 */
  const anchorFlash = () => {
    const point = gateOrCenter();
    flash.style.setProperty('--flash-x', `${point.x}px`);
    flash.style.setProperty('--flash-y', `${point.y}px`);
  };

  /**
   * 墙钟驱动的补间。rAF 被节流不会积欠，另加定时器兜底：后台标签页里 rAF 可能
   * 被完全停掉，而换页、解锁滚动、焦点转移都挂在收尾回调上——只靠帧循环的话，
   * 切走再切回之前整个转场会冻在半路。定时器在同样情形下仍会派发。
   */
  const tween = (durationMs: number, onFrame: (t: number) => void, onDone: () => void) => {
    window.cancelAnimationFrame(transitionFrame);
    window.clearTimeout(transitionGuard);
    const startedAt = performance.now();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.cancelAnimationFrame(transitionFrame);
      window.clearTimeout(transitionGuard);
      transitionFrame = 0;
      onFrame(1);
      onDone();
    };

    transitionGuard = window.setTimeout(finish, durationMs + 320);

    const frame = (now: number) => {
      if (settled) return;
      const t = clamp((now - startedAt) / durationMs, 0, 1);
      if (t >= 1) {
        finish();
        return;
      }
      onFrame(t);
      transitionFrame = window.requestAnimationFrame(frame);
    };
    transitionFrame = window.requestAnimationFrame(frame);
  };

  /** 正面换背面。白光最盛的那一帧执行，用户看不到这次硬切。 */
  const showBack = () => {
    front.classList.add('is-gone');
    back.classList.add('is-present');
    back.setAttribute('aria-hidden', 'false');
  };

  const showFront = () => {
    front.classList.remove('is-gone');
    back.classList.remove('is-present');
    back.setAttribute('aria-hidden', 'true');
  };

  const doOpen = () => {
    if (open || busy) return;
    open = true;
    // 锁在根元素上：body 不是滚动容器，锁 body 不起作用。
    root.classList.add('is-flipped');
    options.onTransitionStart('wish');

    if (reduceMotion.matches) {
      // 减弱动效：不推进、不闪光，直接换页。
      showBack();
      options.onOpened();
      lanternPull.focus();
      return;
    }

    busy = true;
    anchorFlash();
    // 主界面的 DOM 覆盖层（倒计时、节点、星）先退场，否则它们会跟着相机乱飞。
    root.classList.add('is-warping');

    tween(
      FLASH_PEAK_MS,
      (t) => {
        options.setWarp(clamp(t * (FLASH_PEAK_MS / WARP_IN_MS), 0, 1));
        // 白光在后 40% 才起，前段留给纯粹的推进。
        flash.style.opacity = String(Math.pow(clamp((t - 0.42) / 0.58, 0, 1), 1.6));
        flash.style.setProperty('--flash-scale', String(0.04 + t * t * 2.6));
      },
      () => {
        showBack();
        options.onOpened();
        lanternPull.focus();
        // 换页已完成，白光退去的同时祝福页从里面落出来。
        tween(
          REVEAL_MS,
          (t) => {
            flash.style.opacity = String(1 - t);
            flash.style.setProperty('--flash-scale', String(2.64 + t * 1.2));
          },
          () => {
            flash.style.opacity = '0';
            busy = false;
            // 相机与粒子退回常态：正面此刻已被盖住，退回过程不可见。
            options.setWarp(0);
            root.classList.remove('is-warping');
          },
        );
      },
    );
  };

  const doClose = () => {
    if (!open || busy) return;
    open = false;
    options.onTransitionStart('sky');

    if (reduceMotion.matches) {
      root.classList.remove('is-flipped');
      showFront();
      options.resetToStart();
      options.onClosed();
      actOne.focus({ preventScroll: true });
      return;
    }

    busy = true;
    // 正面的倒计时与节点先压住；换面后只露 WebGL 银河，等纸尘大半收束到带上
    // 才让 DOM 淡入，否则数字会穿过仍呈放射状的隧道，交棒立刻断成两层。
    root.classList.add('is-warping');
    // 先把主页面相机与曲线投影归位；银河的真正聚拢等到换面那一刻再起。
    options.resetToStart();

    back.classList.add('is-dissolving');
    back.style.setProperty('--dissolve-ms', `${DISSOLVE_MS}ms`);
    dissolve.seed();
    dust.style.opacity = '1';

    tween(
      DISSOLVE_MS,
      (t) => dissolve.render(t * 0.66),
      () => {
        // 隧道最盛时换回正面。暗中心与四周粒子仍盖在上面，看不出这次硬切。
        root.classList.remove('is-flipped');
        showFront();
        back.classList.remove('is-dissolving');
        // 此刻才让主银河从混沌位聚拢；它与纸尘的收束段拥有相同的 2.4 秒墙钟。
        const introDone = options.replayIntro();

        tween(
          HANDOFF_MS,
          (t) => {
            // 前 18% 保持隧道完全不透明，等下方银河有足够粒子后才开始交棒。
            dissolve.render(0.66 + t * 0.34);
            const fade = clamp((t - 0.18) / 0.82, 0, 1);
            dust.style.opacity = String(1 - fade * fade * (3 - 2 * fade));
            if (t >= 0.72) root.classList.remove('is-warping');
          },
          () => {
            dust.style.opacity = '0';
            dissolve.clear();
            root.classList.remove('is-warping');
            busy = false;
            options.onClosed();
            actOne.focus({ preventScroll: true });
            // 开场聚拢播完才解锁滚动，与首次进站完全一致。
            void introDone.then(() => options.onIntroDone());
          },
        );
      },
    );
  };

  trigger.addEventListener('click', doOpen);
  // 信末那枚银河印记由 wish.ts 持有，它会回调 close()；这里不重复绑定。
  // Escape 是任何时候都留着的退路：祝福页第一幕本身没有回主界面的入口。
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) doClose();
  });

  return { open: doOpen, close: doClose, isOpen: () => open, isBusy: () => busy };
};
