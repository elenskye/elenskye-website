// 银河带的 WebGL 渲染。
//
// 形态：粒子沿 band.ts 的曲线分布，法向偏移取高斯（中间密、两侧散），
// 低频噪声在带上挖出暗星云缝隙。带脊暖金、带缘青绿。
// 开场：顶点着色器在「混沌位」与「目标位」之间按 uAssemble 插值。
// 可读性：顶点着色器按屏幕空间椭圆遮罩压暗，不用整层暗场。
// 常驻动态（Phase 18-4）：相机微浮 + 逐粒子缓churn（「呼吸」），
// 以及沿 s 从带首传向尽头的双瓣亮度波（「心跳」）。两者都归零于减弱动效。

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import {
  CAMERA_FOV,
  FINAL_STAR_S,
  NODE_S_END,
  bandPoint,
  bandTangent,
  cameraYAt,
  desktopBand,
  portraitBand,
  type BandConfig,
} from './band';
import { TAU, clamp, mulberry32, reduceMotion } from './dom';

const MAX_MASKS = 2;

/**
 * 首屏银河的可见段从 s = 0 开始，但渲染额外向带首之前延长一小段：
 * 端帽停在视口外，画面里读作银河从左上角之外自然延入，而不是在屏内起笔。
 */
const LEAD_EXTENSION = {
  startS: -0.16,
  endS: 0.025,
  density: 0.185,
};

// ---------------------------------------------------------------------------
// 常驻动态的全部可调参数。基调「克制」：单项位移都在 6px 以内，
// 周期以十秒计，主体仍是安静的夜空。
// ---------------------------------------------------------------------------

/** 相机微浮：纯平移，不做旋转，近处带体与远景星场因此自然分层。 */
const DRIFT = {
  /** 世界单位。桌面 800px 高时 1 世界单位 ≈ 37px。 */
  xMajor: 0.09,
  xMinor: 0.05,
  y: 0.06,
  /** rad/s，三个互不整除的角速度（周期约 57s / 36s / 76s），
   *  合成轨迹不会肉眼可辨地循环。 */
  wxMajor: 0.11,
  wxMinor: 0.173,
  wy: 0.083,
};

/** 逐粒子 churn 的角速度；幅度存在 aChurn 里，逐粒子不同。 */
const CHURN_SPEED = 0.16;

/** 心跳波。travel 段沿 s 推进，rest 段熄灭。 */
const PULSE = {
  travelMs: 7_500,
  restMs: 1_600,
  /** 推进曲线。指数 > 1 让波在带首（第一幕视野内）停留更久。 */
  ease: 1.5,
  /** 峰值亮度增益，乘在原亮度上。 */
  gain: 0.45,
  /** 终点略越过尽头那颗星，波才是「传到星上再散掉」而不是半路熄灭。 */
  endS: 1.06,
  /** 起点淡入占行程比例；终点淡出按 s 与 endS 的距离算。 */
  fadeInT: 0.1,
  fadeOutS: 0.09,
};

/**
 * 最后一个节点之后，银河由「带」逐渐归束成三股细流，并在生日入口中心消散。
 * 起点略晚于 NODE_S_END，保证最后一个时间节点附近的既定构图不受影响。
 */
const TAIL = {
  startS: NODE_S_END + 0.006,
  fadeLength: 0.016,
  minWidth: 0.06,
  depthScale: 0.12,
  warmBlend: 0.42,
};

const smoothstep = (start: number, end: number, value: number) => {
  const t = clamp((value - start) / Math.max(Number.EPSILON, end - start), 0, 1);
  return t * t * (3 - 2 * t);
};

