/**
 * F-2 耶路撒冷時間軸資料。
 *
 * 年代：負數＝主前（BC），正數＝主後（AD）；日期多為約數。
 * 可信度三級（與會幕資料一致）：
 *   text  經文明載：事件本身在和合本經文中有記載
 *   arch  傳統文獻：事件來自聖經以外的古代文獻、碑文或考古（約瑟夫、馬加比書、教會史等）
 *   infer 重建推測：學者依零星證據推測
 * 另外，畫面上的建築外觀（model）幾乎都屬於重建推測，卡片上另外標示。
 * 經文引文為和合本；說明文字是我們自己寫的。近代部分只描述建築外觀，用中立的文字。
 * 年表參照：《3D會幕與耶路撒冷聖殿》附錄「一頁看三座聖殿」「年表：從所羅門到公元70年」。
 */
export type Confidence = 'text' | 'arch' | 'infer'

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  text: '經文明載',
  arch: '傳統文獻',
  infer: '重建推測',
}

export interface Focus {
  /** 鏡頭注視點（平面座標） */
  x: number
  z: number
  /** 鏡頭距離（公尺） */
  dist: number
  /** 方位角（度）：0＝從東邊看過來、90＝從南邊、-90＝從北邊 */
  az: number
  /** 仰角（度） */
  el: number
}

export interface TimelineEvent {
  id: string
  year: number
  /** 顯示用年代 */
  date: string
  title: string
  era: string
  text: string
  refs: string
  quote?: { ref: string; text: string }
  confidence: Confidence
  /** 建築外觀的可信度與說明 */
  model: string
  focus: Focus
  /** 地圖上要特別標示的東西（例如希西家水道） */
  highlight?: 'tunnel' | 'golgotha'
}

