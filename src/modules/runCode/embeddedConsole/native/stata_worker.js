/**
 * Stata Worker Thread (Windows only)
 *
 * Runs on a dedicated Node.js Worker thread so that both StataSO_Main
 * and StataSO_Execute are called from the same thread (preserving
 * thread affinity that the Windows Stata DLL requires).
 *
 * The main JS thread stays responsive — the stop button sends
 * g_StataSO_SetBreak from the main thread (it is thread-safe).
 */
const { parentPort } = require('worker_threads');
const path = require('path');

let nativeModule = null;
let _initialized = false;
let _dllPath = null;

function loadNative(nativePath) {
    if (nativeModule) return nativeModule;
    try {
        nativeModule = require(nativePath);
    } catch (err) {
        // Try platform-specific path
        const dir = path.dirname(nativePath);
        const platformPath = path.join(dir, 'stata_bridge-win32.node');
        nativeModule = require(platformPath);
    }
    return nativeModule;
}

function handleInit(msg) {
    try {
        loadNative(msg.nativePath);
        const result = nativeModule.initSession(
            msg.dllPath,
            msg.splash || false,
            msg.execPath || '',
            msg.stHome || ''
        );
        _initialized = !!result;
        _dllPath = msg.dllPath;
        parentPort.postMessage({ id: msg.id, type: 'initResult', success: _initialized });
    } catch (err) {
        parentPort.postMessage({ id: msg.id, type: 'initResult', success: false, error: err.message });
    }
}

function handleExecute(msg) {
    if (!_initialized) {
        parentPort.postMessage({
            id: msg.id, type: 'executeResult',
            success: false, returnCode: -1, output: '', error: 'Session not initialized'
        });
        return;
    }
    try {
        nativeModule.clearOutput();
        const result = nativeModule.executeSync(msg.code, msg.echo ? 1 : 0);
        parentPort.postMessage({
            id: msg.id, type: 'executeResult',
            success: result.returnCode === 0,
            returnCode: result.returnCode,
            output: result.output || '',
            error: result.error || ''
        });
    } catch (err) {
        parentPort.postMessage({
            id: msg.id, type: 'executeResult',
            success: false, returnCode: -1, output: '', error: err.message
        });
    }
}

function handleShutdown() {
    try {
        if (nativeModule) nativeModule.shutdown();
    } catch (_e) {}
    _initialized = false;
    process.exit(0);
}

parentPort.on('message', (msg) => {
    switch (msg.type) {
        case 'init':
            handleInit(msg);
            break;
        case 'execute':
            handleExecute(msg);
            break;
        case 'shutdown':
            handleShutdown();
            break;
    }
});
