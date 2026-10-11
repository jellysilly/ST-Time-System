// Оформление сообщений в чате: теги [time: …] заворачиваются в span (и прячутся CSS-классом
// на body), а в шапке сообщения появляется метка «🕑 08:30» — по нажатию время можно исправить.

import { h } from './dom.js';
import { ctx, settings, getSnap, nowAt } from '../store.js';
import { tagRegex, fmtTime, fmtDateShort, fmtFull, dayOf } from '../calendar.js';

const SRC = {
    tag: 'из ответа модели', analysis: 'по анализу ответа', auto: 'авто-ход', manual: 'исправлено вручную',
    user: 'из вашего сообщения', rejected: 'изменение отклонено',
};

let stampHandler = null;
/** fn(messageIndex) — вызывается по нажатию на метку времени. */
export function setStampHandler(fn) { stampHandler = fn; }

export function syncBodyClasses() {
    const s = settings();
    document.body.classList.toggle('ts-hide-tags', !!(s.enabled && s.hideTags));
}

function wrapTags(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement?.closest('.ts-tag') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const hits = [];
    while (walker.nextNode()) {
        if (tagRegex().test(walker.currentNode.nodeValue)) hits.push(walker.currentNode);
    }
    for (const node of hits) {
        const text = node.nodeValue;
        const frag = document.createDocumentFragment();
        let last = 0;
        for (const m of text.matchAll(tagRegex())) {
            if (m.index > last) frag.append(text.slice(last, m.index));
            frag.append(h('span', { class: 'ts-tag', title: 'Отметка времени для Time System' }, m[0]));
            last = m.index + m[0].length;
        }
        if (last < text.length) frag.append(text.slice(last));
        const parent = node.parentElement;
        const spans = [...frag.querySelectorAll('.ts-tag')];
        node.replaceWith(frag);
        // Перенос строки перед тегом в конце абзаца тоже прячем.
        for (const span of spans) {
            let next = span.nextSibling;
            while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue.trim()) next = next.nextSibling;
            if (next) continue;
            let prev = span.previousSibling;
            while (prev && prev.nodeType === Node.TEXT_NODE && !prev.nodeValue.trim()) prev = prev.previousSibling;
            if (prev?.nodeName === 'BR') prev.classList.add('ts-tag-br');
        }
        // Строка, где кроме тега ничего нет, прячется целиком (без пустого абзаца).
        const block = parent?.closest('p, li, div');
        if (block && root.contains(block)) {
            const clone = block.cloneNode(true);
            clone.querySelectorAll('.ts-tag').forEach(x => x.remove());
            if (!clone.textContent.trim() && !clone.querySelector('img, video, audio, iframe')) block.classList.add('ts-tag-line');
        }
    }
}

function stampHost(mesEl) {
    const ts = mesEl.querySelector('.ch_name .timestamp');
    return ts?.parentElement ?? mesEl.querySelector('.ch_name .name_text')?.parentElement ?? null;
}

function updateStamp(mesEl, id, msg) {
    let el = mesEl.querySelector('.ts-stamp');
    const s = settings();
    const snap = getSnap(msg);
    const pending = snap?.src === 'pending';
    const t = pending ? snap.p : snap?.t;
    if (!s.enabled || !s.showStamps || !snap || !Number.isFinite(t)) {
        el?.remove();
        return;
    }
    const host = stampHost(mesEl);
    if (!host) return;

    const prevT = nowAt(id - 1);
    const newDay = prevT === null || dayOf(prevT) !== dayOf(t);
    const text = pending ? 'подтвердить время?' : newDay ? `${fmtDateShort(t)} · ${fmtTime(t)}` : fmtTime(t);
    const title = pending
        ? `Модель предлагает: ${fmtFull(t)}. Нажмите, чтобы решить.`
        : `Время мира после сообщения: ${fmtFull(t)} — ${SRC[snap.src] ?? snap.src}${snap.ed ? ', поправлено' : ''}. Нажмите, чтобы исправить.`;

    if (!el) {
        el = h('span', { class: 'ts-stamp', role: 'button', tabindex: '0' });
        const activate = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const index = Number(el.closest('.mes')?.getAttribute('mesid'));
            if (Number.isInteger(index)) stampHandler?.(index);
        };
        el.addEventListener('click', activate);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') activate(e); });
    }
    if (el.parentElement !== host) host.append(el);
    el.title = title;
    el.setAttribute('aria-label', title);
    el.classList.toggle('is-pending', pending);
    el.classList.toggle('is-newday', newDay && !pending);
    el.replaceChildren(h('i', { class: pending ? 'fa-solid fa-hourglass-half' : 'fa-regular fa-clock', 'aria-hidden': 'true' }), h('span', null, text));
}

export function decorateMessage(mesEl) {
    if (!mesEl) return;
    const id = Number(mesEl.getAttribute('mesid'));
    if (!Number.isInteger(id)) return;
    const msg = ctx().chat?.[id];
    if (!msg) return;
    wrapTags(mesEl.querySelector('.mes_text'));
    updateStamp(mesEl, id, msg);
}

export function decorateById(id) {
    decorateMessage(document.querySelector(`#chat .mes[mesid="${Number(id)}"]`));
}

export function decorateAll() {
    syncBodyClasses();
    document.querySelectorAll('#chat .mes').forEach(decorateMessage);
}