const vertexShader = /* glsl */ `
  attribute vec3 aChaos;
  attribute float aSize;
  attribute float aPhase;
  attribute float aDelay;
  attribute float aBright;
  // 粒子在曲线上的参数位置；心跳波按它取值。远景星场存 -1，永不被波及。
  attribute float aS;
  // 逐粒子 churn 幅度（世界单位）。远景星场存 0。
  attribute float aChurn;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uAssemble;
  uniform float uChurnSpeed;
  uniform float uChurnAmp;
  // 心跳波头所在的 s；uPulseGain 为 0 时整个波关闭。
  uniform float uPulseS;
  uniform float uPulseGain;
  // 星门穿越：0 为常态，1 为穿越峰值。uWarpCenter 是星门的世界坐标。
  uniform float uWarp;
  uniform vec3 uWarpCenter;
  uniform float uAspect;
  // 每个遮罩为 vec4(centerX, centerY, radiusX, radiusY)，单位是屏幕 UV。
  uniform vec4 uMasks[${MAX_MASKS}];
  uniform float uMaskStrength[${MAX_MASKS}];

  varying vec3 vColor;
  varying float vAlpha;
  // 穿梭时把点精灵沿「离开星门」的屏幕方向拉长成光条。
  varying vec2 vStreakDir;
  varying float vStreak;

  void main() {
    // 开场聚拢：每颗粒子有自己的起跑延迟，收拢过程才有错落感。
    float span = 1.0 - 0.35;
    float local = clamp((uAssemble - aDelay) / span, 0.0, 1.0);
    local = 1.0 - pow(1.0 - local, 3.0);
    vec3 transformed = mix(aChaos, position, local);

    // 呼吸：逐粒子相位不同，整体读作带内尘埃在缓慢翻涌，
    // 而不是整条带子在平移——后者会让固定在曲线上的 DOM 节点看着错位。
    // 幅度而不是速度才是开关：uTime 归零时 sin(aPhase) 仍是个非零常量，
    // 只把速度调成 0 会留下一层「冻住的位移」，静止帧就与基线构图对不上。
    float churn = aChurn * local * uChurnAmp;
    transformed.y += sin(uTime * uChurnSpeed + aPhase) * churn;
    transformed.x += cos(uTime * uChurnSpeed * 0.73 + aPhase * 0.7) * churn * 0.45;

    // 心跳：双瓣（lub-dub），后瓣落在波头之后（s 更小的一侧）、更弱。
    // 瓣宽与瓣距的比值决定两拍能不能分开——挨太近就糊成一道普通亮斑。
    float pulse = 0.0;
    if (uPulseGain > 0.0) {
      float d1 = (aS - uPulseS) / 0.030;
      float d2 = (aS - uPulseS + 0.085) / 0.033;
      pulse = (exp(-d1 * d1) + 0.55 * exp(-d2 * d2)) * uPulseGain * local;
    }

    // 星门穿越：以星门为轴向外扩张。相机同时朝星门推进，两者叠加后
    // 带体粒子从画面中心向四周掠出，读作被拉长的光条。用 uWarp 的平方
    // 起步，前几帧几乎不动，避免刚点下去就看见构图被扯歪。
    if (uWarp > 0.0) {
      vec2 radial = transformed.xy - uWarpCenter.xy;
      transformed.xy += radial * uWarp * uWarp * 0.85;
    }

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vec4 clipPosition = projectionMatrix * mvPosition;

    // 光条方向 = 本粒子在屏幕上离开星门的方向。必须做长宽比修正，
    // 否则宽屏上所有光条都会往水平方向偏。
    vStreak = uWarp;
    vec4 centerClip = projectionMatrix * modelViewMatrix * vec4(uWarpCenter, 1.0);
    vec2 centerNdc = centerClip.xy / max(0.0001, abs(centerClip.w));
    vec2 selfNdc = clipPosition.xy / max(0.0001, abs(clipPosition.w));
    vec2 away = (selfNdc - centerNdc) * vec2(uAspect, 1.0);
    vStreakDir = dot(away, away) > 1e-8 ? normalize(away) : vec2(1.0, 0.0);

    float twinkle = 0.82 + 0.18 * sin(uTime * (0.6 + fract(aPhase) * 0.7) + aPhase);
    float perspective = 26.0 / max(3.0, -mvPosition.z);

    // 屏幕空间遮罩：文字块正后方的粒子压暗，银河仍从后面穿过。
    vec2 screenUv = clipPosition.xy / max(0.0001, clipPosition.w) * 0.5 + 0.5;
    float dim = 1.0;
    for (int i = 0; i < ${MAX_MASKS}; i++) {
      vec4 mask = uMasks[i];
      if (mask.z <= 0.0) continue;
      float d = length((screenUv - mask.xy) / mask.zw);
      // 边缘要足够软，否则文字后方会出现一个看得出形状的暗洞。
      dim *= mix(1.0 - uMaskStrength[i], 1.0, smoothstep(0.3, 1.15, d));
    }

    // 心跳只按倍率抬亮，暗缝仍然是暗的：结构不能被波抹平。
    // 穿梭时点要够大，拉长后的光条才不会被点精灵的方框切掉。
    gl_PointSize = clamp(
      aSize * uPixelRatio * perspective * twinkle * (1.0 + pulse * 0.32) * (1.0 + uWarp * 2.2),
      0.7,
      mix(14.0, 44.0, uWarp)
    );
    gl_Position = clipPosition;

    vColor = color;
    // 亮度只轻微抬：加色叠加下抬太多会把青绿与暖金一起推到削波变成一片白，
    // 而这一段的主角恰恰是这两种颜色。观感上的「更亮」交给尺寸与拉长。
    vAlpha = twinkle * aBright * dim * local * (1.0 + pulse) * (1.0 + uWarp * 0.4);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vStreakDir;
  varying float vStreak;

  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);

    // 常态是圆点；穿梭时沿 vStreakDir 压缩坐标，圆就被拉成一道光条。
    // gl_PointCoord 的 y 朝下、NDC 的 y 朝上，方向要翻一次才对得上。
    float elongation = 1.0 + vStreak * 2.6;
    vec2 direction = normalize(vec2(vStreakDir.x, -vStreakDir.y));
    vec2 perpendicular = vec2(-direction.y, direction.x);
    vec2 shaped = vec2(dot(offset, direction) / elongation, dot(offset, perpendicular));

    float distanceToCenter = length(shaped);
    if (distanceToCenter > 0.5) discard;

    float halo = 1.0 - smoothstep(0.06, 0.5, distanceToCenter);
    float core = 1.0 - smoothstep(0.0, 0.16, distanceToCenter);
    float alpha = (halo * 0.34 + core * 0.66) * vAlpha;
    // 倍率压在 1 附近，颜色才不会被叠加推到削波。
    vec3 luminousColor = vColor * (0.72 + core * 0.5);

    gl_FragColor = vec4(luminousColor, alpha);
  }
`;

