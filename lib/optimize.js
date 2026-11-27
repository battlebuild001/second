// 여러 상품을 여러 쇼핑몰에서 나눠 살 때 총액(상품가 + 배송비 - 쿠폰 - 적립금)이 가장 싼 조합 찾기.
//
// items: [{ id, name, qty, offers: [{ shopId, price, points, url }] }]   (구매 가능한 것만)
// shops: { [shopId]: { name, fee, freeOver, coupon } }   fee/freeOver 가 null 이면 배송비 0 으로 계산
// opts:  { useCoupon, countPoints }

function shopCost(shop, lines, opts) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const fee = shop.fee == null ? 0 : shop.freeOver != null && subtotal >= shop.freeOver ? 0 : shop.fee;
  const coupon = opts.useCoupon && shop.coupon ? Math.min(shop.coupon, subtotal) : 0;
  const points = opts.countPoints ? lines.reduce((s, l) => s + (l.points || 0) * l.qty, 0) : 0;
  return { subtotal, fee, coupon, points, total: subtotal + fee - coupon - points };
}

function evaluate(assign, items, shops, opts) {
  const byShop = {};
  items.forEach((it, i) => {
    const o = it.offers.find((x) => x.shopId === assign[i]);
    (byShop[assign[i]] ||= []).push({ item: it, qty: it.qty, price: o.price, points: o.points, url: o.url });
  });
  let total = 0;
  const baskets = Object.entries(byShop).map(([shopId, lines]) => {
    const c = shopCost(shops[shopId], lines, opts);
    total += c.total;
    return { shopId, shop: shops[shopId].name, lines, ...c };
  });
  baskets.sort((a, b) => b.subtotal - a.subtotal);
  return { total, baskets };
}

// 쇼핑몰 묶음(부분집합)마다: 각 상품을 그 안의 가장 싼 곳에 넣고 → 하나씩 옮겨 보며 더 싸지면 옮김
export function optimize(items, shops, opts = {}) {
  const buyable = items.filter((it) => it.qty > 0 && it.offers.length);
  const missing = items.filter((it) => it.qty > 0 && !it.offers.length);
  if (!buyable.length) return { best: null, single: null, naive: null, missing };

  const shopIds = [...new Set(buyable.flatMap((it) => it.offers.map((o) => o.shopId)))];
  let best = null;
  for (let mask = 1; mask < 1 << shopIds.length; mask++) {
    const allowed = shopIds.filter((_, i) => mask & (1 << i));
    if (!buyable.every((it) => it.offers.some((o) => allowed.includes(o.shopId)))) continue;
    const assign = buyable.map(
      (it) => it.offers.filter((o) => allowed.includes(o.shopId)).sort((a, b) => a.price - b.price)[0].shopId,
    );
    let cur = evaluate(assign, buyable, shops, opts);
    for (let improved = true; improved; ) {
      improved = false;
      buyable.forEach((it, i) => {
        for (const o of it.offers) {
          if (!allowed.includes(o.shopId) || o.shopId === assign[i]) continue;
          const prev = assign[i];
          assign[i] = o.shopId;
          const next = evaluate(assign, buyable, shops, opts);
          if (next.total < cur.total) {
            cur = next;
            improved = true;
          } else assign[i] = prev;
        }
      });
    }
    if (!best || cur.total < best.total) best = cur;
  }

  // 비교 기준 1: 한 곳에서 다 사기 (가능한 곳 중 가장 싼 곳)
  let single = null;
  for (const id of shopIds) {
    if (!buyable.every((it) => it.offers.some((o) => o.shopId === id))) continue;
    const r = evaluate(buyable.map(() => id), buyable, shops, opts);
    if (!single || r.total < single.total) single = r;
  }
  // 비교 기준 2: 상품마다 제일 싼 곳에서 따로 사기 (배송비 신경 안 쓸 때)
  const naive = evaluate(
    buyable.map((it) => [...it.offers].sort((a, b) => a.price - b.price)[0].shopId),
    buyable,
    shops,
    opts,
  );
  return { best, single, naive, missing };
}
