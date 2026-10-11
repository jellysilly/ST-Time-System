// Календарная математика, форматирование и разбор времени.
// Время мира хранится одним числом — минутами от 01.01.1970 (пролептический григорианский
// календарь), поэтому любые сдвиги — это простое сложение, а годы вроде 1247 работают без Date.

export const DAY = 1440;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// days_from_civil / civil_from_days (Howard Hinnant)
export function daysFromCivil(y, m, d) {
    y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const mp = (m + 9) % 12;
    const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
}

export function civilFromDays(z) {
    z += 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    let y = yoe + era * 400;
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const m = mp < 10 ? mp + 3 : mp - 9;
    if (m <= 2) y += 1;
    return { y, m, d };
}

/** 0 — понедельник … 6 — воскресенье. 01.01.1970 был четвергом. */
export const weekdayOf = (day) => (((day + 3) % 7) + 7) % 7;
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
export const dayOf = (t) => Math.floor(t / DAY);
export const minutesOf = (t) => t - dayOf(t) * DAY;

export function makeTime(y, m, d, minutes = 0) {
    return daysFromCivil(y, m, d) * DAY + minutes;
}

export function split(t) {
    const day = dayOf(t);
    const minutes = t - day * DAY;
    const { y, m, d } = civilFromDays(day);
    return { day, y, m, d, minutes, wd: weekdayOf(day) };
}

export const LOCALES = {
    ru: {
        months: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
        monthsGen: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
        monthsShort: ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
        wdShort: ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'],
        wdLong: ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'],
        phases: { night: 'ночь', morning: 'утро', day: 'день', evening: 'вечер' },
    },
    en: {
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        monthsGen: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        wdShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        wdLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        phases: { night: 'night', morning: 'morning', day: 'afternoon', evening: 'evening' },
    },
};

const L = (lang) => LOCALES[lang] ?? LOCALES.ru;
const pad2 = (n) => String(n).padStart(2, '0');
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function fmtHM(minutes) {
    const m = ((Math.round(minutes) % DAY) + DAY) % DAY;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}

/** «18:00» → 1080. «24:00» допускается и означает полночь (0). */
export function parseHM(str) {
    const m = /^\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*$/.exec(String(str ?? ''));
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
    return (h * 60 + mi) % DAY;
}

export const fmtTime = (t) => fmtHM(minutesOf(t));

/** 14 октября 1247 г. / October 14, 1247 */
export function fmtDate(t, lang = 'ru') {
    const { y, m, d } = split(t);
    if (lang === 'en') return `${L(lang).months[m - 1]} ${d}, ${y}`;
    return `${d} ${L(lang).monthsGen[m - 1]} ${y} г.`;
}

/** 14 октября / October 14 */
export function fmtDayMonth(t, lang = 'ru') {
    const { m, d } = split(t);
    if (lang === 'en') return `${L(lang).months[m - 1]} ${d}`;
    return `${d} ${L(lang).monthsGen[m - 1]}`;
}

/** ср, 14 окт. / Wed, Oct 14 */
export function fmtDateShort(t, lang = 'ru') {
    const { m, d, wd } = split(t);
    if (lang === 'en') return `${L(lang).wdShort[wd]}, ${L(lang).monthsShort[m - 1]} ${d}`;
    return `${L(lang).wdShort[wd]}, ${d} ${L(lang).monthsShort[m - 1]}`;
}

export const fmtWeekday = (t, lang = 'ru') => L(lang).wdLong[split(t).wd];
export const fmtWeekdayShort = (t, lang = 'ru') => L(lang).wdShort[split(t).wd];

/** 14.10.1247 */
export function fmtNumDate(t) {
    const { y, m, d } = split(t);
    return `${pad2(d)}.${pad2(m)}.${y}`;
}

/** 14.10.1247 21:40 — формат тега [time: …] */
export const fmtStamp = (t) => `${fmtNumDate(t)} ${fmtTime(t)}`;

/** Среда, 14 октября 1247 г., 21:40 */
export const fmtFull = (t, lang = 'ru') => `${cap(fmtWeekday(t, lang))}, ${fmtDate(t, lang)}, ${fmtTime(t)}`;

export function phaseKey(minutes) {
    if (minutes < 300) return 'night';
    if (minutes < 660) return 'morning';
    if (minutes < 1020) return 'day';
    if (minutes < 1320) return 'evening';
    return 'night';
}