export const EVENTS: TimelineEvent[] = [
  {
    id: 'david',
    year: -1000,
    date: '約主前 1000 年',
    title: '大衛的城',
    era: '聯合王國',
    text: '大衛從耶布斯人手中奪下錫安的保障，定都在這條夾在汲淪谷與泰羅邊谷之間的狹長山脊上。城很小，大約只有四、五公頃，靠近東坡下的基訓泉。北邊較高的山頂，就是後來建聖殿的摩利亞山。',
    refs: '撒下 5:6–9；代上 11:4–8',
    quote: { ref: '撒下 5:7', text: '然而大衛攻取錫安的保障，就是大衛的城。' },
    confidence: 'text',
    model: '城牆走向與房屋密度為重建推測；王宮位置參考考古發現的「階梯式石造結構」。',
    focus: { x: 30, z: 560, dist: 900, az: 25, el: 30 },
  },
  {
    id: 'solomon',
    year: -960,
    date: '約主前 960 年',
    title: '所羅門的聖殿與王宮',
    era: '第一聖殿時期',
    text: '所羅門在摩利亞山上建造耶和華的殿，殿長六十肘、寬二十肘、高三十肘，前面有廊，廊前立著雅斤和波阿斯兩根銅柱。王宮建在聖殿南邊，包括黎巴嫩林宮、柱廊、審判廊，城牆也往北延伸，把聖殿圍進城內。',
    refs: '王上 6–8；王上 7:1–12、15–22；代下 3:1',
    quote: { ref: '王上 6:2', text: '所羅門王為耶和華所建的殿，長六十肘，寬二十肘，高三十肘。' },
    confidence: 'text',
    model: '聖殿的長寬高照經文的肘數；平台、院子與王宮的配置是重建推測。',
    focus: { x: 0, z: 100, dist: 620, az: 20, el: 28 },
  },
  {
    id: 'hezekiah',
    year: -701,
    date: '約主前 701 年',
    title: '希西家的水道與西擴的城牆',
    era: '第一聖殿時期',
    text: '面對亞述的威脅，希西家把基訓泉的水從岩石中鑿出的水道引到城西的西羅亞池，又修築城牆，把已經住滿人的西山圍進城內。水道全長約 533 公尺，至今還能走過。',
    refs: '王下 20:20；代下 32:3–5、30；賽 22:9–11',
    quote: { ref: '王下 20:20', text: '希西家其餘的事和他的勇力，他怎樣挖池、挖溝、引水入城，都寫在猶大列王記上。' },
    confidence: 'text',
    model: '水道依考古測繪的大致走向；西山「寬牆」有部分遺跡，其餘走向是重建推測。',
    focus: { x: -250, z: 450, dist: 1300, az: 15, el: 38 },
    highlight: 'tunnel',
  },
  {
    id: 'babylon',
    year: -586,
    date: '主前 587／586 年',
    title: '巴比倫毀城',
    era: '被擄',
    text: '巴比倫軍圍城一年半後破城，護衛長尼布撒拉旦焚燒了耶和華的殿、王宮和城中的大房屋，並拆毀四圍的城牆。百姓被擄到巴比倫，第一聖殿時期結束。',
    refs: '王下 25:8–10；代下 36:17–19；耶 52:12–14；哀 1–5',
    quote: { ref: '王下 25:9', text: '用火焚燒耶和華的殿和王宮，又焚燒耶路撒冷的房屋，就是各大戶家的房屋。' },
    confidence: 'text',
    model: '城市被焚的過程為示意。考古在大衛城找到這一層的焚燒痕跡。',
    focus: { x: -100, z: 300, dist: 1200, az: 18, el: 32 },
  },
  {
    id: 'zerubbabel',
    year: -516,
    date: '主前 516／515 年',
    title: '所羅巴伯的聖殿',
    era: '第二聖殿時期',
    text: '居魯士准許被擄的人歸回。所羅巴伯和大祭司耶書亞在原來的地方先築壇、再立根基，經過中斷，終於在大利烏王第六年完工。見過舊殿的老人看見新殿的根基就大聲哭號。',
    refs: '拉 1:1–4；拉 3；拉 6:3、15；該 2:3',
    quote: { ref: '拉 6:15', text: '大利烏王第六年，亞達月初三日，這殿修成了。' },
    confidence: 'text',
    model: '聖經沒有記下這座殿的確切外觀；這裡用與所羅門殿相同的基本比例，較樸素，屬重建推測。',
    focus: { x: 0, z: -20, dist: 520, az: 30, el: 30 },
  },
  {
    id: 'nehemiah',
    year: -444,
    date: '約主前 445／444 年',
    title: '尼希米重修城牆',
    era: '第二聖殿時期',
    text: '尼希米夜間察看殘破的城牆後，帶領百姓分段修造，一手做工、一手拿兵器，五十二天完成。這時的城縮回大衛城和聖殿山，東牆改建在山脊較高處，西山仍然荒廢。',
    refs: '尼 2:11–20；尼 3–4；尼 6:15',
    quote: { ref: '尼 6:15', text: '以祿月二十五日，城牆修完了，共修了五十二天。' },
    confidence: 'text',
    model: '城牆範圍依尼希米記的門名與考古推測，屬重建推測。',
    focus: { x: 10, z: 380, dist: 1100, az: 22, el: 34 },
  },
  {
    id: 'maccabees',
    year: -164,
    date: '主前 164 年',
    title: '馬加比潔淨聖殿',
    era: '哈斯摩尼王朝',
    text: '安提阿哥四世玷污聖殿後，猶大．馬加比收復耶路撒冷，潔淨聖殿、重新獻壇，這就是修殿節（光明節）的由來。哈斯摩尼王朝之後再把城擴到西山，並在聖殿北邊建堡壘。',
    refs: '約 10:22；次經馬加比一書 4:36–59',
    quote: { ref: '約 10:22', text: '在耶路撒冷有修殿節，是冬天的時候。' },
    confidence: 'arch',
    model: '新約提到修殿節；事件經過記在次經馬加比書。城牆與堡壘的外觀為重建推測。',
    focus: { x: -200, z: 150, dist: 1300, az: 20, el: 34 },
  },
  {
    id: 'herod',
    year: -20,
    date: '約主前 20／19 年起',
    title: '希律重建聖殿',
    era: '第二聖殿時期（希律）',
    text: '大希律在位第十八年開始大規模重建聖殿，把聖殿山平台擴成約 488 × 300 公尺的梯形，四周有柱廊，南邊是高大的皇家柱廊，西北角是安東尼亞堡；城西有希律的王宮和三座高塔。工程在他死後仍在繼續。',
    refs: '約 2:20；可 13:1；路 21:5',
    quote: { ref: '約 2:20', text: '猶太人便說：「這殿是四十六年才造成的，你三日內就再建立起來嗎？」' },
    confidence: 'arch',
    model: '工程經過來自約瑟夫。平台尺寸依今日仍存的擋土牆；殿與院子的配置依米示拿與考古重建。',
    focus: { x: 0, z: -20, dist: 820, az: 12, el: 26 },
  },
  {
    id: 'jesus',
    year: 30,
    date: '約主後 30 年',
    title: '耶穌時代的耶路撒冷',
    era: '羅馬統治',
    text: '耶穌十二歲時在殿裡與教師問答；成年後在殿裡教導、潔淨聖殿，最後一週從橄欖山進城，在客西馬尼被捕，在城外的各各他被釘十字架。從橄欖山望過去，正是福音書描寫的這座城。',
    refs: '路 2:41–52；約 2:13–22；路 19:37–44；太 21–27；約 18–19',
    quote: { ref: '路 19:41', text: '耶穌快到耶路撒冷，看見城，就為它哀哭。' },
    confidence: 'text',
    model: '事件見於福音書；第二道牆的走向與各各他的位置依傳統（今日聖墓教堂），有爭議。',
    focus: { x: -150, z: -20, dist: 1500, az: 8, el: 22 },
    highlight: 'golgotha',
  },
  {
    id: 'rome70',
    year: 70,
    date: '主後 70 年',
    title: '聖殿被毀',
    era: '猶太戰爭',
    text: '猶太人起義後，羅馬將軍提多圍城，主後 70 年夏天攻破城牆，聖殿被焚，城市大半被拆毀。耶穌曾預言「將來在這裡沒有一塊石頭留在石頭上」。聖殿山的擋土牆留了下來，今日的西牆就是其中一段。',
    refs: '太 24:1–2；可 13:1–2；路 19:43–44；路 21:20–24',
    quote: { ref: '太 24:2', text: '耶穌對他們說：「你們不是看見這殿宇嗎？我實在告訴你們，將來在這裏沒有一塊石頭留在石頭上不被拆毀了。」' },
    confidence: 'arch',
    model: '預言記在福音書；毀城經過來自約瑟夫《猶太戰記》。焚毀過程為示意。',
    focus: { x: -50, z: 0, dist: 1000, az: 15, el: 28 },
  },
  {
    id: 'aelia',
    year: 135,
    date: '主後 130–135 年',
    title: '羅馬城市埃利亞加比多連',
    era: '羅馬帝國',
    text: '哈德良皇帝在廢墟上重建一座羅馬殖民城市，取名埃利亞加比多連。城北的大馬士革門有凱旋門，南北向的大道兩旁是柱廊，城中有廣場與神廟；巴柯巴起義失敗後，猶太人被禁止進城。',
    refs: '（聖經之後的歷史）',
    confidence: 'arch',
    model: '依卡西烏斯．狄奧等文獻與考古（馬德巴地圖、柱廊大道遺跡）重建；細節為推測。',
    focus: { x: -350, z: -150, dist: 1300, az: 10, el: 30 },
  },
  {
    id: 'byzantine',
    year: 335,
    date: '主後 335 年',
    title: '拜占庭的聖墓教堂',
    era: '拜占庭',
    text: '君士坦丁皇帝在傳統認定的耶穌受難與埋葬之處建造聖墓教堂，於主後 335 年祝聖：西邊是圓頂的復活堂，東邊是長方形的大殿。之後城中陸續建起許多教堂，城牆也再次圍到錫安山與大衛城。',
    refs: '（聖經之後的歷史；參約 19:41–42）',
    confidence: 'arch',
    model: '依優西比烏的記載與馬德巴地圖重建，外觀為推測。',
    focus: { x: -500, z: 50, dist: 900, az: 20, el: 30 },
  },
  {
    id: 'dome',
    year: 691,
    date: '主後 691／692 年',
    title: '圓頂清真寺',
    era: '伊斯蘭早期',
    text: '倭馬亞王朝的哈里發阿布杜勒．馬利克在聖殿山平台上建成八角形的圓頂建築，覆蓋平台中央的岩石；不久南端又建了阿克薩清真寺。平台從此成為今日所見的樣貌。',
    refs: '（聖經之後的歷史）',
    confidence: 'arch',
    model: '建築現存，外觀依今日樣貌簡化（今日的金色圓頂與外牆磁磚是後來多次整修的結果）。',
    focus: { x: 0, z: 0, dist: 520, az: 20, el: 26 },
  },
  {
    id: 'crusader',
    year: 1099,
    date: '主後 1099 年',
    title: '十字軍的耶路撒冷',
    era: '十字軍王國',
    text: '第一次十字軍攻下耶路撒冷，建立耶路撒冷王國，重建聖墓教堂成為今日大致的樣子。1187 年薩拉丁收復這座城。',
    refs: '（聖經之後的歷史）',
    confidence: 'arch',
    model: '聖墓教堂、城牆與城堡依現存建築與文獻簡化。',
    focus: { x: -350, z: -50, dist: 1100, az: 15, el: 30 },
  },
  {
    id: 'ottoman',
    year: 1538,
    date: '主後 1537–1541 年',
    title: '蘇萊曼的城牆',
    era: '鄂圖曼帝國',
    text: '鄂圖曼蘇丹蘇萊曼一世重建環繞舊城的城牆，周長約四公里，有雅法門、大馬士革門、獅子門、錫安門等城門，今天的舊城輪廓就是這道城牆。',
    refs: '（聖經之後的歷史）',
    confidence: 'arch',
    model: '城牆現存，依現況簡化（城垛、塔樓、城門）。',
    focus: { x: -320, z: 0, dist: 1500, az: 12, el: 30 },
  },
  {
    id: 'today',
    year: 2026,
    date: '今日',
    title: '今日的耶路撒冷',
    era: '現代',
    text: '舊城仍由鄂圖曼城牆圍繞，城外是現代的城市。聖殿山平台上有圓頂清真寺與阿克薩清真寺，西牆是希律平台留下的擋土牆；城內有聖墓教堂，橄欖山坡上有古老的墓地與橄欖園。',
    refs: '—',
    confidence: 'arch',
    model: '依現況簡化，只呈現建築外觀與城市範圍。',
    focus: { x: -250, z: 0, dist: 2000, az: 10, el: 24 },
  },
]

