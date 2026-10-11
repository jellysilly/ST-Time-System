// Slash-команды (/ts-time, /ts-open, /ts-status, /ts-npc) и макросы {{worldTime}} и т. п.

import { ctx, hasChat, now, setNow, chatState } from './store.js';
import { parseTimeValue, fmtFull } from './calendar.js';
import { buildPrompt, variables } from './prompt.js';
import { npcStatus, statusLabel } from './schedule.js';
import { toast } from './ui/dom.js';

function needChat() {
    if (hasChat() && now() !== null) return true;
    toast('warning', 'Откройте чат');
    return false;
}

export function registerCommands(openNotebook) {
    const c = ctx();
    const commands = [
        {
            name: 'ts-time',
            arg: 'новое время: «08:00», «15.10.1247 08:00», «+2ч», «на следующее утро»',
            help: 'Без аргумента возвращает время мира. С аргументом — устанавливает его. Пример: <code>/ts-time +3ч</code>',
            callback: (_args, value) => {
                if (!needChat()) return '';
                const v = String(value ?? '').trim();
                if (v) {
                    const t = parseTimeValue(v, now());
                    if (t === null) { toast('warning', `Не понял время: «${v}»`); return ''; }
                    setNow(t);
                }
                return fmtFull(now());
            },
        },
        {
            name: 'ts-open',
            help: 'Открывает блокнот Time System.',
            callback: () => { openNotebook(); return ''; },
        },
        {
            name: 'ts-status',
            help: 'Возвращает текст, который Time System сейчас передаёт ИИ.',
            callback: () => (needChat() ? buildPrompt() : ''),
        },
        {
            name: 'ts-npc',
            arg: 'имя NPC',
            help: 'Где сейчас NPC. Пример: <code>/ts-npc Олег</code>',
            callback: (_args, value) => {
                if (!needChat()) return '';
                const q = String(value ?? '').trim().toLowerCase();
                const t = now();
                const list = chatState().npcs.filter(n => !q || n.name.toLowerCase().includes(q));
                return list.map((n) => {
                    const st = npcStatus(n, t);
                    return `${n.name}: ${statusLabel(st, t)}${st.place ? ` (${st.place})` : ''}`;
                }).join('\n') || 'NPC не найден';
            },
        },
    ];

    const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE } = c;
    for (const cmd of commands) {
        try {
            if (SlashCommandParser?.addCommandObject && SlashCommand?.fromProps) {
                SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                    name: cmd.name,
                    callback: cmd.callback,
                    returns: 'строка',
                    helpString: cmd.help,
                    unnamedArgumentList: cmd.arg && SlashCommandArgument?.fromProps
                        ? [SlashCommandArgument.fromProps({ description: cmd.arg, typeList: [ARGUMENT_TYPE.STRING], isRequired: false })]
                        : [],
                }));
            } else if (typeof c.registerSlashCommand === 'function') {
                c.registerSlashCommand(cmd.name, cmd.callback, [], cmd.help, true, true);
            }
        } catch (e) {
            console.warn(`[Time System] не удалось зарегистрировать /${cmd.name}`, e);
        }
    }
}

export function registerMacros() {
    const c = ctx();
    const defs = [
        ['worldTime', 'Time System: время мира (ЧЧ:ММ)'],
        ['worldDate', 'Time System: дата мира'],
        ['worldWeekday', 'Time System: день недели'],
        ['worldPhase', 'Time System: часть суток'],
        ['worldStamp', 'Time System: ДД.ММ.ГГГГ ЧЧ:ММ'],
        ['worldNpcs', 'Time System: где сейчас NPC'],
        ['worldEvents', 'Time System: события сегодня и завтра'],
    ];
    for (const [name, description] of defs) {
        const handler = () => {
            if (!hasChat()) return '';
            const t = now();
            return t === null ? '' : (variables(t)[`{{${name}}}`] ?? '');
        };
        try {
            if (typeof c.registerMacro === 'function') c.registerMacro(name, handler, description);
            else c.macros?.register?.(name, { handler, description, category: 'time' });
        } catch (e) {
            console.warn(`[Time System] макрос {{${name}}} не зарегистрирован`, e);
        }
    }
}
