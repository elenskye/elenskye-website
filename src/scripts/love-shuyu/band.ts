// 银河带的曲线定义。
//
// 这是全页唯一的空间真相源：粒子沿它生成，时间线的 11 个 DOM 节点也靠它
// 投影定位。任何一方另算一套坐标都会导致节点与银河错位。

import { TAU } from './dom';

export interface BandConfig {
  /** 曲线总长（世界单位），沿 -Y 方向延伸。 */
  length: number;
  /** 左右蜿蜒幅度。竖屏收窄，桌面放宽以形成斜跨天幕的观感。 */
  amplitude: number;
  /** 整条带子上的正弦周期数，决定 S 形的疏密。 */
  meander: number;
  /** 带子所在的基准深度（负值，位于相机前方）。 */
  baseZ: number;
  /** 深度方向的起伏，避免带子像一张平贴的纸。 */
  depth: number;
  /** 起始相位。负值让第一幕的带子从画面左侧入画、横贯过去。 */
  phase: number;
  /** 带子的半宽（世界单位）。这是「银河带」而不是「星云」的关键。 */
  halfWidth: number;
}

// 幅度上限由「最近处的可视半宽」决定，不是基准深度处的半宽：
// 深度起伏会把一部分节点推近相机，投影随之放大。按基准深度算幅度，
// 靠近相机的那几个节点就会被甩出画面（实测 1280px 下 node-11 到过 x=1351）。
export const desktopBand: BandConfig = {
  length: 84,
  amplitude: 11.5,
  meander: 1.6,
  baseZ: -26,
  depth: 4.5,
  phase: -0.95,
  halfWidth: 3.1,
};

export const portraitBand: BandConfig = {
  length: 84,
  // 竖屏可视半宽只有桌面的三成左右，幅度必须同步收窄，
  // 再靠更高的周期数维持 S 形蜿蜒向下。
  amplitude: 3,
  meander: 2.1,
  baseZ: -26,
  depth: 3,
  phase: -0.95,
  halfWidth: 2.3,
};

// 11 个节点落在 s 的这一段：带首留给第一幕，带尾留给生日入口。
export const NODE_S_START = 0.22;
export const NODE_S_END = 0.88;
/** 生日入口所在的 s，位于全部节点之后。 */
export const FINAL_STAR_S = 0.97;

/** 与粒子归束使用同一起点：最后一个节点之后才开始向屏幕水平中心靠拢。 */
const FINAL_CENTER_START_S = NODE_S_END + 0.006;
const FINAL_CENTER_RANGE = FINAL_STAR_S - FINAL_CENTER_START_S;

const finalCenterProgress = (s: number) => {
  const t = Math.min(1, Math.max(0, (s - FINAL_CENTER_START_S) / FINAL_CENTER_RANGE));
  return t * t * (3 - 2 * t);
};

const finalCenterDerivative = (s: number) => {
  const t = (s - FINAL_CENTER_START_S) / FINAL_CENTER_RANGE;
  if (t <= 0 || t >= 1) return 0;
  return (6 * t * (1 - t)) / FINAL_CENTER_RANGE;
};

/** s ∈ [0, 1] 上的曲线点。s = 0 是第一幕所在的带首。 */
export const bandPoint = (s: number, config: BandConfig, out = { x: 0, y: 0, z: 0 }) => {
  const angle = s * TAU * config.meander + config.phase;
  const baseX = Math.sin(angle) * config.amplitude;
  out.x = baseX * (1 - finalCenterProgress(s));
  out.y = -s * config.length;
  out.z = config.baseZ + Math.cos(angle * 0.7 + 1.1) * config.depth;
  return out;
};

/** 曲线在 s 处的切向（未归一化）。用于求带宽方向。 */
export const bandTangent = (s: number, config: BandConfig, out = { x: 0, y: 0, z: 0 }) => {
  const angle = s * TAU * config.meander + config.phase;
  const dAngle = TAU * config.meander;
  const baseX = Math.sin(angle) * config.amplitude;
  const baseDx = Math.cos(angle) * config.amplitude * dAngle;
  const centerProgress = finalCenterProgress(s);
  out.x = baseDx * (1 - centerProgress) - baseX * finalCenterDerivative(s);
  out.y = -config.length;
  out.z = -Math.sin(angle * 0.7 + 1.1) * config.depth * dAngle * 0.7;
  return out;
};

export const nodeS = (index: number, count: number) =>
  count <= 1 ? NODE_S_START : NODE_S_START + (index * (NODE_S_END - NODE_S_START)) / (count - 1);

/** 透视相机的垂直视野角（度）。曲线与相机是一套真相源，故与 galaxy.ts 共用这一处。 */
export const CAMERA_FOV = 45;
/** 相机在 s = 0 时略低于带首，让银河落在画面上部、把下半屏让给倒计时。 */
export const CAMERA_LEAD_Y = -4.5;
/** 滚动到底时相机走过的距离；略短于 length，保证最后那颗星停在舒服的位置。 */
export const CAMERA_TRAVEL = 80;

export const cameraYAt = (progress: number) => CAMERA_LEAD_Y - progress * CAMERA_TRAVEL;
