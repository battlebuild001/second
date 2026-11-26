import { searchAll } from '../lib/shops.js';

// 검색 요청 처리: /api/search?q=검색어
export default async function handler(req, res) {
  const q = new URL(req.url, 'http://localhost').searchParams.get('q')?.trim() || '';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (q.length < 2 || q.length > 60) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: '검색어는 2~60자로 입력해 주세요.' }));
    return;
  }
  const data = await searchAll(q);
  // 같은 검색어는 10분 동안 저장해 두었다가 재사용 (쇼핑몰 부담 줄이기)
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
  res.end(JSON.stringify(data));
}