export interface ScreenMask {
  /** 视口内的矩形，单位 CSS px。 */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 0–1，压暗强度。 */
  strength: number;
}

export interface GalaxyController {
  resize: () => void;
  setScroll: (progress: number) => void;
  setMasks: (masks: ScreenMask[]) => void;
  /** 星门穿越进度 0–1。只改渲染，退回 0 后构图与穿越前完全一致。 */
  setWarp: (progress: number) => void;
  /** 重播开场聚拢；resolve 时表示已经收拢完成，可以解锁滚动。 */
  replayIntro: () => Promise<void>;
  /** 把曲线上的 s 投影成 CSS 像素坐标，供时间线节点定位。 */
  project: (s: number) => { x: number; y: number; depth: number; onScreen: boolean };
  /** 当前心跳波头所在的 s；静默段与减弱动效下返回 -1。 */
  pulseS: () => number;
  start: () => void;
  stop: () => void;
  /** 开场聚拢完成时 resolve；减弱动效下立即 resolve。 */
  ready: Promise<void>;
}

const gaussian = (random: () => number) => {
  const a = Math.max(random(), Number.EPSILON);
  const b = random();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(TAU * b);
};

/** 沿带子的低频噪声，用来挖暗星云缝隙。 */
const laneNoise = (s: number) =>
  Math.sin(s * 37.1) * 0.5 + Math.sin(s * 13.7 + 2.1) * 0.32 + Math.sin(s * 71.3 + 4.4) * 0.18;

