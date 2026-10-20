// 信纸从纸屑连续变成隧道星尘，再收束到主界面银河带的真实投影位置。
// 三段共用同一批粒子：颜色从纸张米白渐变为青绿／暖金，位置从信纸网格卷入
// 圆筒壁，最后沿银河法线铺开。画面交换发生在隧道最盛处，因此看不到硬切。
//
// 回程不使用加色、模糊或中心光源；中央始终是深空消失点，速度感来自近处粒子
// 的纵深循环与短轨迹。信纸自己的 CSS 遮罩沿同一左下起点蚀开，纸屑才会看起来
// 真正从仍然可见的纸面上剥落，而不是纸先消失、粒子后出现。

import { clamp, requireElement } from './dom';

const DUST_COLORS = ['#7fe8d2', '#5fc9b6', '#3d9f91', '#a9e6dc', '#ffd9a0', '#ffc47a', '#b98546'];
const PAPER_COLORS = ['#f8ecd4', '#efd9b8', '#e3c9a4', '#d5b98f'];
const COLOR_STEPS = 16;
const TUNNEL_LENGTH = 3.9;
const NEAR_PLANE = 0.2;
const CAMERA_TRAVEL = 3.05;
const TARGET_SAMPLES = 220;

const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / Math.max(0.0001, to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

const hexRgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
};

const colorTable = PAPER_COLORS.map((paper) =>
  DUST_COLORS.map((dust) => {
    const from = hexRgb(paper);
    const to = hexRgb(dust);
    return Array.from({ length: COLOR_STEPS + 1 }, (_, step) => {
      const t = step / COLOR_STEPS;
      const red = Math.round(from[0] + (to[0] - from[0]) * t);
      const green = Math.round(from[1] + (to[1] - from[1]) * t);
      const blue = Math.round(from[2] + (to[2] - from[2]) * t);
      return `rgb(${red} ${green} ${blue})`;
    });
  }),
);

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  depth: number;
  speed: number;
  spin: number;
  dustSize: number;
  fragmentSize: number;
  fragmentRatio: number;
  delay: number;
  paperColor: number;
  dustColor: number;
  target: number;
  targetAcross: number;
  streak: boolean;
}

interface Projection {
  x: number;
  y: number;
  z: number;
  scale: number;
  cycle: number;
}

interface TargetSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export interface LetterDissolve {
  render: (progress: number) => void;
  seed: () => void;
  clear: () => void;
}

