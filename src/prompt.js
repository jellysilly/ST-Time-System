// Текст, который получает модель: время мира, кто где находится, события дня
// и (в режиме «тег») инструкция отмечать смену времени тегом [time: …].

import { dayOf, fmtDate, fmtTime, fmtWeekday, fmtStamp, phaseName, fmtHM, minutesOf } from './calendar.js';
import { npcStatus, fmtNextStart } from './schedule.js';
import { ctx, KEY, settings, chatState, eventsOn, now, hasChat } from './store.js';

export const DEFAULT_TEMPLATE = {
    ru: `[Время мира: {{worldWeekday}}, {{worldDate}}, {{worldTime}} — {{worldPhase}}.
{{worldNpcs}}
{{worldEvents}}
{{worldNotes}}]`,
    en: `[World time: {{worldWeekday}}, {{worldDate}}, {{worldTime}} ({{worldPhase}}).
{{worldNpcs}}
{{worldEvents}}
{{worldNotes}}]`,
};

export const DEFAULT_TAG_RULE = {
    ru: `[Учёт времени: в самом конце каждого ответа отдельной строкой пиши тег [time: ДД.ММ.ГГГГ ЧЧ:ММ] — время мира после событий ответа (сейчас [time: {{worldStamp}}]). Учитывай длительность действий, сон и переходы между сценами; если наступил новый день — поменяй дату. Если точное время неизвестно, укажи примерное (утро ≈ 08:00, полдень ≈ 12:00, вечер ≈ 19:00, ночь ≈ 23:00).]`,
    en: `[Time tracking: at the very end of every reply, on its own line, write the tag [time: DD.MM.YYYY HH:MM] with the world time after the events of the reply (now it is [time: {{worldStamp}}]). Account for how long actions take, sleep and scene transitions; if a new day starts, change the date. If the exact time is unknown, give an estimate (morning ≈ 08:00, noon ≈ 12:00, evening ≈ 19:00, night ≈ 23:00).]`,
};

export const VARIABLES = [
    ['{{worldWeekday}}', 'день недели'],
    ['{{worldDate}}', 'дата'],
    ['{{worldTime}}', 'время ЧЧ:ММ'],
    ['{{worldPhase}}', 'часть суток'],
    ['{{worldStamp}}', 'ДД.ММ.ГГГГ ЧЧ:ММ'],
    ['{{worldNpcs}}', 'где сейчас NPC'],
    ['{{worldPresent}}', 'кто на месте'],
    ['{{worldAbsent}}', 'кого нет'],
    ['{{worldEvents}}', 'события сегодня/завтра'],
    ['{{worldNotes}}', 'заметки (если включено)'],
];

const lang = () => (settings().promptLang === 'en' ? 'en' : 'ru');

function npcLine(n, t, L) {
    const st = npcStatus(n, t);
    const who = [n.role, n.notes].filter(Boolean).join('; ');
    const head = who ? `${n.name} (${who})` : n.name;
    if (L === 'en') {
        switch (st.kind) {
            case 'present': return `- ${head} — here: ${st.place || 'at their post'}${st.until !== null ? `, until ${fmtHM(minutesOf(st.until))}` : ''}.`;
            case 'away': case 'off': {
                const now = st.place ? ` (right now: ${st.place})` : '';
                const next = st.next ? `; will be at ${st.next.shift.place || n.place || 'their post'} ${fmtNextStart(st.next, t, 'en')}` : '';
                return `- ${head} — ${st.kind === 'off' ? 'day off' : 'not here'}${now}${next}.`;
            }
            default: return `- ${head} — no fixed schedule${n.place ? `, usually: ${n.place}` : ''}.`;
        }
    }
    switch (st.kind) {
        case 'present': return `- ${head} — на месте: ${st.place || 'на своём посту'}${st.until !== null ? `, до ${fmtHM(minutesOf(st.until))}` : ''}.`;
        case 'away': case 'off': {
            const where = st.place ? ` (сейчас: ${st.place})` : '';
            const next = st.next ? `; будет: ${st.next.shift.place || n.place || 'на своём месте'} ${fmtNextStart(st.next, t)}` : '';
            return `- ${head} — ${st.kind === 'off' ? 'выходной' : 'нет на месте'}${where}${next}.`;
        }
        default: return `- ${head} — без расписания${n.place ? `, обычно: ${n.place}` : ''}.`;
    }
}

function eventsText(t, L) {
    const fmt = (list) => list.map(e => (e.time ? `${e.name} (${e.time})` : e.name)).join('; ');
    const today = eventsOn(dayOf(t));
    const tomorrow = eventsOn(dayOf(t) + 1);
    const lines = [];
    if (today.length) lines.push((L === 'en' ? 'Events today: ' : 'События сегодня: ') + fmt(today) + '.');
    if (tomorrow.length) lines.push((L === 'en' ? 'Tomorrow: ' : 'Завтра: ') + fmt(tomorrow) + '.');
    return lines.join('\n');
}