const createBandGeometry = (
  count: number,
  config: BandConfig,
  range = { startS: 0, endS: 1, seed: 0x5b0903 },
) => {
  const positions = new Float32Array(count * 3);
  const chaos = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const delays = new Float32Array(count);
  const brights = new Float32Array(count);
  const curveS = new Float32Array(count);
  const churns = new Float32Array(count);

  const random = mulberry32(range.seed);
  const spine = new THREE.Color(0xffd9a0); // 带脊暖金，只占极窄的一条
  const mid = new THREE.Color(0x3fd0b4); // 主体青绿，饱和度要够，否则加色叠加会洗白
  const edge = new THREE.Color(0x1b5b82); // 带缘冷青
  const color = new THREE.Color();

  const point = { x: 0, y: 0, z: 0 };
  const tangent = { x: 0, y: 0, z: 0 };
  const halfWidth = config.halfWidth;
  const halfDepth = config.depth * 0.5 + 1.2;

  for (let i = 0; i < count; i += 1) {
    const s = range.startS + random() * (range.endS - range.startS);
    bandPoint(s, config, point);
    bandTangent(s, config, tangent);

    const tailProgress = smoothstep(TAIL.startS, FINAL_STAR_S, s);
    const tailWidth = 1 - tailProgress * (1 - TAIL.minWidth);
    const tailDepth = 1 - tailProgress * (1 - TAIL.depthScale);
    const endFade = 1 - smoothstep(FINAL_STAR_S - TAIL.fadeLength, FINAL_STAR_S, s);

    // 带宽方向：切向在 XY 平面内的法线。
    const tl = Math.hypot(tangent.x, tangent.y) || 1;
    const nx = -tangent.y / tl;
    const ny = tangent.x / tl;

    // 高斯偏移：中间密两侧散。offset 归一化后同时决定颜色与亮度。
    const originalSpread = gaussian(random) * 0.5;
    // 尾段把原本连续的带缘缓慢梳成三股细流，再一起收进入口。
    // lane 与 jitter 只由粒子序号计算，不消耗随机数，因此 s < TAIL.startS
    // 的粒子属性与既定第一幕基线逐项一致。
    const filamentLane = ((i % 3) - 1) * 0.34 + Math.sin((i + 1) * 12.9898) * 0.035;
    const filamentBlend = smoothstep(0.12, 0.82, tailProgress) * 0.72;
    const spread = originalSpread + (filamentLane - originalSpread) * filamentBlend;
    const offset = spread * halfWidth * tailWidth;
    const across = clamp(Math.abs(originalSpread) / 1.2, 0, 1);

    const index = i * 3;
    positions[index] = point.x + nx * offset;
    positions[index + 1] = point.y + ny * offset;
    positions[index + 2] = point.z + gaussian(random) * 0.42 * halfDepth * tailDepth;

    // 混沌起点：绕带子外围的一个大球壳，收拢时从四面八方汇入。
    const theta = random() * TAU;
    const phi = Math.acos(2 * random() - 1);
    const chaosRadius = 34 + random() * 26;
    chaos[index] = Math.sin(phi) * Math.cos(theta) * chaosRadius;
    chaos[index + 1] = point.y + Math.cos(phi) * chaosRadius * 0.55;
    chaos[index + 2] = config.baseZ + Math.sin(phi) * Math.sin(theta) * chaosRadius * 0.5;

    // 暖金只占最中间的一条细脊，其余全是青绿到冷青，整体才是「青绿 + 暖金」
    // 而不是一团金。
    if (across < 0.07) color.copy(spine).lerp(mid, across / 0.07);
    else color.copy(mid).lerp(edge, (across - 0.07) / 0.93);
    // 越接近入口，青绿细流越多地把暖金让到核心，但仍保留极光色层次。
    color.lerp(spine, tailProgress * TAIL.warmBlend);
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;

    // 暗缝：噪声低谷处直接压暗，形成星云缝隙而不是均匀一条。
    const lane = clamp(0.55 + laneNoise(s) * 0.42, 0, 1);
    // 带脊不能又最密又最亮，否则加色叠加会把青绿整片洗成白。
    const centreBoost = Math.pow(1 - across, 1.1);
    brights[i] = (0.5 + centreBoost * 0.75) * lane * (1 - tailProgress * 0.2) * endFade;
    sizes[i] = (0.8 + centreBoost * 1.35 + (random() < 0.015 ? 2.8 : 0)) * (1 - tailProgress * 0.22);
    phases[i] = random() * TAU;
    delays[i] = random() * 0.35;
    curveS[i] = s;
    // 带缘的尘埃比带脊飘得多一点，churn 才不像整块在晃。
    churns[i] = (0.04 + random() * 0.09) * (0.6 + across * 0.8) * (1 - tailProgress * 0.84);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aChaos', new THREE.BufferAttribute(chaos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));
  geometry.setAttribute('aBright', new THREE.BufferAttribute(brights, 1));
  geometry.setAttribute('aS', new THREE.BufferAttribute(curveS, 1));
  geometry.setAttribute('aChurn', new THREE.BufferAttribute(churns, 1));
  return geometry;
};

/** 远景星场：跟随相机做 8% 视差，充当不动的天幕。 */
const createStarfield = (count: number, config: BandConfig) => {
  const positions = new Float32Array(count * 3);
  const chaos = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const delays = new Float32Array(count);
  const brights = new Float32Array(count);

  const random = mulberry32(0x2c1f07);
  const cold = new THREE.Color(0xbcd4ff);
  const warm = new THREE.Color(0xffe6c0);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    positions[index] = (random() - 0.5) * 150;
    positions[index + 1] = (random() - 0.5) * 90;
    positions[index + 2] = config.baseZ - 12 - random() * 34;
    chaos[index] = positions[index];
    chaos[index + 1] = positions[index + 1];
    chaos[index + 2] = positions[index + 2];

    color.copy(random() < 0.22 ? warm : cold);
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;

    sizes[i] = 0.5 + random() * 1.1;
    phases[i] = random() * TAU;
    delays[i] = 0;
    brights[i] = 0.25 + random() * 0.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aChaos', new THREE.BufferAttribute(chaos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));
  geometry.setAttribute('aBright', new THREE.BufferAttribute(brights, 1));
  // 远景星场与银河带共用同一个 material，两个新属性必须都在：
  // aS 取 -1 让心跳波永远够不到它，aChurn 取 0 让它纹丝不动。
  geometry.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(count).fill(-1), 1));
  geometry.setAttribute('aChurn', new THREE.BufferAttribute(new Float32Array(count), 1));
  return geometry;
};