/** 時期（時間軸上方的色帶） */
export const ERAS: { name: string; from: number; to: number; color: string }[] = [
  { name: '第一聖殿', from: -1000, to: -586, color: '#c89b4a' },
  { name: '被擄', from: -586, to: -538, color: '#7a5a46' },
  { name: '第二聖殿', from: -538, to: 70, color: '#d9b86c' },
  { name: '羅馬', from: 70, to: 324, color: '#a5674a' },
  { name: '拜占庭', from: 324, to: 638, color: '#8a7aa8' },
  { name: '伊斯蘭', from: 638, to: 1099, color: '#4f8a7d' },
  { name: '十字軍', from: 1099, to: 1187, color: '#a34a3d' },
  { name: '中世紀', from: 1187, to: 1517, color: '#6b8a52' },
  { name: '鄂圖曼', from: 1517, to: 1917, color: '#4f7a9a' },
  { name: '現代', from: 1917, to: 2026, color: '#9aa3a8' },
]

/** 時間軸位置（0 … N-1，事件等距）→ 年 */
export function yearAt(pos: number) {
  const n = EVENTS.length
  const p = Math.max(0, Math.min(n - 1, pos))
  const i = Math.min(n - 2, Math.floor(p))
  const t = p - i
  return EVENTS[i].year + (EVENTS[i + 1].year - EVENTS[i].year) * t
}

/** 年 → 時間軸位置 */
export function posOfYear(year: number) {
  const n = EVENTS.length
  if (year <= EVENTS[0].year) return 0
  for (let i = 0; i < n - 1; i++) {
    const a = EVENTS[i].year
    const b = EVENTS[i + 1].year
    if (year <= b) return i + (year - a) / (b - a)
  }
  return n - 1
}

export function fmtYear(y: number) {
  const r = Math.round(y)
  if (r >= 2026) return '今日'
  return r < 0 ? `主前 ${-r} 年` : `主後 ${Math.max(1, r)} 年`
}
