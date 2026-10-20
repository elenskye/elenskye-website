// 背景音乐：主界面与祝福页各一首单曲循环，两页切换时三秒交叉淡入淡出。
//
// 页面要求「绝对干净、无多余 UI」，所以这里没有任何可见控件。
// 自动播放的现实：Chrome / Safari / Firefox 只在页面已获得用户激活手势、
// 或该站点媒体互动分足够高时才允许有声播放，隐藏元素或脚本自点都不算激活。
// 因此策略是——加载即尝试，被拦下就静默挂一次性手势监听，用户第一次
// 触摸／点击／按键时无感接上。手机上滑动结束的 touchend 即构成激活，
// 实际体验是「刚开始滚动就有音乐」。
//
// 音量必须走 Web Audio 的 GainNode：iOS Safari 上 HTMLMediaElement.volume
// 是只读的，直接赋值不会有任何效果，三秒淡入淡出会退化成硬切。

import { clamp } from './dom';

// 交叉淡入淡出：旧曲先退干净，新曲晚一拍才进来，只留一点点重叠。
// 两条同时跑（原来的做法）听起来会挤在一起、很急促。
/** 旧曲淡出时长。 */
const FADE_OUT_MS = 2600;
/** 新曲淡入时长。 */
const FADE_IN_MS = 2600;
/** 两条曲线的重叠时长；新曲起步时刻 = FADE_OUT_MS - FADE_OVERLAP_MS。 */
const FADE_OVERLAP_MS = 700;
/** 整段切换的墙钟长度，供文档与调用方参考。 */
export const MUSIC_SWITCH_MS = FADE_OUT_MS - FADE_OVERLAP_MS + FADE_IN_MS;

type TrackName = 'sky' | 'wish';
type EffectName = 'pull' | 'page';

const EFFECT_LEVELS: Record<EffectName, number> = {
  // 交互音只做触感，不盖过背景音乐。
  pull: 0.46,
  page: 0.38,
};

export interface MusicController {
  /** 淡向主界面曲。 */
  toSky: (immediate?: boolean) => void;
  /** 淡向祝福曲，每次进入都从头播放。 */
  toWish: (immediate?: boolean) => void;
  /** 拉绳触发时播放一次真实的拉链开关声。 */
  pull: () => void;
  /** 信纸前后翻页时播放一次纸张翻动声。 */
  turnPage: () => void;
}

interface Track {
  element: HTMLAudioElement;
  gain: GainNode | null;
  /** Web Audio 不可用时的回退音量，用 element.volume 逼近。 */
  fallbackVolume: number;
}

interface Effect {
  /** Web Audio 不可用时的回退发声体；正常路径用下面的 buffer。 */
  element: HTMLAudioElement;
  gain: GainNode | null;
  /** 解码好的短音，交互时现开一个 BufferSource 播。 */
  buffer: AudioBuffer | null;
  /** 上一次还在响的那一声，重复触发时先停掉它。 */
  source: AudioBufferSourceNode | null;
}

