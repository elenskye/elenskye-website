export const requireElement = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export const TAU = Math.PI * 2;

/** 北京时间偏移；本页所有时间判断都不跟随设备时区。 */
export const BEIJING_OFFSET_MS = 8 * 3_600_000;

export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 平滑收尾，用于开场聚拢与滚动跟随。 */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** 确定性伪随机，保证每次刷新银河形状一致。 */
export const mulberry32 = (seed: number) => () => {
  let value = (seed += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
};
