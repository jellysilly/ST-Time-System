// Slash-команды (/ts-time, /ts-open, /ts-status, /ts-npc) и макросы {{worldTime}} и т. п.

import { ctx, hasChat, now, setNow, chatState } from './store.js';
import { parseTimeValue, fmtFull } from './calendar.js';
import { buildPrompt, variables } from './prompt.js';
import { npcStatus, statusLabel } from './schedule.js';
import { toast } from './ui/dom.js';
import { t as tr } from './i18n.js';

function needChat() {
    if (hasChat() && now() !== null) return true;
    toast('warning', tr('cmd.needChat'));
    return false;
}

export function registerCommands(openNotebook) {
    const c = ctx();
    const commands = [
        {
            name: 'ts-time',
            arg: tr('cmd.time.arg'),
            help: tr('cmd.time.help'),
            callback: (_args, value) => {
                if (!needChat()) return '';
                const v = String(value ?? '').trim();
                if (v) {
                    const t = parseTimeValue(v, now());
                    if (t === null) { toast('warning', tr('cmd.badTime', { v })); return ''; }
                    setNow(t);
                }
                return fmtFull(now());
            },
        },
        {
            name: 'ts-open',
            help: tr('cmd.open.help'),
            callback: () => { openNotebook(); return ''; },
        },
        {
            name: 'ts-status',
            help: tr('cmd.status.help'),
            callback: () => (needChat() ? buildPrompt() : ''),
        },
        {
            name: 'ts-npc',
            arg: tr('cmd.npc.arg'),
            help: tr('cmd.npc.help'),
            callback: (_args, value) => {
                if (!needChat()) return '';
                const q = String(value ?? '').trim().toLowerCase();
                const t = now();
                const list = chatState().npcs.filter(n => !q || n.name.toLowerCase().includes(q));
                return list.map((n) => {
                    const st = npcStatus(n, t);
                    return `${n.name}: ${statusLabel(st, t)}${st.place ? ` (${st.place})` : ''}`;
                }).join('\n') || tr('cmd.npc.none');
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
                    returns: tr('cmd.returns'),
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
    const names = ['worldTime', 'worldDate', 'worldWeekday', 'worldPhase', 'worldStamp', 'worldNpcs', 'worldEvents'];
    for (const name of names) {
        const description = tr(`macro.${name}`);
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
