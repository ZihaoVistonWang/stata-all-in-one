const engine = require('./stata_session');

function sendResponse(id, result, error = null) {
    if (!process.connected) {
        return;
    }
    process.send({
        kind: 'response',
        id,
        ok: !error,
        result,
        error: error ? (error.message || String(error)) : ''
    });
}

async function handleRequest(message) {
    const { id, action, args = [] } = message;
    try {
        if (action === 'execute') {
            const result = await engine.execute(args[0], args[1], (data) => {
                if (process.connected) {
                    process.send({ kind: 'output', id, data });
                }
            });
            sendResponse(id, result);
            return;
        }

        const handlers = {
            initSession: () => engine.initSession(...args),
            getDatasetInfo: () => engine.getDatasetInfo(),
            beginDatasetCapture: () => engine.beginDatasetCapture(),
            finishDatasetCapture: () => engine.finishDatasetCapture(),
            cancelDatasetCapture: () => engine.cancelDatasetCapture(),
            getVarMetadata: () => engine.getVarMetadata(),
            getDataRows: () => engine.getDataRows(...args),
            getSummary: () => engine.getSummary()
        };
        const handler = handlers[action];
        if (!handler) {
            throw new Error(`Unknown Stata worker action: ${action}`);
        }
        sendResponse(id, await handler());
    } catch (error) {
        sendResponse(id, null, error);
    }
}

process.on('message', (message) => {
    if (!message || typeof message !== 'object') {
        return;
    }
    if (message.kind === 'request') {
        handleRequest(message);
        return;
    }
    if (message.kind !== 'signal') {
        return;
    }
    if (message.action === 'break') {
        engine.setBreak();
    } else if (message.action === 'clearOutput') {
        engine.clearOutput();
    } else if (message.action === 'cancelDatasetCapture') {
        engine.cancelDatasetCapture();
    }
});

process.on('disconnect', () => {
    process.exit(0);
});
