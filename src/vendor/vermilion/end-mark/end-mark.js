// 文末落款（calm，见 end-mark.css）：三版里随机挑一版显示，第一次滚进视口时写一次。

/**
 * 初始化一个落款。每次打开页面调用一次。
 * @param {HTMLElement} mark .va-end-mark
 * @param {{ random?: () => number }} [options] random：取 [0, 1) 随机数的函数（默认 Math.random）
 */
export function initEndMark(mark, { random = Math.random } = {}) {
  const variants = [...mark.querySelectorAll(':scope > .va-draw-v2')];
  if (!variants.length) return;
  const pick = variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))];
  for (const v of variants) v.hidden = v !== pick;
  mark.dataset.pick = pick.dataset.variant ?? '';

  // 减弱动效或没有 IntersectionObserver：静态显示
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  // 打开页面时已在屏幕里（很短的文章）：直接静态显示，不先藏再写，免得闪一下
  const box = pick.getBoundingClientRect();
  if (box.top < window.innerHeight && box.bottom > 0) return;

  pick.classList.add('is-waiting');
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    pick.classList.remove('is-waiting');
    pick.classList.add('is-playing');
  }, { threshold: 0.6 });
  io.observe(pick);
}