/** Значения переменных шаблона для момента t. */
export function variables(t = now()) {
    const s = settings();
    const st = chatState();
    const L = lang();
    const npcs = (st?.npcs ?? []).filter(n => !n.hidden);
    const statuses = npcs.map(n => [n, npcStatus(n, t)]);
    const present = statuses.filter(([, x]) => x.kind === 'present');
    const absent = statuses.filter(([, x]) => x.kind !== 'present');

    let npcBlock = '';
    if (s.includeNpcs && npcs.length) {
        npcBlock = [
            L === 'en' ? 'Where the NPCs are right now (by their schedules):' : 'Где сейчас NPC (по расписанию):',
            ...npcs.map(n => npcLine(n, t, L)),
            L === 'en'
                ? 'An NPC cannot be met outside their schedule unless the story clearly explains why.'
                : 'Встретить NPC вне его расписания нельзя, если сюжет явно этого не объясняет.',
        ].join('\n');
    }

    return {
        '{{worldWeekday}}': fmtWeekday(t, L),
        '{{worldDate}}': fmtDate(t, L),
        '{{worldTime}}': fmtTime(t),
        '{{worldPhase}}': phaseName(t, L),
        '{{worldStamp}}': fmtStamp(t),
        '{{worldNpcs}}': npcBlock,
        '{{worldPresent}}': present.map(([n, x]) => (x.place ? `${n.name} (${x.place})` : n.name)).join(', ') || (L === 'en' ? 'nobody' : 'никого'),
        '{{worldAbsent}}': absent.map(([n]) => n.name).join(', ') || '—',
        '{{worldEvents}}': s.includeEvents ? eventsText(t, L) : '',
        '{{worldNotes}}': st?.notesToPrompt && st.notes.trim() ? (L === 'en' ? 'World notes: ' : 'Заметки о мире: ') + st.notes.trim() : '',
    };
}

function fill(template, vars) {
    let out = template;
    for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v);
    return out
        .split('\n')
        .filter(line => line.trim() !== '')
        .join('\n')
        .replace(/\n+\]$/, ']')
        .trim();
}

export const templateText = () => settings().template?.trim() || DEFAULT_TEMPLATE[lang()];
export const tagRuleText = () => settings().tagRule?.trim() || DEFAULT_TAG_RULE[lang()];

/** Полный текст инъекции для момента t. Пустая строка — ничего не вставлять. */
export function buildPrompt(t = now()) {
    const s = settings();
    if (!s.enabled || !hasChat() || t === null) return '';
    const vars = variables(t);
    let text = fill(templateText(), vars);
    if (s.detection === 'tag') text += '\n' + fill(tagRuleText(), vars);
    return text;
}

/** Запрос для режима «анализ»: модель по фрагменту определяет новое время. */
export function analysisPrompt(before, fragment) {
    const L = lang();
    if (L === 'en') {
        return {
            system: 'You track in-world time in a roleplay story. Answer with a single line in the requested format, no explanations.',
            prompt: `World time before the fragment: ${fmtWeekday(before, 'en')}, ${fmtStamp(before)}.\n\nStory fragment:\n"""\n${fragment}\n"""\n\nWhat is the world time after the events of this fragment? Consider explicit cues (morning, an hour later, next day) and how long the actions take. If almost no time passed, add a few minutes. Answer strictly as [time: DD.MM.YYYY HH:MM].`,
        };
    }
    return {
        system: 'Ты отслеживаешь внутриигровое время в ролевой истории. Отвечай одной строкой в заданном формате, без пояснений.',
        prompt: `Время мира до фрагмента: ${fmtWeekday(before)}, ${fmtStamp(before)}.\n\nФрагмент истории:\n"""\n${fragment}\n"""\n\nКакое время в мире после событий этого фрагмента? Учитывай явные указания (утро, через час, на следующий день) и длительность действий. Если прошло совсем немного, прибавь несколько минут. Ответь строго в формате [time: ДД.ММ.ГГГГ ЧЧ:ММ].`,
    };
}

const POSITIONS = { after: 0, chat: 1, before: 2 };
const ROLES = { system: 0, user: 1, assistant: 2 };

/** Передаёт текст в SillyTavern (setExtensionPrompt). */
export function applyPrompt(t = now()) {
    const s = settings();
    const text = buildPrompt(t);
    const depth = Math.max(0, Math.round(Number(s.injectDepth) || 0));
    ctx().setExtensionPrompt(KEY, text, POSITIONS[s.injectPosition] ?? 1, depth, false, ROLES[s.injectRole] ?? 0);
    return text;
}
