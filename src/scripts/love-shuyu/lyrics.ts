// 祝福页第一幕的歌词轮换。
// 长段只出现在桌面端；短句桌面三轨、移动单轨。每次显现都重新做碰撞检测与随机定位。

import {
  loveShuyuLongLyrics,
  loveShuyuShortLyrics,
  type LoveShuyuLyric,
} from '../../data/love-shuyu-lyrics';
import { reduceMotion, requireElement } from './dom';

type LyricKind = 'long' | 'short';

interface LyricTrack {
  kind: LyricKind;
  element: HTMLParagraphElement;
  pool: readonly LoveShuyuLyric[];
  previous: number;
  initialDelay: number;
  hold: number;
  fade: number;
  gap: number;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface WishLyricsController {
  /** 祝福页真正翻到背面后开始。 */
  start: () => void;
  /** 拉灯或离开祝福页时停止，不让隐藏页面继续换句。 */
  stop: () => void;
  /** 每次重新进入前清空上一轮。 */
  reset: () => void;
}

export const createWishLyrics = (): WishLyricsController => {
  const actOne = requireElement<HTMLElement>('wish-act-one');
  const longElement = requireElement<HTMLParagraphElement>('wish-lyric-long');
  const shortElements = [
    requireElement<HTMLParagraphElement>('wish-lyric-short'),
    requireElement<HTMLParagraphElement>('wish-lyric-short-2'),
    requireElement<HTMLParagraphElement>('wish-lyric-short-3'),
  ];
  const allLyricElements = [longElement, ...shortElements];
  const prelude = actOne.querySelector<HTMLElement>('.wish-prelude');
  const lantern = actOne.querySelector<HTMLElement>('.lantern-hang');
  const lanternStage = requireElement<HTMLElement>('lantern-stage');
  const lanternCord = actOne.querySelector<HTMLElement>('.lantern-cord');
  const lanternHint = requireElement<HTMLElement>('lantern-hint');
  const desktop = window.matchMedia('(min-width: 720px) and (min-aspect-ratio: 4/3)');

  let active = false;
  let run = 0;
  let resizeTimer = 0;
  const timers = new Set<number>();
  const lastPositions = new WeakMap<HTMLParagraphElement, { x: number; y: number }>();

  const clearTimers = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
  };