export const createMusic = (options: {
  sky: HTMLAudioElement;
  wish: HTMLAudioElement;
  pull: HTMLAudioElement;
  page: HTMLAudioElement;
  /** 自动播放被浏览器拦下、开始等待用户手势时调用一次。 */
  onBlocked?: () => void;
  /** 音乐真正响起来时调用一次。 */
  onPlaying?: () => void;
}): MusicController => {
  let context: AudioContext | null = null;
  const tracks: Record<TrackName, Track> = {
    sky: { element: options.sky, gain: null, fallbackVolume: 0 },
    wish: { element: options.wish, gain: null, fallbackVolume: 0 },
  };
  const effects: Record<EffectName, Effect> = {
    pull: { element: options.pull, gain: null, buffer: null, source: null },
    page: { element: options.page, gain: null, buffer: null, source: null },
  };

  /**
   * 取回并解码一段交互音。失败不报错也不重试：回退路径（`<audio>` 元素）
   * 一直在，最坏情况只是这一声没响，绝不能影响翻页本身。
   */
  const loadEffectBuffer = async (effect: Effect) => {
    const source = effect.element.getAttribute('src');
    if (!source || !context) return;
    try {
      const response = await fetch(source);
      if (!response.ok) return;
      effect.buffer = await context.decodeAudioData(await response.arrayBuffer());
    } catch {
      // 解码失败就留着 buffer = null，playEffect 自动走元素回退。
    }
  };

  // MediaElementSource 只能对同一个 <audio> 建一次，重复建会抛错；
  // 因此接线在这里一次性完成，之后只改 gain。
  try {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      context = new AudioContextCtor();
      for (const track of Object.values(tracks)) {
        const gain = context.createGain();
        gain.gain.value = 0;
        context.createMediaElementSource(track.element).connect(gain);
        gain.connect(context.destination);
        track.gain = gain;
        // Web Audio 接管后由 gain 控制响度，元素自身保持满音量。
        track.element.volume = 1;
      }
      /*
        交互音**不走 `<audio>` 元素**，解码成 AudioBuffer 现开 BufferSource 播。

        元素那条路在 iOS 上不可靠：`preload` 被系统忽略，每个媒体元素还要各自
        被一次用户手势「解锁」，接进 `MediaElementSource` 之后更是只有在
        AudioContext 真的 running 时才出声 —— 站主实测手机上翻页完全没有声音，
        而拉绳（同一条路径、但紧跟在真实点击后）是响的。两声都很短
        （`page-turn.m4a` 6.8 KB、`pull-chain.m4a` 37 KB），整段解进内存代价
        可以忽略，之后每次触发都是纯 Web Audio，没有元素、没有解锁、没有延迟。

        `<audio>` 元素保留成没有 Web Audio 时的回退，那时不再接线，
        由元素自己发声（iOS 上 volume 只读，回退态音量会偏大，可接受）。
      */
      for (const [name, effect] of Object.entries(effects) as [EffectName, Effect][]) {
        const gain = context.createGain();
        gain.gain.value = EFFECT_LEVELS[name];
        gain.connect(context.destination);
        effect.gain = gain;
        void loadEffectBuffer(effect);
      }
    }
  } catch (error) {
    console.warn('[love-shuyu] Web Audio 不可用，淡入淡出退化为直接设音量', error);
    context = null;
    for (const [name, effect] of Object.entries(effects) as [EffectName, Effect][]) {
      try {
        effect.element.volume = EFFECT_LEVELS[name];
      } catch {
        // iOS 的媒体元素音量只读；有 Web Audio 时上面的 GainNode 会接管。
      }
    }
  }

  let current: TrackName = 'sky';
  let muted = false;
  let fadeOutTimer = 0;
  let enterTimer = 0;

  /** 无 Web Audio 时的 rAF 音量渐变；iOS 上 volume 只读，这里等于硬切，可接受。 */
  const fallbackRamp = (track: Track, target: number, durationMs: number, delayMs = 0) => {
    const from = track.fallbackVolume;
    const startedAt = performance.now() + delayMs;
    const step = (now: number) => {
      const t = durationMs <= 0 ? 1 : clamp((now - startedAt) / durationMs, 0, 1);
      track.fallbackVolume = from + (target - from) * t;
      try {
        track.element.volume = clamp(track.fallbackVolume, 0, 1);
      } catch {
        // iOS：volume 只读，忽略。
      }
      if (t < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  };

  const ramp = (track: Track, target: number, durationMs: number, delayMs = 0) => {
    const value = muted ? 0 : target;
    if (track.gain && context) {
      const now = context.currentTime;
      const start = now + delayMs / 1000;
      // 先把曲线锚在当前值上，否则上一段 ramp 未走完时会从旧起点跳变。
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setValueAtTime(track.gain.gain.value, now);
      // 延迟期间保持不动，到点再起步——这样两条曲线才是错开的，不是挤在一起。
      if (delayMs > 0) track.gain.gain.setValueAtTime(track.gain.gain.value, start);
      track.gain.gain.linearRampToValueAtTime(value, start + Math.max(0.001, durationMs / 1000));
      return;
    }
    fallbackRamp(track, value, durationMs, delayMs);
  };

  /** 现在是否真的在出声。context 挂起时元素虽在走，但一点声音都没有。 */
  const isAudible = () =>
    !tracks[current].element.paused && (!context || context.state === 'running');

  /**
   * 尝试起播。被拦下时抛出，由调用方决定是否挂手势监听。
   *
   * **绝对不要 `await context.resume()`。** 没有用户激活时，Chrome 让被自动播放
   * 策略挡住的 `resume()` promise 一直 pending，永远不 reject——await 它会把整条
   * 链挂死在这里：`element.play()` 不会被调用，返回的 promise 不会 settle，
   * 调用方的 .catch 永远不执行，于是提示音符不出现、手势监听也从没挂上。
   * 这正是站主在真实浏览器里遇到的那个「点什么都没反应」。
   */
  const play = async (track: Track) => {
    await track.element.play();
    if (!context) return;

    if (context.state === 'suspended') {
      // 只发不等。拿得到激活时它很快就 running，拿不到就一直挂着，与我们无关。
      void context.resume();
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }

    if (context.state !== 'running') {
      // 元素在走但整条链是静音的：这不算播上了。停回去，等下一次手势重来。
      track.element.pause();
      throw new DOMException('audio context is suspended', 'NotAllowedError');
    }
  };

  /**
   * 给每一次起播加上限时。`play()` 这类接口在被自动播放策略挡住时，可能既不
   * resolve 也不 reject（Chrome 的 `AudioContext.resume()` 就是这样挂着的），
   * 而页面上所有反馈——提示音符、手势监听——都挂在这个 promise 的两个分支上。
   * 不限时的话，一次挂死就等于整套音乐逻辑静悄悄地消失，用户点什么都没反应。
   */
  const playWithTimeout = (track: Track) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const guard = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new DOMException('play() timed out', 'NotAllowedError'));
      }, 2500);
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(guard);
        if (error) reject(error);
        else resolve();
      };
      play(track).then(() => finish(), finish);
    });

  /**
   * 交互音不做排队：连续翻页时总是从声头重新开始，触感才跟得上折角。
   * 用户的点击／触摸本身可以解锁 AudioContext；这里只发 resume，不等待它，避免
   * 重蹈背景音乐自动播放 promise 永久 pending 的问题。
   */
  const playEffect = (name: EffectName) => {
    if (muted) return;
    const effect = effects[name];

    // 正常路径：现开一个 BufferSource。连续触发时先停掉上一声，
    // 保持「每次都从声头重新开始」而不是叠成一片。
    if (context && effect.gain && effect.buffer) {
      if (context.state === 'suspended') void context.resume();
      try {
        effect.source?.stop();
      } catch {
        // 还没开始播的 source 再 stop 会抛，忽略。
      }
      const source = context.createBufferSource();
      source.buffer = effect.buffer;
      source.connect(effect.gain);
      source.onended = () => {
        if (effect.source === source) effect.source = null;
      };
      effect.source = source;
      source.start();
      return;
    }

    // 回退：没有 Web Audio（或解码失败）时由元素自己发声。
    effect.element.pause();
    effect.element.currentTime = 0;
    effect.element.muted = muted;
    if (context?.state === 'suspended') void context.resume();
    void effect.element.play().catch(() => {
      // wheel 等事件不一定构成用户激活；视觉交互不能因此失败。
    });
  };

  // 只有这几类事件构成用户激活；wheel 不算，但一并试一次无害，
  // 站点媒体互动分已足够高时它也能成功。
  const GESTURES: (keyof WindowEventMap)[] = [
    'pointerdown',
    'pointerup',
    'touchend',
    'keydown',
    'click',
    'wheel',
  ];

  let waitingForGesture = false;

  /**
   * 每次成功出声都通知，不做「只报一次」的去重。
   * 去重放在这里会留下一个死结：若某次切歌被拒（onBlocked 让音符现身）时
   * 早先已经报过播放，音符就再也等不到撤下的信号，永远挂在画面上。
   * 幂等由调用方按「音符是否还显示着」判断，那边天然拿得到真实状态。
   */
  const announcePlaying = () => options.onPlaying?.();

  const armGestureFallback = () => {
    if (waitingForGesture) return;
    waitingForGesture = true;
    options.onBlocked?.();

    const attempt = () => {
      void playWithTimeout(tracks[current])
        .then(() => {
          waitingForGesture = false;
          disarm();
          ramp(tracks[current], 1, FADE_IN_MS);
          announcePlaying();
        })
        .catch(() => {
          // 该手势仍不构成激活（例如 wheel），继续等下一次。
        });
    };

    const disarm = () => {
      for (const type of GESTURES) window.removeEventListener(type, attempt, true);
    };

    for (const type of GESTURES) {
      window.addEventListener(type, attempt, { capture: true, passive: true });
    }
  };

  /** 让某一轨从头开始出声。fadeMs 为 0 表示直接到位。 */
  const enter = (name: TrackName, fadeMs: number) => {
    // 祝福曲每次进入都从头开始；主界面曲是常驻底噪，从上次位置续上。
    if (name === 'wish') tracks.wish.element.currentTime = 0;
    void playWithTimeout(tracks[name])
      .then(() => {
        ramp(tracks[name], 1, fadeMs);
        announcePlaying();
      })
      .catch(() => armGestureFallback());
  };

  const switchTo = (next: TrackName, immediate: boolean) => {
    if (next === current && !tracks[next].element.paused) return;
    const previous = current;
    current = next;
    window.clearTimeout(fadeOutTimer);
    window.clearTimeout(enterTimer);

    if (immediate) {
      if (previous !== next) {
        ramp(tracks[previous], 0, 0);
        tracks[previous].element.pause();
      }
      enter(next, 0);
      return;
    }

    if (previous === next) {
      enter(next, FADE_IN_MS);
      return;
    }

    // 旧曲先退干净。淡出走完才真正暂停：提前暂停会把尾巴切掉。
    ramp(tracks[previous], 0, FADE_OUT_MS);
    fadeOutTimer = window.setTimeout(() => {
      if (current !== previous) tracks[previous].element.pause();
    }, FADE_OUT_MS);

    // 新曲晚一拍才起播，只与旧曲的尾巴重叠 FADE_OVERLAP_MS。
    // 起播本身也要延后，不能只延后音量曲线——否则等它该被听见时，
    // 歌已经空放过去将近两秒了，而祝福曲必须从头听。
    enterTimer = window.setTimeout(() => {
      if (current !== next) return;
      enter(next, FADE_IN_MS);
    }, Math.max(0, FADE_OUT_MS - FADE_OVERLAP_MS));
  };

  // 不可见的静音退路：不占任何视觉，站主自己知道就行。
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'm' && event.key !== 'M') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    muted = !muted;
    ramp(tracks[current], 1, 420);
    for (const [name, effect] of Object.entries(effects) as [EffectName, Effect][]) {
      effect.element.muted = muted;
      // 正在响的那一声也要立刻掐掉，静音不该等它自然播完。
      if (muted) {
        try {
          effect.source?.stop();
        } catch {
          // 还没开始播的 source 再 stop 会抛，忽略。
        }
        effect.source = null;
      }
      if (effect.gain && context) {
        effect.gain.gain.cancelScheduledValues(context.currentTime);
        effect.gain.gain.setValueAtTime(muted ? 0 : EFFECT_LEVELS[name], context.currentTime);
      }
    }
  });

  for (const track of Object.values(tracks)) {
    track.element.loop = true;
  }

  // 页面隐藏时不停音乐：切走再切回还在同一段，比每次重来自然。

  switchTo('sky', true);

  // 兜底看门狗：不管是哪条路径出了岔（play 的 promise 既不 resolve 也不 reject、
  // context 停在 suspended、解码失败……），只要开场两秒还没真的出声，就一律
  // 当作被拦下，把提示音符放出来并挂上手势监听。
  // 站主遇到的正是「什么信号都没有」，所以这里不能只依赖 catch 链。
  window.setTimeout(() => {
    if (!isAudible()) armGestureFallback();
  }, 2000);

  return {
    toSky: (immediate = false) => switchTo('sky', immediate),
    toWish: (immediate = false) => switchTo('wish', immediate),
    pull: () => playEffect('pull'),
    turnPage: () => playEffect('page'),
  };
};
