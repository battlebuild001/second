// 가격을 가져올 쇼핑몰 목록 (모두 카페24 기반 쇼핑몰)
export const SHOPS = [
  { id: 'funforge', name: '펀포지', base: 'https://funforge.co.kr' },
  { id: 'orctown', name: '오크타운', base: 'https://www.orctown-store.com' },
  { id: 'dicehold', name: '다이스홀드', base: 'https://dicehold.com' },
  { id: 'camelot', name: '카멜롯 하비', base: 'https://camelothobby.com' },
  { id: 'hobbycafeace', name: '하비카페 에이스', base: 'https://hobbycafeace.cafe24.com' },
];

const UA = 'Mozilla/5.0 (compatible; MiniaturePriceCompare/1.0)';
const PRICE_LABELS = ['판매가', '할인판매가', '최적할인가'];
// 긴 라벨이 먼저 와야 '할인판매가'가 '판매가'로 잘못 잡히지 않음
const KNOWN_LABELS = [
  '상품요약정보', '상품간략설명', '최적할인가', '할인판매가', '소비자가', '판매가',
  '상품명', '적립금', '할인 기간', '제조사', '브랜드', '상품코드', '원산지',
];

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function toText(html) {
  return decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(s) {
  const digits = (s || '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}

// "상품명 : A 판매가 : 72,000원" 같은 글자를 {상품명: 'A', 판매가: '72,000원'} 으로 나눔
function parseLabels(text) {
  const out = {};
  const re = new RegExp(`(${KNOWN_LABELS.join('|')}) : `, 'g');
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ label: m[1], start: m.index, end: re.lastIndex });
  marks.forEach((mk, i) => {
    const valueEnd = i + 1 < marks.length ? marks[i + 1].start : text.length;
    if (!(mk.label in out)) out[mk.label] = text.slice(mk.end, valueEnd).trim();
  });
  return { labels: out, firstLabelAt: marks.length ? marks[0].start : text.length };
}

export function parseSearchPage(html, shop) {
  const items = [];
  const blocks = html.split(/<li id="anchorBoxId_\d+"/).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/ul>\s*<\/div>/)[0];
    const hrefMatch = block.match(/href="([^"]*\/product\/[^"]+)"/);
    if (!hrefMatch) continue;
    const text = toText(block);
    const { labels, firstLabelAt } = parseLabels(text);

    let name = labels['상품명'];
    if (!name) {
      // 라벨 없이 이름만 있는 쇼핑몰: 상품 링크 중 글자가 있는 첫 번째 것
      const anchors = [...block.matchAll(/<a [^>]*href="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
      name = anchors.map((a) => toText(a[1])).find((t) => t.length > 1);
    }
    if (!name) name = text.slice(0, firstLabelAt).replace(/^(\d+ )?(WISH ADD OPTION )?/, '').trim();
    name = name.replace(/\s*단독구매상품$/, '').trim();
    if (!name) continue;

    const prices = PRICE_LABELS.map((l) => toNumber(labels[l])).filter((n) => n && n > 0);
    const price = prices.length ? Math.min(...prices) : null;
    const listPrice = toNumber(labels['소비자가']);
    const soldOut = /alt="품절"|soldout|sellout|sold_out/i.test(block);

    // 같은 상품이 여러 분류에 중복으로 나오는 경우 하나만
    if (items.some((it) => it.name === name && it.price === price)) continue;

    items.push({
      shop: shop.name,
      shopId: shop.id,
      name,
      subtitle: labels['상품요약정보'] || labels['상품간략설명'] || '',
      price,
      priceNote: price ? '' : labels['판매가'] || '가격 정보 없음',
      listPrice: listPrice && listPrice !== price ? listPrice : null,
      soldOut,
      url: new URL(decode(hrefMatch[1]), shop.base).href,
    });
  }
  return items;
}

async function searchShop(shop, keyword) {
  const url = `${shop.base}/product/search.html?keyword=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseSearchPage(await res.text(), shop);
}

export async function searchAll(keyword) {
  const results = await Promise.allSettled(SHOPS.map((s) => searchShop(s, keyword)));
  const items = [];
  const status = [];
  results.forEach((r, i) => {
    const shop = SHOPS[i];
    if (r.status === 'fulfilled') {
      items.push(...r.value);
      status.push({ shop: shop.name, ok: true, count: r.value.length });
    } else {
      status.push({ shop: shop.name, ok: false, count: 0, error: String(r.reason?.message || r.reason) });
    }
  });
  // 정렬: 구매 가능 + 가격 있음 → 가격 낮은 순, 품절/가격 없음은 뒤로
  items.sort((a, b) => {
    const ra = a.price && !a.soldOut ? 0 : a.price ? 1 : 2;
    const rb = b.price && !b.soldOut ? 0 : b.price ? 1 : 2;
    return ra - rb || (a.price ?? Infinity) - (b.price ?? Infinity);
  });
  return { keyword, groups: groupProducts(items), status };
}

// 쇼핑몰마다 조금씩 다른 상품명을 같은 상품으로 묶기 위한 기준 글자
// 예) "SPACE MARINES: INTERCESSOR SQUAD", "Space Marines Intercessors" → "intercessor"
const IGNORE_WORDS = new Set(['space', 'marine', 'squad', 'warhammer', '40k', '40000', 'the', 'and', 'with', 'of']);
export function productKey(name) {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .filter((w) => !IGNORE_WORDS.has(w));
  return words.length ? [...new Set(words)].sort().join(' ') : name.toLowerCase().trim();
}

const rank = (it) => (it.price && !it.soldOut ? 0 : it.price ? 1 : 2);

function groupProducts(items) {
  const map = new Map();
  for (const it of items) {
    const key = productKey(it.name);
    if (!map.has(key)) map.set(key, []);
    const offers = map.get(key);
    // 한 쇼핑몰에 같은 상품이 여러 개면 더 좋은 조건(구매 가능·저렴) 하나만
    const same = offers.findIndex((o) => o.shopId === it.shopId);
    if (same === -1) offers.push(it);
    else if (rank(it) < rank(offers[same]) || (rank(it) === rank(offers[same]) && it.price < offers[same].price)) offers[same] = it;
  }
  const groups = [...map.values()].map((offers) => {
    offers.sort((a, b) => rank(a) - rank(b) || (a.price ?? Infinity) - (b.price ?? Infinity));
    // 대표 이름: 한국어 요약이 있으면 함께, 이름은 가장 짧은 것
    const name = offers.map((o) => o.name).sort((a, b) => a.length - b.length)[0];
    const subtitle = offers.find((o) => o.subtitle)?.subtitle || '';
    const best = offers.find((o) => o.price && !o.soldOut);
    return { name, subtitle, lowest: best ? best.price : null, offers };
  });
  // 여러 쇼핑몰에서 파는 상품(비교 가치가 큰 것) 먼저, 그다음 최저가 낮은 순
  groups.sort((a, b) => b.offers.length - a.offers.length || (a.lowest ?? Infinity) - (b.lowest ?? Infinity));
  return groups;
}