export const createLetterDissolve = (options: {
  /** 主界面银河曲线的投影；纸尘最终沿这条线聚合。单位为 CSS px。 */
  targetPoint: (s: number) => { x: number; y: number; onScreen: boolean };
}): LetterDissolve => {
  const canvas = requireElement<HTMLCanvasElement>('letter-dust');
  const context = canvas.getContext('2d');
  let motes: Mote[] = [];
  let targets: TargetSample[] = [];
  let dpr = 1;
  let centerX = 0;
  let centerY = 0;
  let minDimension = 0;
  let stretchX = 1;
  let stretchY = 1;
  let margin = 0;

  const sampleTargets = () => {
    const projected = Array.from({ length: TARGET_SAMPLES }, (_, index) => {
      const s = -0.16 + (index / (TARGET_SAMPLES - 1)) * 0.43;
      const point = options.targetPoint(s);
      return { x: point.x * dpr, y: point.y * dpr };
    });
    targets = projected.map((point, index) => {
      const before = projected[Math.max(0, index - 1)];
      const after = projected[Math.min(projected.length - 1, index + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      return { x: point.x, y: point.y, nx: -dy / length, ny: dx / length };
    });
  };

  const seed = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    centerX = canvas.width * 0.5;
    centerY = canvas.height * 0.5;
    minDimension = Math.min(canvas.width, canvas.height);
    stretchX = Math.max(1, (canvas.width / canvas.height) * 0.76);
    stretchY = Math.max(1, (canvas.height / canvas.width) * 0.76);
    margin = 100 * dpr;
    sampleTargets();

    // 约为旧版的两倍密度；仍按视口面积缩放，并给高分屏设上限。
    const area = width * height;
    const count = Math.min(30000, Math.round(area / 42));
    const step = Math.max(4.9, Math.sqrt(area / count));
    const cols = Math.ceil(width / step);
    const rows = Math.ceil(height / step);
    const span = Math.hypot(width, height);

    motes = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = (col + 0.5) * step + (Math.random() - 0.5) * step * 0.78;
        const y = (row + 0.5) * step + (Math.random() - 0.5) * step * 0.78;
        const distance = Math.hypot(x, y - height) / span;
        const paperAngle = Math.atan2(y - height * 0.52, x - width * 0.46) + (Math.random() - 0.5) * 0.9;
        const drift = (0.13 + Math.random() * 0.32) * span * 0.12;
        const across = (Math.random() + Math.random() + Math.random() - 1.5) * 1.02;
        motes.push({
          x: x * dpr,
          y: y * dpr,
          vx: Math.cos(paperAngle) * drift * dpr,
          vy: (Math.sin(paperAngle) * drift - span * 0.022) * dpr,
          angle: Math.random() * Math.PI * 2,
          radius: minDimension * (0.47 + Math.random() * 0.19),
          depth: NEAR_PLANE + 0.18 + Math.random() * TUNNEL_LENGTH,
          speed: 0.88 + Math.random() * 0.38,
          spin: Math.random() < 0.5 ? -1 : 1,
          dustSize: (0.3 + Math.random() * 0.66) * dpr,
          fragmentSize: (1.3 + Math.random() * 2.35) * dpr,
          fragmentRatio: 0.45 + Math.random() * 1.35,
          delay: clamp(distance * 0.3 + Math.random() * 0.045, 0, 0.34),
          paperColor: Math.floor(Math.random() * PAPER_COLORS.length),
          dustColor: Math.floor(Math.random() * DUST_COLORS.length),
          target: Math.floor(Math.random() * TARGET_SAMPLES),
          targetAcross: across,
          streak: Math.random() < 0.46,
        });
      }
    }
  };

  const clear = () => {
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  };

  const projectTunnel = (
    mote: Mote,
    travel: number,
    twist: number,
    vanishX: number,
    vanishY: number,
  ): Projection => {
    let z = mote.depth - travel * mote.speed;
    let cycle = 0;
    while (z <= NEAR_PLANE) {
      z += TUNNEL_LENGTH;
      cycle += 1;
    }
    const scale = 1.12 / z;
    const angle = mote.angle + twist * mote.spin + cycle * 0.08 * mote.spin;
    const radial = mote.radius * scale;
    return {
      x: vanishX + Math.cos(angle) * radial * stretchX,
      y: vanishY + Math.sin(angle) * radial * stretchY,
      z,
      scale,
      cycle,
    };
  };

  const render = (progress: number) => {
    if (!context) return;
    const t = clamp(progress, 0, 1);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';

    const formation = smoothstep(0.16, 0.54, t);
    const travel = CAMERA_TRAVEL * smoothstep(0.23, 0.78, t);
    const twist = smoothstep(0.25, 0.78, t) * 0.48;
    const settle = smoothstep(0.63, 1, t);
    const colorShift = smoothstep(0.24, 0.67, t);
    const vanishX = centerX + Math.sin(t * 2.35) * canvas.width * 0.013 * formation * (1 - settle);
    const vanishY = centerY + Math.sin(t * 1.62 + 0.5) * canvas.height * 0.011 * formation * (1 - settle);

    if (formation > 0.001) {
      context.globalAlpha = 0.64 * formation * (1 - settle * 0.88);
      context.fillStyle = '#03050c';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const aperture = context.createRadialGradient(vanishX, vanishY, 0, vanishX, vanishY, minDimension * 0.38);
      aperture.addColorStop(0, `rgba(3,5,12,${0.99 * formation * (1 - settle)})`);
      aperture.addColorStop(0.5, `rgba(3,5,12,${0.9 * formation * (1 - settle)})`);
      aperture.addColorStop(0.82, `rgba(3,5,12,${0.34 * formation * (1 - settle)})`);
      aperture.addColorStop(1, 'rgba(3,5,12,0)');
      context.globalAlpha = 1;
      context.fillStyle = aperture;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    const colorStep = Math.round(colorShift * COLOR_STEPS);
    const bandWidth = minDimension * 0.22;

    for (const mote of motes) {
      const breakUp = smoothstep(mote.delay, mote.delay + 0.2, t);
      if (breakUp <= 0) continue;

      const paperSpread = breakUp * (2 - breakUp) * 0.44;
      const paperX = mote.x + mote.vx * paperSpread;
      const paperY = mote.y + mote.vy * paperSpread;
      const tunnel = projectTunnel(mote, travel, twist, vanishX, vanishY);
      const tunnelX = paperX + (tunnel.x - paperX) * formation;
      const tunnelY = paperY + (tunnel.y - paperY) * formation;
      const target = targets[mote.target];
      const targetX = target.x + target.nx * mote.targetAcross * bandWidth;
      const targetY = target.y + target.ny * mote.targetAcross * bandWidth;
      const screenX = tunnelX + (targetX - tunnelX) * settle;
      const screenY = tunnelY + (targetY - tunnelY) * settle;

      if (screenX < -margin || screenY < -margin || screenX > canvas.width + margin || screenY > canvas.height + margin) {
        continue;
      }

      const near = 1 - clamp((tunnel.z - NEAR_PLANE) / TUNNEL_LENGTH, 0, 1);
      const fragmentPulse = Math.sin(breakUp * Math.PI);
      const paperAlpha = 0.64 + fragmentPulse * 0.26;
      const tunnelAlpha = 0.38 + near * 0.58;
      const alpha = (paperAlpha + (tunnelAlpha - paperAlpha) * formation) * (0.82 + settle * 0.18);
      if (alpha <= 0.012) continue;

      const color = colorTable[mote.paperColor][mote.dustColor][colorStep];
      if (mote.streak && formation > 0.3 && settle < 0.82) {
        const previousTravel = Math.max(0, travel - (0.06 + near * 0.11));
        const previous = projectTunnel(mote, previousTravel, twist - 0.018, vanishX, vanishY);
        if (previous.cycle === tunnel.cycle) {
          const oldTunnelX = paperX + (previous.x - paperX) * formation;
          const oldTunnelY = paperY + (previous.y - paperY) * formation;
          const previousX = oldTunnelX + (targetX - oldTunnelX) * settle;
          const previousY = oldTunnelY + (targetY - oldTunnelY) * settle;
          const length = Math.hypot(screenX - previousX, screenY - previousY);
          if (length > dpr && length < 190 * dpr) {
            context.globalAlpha = alpha * formation * (1 - settle) * (0.34 + near * 0.46);
            context.strokeStyle = color;
            context.lineWidth = Math.min(1.5 * dpr, Math.max(0.45 * dpr, mote.dustSize * (0.9 + near)));
            context.beginPath();
            context.moveTo(previousX, previousY);
            context.lineTo(screenX, screenY);
            context.stroke();
          }
        }
      }

      const sizeBlend = smoothstep(0.2, 0.58, t);
      const size = mote.fragmentSize + (mote.dustSize * (0.8 + tunnel.scale * 0.8) - mote.fragmentSize) * sizeBlend;
      context.globalAlpha = alpha;
      context.fillStyle = color;
      if (sizeBlend < 0.65) {
        context.fillRect(screenX - size * mote.fragmentRatio, screenY - size, size * mote.fragmentRatio * 2, size * 2);
      } else {
        const radius = Math.min(size, 2.5 * dpr);
        context.fillRect(screenX - radius, screenY - radius, radius * 2, radius * 2);
      }
    }

    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  };

  return { render, seed, clear };
};
