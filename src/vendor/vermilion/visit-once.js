// 「每次打开网站只播一次」的共用标记（DESIGN.md §5）。
// 同一次访问（同一个标签页的会话）里，第一次打开的页面照常播放入场类动效；之后在站内跳转或刷新，
// 根元素带上 data-va-visited，零件的 CSS 据此直接显示终态（count-up 等）。
// 放在 <head> 里、页面样式之前同步执行，免得先播一帧再停。sessionStorage 读写失败（隐私模式等）时每次都播放。
// 同一页引入两次也只判定一次。与 section-deco-intro.once.js 用同一个标记，二者取一即可。
(() => {
  const root = document.documentElement;
  if (root.hasAttribute('data-va-visit')) return;
  let seen = false;
  try {
    seen = Boolean(sessionStorage.getItem('va-visited'));
    if (!seen) sessionStorage.setItem('va-visited', '1');
  } catch {}
  root.setAttribute('data-va-visit', seen ? 'repeat' : 'first');
  if (seen) root.setAttribute('data-va-visited', '');
})();
