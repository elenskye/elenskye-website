// 倒计时、北京时间换算与生日态判定。
// 这部分逻辑在 Phase 18-1/18-2 已实测正确（跨月、跨年、闰日、归零切换），
// Phase 18-3 原样迁移，只把「归零后隐藏什么」收敛到第一幕内部。

import { BEIJING_OFFSET_MS, reduceMotion, requireElement } from './dom';

const splitDuration = (milliseconds: number) => {
  const value = Math.max(0, milliseconds);
  return {
    d: Math.floor(value / 86_400_000),
    h: Math.floor(value / 3_600_000) % 24,
    m: Math.floor(value / 60_000) % 60,
    s: Math.floor(value / 1_000) % 60,
  };
};

const pad = (value: number) => String(value).padStart(2, '0');

export interface CountdownOptions {
  startUtcMs: number;
  endUtcMs: number;
  birthdayMonth: number;
  birthdayDay: number;
  progressPrefix: string;
  idleText: string;
  birthdayText: string;
}

export const startCountdown = (options: CountdownOptions) => {
  const el = {
    d: requireElement<HTMLSpanElement>('d'),
    h: requireElement<HTMLSpanElement>('h'),
    m: requireElement<HTMLSpanElement>('m'),
    s: requireElement<HTMLSpanElement>('s'),
    clock: requireElement<HTMLDivElement>('clock'),
    label: requireElement<HTMLParagraphElement>('countdown-label'),
    progress: requireElement<HTMLDivElement>('progress'),
    fill: requireElement<HTMLSpanElement>('progress-fill'),
    progressText: requireElement<HTMLParagraphElement>('progress-text'),
    reunion: requireElement<HTMLDivElement>('reunion'),
    total: requireElement<HTMLParagraphElement>('total'),
    announce: requireElement<HTMLParagraphElement>('clock-text'),
  };

  const totalSpan = options.endUtcMs - options.startUtcMs;
  let hasReunited = false;
  let lastSecond = -1;
  let lastAnnouncement = 0;

  // 归零只影响第一幕：倒计时与进度换成结果，第二幕时间线照旧。
  const showReunion = () => {
    if (hasReunited) return;
    hasReunited = true;
    const duration = splitDuration(totalSpan);
    el.total.textContent = `${duration.d} 天 ${pad(duration.h)} 时 ${pad(duration.m)} 分`;
    el.clock.hidden = true;
    el.label.hidden = true;
    el.progress.hidden = true;
    el.reunion.hidden = false;
  };

  const tick = () => {
    const now = Date.now();
    const left = options.endUtcMs - now;
    if (left <= 0) {
      showReunion();
      return;
    }

    const duration = splitDuration(left);
    if (duration.s !== lastSecond) {
      lastSecond = duration.s;
      el.d.textContent = String(duration.d);
      el.h.textContent = pad(duration.h);
      el.m.textContent = pad(duration.m);
      el.s.textContent = pad(duration.s);
      if (!reduceMotion.matches) {
        el.s.classList.remove('beat');
        void el.s.offsetWidth;
        el.s.classList.add('beat');
      }
    }

    const done = Math.min(1, Math.max(0, (now - options.startUtcMs) / totalSpan));
    el.fill.style.transform = `scaleX(${done})`;
    el.progressText.textContent = `${options.progressPrefix} ${(done * 100).toFixed(1)}%`;

    // 屏幕阅读器每分钟播报一次，避免逐秒刷屏。
    if (now - lastAnnouncement > 60_000) {
      lastAnnouncement = now;
      el.announce.textContent = `还有 ${duration.d} 天 ${duration.h} 小时 ${duration.m} 分`;
    }
  };

  tick();
  window.setInterval(tick, 200);
};

/** 生日入口：每年 9 月 3 日（北京时间）换样式与文案，其余日期常态。 */
export const startBirthdayWatch = (options: Pick<CountdownOptions, 'birthdayMonth' | 'birthdayDay' | 'idleText' | 'birthdayText'>) => {
  const trigger = requireElement<HTMLButtonElement>('wish-button');
  const label = requireElement<HTMLSpanElement>('wish-button-text');

  const sync = () => {
    const beijing = new Date(Date.now() + BEIJING_OFFSET_MS);
    const isBirthday =
      beijing.getUTCMonth() + 1 === options.birthdayMonth && beijing.getUTCDate() === options.birthdayDay;
    trigger.classList.toggle('is-birthday', isBirthday);
    label.textContent = isBirthday ? options.birthdayText : options.idleText;
  };

  sync();
  window.setInterval(sync, 30_000);
};
