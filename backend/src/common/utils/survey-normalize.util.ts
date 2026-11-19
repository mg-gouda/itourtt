// Folding the free-text answers of the guest survey into countable values (Guest Analytics).
// Reps type nationality and stay length by hand: "Germany" / "German" / "germen", "7" / "7 days" /
// "1 weak". These helpers make them comparable; the stored answers are never changed.

/** Country (or common spelling) → nationality adjective. */
const COUNTRY_TO_NATIONALITY: Record<string, string> = {
  egypt: 'Egyptian', germany: 'German', france: 'French', russia: 'Russian', 'russian federation': 'Russian',
  turkey: 'Turkish', turkiye: 'Turkish', italy: 'Italian', spain: 'Spanish', portugal: 'Portuguese',
  uk: 'British', 'united kingdom': 'British', england: 'British', english: 'British', britain: 'British', scotland: 'British',
  ireland: 'Irish', usa: 'American', us: 'American', america: 'American', 'united states': 'American', canada: 'Canadian',
  poland: 'Polish', 'czech republic': 'Czech', czechia: 'Czech', slovakia: 'Slovak', hungary: 'Hungarian',
  austria: 'Austrian', switzerland: 'Swiss', belgium: 'Belgian', netherlands: 'Dutch', holland: 'Dutch',
  denmark: 'Danish', sweden: 'Swedish', norway: 'Norwegian', finland: 'Finnish', ukraine: 'Ukrainian',
  belarus: 'Belarusian', lithuania: 'Lithuanian', latvia: 'Latvian', estonia: 'Estonian', romania: 'Romanian',
  bulgaria: 'Bulgarian', serbia: 'Serbian', croatia: 'Croatian', slovenia: 'Slovenian', albania: 'Albanian',
  greece: 'Greek', moldova: 'Moldovan', georgia: 'Georgian', armenia: 'Armenian', azerbaijan: 'Azerbaijani',
  kazakhstan: 'Kazakh', uzbekistan: 'Uzbek', china: 'Chinese', japan: 'Japanese', korea: 'Korean', india: 'Indian',
  saudi: 'Saudi', 'saudi arabia': 'Saudi', ksa: 'Saudi', kuwait: 'Kuwaiti', uae: 'Emirati', emirates: 'Emirati',
  qatar: 'Qatari', bahrain: 'Bahraini', oman: 'Omani', jordan: 'Jordanian', lebanon: 'Lebanese', syria: 'Syrian',
  iraq: 'Iraqi', palestine: 'Palestinian', israel: 'Israeli', iran: 'Iranian', libya: 'Libyan', sudan: 'Sudanese',
  algeria: 'Algerian', morocco: 'Moroccan', tunisia: 'Tunisian', brazil: 'Brazilian', mexico: 'Mexican',
  argentina: 'Argentine', australia: 'Australian', 'south africa': 'South African', africa: 'African',
  nigeria: 'Nigerian', pakistan: 'Pakistani', bangladesh: 'Bangladeshi', arab: 'Arab', arabic: 'Arab',
  'united arab emirates': 'Emirati', 'new zealand': 'New Zealander',
  // spellings seen in the surveys
  rominya: 'Romanian', romanya: 'Romanian', arminya: 'Armenian', kweit: 'Kuwaiti', frinsh: 'French',
  swissland: 'Swiss', ostrich: 'Austrian', paris: 'French', bulgim: 'Belgian', saudia: 'Saudi',
  'باكستان': 'Pakistani', 'مصر': 'Egyptian', 'مصري': 'Egyptian', 'السعودية': 'Saudi', 'الكويت': 'Kuwaiti',
};
const NATIONALITIES = [...new Set(Object.values(COUNTRY_TO_NATIONALITY))];

function similarity(a: string, b: string): number {
  // Levenshtein ratio
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}

/** "germany" / "German " / "Germen" → "German"; unknown values come back title-cased. */
export function normalizeNationality(raw: string | null | undefined): string {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Not given';
  if (COUNTRY_TO_NATIONALITY[t]) return COUNTRY_TO_NATIONALITY[t]; // Arabic script
  const k = t.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const known = (q: string) => COUNTRY_TO_NATIONALITY[q] ?? NATIONALITIES.find((x) => x.toLowerCase() === q) ?? null;
  const fuzzy = (q: string) => {
    let best = '';
    let score = 0;
    for (const cand of [...NATIONALITIES, ...Object.keys(COUNTRY_TO_NATIONALITY)]) {
      const c = cand.toLowerCase();
      // same first letter and similar length — "African" must not become "American"
      if (!q || c[0] !== q[0] || Math.abs(c.length - q.length) > 2) continue;
      const s = similarity(q, c);
      if (s > score) {
        score = s;
        best = cand;
      }
    }
    return score >= 0.75 ? COUNTRY_TO_NATIONALITY[best.toLowerCase()] ?? best : null;
  };
  const whole = known(k) ?? fuzzy(k);
  if (whole) return whole;
  // "Egyptian but they live in Switzerland" → the first word
  const first = k.split(' ')[0];
  if (first && first !== k) {
    const f = known(first) ?? fuzzy(first);
    if (f) return f;
  }
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "7", "7 days", "1 weak", "2 weeks", "10 nights" → days, or null. */
const NUMBER_WORDS: Record<string, string> = { one: '1', a: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };

export function parseStayDays(raw: string | null | undefined): number | null {
  // "one week", "two weeks", "a month" → digits first
  const t = (raw ?? '').toLowerCase().replace(/\b(one|a|two|three|four|five|six|seven|eight|nine|ten)\b(?=\s*(w|d|n|m))/g, (w) => NUMBER_WORDS[w]);
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const days = /w(ee|ea)?k|wk/.test(t) ? n * 7 : /month/.test(t) ? n * 30 : n;
  return days > 120 ? null : Math.round(days);
}

/** Stay buckets used by the analytics. */
export function stayBucket(days: number | null): string {
  if (days === null) return 'Not given';
  if (days <= 3) return '1–3 days';
  if (days <= 6) return '4–6 days';
  if (days === 7) return '7 days';
  if (days <= 13) return '8–13 days';
  if (days === 14) return '14 days';
  return '15+ days';
}

const STOPWORDS = new Set(
  'the a an and or but to of in on at for with from by is are was were be been very so it its this that we our us i my me you your they them he she his her as not no all any good nice ok okay thank thanks thankyou everything also just more most much there here have has had do did done will would can could hotel trip transfer transfers rep driver guest guests service'.split(' '),
);

/** Most frequent meaningful words in the comments (English; Arabic words kept as typed). */
export function topWords(comments: string[], limit = 25): { word: string; count: number }[] {
  const freq = new Map<string, number>();
  for (const c of comments) {
    const seen = new Set<string>();
    for (const w of c.toLowerCase().split(/[^\p{L}]+/u)) {
      if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) continue;
      seen.add(w);
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word, count]) => ({ word, count }));
}
