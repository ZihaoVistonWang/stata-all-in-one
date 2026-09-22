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
            finishDatasetCapture: () => engine.finishDatasetCapture(args[0]),
            cancelDatasetCapture: () => engine.cancelDatasetCapture(args[0]),
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

// Requests are executed strictly in arrival order. The engine keeps a single
// command slot, output buffer and capture buffer, so two overlapping requests
// would corrupt each other and race the native command slot.
let requestChain = Promise.resolve();

function enqueueRequest(message) {
    requestChain = requestChain
        .then(() => handleRequest(message))
        .catch((error) => {
            // handleRequest already reports its own failures; this is a safety
            // net so one bad request can never stall the queue.
            sendResponse(message.id, null, error);
        });
    return requestChain;
}

process.on('message', (message) => {
    if (!message || typeof message !== 'object') {
        return;
    }
    if (message.kind === 'request') {
        enqueueRequest(message);
        return;
    }
    if (message.kind !== 'signal') {
        return;
    }
    // Signals are deliberately handled out of band: a Break must reach the
    // engine while the long command it interrupts is still on the queue.
    if (message.action === 'break') {
        engine.setBreak();
    } else if (message.action === 'clearOutput') {
        engine.clearOutput();
    } else if (message.action === 'cancelDatasetCapture') {
        engine.cancelDatasetCapture(message.payload || undefined);
    }
});

process.on('disconnect', () => {
    process.exit(0);
});
