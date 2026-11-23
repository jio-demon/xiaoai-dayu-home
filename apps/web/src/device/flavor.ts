/** 触屏彩蛋台词：点房间物件时大肥鱼的随口反应（缓存随机，不重复上一条）。 */
export const FLAVOR: Record<string, string[]> = {
  character: [
    '嘿嘿，摸头舒服吧，尾巴都摇起来了。',
    '呜哇，痒痒的！要不要一起潜一会儿？',
    '今天也辛苦啦，给你充点鲸鱼能量。',
    '再摸就要收小鱼干当手续费了哦。',
  ],
  monitor: [
    '屏幕里是我的鲸鱼朋友，它说想你了。',
    '别盯太久屏幕啦，眼睛会累的。',
    '这张壁纸是我挑的，好看吧？',
  ],
  plushie: [
    '那是小鲸玩偶，睡觉抱着它特别安心。',
    '嘘，小鲸在睡觉，我们小声一点。',
    '它和我长得像吗？我觉得它更圆一点。',
  ],
  radio: [
    '收音机里在放海浪的声音，要听一会儿吗？',
    '这台老收音机只能收到鲸鱼频道哦。',
    '滴——收到一条来自深海的祝福。',
  ],
  window: [
    '窗外的天空和真实世界是同步的哦，看看现在是什么颜色？',
    '这扇窗连着外面的世界，下雨下雪都看得见。',
    '等天晴了，我们一起去看看海吧。',
  ],
  window_rain: [
    '外面在下雨呢，屋里暖暖的，正好聊天。',
    '雨点敲窗户的声音，像不像鼓掌？',
    '下雨天最适合窝在家里了，你也别出门啦。',
  ],
  window_snow: [
    '哇，外面下雪了！窗台都白了一点点。',
    '雪花飘得好慢呀，像海里的小水母。',
    '下雪天要多穿点，别冻成小冰鱼。',
  ],
  window_night: [
    '外面的城市亮灯了，一颗一颗像浮游生物。',
    '夜深了，窗外好安静，屋里暖暖的。',
    '看，月亮出来值班了，我也在值班哦。',
  ],
  window_clear: [
    '今天天气不错，阳光晒进来暖洋洋的。',
    '窗外天蓝蓝的，适合浮出水面换气。',
    '这样的天气，好想和你出去散步呀。',
  ],
  bed: [
    '这是我的床，被子有海盐的味道。',
    '困了吗？困了就靠一会儿，我守着你。',
    '床头的鲸鱼玩偶是我的值班保安。',
  ],
  lamp: [
    '暖黄的灯最舒服了，像浮在水面晒太阳。',
    '灯给你留着，晚回来也不怕黑。',
  ],
  rug: [
    '鲸鱼地毯软软的，踩上去像踩在云上。',
    '我平时就坐在这块地毯上发呆。',
  ],
  plant: [
    '这盆绿植叫小海草，很好养活的。',
    '小海草今天也长高了一点点哦。',
  ],
};

const last = new Map<string, number>();
export function pickFlavor(name: string, ctx?: { weather?: string; night?: boolean }): string {
  let key = name;
  if (name === 'window' && ctx) {
    if (ctx.weather === 'rain' || ctx.weather === 'drizzle' || ctx.weather === 'thunder') key = 'window_rain';
    else if (ctx.weather === 'snow') key = 'window_snow';
    else if (ctx.night) key = 'window_night';
    else if (ctx.weather === 'clear') key = 'window_clear';
  }
  const lines = FLAVOR[key] ?? FLAVOR[name] ?? FLAVOR.character;
  const prev = last.get(key) ?? -1;
  let i = Math.floor(Math.random() * lines.length);
  if (lines.length > 1 && i === prev) i = (i + 1) % lines.length;
  last.set(key, i);
  return lines[i];
}
