const { ROLE_SCOPES } = require('./themeProtocol');

// Runs in the CLIENT Webview on all OSes, including a Remote-SSH window.
// The backend supplies token identities; this is the only place that fills colors.
function connectClientTheme(vscode, roleScopes) {
    let themeId = '';
    let generation = 0;
    let sequence = 0;
    let timer;
    const colors = new Map();
    const requested = new Set();
    const pending = new Map();
    const waiting = new Map();

    function roleFor(element) {
        for (const role of Object.keys(roleScopes)) {
            if (element.classList.contains('tok-' + role)) return role;
        }
        return '';
    }
    function scopesFor(element) {
        if (element.dataset.stataScopes) {
            try { return JSON.parse(element.dataset.stataScopes); } catch (_) {}
        }
        return roleScopes[roleFor(element)] || null;
    }
    function fill(element) {
        const scopes = scopesFor(element);
        if (!scopes) return;
        const key = JSON.stringify(scopes);
        const value = colors.get(key);
        // Discard legacy backend color attributes, including old history.
        element.style.removeProperty('color');
        if (value) element.style.color = value.color;
        if (value && element.dataset.stataScopes) {
            element.style.fontStyle = value.italic ? 'italic' : 'normal';
            element.style.fontWeight = value.bold ? 'bold' : 'normal';
            element.style.textDecoration = value.underline ? 'underline' : 'none';
        }
        if (!colors.has(key) && !requested.has(key)) waiting.set(key, scopes);
    }
    function queue() {
        if (!timer && waiting.size) timer = setTimeout(send, 0);
    }
    function send() {
        timer = null;
        if (!themeId || !waiting.size) return;
        const scopes = Array.from(waiting.values()).slice(0, 128);
        const keys = scopes.map(value => JSON.stringify(value));
        keys.forEach(key => { waiting.delete(key); requested.add(key); });
        const requestId = String(generation) + ':' + String(++sequence);
        pending.set(requestId, { generation, keys });
        vscode.postMessage({ type: 'resolveClientTheme', requestId, themeId,
            foreground: getComputedStyle(document.body).getPropertyValue('--vscode-editor-foreground').trim(), scopes });
        queue();
    }
    function applyRoles() {
        for (const [role, scopes] of Object.entries(roleScopes)) {
            const value = colors.get(JSON.stringify(scopes));
            const fallback = role === 'comment' ? 'var(--vscode-descriptionForeground)' : 'var(--vscode-editor-foreground)';
            document.documentElement.style.setProperty('--stata-' + role, value ? value.color : fallback);
        }
        document.documentElement.style.setProperty('--stata-time-value', 'var(--stata-number)');
    }
    function scan(root = document) {
        if (root.matches && root.matches('.tok')) fill(root);
        if (root.querySelectorAll) root.querySelectorAll('.tok').forEach(fill);
        queue();
    }
    function reset(force) {
        const current = document.body.dataset.vscodeThemeId || '';
        if (!force && current === themeId) return;
        themeId = current;
        generation += 1;
        colors.clear(); requested.clear(); pending.clear(); waiting.clear();
        for (const scopes of Object.values(roleScopes)) waiting.set(JSON.stringify(scopes), scopes);
        applyRoles();
        scan();
    }
    window.addEventListener('message', event => {
        const message = event.data || {};
        if (message.type === 'invalidateClientTheme') { reset(true); return; }
        if (message.type !== 'clientThemeColors') return;
        const batch = pending.get(message.requestId);
        pending.delete(message.requestId);
        if (!batch || batch.generation !== generation || message.themeId !== themeId) return;
        for (const key of batch.keys) {
            const value = message.colors && message.colors[key];
            colors.set(key, value && /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.color) ? value : null);
        }
        applyRoles();
        scan();
    });
    const themeObserver = new MutationObserver(() => reset(false));
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-id'] });
    const tokenObserver = new MutationObserver(records => {
        for (const record of records) record.addedNodes.forEach(node => scan(node));
    });
    tokenObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('unload', () => {
        themeObserver.disconnect(); tokenObserver.disconnect(); clearTimeout(timer);
    }, { once: true });
    reset(true);
}

function clientThemeScript() {
    return `(${connectClientTheme.toString()})(vscode, ${JSON.stringify(ROLE_SCOPES)});`;
}
module.exports = { clientThemeScript, connectClientTheme };
