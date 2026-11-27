// 공식 워해머 앱(40K / 에이지 오브 지그마)에서 "내보내기"한 로스터 글을 부대 목록으로 바꿈.
// 한 줄에 하나씩 적은 목록("2x Intercessor Squad", "Hive Tyrant x2", "Hellblasters")도 받음.

const SECTION = /^[A-Z][A-Z &'\-]+$/; // CHARACTERS, BATTLELINE, OTHER DATASHEETS ...
const UNIT_WITH_POINTS = /^(.+?)\s*\[?\(?\s*(\d+)\s*(?:points?|pts?)?\s*\)?\]?\s*$/i;
const BULLET = /^[\s•◦\-\*·+]+/;
const MODEL_COUNT = /^[\s•◦\-\*·+]*(\d+)\s*x\s+(.+)$/i;
const SKIP = /^(exported with|created with|warlord|enhancement|\+{2,}|={2,}|-{2,})/i;

function cleanName(s) {
  return s.replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim();
}

// 반환: [{ name, count, models }]  (같은 이름은 합침)
export function parseRoster(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const hasSections = lines.some((l) => SECTION.test(l.trim()) && l.trim().length > 3);
  const units = [];
  let inUnits = !hasSections; // 섹션 제목이 있는 형식은 첫 섹션 전(군대 이름·분견대)을 건너뜀
  let current = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t || SKIP.test(t)) continue;

    if (hasSections && SECTION.test(t) && t.length > 3) {
      inUnits = true;
      current = null;
      continue;
    }
    if (!inUnits) continue;

    const indented = /^\s/.test(line) || BULLET.test(line);
    if (indented) {
      // 부대 아래 모델 수: "• 9x Intercessor"  (무기 줄 "◦ 1x Bolt pistol" 은 더 깊게 들여써져 있어 제외)
      const depth = line.match(/^[\s]*/)[0].length;
      const m = t.match(MODEL_COUNT);
      if (current && m && depth <= 2 && /^[\s]*•/.test(line)) current.models += Number(m[1]);
      continue;
    }

    // 부대 줄
    let name = t;
    let count = 1;
    const pre = t.match(/^(\d+)\s*x\s+(.+)$/i); // "2x Intercessor Squad"
    const post = t.match(/^(.+?)\s+x\s*(\d+)$/i); // "Intercessor Squad x2"
    if (pre) [count, name] = [Number(pre[1]), pre[2]];
    else if (post) [name, count] = [post[1], Number(post[2])];
    const pts = name.match(UNIT_WITH_POINTS);
    if (pts && /\d/.test(name) && /(point|pts|\(|\[)/i.test(name)) name = pts[1];
    name = cleanName(name);
    if (!name || name.length < 2) continue;
    current = { name, count, models: 0 };
    units.push(current);
  }

  // 같은 부대는 합치기
  const merged = new Map();
  for (const u of units) {
    const k = u.name.toLowerCase();
    if (!merged.has(k)) merged.set(k, { ...u });
    else {
      const m = merged.get(k);
      m.count += u.count;
      m.models += u.models;
    }
  }
  return [...merged.values()];
}
