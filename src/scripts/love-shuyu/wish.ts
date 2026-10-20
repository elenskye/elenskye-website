// 祝福页自己的两幕。
//
//   第一幕：一盏挂着的八面纸灯，灯下垂一根拉绳。
//   过渡：拉绳被拉长 → 弹回 → 整盏灯带着回弹向上飞出 → 只留下一片台灯光池
//         → 信纸与文字以「墨迹渗现」浮出。
//   第二幕：一封铺满整屏的信。桌面两栏、移动端单栏；下方两角的折角翻页，
//         哪一角出现取决于那个方向还有没有页。
//
// 三个转场各自独立，不共用效果：进入祝福页是银河粒子穿梭（postcard.ts），
// 这里是拉灯，回主界面是信纸碎裂后卷成粒子隧道（也在 postcard.ts）。
//
// 这一页没有真正的滚动容器（`html` 在祝福态是锁死的），所以「向下滚动」只能
// 当作**手势信号**来接：wheel 与 touch 拖拽都只用来触发那一次过渡，不驱动位移。

import { clamp, reduceMotion, requireElement } from './dom';

/** 拉绳被拉长到弹回。 */
const CORD_MS = 420;
/** 灯开始上飞的时刻（相对拉绳起手）与飞完所需时长。 */
const RECOIL_DELAY_MS = 320;
const RECOIL_MS = 900;
/** 光池涨到位的时长。 */
const POOL_MS = 760;
/** 墨迹渗现。与 CSS 的 ink-bleed 必须一致——改一处就得改另一处。 */
const INK_MS = 1600;
/** 触发过渡所需的累计下滑量（CSS px）。太小会误触，太大会以为没反应。 */
const SCROLL_TRIGGER = 90;

export interface WishStage {
  /** 每次进入祝福页时调用：回到第一幕，清掉上一次的动画状态。 */
  reset: () => void;
  /** 视口变化后重算分页。 */
  relayout: () => void;
}

