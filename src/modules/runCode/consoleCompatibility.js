const CONSOLE_GUI_COMMANDS = Object.freeze({
    br: 'Data Viewer',
    browse: 'Data Viewer',
    edit: 'Data Editor',
    view: 'Viewer',
    doedit: 'Do-file Editor',
    adoedit: 'Ado-file Editor',
    viewsource: 'source viewer',
    findit: 'GUI search',
    search: 'GUI search',
    db: 'dialog box',
    dialog: 'dialog box',
    window: 'Stata GUI windows'
});

const WHICH_ONLY_COMMANDS = new Set(['br', 'browse']);

function parseConsoleUnsupportedCommand(code) {
    const normalized = String(code || '').replace(/\r\n?/g, '\n').trim();
    if (!normalized || normalized.includes('\n')) {
        return null;
    }

    const match = normalized.match(/^([a-z][a-z0-9_]*)\b(?:\s+(.*))?$/i);
    if (!match) {
        return null;
    }

    const command = match[1].toLowerCase();
    const rest = String(match[2] || '').trim();
    if (command === 'which') {
        const targetMatch = rest.match(/^([a-z][a-z0-9_]*)\b/i);
        const target = targetMatch ? targetMatch[1].toLowerCase() : '';
        if (CONSOLE_GUI_COMMANDS[target]) {
            return { kind: 'which', command: target, original: normalized };
        }
        return null;
    }

    if (!CONSOLE_GUI_COMMANDS[command]) {
        return null;
    }

    if (WHICH_ONLY_COMMANDS.has(command)) {
        return null;
    }

    return { kind: 'direct', command, original: normalized };
}

async function routeConsoleUnsupportedCommand(code, dependencies = {}) {
    const parsed = parseConsoleUnsupportedCommand(code);
    if (!parsed) {
        return null;
    }

    const sink = dependencies.getTerminalSink
        || (() => require('./consoleTarget').getWebviewTerminalSink());
    const openedMessage = dependencies.message
        || (() => {
            const { msg } = require('../../utils/common');
            if (parsed.kind === 'which') {
                return msg('consoleUnsupportedWhich', { command: parsed.command });
            }
            return msg('consoleUnsupportedCommand', { command: parsed.command });
        })();

    const terminalSink = sink();
    await terminalSink.prepareForExecution();
    terminalSink.writeCommand(parsed.original);
    terminalSink.writeRawChunk(openedMessage);
    terminalSink.flushOutput();
    terminalSink.setStatus('success');

    return {
        success: true,
        routedToDataViewer: false,
        unsupportedConsoleCommand: parsed.command,
        kind: parsed.kind
    };
}

module.exports = {
    CONSOLE_GUI_COMMANDS,
    WHICH_ONLY_COMMANDS,
    parseConsoleUnsupportedCommand,
    routeConsoleUnsupportedCommand
};
