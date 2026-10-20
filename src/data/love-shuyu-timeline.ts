// Phase 18-3 时间线数据。
//
// 站主填写区：`place`、`body`、`alt` 全部由站主给定，Agent 不代拟内容。
// 日期与顺序已由站主确认，不要擅自改动。
//
// 规则：
// - `start` / `rangeStart` / `end` 都是北京时间的 `YYYY-MM-DD`；单日节点省略 `end`。
// - `start` 有两个身份：节点星旁显示的那个日期，**同时也是 `timeline.ts` 里
//   `milestoneByStart` 的键**。想改展开层区间而不动星旁日期时，加 `rangeStart`，
//   千万不要去改 `start`——那会顺手把里程碑样式一起弄丢。
// - `photo` 指向 `public/love-shuyu/photos/` 下的文件，单张 ≤ 1.5 MB；展开层横向永远铺满，
//   只有竖图自然高度超过高度上限时才等比裁掉纵向多余部分（见 `DESIGN.md` §8）。

export interface TimelineNode {
  /** 稳定 ID，用于 DOM id 与照片文件名，改动会断掉照片引用。 */
  id: string;
  /** 节点星旁显示的日期，北京时间 YYYY-MM-DD；也是里程碑样式的键。 */
  start: string;
  /** 展开层区间的真实起点；缺省等于 `start`。只在两者需要不一致时才写。 */
  rangeStart?: string;
  /** 结束日；单日节点留空。 */
  end?: string;
  /** 地点。站主填写。 */
  place: string;
  /** 一段文字。站主填写。 */
  body: string;
  /** 相对 public 的照片路径。 */
  photo: string;
  /** 图片替代文本。站主填写。 */
  alt: string;
}

const realPhotoIds = new Set(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);

// 三段文字都是必填：漏写会在这里编译报错，而不是把占位文案带上线。
type TimelineSeed = Omit<TimelineNode, 'photo'>;

const seeds: TimelineSeed[] = [
  { id: '01', start: '2025-08-10', place: '上海', alt: '初次相遇，一起去动物园玩', body: '和你相遇想必是生命中最奇妙的一天，刚刚好的两个人，刚刚好的站位，刚刚好的行程，超级无敌好的爱情' },
  // 星旁保持告白当天，展开层给出这次见面的完整区间。
  { id: '02', start: '2025-10-03', rangeStart: '2025-10-02', end: '2025-10-08', place: '重庆', alt: '告白之夜', body: '互相试探、互相装装的两个人，“我喜欢你”在见面前就欲言又止' },
  { id: '03', start: '2025-11-07', end: '2025-11-09', place: '北京', alt: '周末共进西餐', body: '我们的第一个秋天，第一次来你的学校，铺满地的银杏叶' },
  { id: '04', start: '2025-12-31', end: '2026-01-04', place: '北京', alt: '冬夜开心的见面', body: '我们第一次跨年～好冷！但是好开心！' },
  { id: '05', start: '2026-01-17', end: '2026-01-22', place: '重庆', alt: '给彼此戴上戒指', body: '嘻嘻～互相戴上戒指，习惯戴着戒指' },
  { id: '06', start: '2026-02-03', end: '2026-02-10', place: '成都', alt: '成都之旅偶遇的猫咖', body: '每年冬天都想和你一起泡温泉！' },
  { id: '07', start: '2026-02-25', end: '2026-03-01', place: '重庆', alt: '重庆文创街散步', body: '什么时候再去重庆呢？烤鱼、火锅、尖叫鸡、可爱文创……' },
  { id: '08', start: '2026-04-01', end: '2026-04-06', place: '北京', alt: '一起去看初春的花', body: '一起去看初春的花花～我会好好修炼拍照技术的、、、' },
  { id: '09', start: '2026-04-27', end: '2026-05-07', place: '北京&天津', alt: '两个人一起打卡天津之眼', body: '相比之下，天津说不定是个不错的地方' },
  { id: '10', start: '2026-06-24', end: '2026-06-28', place: '北京&重庆', alt: '酒店里两份糯米饭', body: '只要能见到你，任何机会都不放过' },
  { id: '11', start: '2026-07-27', end: '2026-08-11', place: '香港&新加坡', alt: '海洋馆约会', body: '我们终于在海洋馆约会啦～～～也在海边看了日落，哪天再去看日出叭' },
];

export const timelineNodes: TimelineNode[] = seeds.map((node) => ({
  ...node,
  photo: `/love-shuyu/photos/${node.id}.${realPhotoIds.has(node.id) ? 'jpg' : 'svg'}`,
}));

/** `2026-02-03` → `2026.02.03`，节点旁的常态显示。 */
export const formatStart = (value: string) => value.replaceAll('-', '.');

/**
 * 展开层里的完整区间，起点取 `rangeStart ?? start`。单日节点只显示一个日期；
 * 跨月区间保留完整月份，同月区间省略重复的年月，例如 `2026.02.03 – 02.10`。
 */
export const formatRange = (node: TimelineNode) => {
  const from = node.rangeStart ?? node.start;
  const start = formatStart(from);
  if (!node.end) return start;
  const sameMonth = from.slice(0, 7) === node.end.slice(0, 7);
  const end = sameMonth ? node.end.slice(8) : formatStart(node.end).slice(5);
  return `${start} – ${end}`;
};