/** 穿越峰值时相机走完到星门距离的比例。留出余量，相机不穿过星门。 */
const GATE_REACH = 0.9;
/** 穿越峰值时的 bloom 强度；常态为 0.3。 */
const WARP_BLOOM = 1.35;

export const createGalaxy = (
  canvas: HTMLCanvasElement,
  options: {
    /** 相机就位后、渲染之前调用。DOM 节点在这里同步，才能与画面严格同帧。 */
    onSync?: () => void;
    /** 每一次心跳波抵达尽头那颗星时调用一次。减弱动效下永不触发。 */
    onPulseArrive?: () => void;
  } = {},
): GalaxyController => {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 不用 ACES：它会把高光强力去饱和，加色叠加的星点会整片洗成白，
  // 青绿与暖金的分别就没了。这里靠亮度自身控制动态范围。
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x03050c, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050c);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

  const isPortrait = window.innerHeight > window.innerWidth * 1.1;
  const isCompact = window.innerWidth < 720;
  const config = isPortrait ? portraitBand : desktopBand;
  const bandCount = isCompact ? 95_000 : 190_000;

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uAssemble: { value: 0 },
    uChurnSpeed: { value: CHURN_SPEED },
    uChurnAmp: { value: 0 },
    uPulseS: { value: -1 },
    uPulseGain: { value: 0 },
    uWarp: { value: 0 },
    uWarpCenter: { value: new THREE.Vector3() },
    uAspect: { value: 1 },
    uMasks: { value: Array.from({ length: MAX_MASKS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uMaskStrength: { value: new Array<number>(MAX_MASKS).fill(0) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const bandPoints = new THREE.Points(createBandGeometry(bandCount, config), material);
  bandPoints.frustumCulled = false;
  scene.add(bandPoints);

  // 独立追加带首外延，主银河仍使用原来的 seed 与 s∈[0,1]，因此它的粒子
  // 位置、颜色和暗缝逐项保持不变；新段与 s∈[0,0.025] 少量重叠以藏住接缝。
  const leadCount = Math.round(bandCount * LEAD_EXTENSION.density);
  const leadPoints = new THREE.Points(
    createBandGeometry(leadCount, config, {
      startS: LEAD_EXTENSION.startS,
      endS: LEAD_EXTENSION.endS,
      seed: 0x7a1809,
    }),
    material,
  );
  leadPoints.frustumCulled = false;
  scene.add(leadPoints);

  const starfield = new THREE.Points(createStarfield(isCompact ? 1_400 : 2_400, config), material);
  starfield.frustumCulled = false;
  scene.add(starfield);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Bloom 大幅调弱：只让最亮星点泛光，带体主色不得发白。
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3,
    0.55,
    0.55,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const ASSEMBLE_MS = 2400;

  let scrollProgress = 0;
  let animationFrame = 0;
  let lastTime = 0;
  let introStart = 0;
  let driftSeconds = 0;
  let drawing = false;
  let pulseStart = 0;
  let pulseArrived = false;
  let currentPulseS = -1;
  let assemble = reduceMotion.matches ? 1 : 0;
  // 开场聚拢可以重播（从祝福页回来时），所以 resolver 是可替换的：
  // 每次重播换一个新的 promise，旧的那个早已 resolve，互不干扰。
  let resolveReady: () => void = () => {};
  const armIntro = () =>
    new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
  const ready = armIntro();

  if (reduceMotion.matches) {
    resolveReady();
  } else {
    // 兜底：rAF 在后台标签页会被节流甚至停掉。开场若只靠帧循环推进，
    // 用户切走再切回就会卡在锁定滚动的状态里。墙钟到点必须放行。
    window.setTimeout(() => {
      assemble = 1;
      resolveReady();
    }, ASSEMBLE_MS + 900);
  }

  // 星门的世界坐标：相机穿越时朝它推进，着色器也以它为扩张轴心。
  const gate = bandPoint(FINAL_STAR_S, config);
  uniforms.uWarpCenter.value.set(gate.x, gate.y, gate.z);
  let warp = 0;

  const placeCamera = () => {
    const baseY = cameraYAt(scrollProgress);
    // 微浮只做平移、不做旋转：视线保持平行于 -Z，
    // 近处的带体因此比远景星场位移更多，分层是自然透视的结果。
    // 三项都用无相位偏移的 sin：t = 0 时位移严格为 0，
    // 首帧构图与减弱动效下的静止帧因此与既定基线完全一致。
    const driftX =
      Math.sin(driftSeconds * DRIFT.wxMajor) * DRIFT.xMajor +
      Math.sin(driftSeconds * DRIFT.wxMinor) * DRIFT.xMinor;
    const driftY = Math.sin(driftSeconds * DRIFT.wy) * DRIFT.y;

    let x = driftX;
    let y = baseY + driftY;
    let z = 0;
    if (warp > 0) {
      // 三次缓入：起步几乎不动，末段最快，读作朝星门加速推进。
      // GATE_REACH < 1，相机停在星门前方，不会穿过去看见带体背面。
      const eased = warp * warp * warp;
      const reach = eased * GATE_REACH;
      x += (gate.x - x) * reach;
      y += (gate.y - y) * reach;
      z += (gate.z - z) * reach;
    }

    camera.position.set(x, y, z);
    // 视线始终平行于 -Z：穿越是纯推进，不带转向，否则画面会甩。
    camera.lookAt(x, y, z - 1);
    camera.updateMatrixWorld();
    // 星场跟随相机做 8% 视差，读起来像不动的远天。
    // 只跟基准 Y，不跟微浮量——跟了就没有视差了。
    starfield.position.y = baseY * 0.92;
  };

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, isCompact ? 1.5 : 1.75);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uAspect.value = camera.aspect;
    placeCamera();
  };

  const draw = (time: number) => {
    // 重入保护。减弱动效下 setMasks() 会直接 draw()，而 draw() 要回调 onSync()
    // 同步 DOM，onSync 又会算出新遮罩再调 setMasks——没有这道闸就是无限递归
    // （只有 prefers-reduced-motion 用户会踩到，实测 Maximum call stack size exceeded）。
    // 挡掉内层调用即可：外层 draw 会在 onSync 返回后带着新遮罩渲染。
    if (drawing) return;
    drawing = true;

    // 每帧现读，减弱动效在会话中途被打开也能立刻静止（不只在初始化时判一次）。
    const still = reduceMotion.matches;
    if (still) {
      driftSeconds = 0;
      uniforms.uPulseGain.value = 0;
      currentPulseS = -1;
    }
    uniforms.uTime.value = still ? 0 : time;
    uniforms.uChurnAmp.value = still ? 0 : 1;
    uniforms.uAssemble.value = assemble;
    placeCamera();
    options.onSync?.();
    composer.render(0);

    drawing = false;
  };

  /** 常驻动态的推进。与开场一样按墙钟走，被节流后不会积欠。 */
  const advanceAmbient = (timestamp: number, time: number) => {
    driftSeconds = time;

    // 心跳等聚拢播完再起搏：开场本身已经够满了。
    if (assemble < 1) {
      pulseStart = timestamp;
      currentPulseS = -1;
      return;
    }

    const cycle = PULSE.travelMs + PULSE.restMs;
    const phase = (timestamp - pulseStart) % cycle;
    if (phase >= PULSE.travelMs) {
      uniforms.uPulseGain.value = 0;
      pulseArrived = false;
      currentPulseS = -1;
      return;
    }

    const t = phase / PULSE.travelMs;
    const s = PULSE.endS * Math.pow(t, PULSE.ease);
    currentPulseS = s;
    uniforms.uPulseS.value = s;
    uniforms.uPulseGain.value =
      PULSE.gain *
      clamp(t / PULSE.fadeInT, 0, 1) *
      clamp((PULSE.endS - s) / PULSE.fadeOutS, 0, 1);

    if (!pulseArrived && s >= FINAL_STAR_S) {
      pulseArrived = true;
      options.onPulseArrive?.();
    }
  };

  const loop = (timestamp: number) => {
    const time = timestamp * 0.001;
    lastTime = timestamp;

    if (assemble < 1) {
      // 按墙钟推进，不累加逐帧 delta：掉帧或被节流时进度依然按真实时间走完。
      assemble = clamp((timestamp - introStart) / ASSEMBLE_MS, 0, 1);
      if (assemble >= 1) resolveReady();
    }

    advanceAmbient(timestamp, time);
    draw(time);
    animationFrame = window.requestAnimationFrame(loop);
  };

  const stop = () => {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  };

  const start = () => {
    stop();
    if (reduceMotion.matches) {
      assemble = 1;
      draw(0);
      return;
    }
    lastTime = performance.now();
    if (!introStart) introStart = lastTime;
    animationFrame = window.requestAnimationFrame(loop);
  };

  const projection = new THREE.Vector3();
  const project = (s: number) => {
    const point = bandPoint(s, config);
    projection.set(point.x, point.y, point.z).project(camera);
    return {
      x: (projection.x * 0.5 + 0.5) * window.innerWidth,
      y: (-projection.y * 0.5 + 0.5) * window.innerHeight,
      depth: projection.z,
      onScreen: Math.abs(projection.x) <= 1.35 && Math.abs(projection.y) <= 1.35,
    };
  };

  const setScroll = (progress: number) => {
    scrollProgress = clamp(progress, 0, 1);
    placeCamera();
    // DOM 节点位置立刻跟上，不等渲染循环：rAF 在后台标签页会被节流甚至停掉，
    // 只靠帧循环同步的话，节点会与滚动脱节。相机已就位，投影与下一帧一致。
    options.onSync?.();
    if (reduceMotion.matches) draw(0);
  };

  /**
   * 星门穿越进度。0 为常态构图，1 为穿越峰值（相机贴近星门、粒子拉散、bloom 拉满）。
   * 只改渲染，不改曲线：退回 0 后构图与穿越前逐像素一致。
   */
  const setWarp = (progress: number) => {
    warp = clamp(progress, 0, 1);
    uniforms.uWarp.value = warp;
    bloom.strength = 0.3 + (WARP_BLOOM - 0.3) * warp;
    placeCamera();
  };

  /**
   * 重播开场聚拢：粒子退回混沌位，再重新收拢成银河带。
   * 从祝福页回来时用它——信纸碎成的粒子正好交棒给这一拍，
   * 落点也就是主界面最开始的状态。
   */
  const replayIntro = () => {
    if (reduceMotion.matches) {
      assemble = 1;
      return Promise.resolve();
    }
    assemble = 0;
    introStart = performance.now();
    const done = armIntro();
    const settle = resolveReady;
    // 与首次开场同一条兜底：rAF 被节流甚至停掉时，墙钟到点也必须放行，
    // 否则锁着的滚动永远解不开。
    window.setTimeout(() => {
      assemble = 1;
      settle();
    }, ASSEMBLE_MS + 900);
    return done;
  };

  const setMasks = (masks: ScreenMask[]) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    for (let i = 0; i < MAX_MASKS; i += 1) {
      const mask = masks[i];
      const target = uniforms.uMasks.value[i];
      if (!mask) {
        target.set(0, 0, 0, 0);
        uniforms.uMaskStrength.value[i] = 0;
        continue;
      }
      target.set(
        (mask.left + mask.width * 0.5) / width,
        1 - (mask.top + mask.height * 0.5) / height,
        Math.max(0.02, mask.width * 0.5 / width),
        Math.max(0.02, mask.height * 0.5 / height),
      );
      uniforms.uMaskStrength.value[i] = mask.strength;
    }
    if (reduceMotion.matches) draw(0);
  };

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stop();
    document.documentElement.classList.add('webgl-fallback');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    document.documentElement.classList.remove('webgl-fallback');
    resize();
    start();
  });

  // 首帧之前必须先定好尺寸，否则会出现只渲染局部的画面。
  resize();

  return {
    resize,
    setScroll,
    setMasks,
    setWarp,
    replayIntro,
    project,
    pulseS: () => currentPulseS,
    start,
    stop,
    ready,
  };
};