  const later = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  };

  /** 相邻两次不重复，桌面三条短句轨道也尽量不同时显示同一段。 */
  const pickIndex = (length: number, previous: number, occupied: ReadonlySet<number>) => {
    const all = Array.from({ length }, (_, index) => index);
    const unoccupied = all.filter((index) => !occupied.has(index));
    const withoutPrevious = unoccupied.filter((index) => index !== previous);
    const pool = withoutPrevious.length > 0
      ? withoutPrevious
      : unoccupied.length > 0
        ? unoccupied
        : all.filter((index) => index !== previous);
    const candidates = pool.length > 0 ? pool : all;
    return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
  };

  /** 有译文时按站主给定的 3:7 选取原文／译文，一次只显示其中一个完整版本。 */
  const chooseLines = (lyric: LoveShuyuLyric) =>
    lyric.translation && Math.random() >= 0.3 ? lyric.translation : lyric.original;

  /** 每轮只抽一次字号，并在实测碰撞盒之前写入，确保随机位置仍按最终尺寸避让。 */
  const chooseFontSize = (kind: LyricKind) => {
    const [minimum, maximum] = desktop.matches
      ? kind === 'long'
        ? [12.5, 16.5]
        : [11.75, 15.5]
      : [10.5, 14];
    return minimum + Math.random() * (maximum - minimum);
  };

  const expandBounds = (bounds: Bounds, padding: number): Bounds => ({
    left: bounds.left - padding,
    top: bounds.top - padding,
    right: bounds.right + padding,
    bottom: bounds.bottom + padding,
  });

  const expanded = (rect: DOMRect, padding: number): Bounds => ({
    left: rect.left - padding,
    top: rect.top - padding,
    right: rect.right + padding,
    bottom: rect.bottom + padding,
  });

  const overlaps = (a: Bounds, b: Bounds) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  /**
   * 桌面空间足够，整盏灯按外接矩形避让。移动端改用与灯轮廓相近的三段区域，
   * 不再把 canvas 四角的大块透明空间也误判成灯体。
   */
  const lanternObstacleRects = (padding: number) => {
    if (desktop.matches && lantern) {
      const rect = lantern.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? [expanded(rect, padding)] : [];
    }

    const stage = lanternStage.getBoundingClientRect();
    if (stage.width <= 0 || stage.height <= 0) return [];
    const center = stage.left + stage.width / 2;
    const band = (top: number, bottom: number, width: number): Bounds => ({
      left: center - stage.width * width / 2,
      top: stage.top + stage.height * top,
      right: center + stage.width * width / 2,
      bottom: stage.top + stage.height * bottom,
    });
    const obstacles = [
      band(0.02, 0.25, 0.48),
      band(0.2, 0.72, 0.92),
      band(0.68, 1, 0.42),
    ].map((bounds) => expandBounds(bounds, padding));

    if (lanternCord) {
      const cord = lanternCord.getBoundingClientRect();
      if (cord.width > 0 && cord.height > 0) obstacles.push(expanded(cord, padding));
    }
    return obstacles;
  };

  const obstacleRects = (current: HTMLParagraphElement) => {
    const padding = desktop.matches ? 18 : 10;
    const fixedElements: HTMLElement[] = [prelude, lanternHint].filter(
      (element): element is HTMLElement => Boolean(element),
    );
    const obstacles = fixedElements
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => expanded(rect, padding));
    obstacles.push(...lanternObstacleRects(padding));
    obstacles.push(
      ...allLyricElements
        .filter((element) => element !== current && element.classList.contains('is-visible'))
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => expanded(rect, padding)),
    );
    return obstacles;
  };

  /**
   * 先随机采样；若连续抽不到空位，再收集全部无碰撞网格点后随机选一个。
   * 不能按固定方向取第一个兜底点，否则窄屏会反复落在同一个角落。
   */
  const positionWithoutCollision = (element: HTMLParagraphElement) => {
    element.classList.add('is-measuring');
    element.style.left = '0px';
    element.style.top = '0px';
    const actRect = actOne.getBoundingClientRect();
    const measured = element.getBoundingClientRect();
    const margin = desktop.matches ? 26 : 14;
    const maxX = actRect.width - measured.width - margin;
    const maxY = actRect.height - measured.height - margin;
    const obstacles = obstacleRects(element);

    const valid = (x: number, y: number) => {
      const candidate: Bounds = {
        left: actRect.left + x,
        top: actRect.top + y,
        right: actRect.left + x + measured.width,
        bottom: actRect.top + y + measured.height,
      };
      return obstacles.every((obstacle) => !overlaps(candidate, obstacle));
    };

    const choosePoint = (points: readonly { x: number; y: number }[]) => {
      if (points.length === 0) return null;
      const previous = lastPositions.get(element);
      const spanX = Math.max(1, maxX - margin);
      const spanY = Math.max(1, maxY - margin);
      const normalized = points.map((point) => ({
        point,
        x: (point.x - margin) / spanX,
        y: (point.y - margin) / spanY,
      }));
      const separated = previous
        ? normalized.filter((point) => Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.24)
        : normalized;
      const pool = separated.length > 0 ? separated : normalized;
      return pool[Math.floor(Math.random() * pool.length)]?.point ?? null;
    };

    let point: { x: number; y: number } | null = null;
    if (maxX >= margin && maxY >= margin) {
      const randomCandidates: { x: number; y: number }[] = [];
      for (let attempt = 0; attempt < 520; attempt += 1) {
        const x = margin + Math.random() * (maxX - margin);
        const y = margin + Math.random() * (maxY - margin);
        if (valid(x, y)) randomCandidates.push({ x, y });
        if (randomCandidates.length >= 96) break;
      }
      point = choosePoint(randomCandidates);

      if (!point) {
        const step = desktop.matches ? 10 : 7;
        const xOffset = Math.floor(Math.random() * step);
        const yOffset = Math.floor(Math.random() * step);
        const gridCandidates: { x: number; y: number }[] = [];
        for (let y = margin + yOffset; y <= maxY; y += step) {
          for (let x = margin + xOffset; x <= maxX; x += step) {
            if (valid(x, y)) gridCandidates.push({ x, y });
          }
        }
        point = choosePoint(gridCandidates);
      }
    }

    if (point) {
      element.style.left = `${point.x.toFixed(1)}px`;
      element.style.top = `${point.y.toFixed(1)}px`;
      lastPositions.set(element, {
        x: (point.x - margin) / Math.max(1, maxX - margin),
        y: (point.y - margin) / Math.max(1, maxY - margin),
      });
    }
    element.classList.remove('is-measuring');
    return Boolean(point);
  };

  const renderLong = (element: HTMLParagraphElement, lines: readonly string[]) => {
    const fragment = document.createDocumentFragment();
    lines.forEach((line, index) => {
      const unit = document.createElement('span');
      unit.className = 'lyric-line';
      unit.style.setProperty('--unit-index', String(index));
      unit.textContent = line;
      fragment.append(unit);
      if (index < lines.length - 1) fragment.append(document.createTextNode('\n'));
    });
    element.replaceChildren(fragment);
    return (lines.length - 1) * 560 + 1100;
  };

  const renderShort = (element: HTMLParagraphElement, lines: readonly string[]) => {
    const fragment = document.createDocumentFragment();
    let characterIndex = 0;
    lines.forEach((line, lineIndex) => {
      const row = document.createElement('span');
      row.className = 'lyric-short-line';
      Array.from(line).forEach((character) => {
        const unit = document.createElement('span');
        unit.className = 'lyric-char';
        unit.style.setProperty('--unit-index', String(characterIndex));
        unit.textContent = character;
        row.append(unit);
        characterIndex += 1;
      });
      fragment.append(row);
      if (lineIndex < lines.length - 1) fragment.append(document.createTextNode('\n'));
    });
    element.replaceChildren(fragment);
    return Math.max(0, characterIndex - 1) * 52 + 720;
  };

  const clearElement = (element: HTMLParagraphElement) => {
    element.classList.remove('is-visible', 'is-leaving', 'is-measuring');
    element.replaceChildren();
    element.style.removeProperty('left');
    element.style.removeProperty('top');
    element.style.removeProperty('--lyric-fade');
    element.style.removeProperty('--lyric-size');
    delete element.dataset.tone;
    delete element.dataset.lyricIndex;
  };

  const paint = async (track: LyricTrack, currentRun: number) => {
    clearElement(track.element);
    const peerElements = track.kind === 'short' ? shortElements : [longElement];
    const occupied = new Set(
      peerElements
        .filter((element) => element !== track.element)
        .map((element) => Number(element.dataset.lyricIndex))
        .filter((index) => Number.isInteger(index)),
    );
    const index = pickIndex(track.pool.length, track.previous, occupied);
    track.previous = index;
    track.element.dataset.lyricIndex = String(index);
    const lines = chooseLines(track.pool[index]);
    const fontSize = chooseFontSize(track.kind).toFixed(1);
    track.element.style.setProperty('--lyric-size', `${fontSize}px`);

    // Yozai 按 unicode-range 拆成子集；先加载本轮实际字形，再按最终字体盒定位。
    try {
      await document.fonts.load(`400 ${fontSize}px Yozai`, lines.join('\n'));
    } catch {
      // 本地字体读取失败时沿用 CSS 回退，不阻断歌词轮换。
    }
    // 旧轮次可能比新轮次更晚结束加载；只退出，不能清掉新轮次已经画出的歌词。
    if (!active || currentRun !== run) return null;

    const reveal = track.kind === 'long'
      ? renderLong(track.element, lines)
      : renderShort(track.element, lines);
    track.element.dataset.tone = index % 2 === 0 ? 'teal' : 'warm';
    track.element.style.setProperty('--lyric-fade', `${track.fade}ms`);

    if (!positionWithoutCollision(track.element)) {
      clearElement(track.element);
      return null;
    }

    // 先提交测量后的透明位置，再启用逐单元晕染，避免文本在 (0, 0) 闪现。
    void track.element.offsetWidth;
    track.element.classList.add('is-visible');
    return reveal;
  };

  const cycle = (track: LyricTrack, currentRun: number, first = false) => {
    if (!active || currentRun !== run) return;

    const show = async () => {
      if (!active || currentRun !== run) return;
      const reveal = await paint(track, currentRun);
      if (!active || currentRun !== run) return;
      if (reveal === null) {
        later(() => cycle(track, currentRun), track.gap);
        return;
      }

      later(() => {
        if (!active || currentRun !== run) return;
        track.element.classList.add('is-leaving');
        later(() => {
          if (!active || currentRun !== run) return;
          clearElement(track.element);
          later(() => cycle(track, currentRun), track.gap);
        }, track.fade);
      }, reveal + track.hold);
    };

    if (first) later(show, track.initialDelay);
    else show();
  };

  const tracks = (): LyricTrack[] => {
    const isDesktop = desktop.matches;
    const activeShortElements = isDesktop ? shortElements : shortElements.slice(0, 1);
    const result: LyricTrack[] = activeShortElements.map((element, index) => ({
      kind: 'short',
      element,
      pool: loveShuyuShortLyrics,
      previous: -1,
      initialDelay: isDesktop ? 700 + index * 1500 : 1400,
      hold: isDesktop ? 2600 : 4400,
      fade: isDesktop ? 1300 : 1450,
      gap: isDesktop ? 350 + index * 90 : 1400,
    }));

    if (isDesktop) {
      result.unshift({
        kind: 'long',
        element: longElement,
        pool: loveShuyuLongLyrics,
        previous: -1,
        initialDelay: 900,
        hold: 3800,
        fade: 1550,
        gap: 950,
      });
    }

    return result;
  };

  const start = () => {
    active = true;
    run += 1;
    clearTimers();
    allLyricElements.forEach(clearElement);

    const currentRun = run;
    const currentTracks = tracks();
    if (reduceMotion.matches) {
      // 减弱动效下只选一次并常驻；仍做同一套随机定位与碰撞检查。
      currentTracks.forEach((track) => void paint(track, currentRun));
      return;
    }

    currentTracks.forEach((track) => cycle(track, currentRun, true));
  };

  const stop = () => {
    active = false;
    run += 1;
    clearTimers();
    allLyricElements.forEach((element) => element.classList.add('is-leaving'));
  };

  const reset = () => {
    stop();
    allLyricElements.forEach(clearElement);
  };

  const restartIfActive = () => {
    if (active) start();
  };

  const restartAfterResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(restartIfActive, 140);
  };

  desktop.addEventListener('change', restartIfActive);
  reduceMotion.addEventListener('change', restartIfActive);
  window.addEventListener('resize', restartAfterResize, { passive: true });

  reset();
  return { start, stop, reset };
};