export const createWishStage = (options: {
  /** 信末的银河印记被点下。 */
  onExit: () => void;
  /** 拉绳已经被有效触发。 */
  onPull: () => void;
  /** 折角已经被有效翻动。 */
  onPageTurn: () => void;
}): WishStage => {
  const actOne = requireElement<HTMLElement>('wish-act-one');
  const actTwo = requireElement<HTMLElement>('wish-act-two');
  const faceBack = requireElement<HTMLDivElement>('face-back');
  const pool = requireElement<HTMLDivElement>('lamp-pool');
  const pull = requireElement<HTMLButtonElement>('lantern-pull');
  const back = requireElement<HTMLButtonElement>('postcard-back-button');
  const body = requireElement<HTMLDivElement>('letter-body');
  const turn = requireElement<HTMLButtonElement>('letter-turn');
  const turnBack = requireElement<HTMLButtonElement>('letter-turn-prev');
  // 中缝整块（分隔线 + 白描小花）。单栏时整块藏起来。
  const seam = requireElement<HTMLElement>('letter-seam');
  const viewport = body.parentElement as HTMLElement;

  /** 分页彻底失灵时的救生圈：整封退成竖向可滚动的单栏。正常永远是 false。 */
  let scrollFallback = false;

  /*
    `overflow: hidden` 的盒子**仍然是滚动容器**。转场结尾的 focus() 会把它
    滚到被聚焦元素处——银河印记在多栏流的最末，于是整页直接跳到最后一栏，
    翻页也就再没有效果。更隐蔽的是：.letter-body 的背景只覆盖它自身那一个
    视口宽的盒子，scrollLeft 一非零就滚出了绘制区，横线会整片消失。
    两个症状同一个根因，所以这里把它钉死。
  */
  viewport.addEventListener('scroll', () => {
    if (viewport.scrollLeft !== 0) viewport.scrollLeft = 0;
    // 兜底态下竖向滚动是**唯一**的读法，这时不能再把 scrollTop 钉死。
    if (!scrollFallback && viewport.scrollTop !== 0) viewport.scrollTop = 0;
  });

  let stage: 'lantern' | 'letter' = 'lantern';
  let busy = false;
  let frame = 0;
  let guard = 0;
  let scrollIntent = 0;
  let touchStartY = 0;
  let page = 0;
  let pageCount = 1;

  /**
   * `wish-act-one` 常驻在翻面背后，单看 hidden 无法判断它是否真的在眼前。
   * 只有背面已经呈现且没有被 aria-hidden 隔离时，滚轮／触摸才属于拉灯手势；
   * 否则主页面的正常滚动会误触这套监听，连带播放拉灯音效。
   */
  const lanternIsInteractive = () =>
    stage === 'lantern' &&
    !actOne.hidden &&
    faceBack.classList.contains('is-present') &&
    faceBack.getAttribute('aria-hidden') === 'false';

  /**
   * 墙钟驱动的补间，另加定时器兜底。
   * 换幕与解锁都挂在收尾回调上，后台标签页里 rAF 会被完全停掉，
   * 只靠帧循环的话整段过渡会冻在半路——与页面其他补间同一条纪律。
   */
  const tween = (durationMs: number, onFrame: (t: number) => void, onDone: () => void) => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(guard);
    const startedAt = performance.now();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(guard);
      frame = 0;
      onFrame(1);
      onDone();
    };

    guard = window.setTimeout(finish, durationMs + 320);

    const step = (now: number) => {
      if (settled) return;
      const t = clamp((now - startedAt) / durationMs, 0, 1);
      if (t >= 1) {
        finish();
        return;
      }
      onFrame(t);
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
  };

  // ---------------- 横线对齐 ----------------

  /** 字脚到横线的间距。CSS 里的 --rule-gap 是同一个数，两边都改才算改。 */
  const RULE_GAP = 3.5;

  /**
   * 把横线推到「刚好贴着字脚」的位置。
   *
   * 基线在行盒里的高度取决于**当前真正生效的那个字体**。自托管的霞鹜文楷在
   * 下载完成前仍会短暂使用衬线回退，两者的上伸部能差好几像素；写死偏移会让
   * 横线在换字体后错位，所以这里实测：
   * 塞一个零尺寸的 inline-block（它的下边缘就是基线），量完立刻拿掉。
   */
  /**
   * 把 `--rule` 钉到整数 CSS 像素。
   *
   * `--rule` 原式是 `clamp(1.95rem, 4.4vh, 2.35rem)`，绝大多数视口上算出来是带
   * 小数的（`393 × 852` 上是 `37.488px`）。它同时是两样东西：正文的 `line-height`，
   * 和横线那条 `repeating-linear-gradient` 的条纹周期。**渐变按小数走，行盒不按。**
   * 真 WebKit 实测把行盒高度**向下取整**成 `37px`，于是每行相对自己的横线上飘
   * `0.488px`，二十行之后就是十来个像素 —— 站主看到的正是「开头贴着线，越往下
   * 越飘，最后一行还冲出信纸」。手机上工具栏收起时可见行数更多，飘得更明显。
   *
   * 所以先把 `--rule` 取整写回 `#wish-act-two`（`--rule` 就声明在那里），
   * 行盒与条纹从此用同一个整数，两家引擎都不会再有累积误差。
   * 向下取整而不是四舍五入：宁可比引擎的行盒小，也不能比它大。
   */
  const snapRule = () => {
    // 先清掉上一次写死的值，否则量到的永远是自己写进去的那个整数。
    actTwo.style.removeProperty('--rule');
    const natural = Number.parseFloat(getComputedStyle(viewport).lineHeight);
    if (!Number.isFinite(natural) || natural <= 1) return;
    actTwo.style.setProperty('--rule', `${Math.floor(natural)}px`);
  };

  const alignRules = () => {
    const first = body.firstElementChild;
    if (!(first instanceof HTMLElement)) return;

    // 横线的落点要在整数化之后再量，否则量的是旧网格。
    snapRule();

    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;overflow:hidden';
    first.insertBefore(probe, first.firstChild);
    // 量到 viewport 的上沿：.letter-viewport 没有内边距，内容顶就是它的边框顶。
    // 拿 first 自己的 rect 不行，多栏分片时那是所有分片的并集。
    const baseline = probe.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top;
    probe.remove();

    const rule = Number.parseFloat(getComputedStyle(viewport).lineHeight);
    if (!Number.isFinite(baseline) || !Number.isFinite(rule) || rule <= 0) return;
    viewport.style.setProperty('--rule-offset', `${(baseline + RULE_GAP - rule).toFixed(2)}px`);
  };

  // ---------------- 分页 ----------------

  /** 求总栏数时最多试几轮。正常两轮收敛，留够余量纯粹是为了不死循环。 */
  const COLUMN_PROBE_LIMIT = 8;

  /**
   * 把「几栏、盒子多宽」显式写死。
   *
   * **绝不能再指望「溢出栏」。** 多栏盒子装不下的内容往哪去，各家引擎并不一致，
   * 而且分歧点极其刁钻 —— 真 WebKit（iPhone 上的 Safari / Edge / Chrome 全是它）
   * 实测：
   *
   * | column-count | 结果 |
   * | --- | --- |
   * | `1` | **根本不当多栏盒子**：不生成任何溢出栏，内容直接向下漏（`scrollWidth === clientWidth`，`scrollHeight` 2964px） |
   * | `≥ 2` | 正常向右生成溢出栏，与 Blink 一致 |
   *
   * 而这一页**移动端正好用的就是 `column-count: 1`**。于是页数算成 1、两个折角
   * 全被 `applyPage()` 收掉、横划也被 `flipTo()` 的边界判断挡掉 ——
   * 真机上「信只有第一页、折角看不见、怎么划都没反应」三个症状同一个根因。
   * 桌面是双栏，落在能正常工作的那一档，所以一直没暴露。
   *
   * 改法是不再让引擎自己决定要几栏：先量出需要几栏，再把栏数与盒宽一起写死。
   * 一个完全指定的多栏盒子是最普通的用法，两家引擎结果一致。
   */
  const applyColumnBox = (count: number, columnWidth: number, gap: number) => {
    body.style.setProperty('--col-count', String(count));
    body.style.width = `${(columnWidth * count + gap * (count - 1)).toFixed(2)}px`;
  };

  /**
   * 信末那枚银河印记是这条流的最后一个元素，它落在哪就是内容的尽头。
   * 返回值折算回布局像素：祝福页刚落定那几百毫秒 `#face-back` 还停在
   * `scale(1.07)`，直接拿 rect 差值会多算出整整一页。
   */
  const tailOf = (scale: number) => {
    const bodyRect = body.getBoundingClientRect();
    const seal = back.getBoundingClientRect();
    return {
      right: (seal.right - bodyRect.left) / scale,
      bottom: (seal.bottom - bodyRect.top) / scale,
    };
  };

  /**
   * 墨迹渗现期间用的版式：就一页宽，不写盒宽。
   *
   * ink 的三团墨是 `mask-size` 的百分比，**基准是 `.letter-body` 自己的盒子**。
   * 盒子一旦被撑成整条多栏流那么宽，三团墨就按那个宽度铺开，渗现直接退化成
   * 一次淡入。渗现期间读者只看得到第一页，而第一栏的断行位置与最终版式完全
   * 一致（断栏点只由栏宽和栏高决定，与总栏数无关），所以先按一页宽渗完，
   * 渗完再撑宽，画面上没有任何跳变。
   */
  const layoutFirstPage = () => {
    if (viewport.clientWidth <= 0) return;
    alignRules();
    const columns = window.innerWidth >= 720 && window.innerWidth > window.innerHeight ? 2 : 1;
    body.style.setProperty('--col-count', String(columns));
    body.style.removeProperty('width');
  };

  /**
   * 分页：内容被切成 N 栏并排，一「页」＝`columns` 栏，翻页就是横移一页宽。
   * 桌面每页两栏（中缝在两栏之间），竖屏或窄屏每页一栏。
   */
  const measurePages = () => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (width <= 0 || height <= 0) return;

    // 渗现还没走完就先别动版式，等 settleInk() 之后这里会被再调用一次。
    if (actTwo.classList.contains('is-inking')) {
      layoutFirstPage();
      return;
    }

    // 先对齐横线：它不影响分页，但和分页一样只有在内容已经在布局里时才量得准。
    alignRules();

    const gap = Number.parseFloat(getComputedStyle(body).columnGap) || 0;
    // 桌面每页两栏、竖屏或窄屏每页一栏。这个判定只在这里做一次，CSS 不另设断点。
    const columns = window.innerWidth >= 720 && window.innerWidth > window.innerHeight ? 2 : 1;
    const columnWidth = (width - gap * (columns - 1)) / columns;
    const colAdvance = columnWidth + gap;
    // 一页 = columns 栏；`columns * colAdvance` 恒等于 `width + gap`，两种栏数都成立。
    const advance = colAdvance * columns;
    body.style.setProperty('--page-advance', `${advance}px`);

    // 缩放从视口层反推：它没有边框与内边距，rect 宽 ÷ clientWidth 就是祖先缩放。
    const scale = viewport.getBoundingClientRect().width / width || 1;

    let count = 1;
    let settled = false;
    for (let round = 0; round < COLUMN_PROBE_LIMIT; round += 1) {
      applyColumnBox(count, columnWidth, gap);
      const tail = tailOf(scale);
      // 两种溢出方向都要算，因为两家引擎各占一种：
      //   Blink（含 Android Chrome）在盒子右侧继续长出溢出栏 → 印记的横坐标已经是真相；
      //   WebKit（含 iPhone 全部浏览器）在 count=1 时只让内容往下漏 → 要按高度折算。
      const sealColumn = Math.max(1, Math.ceil((tail.right - 1) / colAdvance));
      const spill = Math.ceil(Math.max(0, tail.bottom - height - 1) / height);
      const needed = Math.max(1, sealColumn + spill);
      if (needed === count) {
        settled = true;
        break;
      }
      count = needed;
    }

    /*
      兜底。真机上这封信是站主写给女朋友的生日信，**宁可失掉翻页的观感，
      也绝不能让信有一半读不到**：万一哪天某个引擎的多栏行为完全在意料之外、
      上面那轮迭代收不敛，整封就退成竖向可滚动的单栏，内容一个字都不会丢。
      正常路径永远走不到这里。
    */
    scrollFallback = !settled;
    actTwo.classList.toggle('is-scroll-fallback', scrollFallback);
    if (scrollFallback) {
      body.style.removeProperty('width');
      body.style.setProperty('--col-count', '1');
      body.style.setProperty('--page', '0');
      page = 0;
      pageCount = 1;
      seam.setAttribute('hidden', '');
      turn.hidden = true;
      turnBack.hidden = true;
      return;
    }

    // 中缝只在每页两栏时出现，落在两栏之间的正中。
    // 位置用 offsetLeft 而不是 rect：中缝与信纸视口同属 `.letter` 这个定位父级，
    // offsetLeft 已经是同一套布局坐标，不会被祖先缩放带偏。
    // 必须动 hidden 属性本身：光清掉行内 display 是没用的，
    // 属性还在，UA 样式表的 [hidden] 依旧把它按成 display:none。
    if (columns >= 2) {
      seam.removeAttribute('hidden');
      seam.style.setProperty('--divider-x', `${viewport.offsetLeft + columnWidth + gap * 0.5}px`);
    } else {
      seam.setAttribute('hidden', '');
    }

    pageCount = Math.max(1, Math.ceil(count / columns));
    page = clamp(page, 0, pageCount - 1);
    applyPage();
  };

  const applyPage = () => {
    body.style.setProperty('--page', String(page));
    // 折角是「前后还有没有页」的唯一提示：后面还有就有右下角，前面还有就有
    // 左下角，两头都有就两个都在。末页没有右下角，此时才看得见信末的银河印记。
    turn.hidden = page >= pageCount - 1;
    turnBack.hidden = page <= 0;
    viewport.scrollLeft = 0;
  };

  /** 掰起折角作为反馈，横移紧跟其后。 */
  const flipTo = (next: number, dogear: HTMLButtonElement) => {
    if (next === page || next < 0 || next > pageCount - 1) return;
    options.onPageTurn();
    // 用户已经会翻页了，引导动画立刻收掉。
    window.clearTimeout(hintTimer);
    turn.classList.remove('is-first-hint');
    dogear.classList.add('is-turning');
    page = next;
    applyPage();
    window.setTimeout(() => dogear.classList.remove('is-turning'), 320);
    // 掰过去的那一页可能正好是首页或末页，对应的折角刚刚被 applyPage 收掉；
    // 焦点跟着走到还在的那一个，键盘才不会掉回文档开头。
    if (dogear.hidden) (dogear === turn ? turnBack : turn).focus({ preventScroll: true });
  };

  turn.addEventListener('click', () => flipTo(page + 1, turn));
  turnBack.addEventListener('click', () => flipTo(page - 1, turnBack));

  /*
    移动端的主要翻页方式是横划，折角退回成「前后还有没有页」的视觉提示。

    折角本身在手机上并不可靠：它钉在信纸的下缘两角，而这一页的可视层是
    `position: fixed; inset: 0`，铺的是**工具栏收起时**的布局视口 —— iOS 上
    地址栏展开时下缘整条压在工具栏底下，再叠上 home 指示条的手势区，
    那两个角基本按不到。位置问题由 `--chrome-bottom` 单独修（见 viewport.ts），
    但手机上本来就该能划，所以两条路都留着。
  */
  const SWIPE_MIN = 48;
  // 横向位移要明显压过纵向，斜着划过去不该翻页。
  const SWIPE_SLOPE = 1.4;
  let swipeId: number | null = null;
  let swipeX = 0;
  let swipeY = 0;

  const letterIsInteractive = () =>
    stage === 'letter' && !busy && !actTwo.hidden && faceBack.classList.contains('is-present');

  actTwo.addEventListener(
    'touchstart',
    (event) => {
      // 双指是缩放，不当作翻页。
      if (!letterIsInteractive() || event.touches.length !== 1) {
        swipeId = null;
        return;
      }
      const touch = event.touches[0];
      swipeId = touch.identifier;
      swipeX = touch.clientX;
      swipeY = touch.clientY;
    },
    { passive: true },
  );

  actTwo.addEventListener(
    'touchend',
    (event) => {
      if (swipeId === null) return;
      const touch = Array.from(event.changedTouches).find((item) => item.identifier === swipeId);
      swipeId = null;
      if (!touch || !letterIsInteractive()) return;
      const dx = touch.clientX - swipeX;
      const dy = touch.clientY - swipeY;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * SWIPE_SLOPE) return;
      // 手指向左划＝把纸往左推＝翻到下一页。
      if (dx < 0) flipTo(page + 1, turn);
      else flipTo(page - 1, turnBack);
    },
    { passive: true },
  );

  actTwo.addEventListener(
    'touchcancel',
    () => {
      swipeId = null;
    },
    { passive: true },
  );

  // ---------------- 第一幕 → 第二幕 ----------------

  const showLetter = () => {
    actOne.hidden = true;
    actTwo.hidden = false;
    // 渗现期间只按「一页宽」布版，真正的分页等渗完再算（理由见 layoutFirstPage）。
    layoutFirstPage();
    void actTwo.offsetWidth;
    actTwo.classList.add('is-inking');
  };

  const settleInk = () => {
    // 渗完就摘掉遮罩、模糊与 will-change，正文回到完全锐利的常驻态。
    actTwo.classList.remove('is-inking');
    actTwo.classList.add('is-inked');
    body.style.removeProperty('will-change');
    // 遮罩已经摘掉，现在才把盒子撑成整条多栏流并算出页数。
    measurePages();
  };

  /**
   * 第二幕第一次落定时，让右下角的折角**明显地掀一次**。
   *
   * 触屏没有 hover 可以试探，而折角是「这封信还有下一页」的唯一视觉提示；
   * 常驻的 `dogear-invite` 太轻，站主实测时根本没注意到它的存在。
   * 这里只是把已有的那枚折角演一遍，不加任何新元素、新文案。
   * 减弱动效下不播——那时全页本来就静止。
   */
  let hintTimer = 0;

  const inviteTurn = () => {
    window.clearTimeout(hintTimer);
    turn.classList.remove('is-first-hint');
    if (reduceMotion.matches || turn.hidden || pageCount <= 1) return;
    void turn.offsetWidth;
    turn.classList.add('is-first-hint');
    hintTimer = window.setTimeout(() => turn.classList.remove('is-first-hint'), 2600);
  };

  /**
   * 第二幕落定后的焦点。还有下一页时给折角，末页才给银河印记。
   * preventScroll 是必须的：银河印记在多栏流的最末，普通 focus() 会把
   * 整个容器滚到最后一栏去。
   */
  const focusEntry = () => {
    const target = turn.hidden ? back : turn;
    target.focus({ preventScroll: true });
    viewport.scrollLeft = 0;
    inviteTurn();
  };

  const toLetter = () => {
    if (!lanternIsInteractive() || busy) return;
    stage = 'letter';
    scrollIntent = 0;
    options.onPull();

    if (reduceMotion.matches) {
      pool.style.opacity = '1';
      pool.style.setProperty('--pool-scale', '1');
      showLetter();
      actTwo.classList.remove('is-inking');
      settleInk();
      focusEntry();
      return;
    }

    busy = true;
    actOne.classList.add('is-pulling');

    // 灯飞出去的同时，光池从灯原来的位置涨开并留下。
    window.setTimeout(() => {
      tween(
        POOL_MS,
        (t) => {
          pool.style.opacity = String(Math.min(1, t * 1.4));
          pool.style.setProperty('--pool-scale', String(0.42 + t * 0.58));
        },
        () => {
          pool.style.opacity = '1';
          pool.style.setProperty('--pool-scale', '1');
        },
      );
    }, RECOIL_DELAY_MS + 120);

    // 灯完全飞出画面之后才换幕，否则会看见灯与信同框。
    window.setTimeout(() => {
      actOne.classList.add('is-leaving');
      showLetter();
      window.setTimeout(() => {
        settleInk();
        busy = false;
        focusEntry();
      }, INK_MS + 60);
    }, RECOIL_DELAY_MS + RECOIL_MS - 60);
  };

  pull.addEventListener('click', toLetter);

  // 「向下滚动」在这一页没有真正的滚动可用，只能按手势累计量来判定。
  // 一次触发后清零，避免惯性滚动把第二幕也一起划过去。
  window.addEventListener(
    'wheel',
    (event) => {
      if (!lanternIsInteractive()) {
        scrollIntent = 0;
        return;
      }
      if (event.deltaY <= 0) return;
      scrollIntent += event.deltaY;
      if (scrollIntent >= SCROLL_TRIGGER) toLetter();
    },
    { passive: true },
  );

  window.addEventListener(
    'touchstart',
    (event) => {
      if (!lanternIsInteractive()) return;
      touchStartY = event.touches[0]?.clientY ?? 0;
    },
    { passive: true },
  );

  window.addEventListener(
    'touchmove',
    (event) => {
      if (!lanternIsInteractive()) return;
      const y = event.touches[0]?.clientY ?? 0;
      // 手指向上划 = 页面向下滚。
      if (touchStartY - y >= SCROLL_TRIGGER) toLetter();
    },
    { passive: true },
  );

  back.addEventListener('click', () => options.onExit());

  /** 每次重新进入祝福页都从第一幕开始，拉灯与墨迹都重播一次。 */
  const reset = () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(guard);
    frame = 0;
    busy = false;
    scrollIntent = 0;
    stage = 'lantern';
    page = 0;

    pool.style.opacity = '0';
    pool.style.setProperty('--pool-scale', '0.42');
    actTwo.classList.remove('is-inking', 'is-inked', 'is-scroll-fallback');
    scrollFallback = false;
    body.style.removeProperty('width');
    viewport.scrollTop = 0;
    actTwo.hidden = true;
    turn.hidden = true;
    turnBack.hidden = true;
    window.clearTimeout(hintTimer);
    turn.classList.remove('is-turning', 'is-first-hint');
    turnBack.classList.remove('is-turning');
    body.style.removeProperty('will-change');
    body.style.setProperty('--page', '0');
    actOne.classList.remove('is-pulling', 'is-leaving');
    actOne.hidden = false;
  };

  reset();

  /*
    自托管的悠哉字体是 `font-display: swap` 的：它下载完之后字形会整体换一次，
    基线与分页都跟着变。不重量一次的话，横线会停在回退字体的位置上。
  */
  void document.fonts?.ready.then(() => {
    if (!actTwo.hidden) measurePages();
  });

  return { reset, relayout: measurePages };
};
