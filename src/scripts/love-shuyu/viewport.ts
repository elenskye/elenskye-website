// 手机浏览器工具栏挡住的那一条，量出来交给 CSS。
//
// 这一页所有可视层都是 `position: fixed; inset: 0`，也就是**铺满布局视口**。
// 问题在于手机浏览器的布局视口按「工具栏收起」算：iOS 上地址栏与标签栏展开时，
// 固定层的下缘照旧落在屏幕外，压在工具栏底下。信纸右下角那个翻页折角正好在
// 那一带 —— 看不见，也点不着，实测在 iPhone 上就是「无法翻页」。
// Android 的手势条同理，只是少一截。
//
// `100dvh` 解决不了：折角是相对固定层定位的，而那个层的高度仍是布局视口。
// 所以这里直接量：布局视口下缘（`documentElement.clientHeight`）减去
// visualViewport 的可见下缘，差多少就是被工具栏吃掉多少。iOS、Android、
// 桌面同一套算法，桌面自然得 0。
//
// 结果写进根元素的 `--chrome-bottom`。需要「一定在屏内」的交互元素自己去加，
// 通常还要再叠一个 `env(safe-area-inset-bottom)`：工具栏收起时前者归零，
// 由后者接手让出 home 指示条。两者在同一时刻只会有一个非零。

import { clamp } from './dom';

const root = document.documentElement;

/** 被吃掉的高度不可能超过屏幕的四分之一；异常值（如软键盘）不许传下去。 */
const MAX_RATIO = 0.25;

export const startViewportInsets = (onChange: () => void) => {
  let last = -1;

  const sync = () => {
    const layoutHeight = root.clientHeight;
    const visual = window.visualViewport;
    // offsetTop 是可见区相对布局视口的位移；缩放或键盘顶起时才非零。
    const visibleBottom = visual ? visual.offsetTop + visual.height : layoutHeight;
    const hidden = Math.round(clamp(layoutHeight - visibleBottom, 0, layoutHeight * MAX_RATIO));
    if (hidden === last) return;
    last = hidden;
    root.style.setProperty('--chrome-bottom', `${hidden}px`);
    // 信纸的可读高度跟着变，页数必须重算，否则末页会多出或少掉一页。
    onChange();
  };

  sync();
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
};