export const phaseName = (t, lang = 'ru') => L(lang).phases[phaseKey(minutesOf(t))];

/** +10 ч 50 мин, −1 ч, +2 дн. 3 ч, без изменений */
export function fmtDelta(delta) {
    if (!delta) return 'без изменений';
    const sign = delta < 0 ? '−' : '+';
    let rest = Math.abs(delta);
    const days = Math.floor(rest / DAY);
    rest -= days * DAY;
    const hours = Math.floor(rest / 60);
    const mins = rest - hours * 60;
    const parts = [];
    if (days) parts.push(`${days} дн.`);
    if (hours) parts.push(`${hours} ч`);
    if (mins && days < 2) parts.push(`${mins} мин`);
    return sign + (parts.join(' ') || '0 мин');
}

// ───────────────────────── разбор ─────────────────────────

const MONTH_STEMS = {
    'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4, 'май': 5, 'мая': 5, 'мае': 5, 'июн': 6, 'июл': 7, 'авг': 8, 'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
};

function monthFromWord(word) {
    return MONTH_STEMS[String(word).toLowerCase().slice(0, 3)] ?? null;
}

const UNIT_RE = /(\d+(?:[.,]\d+)?)?\s*(полчаса|недел[а-яё]*|нед|сут(?:ок|ки)?|дн(?:я|ей)?|день|мес(?:яц(?:а|ев)?)?|час(?:а|ов)?|мин(?:ут[аыу]?)?|weeks?|wk|days?|hours?|hrs?|minutes?|mins?|months?|[дчмwdhm])(?![a-zа-яё])/gi;

function unitMinutes(unit) {
    const u = unit.toLowerCase();
    if (u === 'полчаса') return 30;
    if (/^(недел|нед|w)/.test(u)) return 7 * DAY;
    if (/^(мес|month)/.test(u)) return 30 * DAY;
    if (/^(сут|дн|день|д$|day|d$)/.test(u)) return DAY;
    if (/^(час|ч$|hour|hr|h$)/.test(u)) return 60;
    return 1; // минуты
}

/** «2ч 30м», «+1 день», «через полчаса», «90» → минуты (без знака). */
export function parseDuration(str) {
    const s = String(str ?? '').toLowerCase();
    let total = 0;
    let found = false;
    for (const m of s.matchAll(UNIT_RE)) {
        const unit = m[2];
        const bare = !m[1];
        // Голая единица без числа допустима только для «полчаса» и слова «час/день/неделя».
        if (bare && !/^(полчаса|час|день|сутки|неделю|неделя|hour|day|week)$/.test(unit.toLowerCase())) continue;
        const n = bare ? 1 : Number(m[1].replace(',', '.'));
        total += n * unitMinutes(unit);
        found = true;
    }
    if (!found) {
        const bare = /^[+\-−]?\s*(\d+)\s*$/.exec(s);
        if (bare) return Number(bare[1]);
        return null;
    }
    return Math.round(total);
}

const PHASE_WORDS = [
    [/полноч|midnight/, 0, null],
    [/рассвет|dawn|sunrise/, 360, 'morning'],
    [/утр|morning/, 480, 'morning'],
    [/полд|noon/, 720, 'day'],
    [/после обеда|afternoon/, 840, 'day'],
    [/днём|днем|daytime/, 780, 'day'],
    [/закат|сумерк|dusk|sunset/, 1200, 'evening'],
    [/вечер|evening/, 1140, 'evening'],
    [/ночь|ночи|ночью|night/, 1380, 'night'],
];

/**
 * Разбирает значение тега / ввод пользователя относительно времени `before`.
 * Понимает: «15.10.1247 08:30», «1247-10-15 08:30», «15 октября 1247, 08:30», «October 15, 08:30»,
 * «08:30» (ближайшее такое время), «+2ч 30м», «через час», «на следующее утро», «вечер», «same».
 * @returns {number|null} новое абсолютное время или null, если ничего не понятно
 */
