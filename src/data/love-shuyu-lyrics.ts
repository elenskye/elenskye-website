// 站主提供的 /love-shuyu/ 第一幕歌词。
// 每次显现只取原文或译文中的一个完整版本；这里不改写、不补写文案。

export interface LoveShuyuLyric {
  original: readonly string[];
  translation?: readonly string[];
}

export const loveShuyuLongLyrics = [
  {
    original: [
      '幾重にも 重ねた 線と 油と 思いと いのち',
      '生まれかけた 僕らの絆 消さないように',
      '赤と青 その手を 繋いだなら',
      'どんな色だって つくれるはずなんだよ',
      '赤と青 こころを 開いたなら',
      '僕たちの ほんとうを 描き続けてよ',
    ],
    translation: [
      '层层重叠的线条、油彩、思绪与生命',
      '只为了不要让我们的羁绊消散',
      '红与蓝 若是牵起那双手',
      '那无论是什么颜色 都能绘制出来',
      '红与蓝 若是敞开心扉',
      '就继续描绘我们的真实吧',
    ],
  },
  {
    original: [
      '傷つき方さえ問われる時代',
      'それでもあなたには 笑っててほしいの',
      'これを超えるような願いが',
      'どこにも見当たらない',
    ],
    translation: [
      '这是一个 连如何受伤 都会被问到的时代，',
      '即便如此我仍旧希望 你能一直面带笑容',
      '超越这份心愿的祈望',
      '我再也寻觅不到',
    ],
  },
  {
    original: [
      'why do you 愛しているんだ',
      'hold on, hold on したって',
      'くだんない、くだんない夢って',
      'no doubt, no doubt',
      '嘘じゃない',
    ],
    translation: [
      '你为什么爱着我呢',
      '说着坚持坚持下去的话语',
      '这令人厌倦，无聊的梦境',
      '毫无疑问，毫无疑问的是',
      '这并非谎言',
    ],
  },
  {
    original: [
      '守ってあげるから',
      'どこまでも側にいようよ',
      '雨の日も',
      '晴れの日も',
      '風の日も',
      '曇りの日も',
      '晴れの日も',
    ],
    translation: ['我会保护你', '不管到哪里我都在身边', '雨天', '晴天', '风天', '阴天', '晴天'],
  },
  {
    original: [
      '僕らが歩いた',
      '摩訶不思議な物語を',
      'どんな言葉で語るだろう',
      'どんな挿絵が似合うだろう',
      '世界でたった一つだけの',
      '後書きに僕らの愛を捧げよう',
    ],
    translation: [
      '我们经历的',
      '不可思议的故事',
      '应以何种言语描述呢',
      '又当是哪幅插画相配呢',
      '为这世界独一无二的',
      '后记献上我们的爱意吧',
    ],
  },
  {
    original: [
      '私の祈りをあなたにあげたい',
      '私の痛みもあなたにあげたい',
      '海も裂ける夜をあなたにあげたい',
      'それを焼く光をあなたにあげたい',
      '私の命をあなたにあげたい',
    ],
    translation: [
      '愿将我的祈愿献予你',
      '愿将我的痛楚也献予你',
      '愿将撕裂大海的夜献予你',
      '愿将灼烧暗夜的光献予你',
      '愿将我的生命献予你',
    ],
  },
  {
    original: [
      'この蒼くて広い世界に',
      '無数に散らばった中から',
      '別々に二人選んだ糸を',
      'お互いたぐり寄せ合ったんだ',
    ],
    translation: [
      '这个湛蓝而宽广的世界',
      '从无数零散的线中',
      '两个人分别选择出自己的线',
      '相互接近交织在一起',
    ],
  },
  {
    original: [
      '何万回の夜を過ごしたって忘れぬような',
      '愛してるを並べるから',
      '何万回の夜を過ごしたって忘れぬような',
      '最高のフルコースを頂戴',
    ],
    translation: [
      '不管夜幕降临几万回，我都不想忘记',
      '我会说出“我爱你”',
      '不管夜幕降临几万回，我都不想忘记',
      '请给我最顶级的高级餐点',
    ],
  },
] as const satisfies readonly LoveShuyuLyric[];

export const loveShuyuShortLyrics = [
  {
    original: ['夏が終わっていく', 'あなたを愛している'],
    translation: ['夏日正落下帷幕', '而我深爱着你'],
  },
  {
    original: [
      '俺は0でも1でも2でも3でも4でも5でも6でもない',
      'だから　ほんとはお前といるのは8でも9でも10でもない',
    ],
    translation: [
      '我不是0不是1不是2不是3不是4不是5不是6我什么都不是',
      '所以 能和你在一起真的是8是9是10分不得了的事',
    ],
  },
  {
    original: ['会いたいわ', '今すぐ会いたいわ'],
    translation: ['我想见你', '现在马上就想见面'],
  },
  { original: ['I will die for you, and I will live for you'] },
  { original: ['You are everything I’ll ever need', 'I never wanted nothing more than this'] },
  { original: ['As the train stops', 'Please don’t get off here'] },
  {
    original: ['幾重にも 重ねた 線と 油と 思いと いのち', '生まれかけた 僕らの絆 消さないように'],
    translation: ['层层重叠的线条、油彩、思绪与生命', '只为了不要让我们的羁绊消散'],
  },
  {
    original: ['愛にできることはまだあるよ', '僕にできることはまだあるよ'],
    translation: ['还有爱能做到的很多事情呢', '还有我能做到的很多事情呢'],
  },
  {
    original: ['Andiyan lang ang mga tala, andiyan lang ang mga tala', 'Saan mang sulok ng mundo'],
    translation: ['星辉永在，星辉永在', '世界的每一个角落，仍璀璨如故'],
  },
  {
    original: ['指の間 沿わせて触れる 優しさ', '君の前 僕だけで埋まる 視界にハグ'],
    translation: ['你沿着我的指间抚摸 如此温柔', '我的样子填满了你的眼前 拥抱你的视野'],
  },
  {
    original: ['私の命をあなたにあげたい'],
    translation: ['愿将我的生命献予你'],
  },
  { original: ['Anywhere with you feels right', 'Anywhere with you feels like', 'Paris in the rain'] },
] as const satisfies readonly LoveShuyuLyric[];
