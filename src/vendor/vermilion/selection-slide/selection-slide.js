// 选中指示滑移（calm，见 selection-slide.css）：把 .va-slide-indicator 移到选中项下方。
// 选项必须在 .va-slide 容器里（容器是定位参照，量出来的位置相对于它）。

/**
 * 移动指示条。item 为 null 表示取消选中：指示条淡出，位置不动。
 * @param {HTMLElement} indicator .va-slide-indicator
 * @param {HTMLElement | null} item 选中的选项
 * @param {{ inset?: number, instant?: boolean }} [options] inset：左右各缩进多少像素（让下划线贴着文字）；instant：直接放到位，不滑
 */
export function moveSlideIndicator(indicator, item, { inset = 0, instant = false } = {}) {
  if (!item) {
    indicator.classList.remove('is-on');
    return;
  }
  // 第一次出现也直接放到位，再淡入，不从上一次的位置滑过来
  const jump = instant || !indicator.classList.contains('is-on');
  if (jump) indicator.classList.add('is-instant');
  indicator.style.setProperty('--va-slide-x', String(item.offsetLeft + inset));
  indicator.style.setProperty('--va-slide-w', String(Math.max(0, item.offsetWidth - inset * 2)));
  if (jump) {
    void indicator.offsetWidth; // 先按新位置排一次版，再恢复过渡
    indicator.classList.remove('is-instant');
  }
  indicator.classList.add('is-on');
}