export function parseTimeValue(raw, before) {
    if (raw == null || !Number.isFinite(before)) return null;
    let s = String(raw).toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (/^(same|unchanged|без изменений|не изменилось|то же|=|[+\-−]?\s*0)$/.test(s)) return before;

    // Относительный сдвиг
    const rel = /^([+\-−]|через |спустя |in |after )/.exec(s);
    if (rel) {
        const sign = rel[1] === '-' || rel[1] === '−' ? -1 : 1;
        const delta = parseDuration(s.slice(rel[0].length));
        if (delta != null) return before + sign * delta;
    }

    const b = split(before);
    let y = null;
    let mo = null;
    let d = null;
    let minutes = null;
    let mm;

    if ((mm = /(^|[^\d.])(\d{1,2}):(\d{2})(?!\d)/.exec(s))) {
        const h = Number(mm[2]);
        const mi = Number(mm[3]);
        if (h <= 24 && mi <= 59) minutes = (h * 60 + mi) % DAY;
        s = s.replace(mm[0], mm[1] + ' ');
    }

    if ((mm = /(-?\d{1,6})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s))) {
        y = Number(mm[1]); mo = Number(mm[2]); d = Number(mm[3]);
    } else if ((mm = /(^|\D)(\d{1,2})[./](\d{1,2})[./](-?\d{1,6})(?!\d)/.exec(s))) {
        d = Number(mm[2]); mo = Number(mm[3]); y = Number(mm[4]);
    } else {
        for (const w of s.matchAll(/(^|\D)(\d{1,2})(?:-?(?:го|е|th|st|nd|rd))?\s+([a-zа-яё]{3,})\.?(?:,?\s+(-?\d{1,6})(?![\d:]))?/g)) {
            const month = monthFromWord(w[3]);
            if (month) { d = Number(w[2]); mo = month; y = w[4] ? Number(w[4]) : null; break; }
        }
        if (mo == null) {
            for (const w of s.matchAll(/([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(-?\d{1,6})(?![\d:]))?/g)) {
                const month = monthFromWord(w[1]);
                if (month) { d = Number(w[2]); mo = month; y = w[3] ? Number(w[3]) : null; break; }
            }
        }
        if (mo == null && (mm = /(^|[^\d.])(\d{1,2})[./](\d{1,2})(?![\d./])/.exec(s))) {
            d = Number(mm[2]); mo = Number(mm[3]);
        }
    }

    if (mo != null) {
        if (mo < 1 || mo > 12) return null;
        let year = y ?? b.y;
        if (y == null) {
            // Без года: берём ближайшую дату — переход через Новый год тоже считается.
            const candidate = daysFromCivil(year, mo, Math.min(d, daysInMonth(year, mo)));
            if (candidate < b.day - 180) year += 1;
            else if (candidate > b.day + 185) year -= 1;
        }
        if (d < 1 || d > daysInMonth(year, mo)) return null;
        return makeTime(year, mo, d, minutes ?? phaseMinutes(s) ?? b.minutes);
    }

    // Слова: «завтра», «на следующее утро», «послезавтра»
    let dayShift = 0;
    if (/послезавтра|day after tomorrow/.test(s)) dayShift = 2;
    else if (/завтра|следующ|наутро|next (day|morning|evening|night)|tomorrow/.test(s)) dayShift = 1;

    let phase = null;
    if (minutes == null) {
        for (const [re, value, key] of PHASE_WORDS) {
            if (re.test(s)) { minutes = value; phase = key; break; }
        }
    }

    if (minutes == null) {
        return dayShift ? before + dayShift * DAY : null;
    }
    if (dayShift) return (b.day + dayShift) * DAY + minutes;

    // Та же часть суток словами («утро», когда уже утро) — время не меняется.
    if (phase && phaseKey(b.minutes) === phase) return before;

    // Только время: ближайшее будущее; небольшой откат назад (до 30 мин) считаем уточнением.
    let t = b.day * DAY + minutes;
    if (t < before - 30) t += DAY;
    return t;
}

function phaseMinutes(s) {
    for (const [re, value] of PHASE_WORDS) if (re.test(s)) return value;
    return null;
}

/** Тег времени в тексте ответа: [time: 15.10.1247 08:30], [время: …], [Время мира: …] */
export const TAG_SOURCE = String.raw`\[\s*(?:time|время(?:\s+мира)?|world\s*time)\s*[:=]\s*([^\]\n]{1,120}?)\s*\]`;
export const tagRegex = () => new RegExp(TAG_SOURCE, 'gi');

/** Значение последнего тега в тексте или null. */
export function findTag(text) {
    let last = null;
    for (const m of String(text ?? '').matchAll(tagRegex())) last = m[1].trim();
    return last;
}
