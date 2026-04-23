/**
 * Windows Embedded Console Runner
 * 预留 Windows 版内嵌控制台入口；当前仍回退到 External App
 */

async function runOnWindowsEmbeddedConsole() {
    return {
        success: false,
        shouldOfferExternalAppFallback: true,
        errorType: 'unsupported',
        message: 'Embedded Console is not implemented on Windows yet.'
    };
}

function stopEmbeddedConsoleExecution() {
    return false;
}

function forceShutdownEmbeddedConsoleSession() {
    return false;
}

module.exports = {
    runOnWindowsEmbeddedConsole,
    stopEmbeddedConsoleExecution,
    forceShutdownEmbeddedConsoleSession
};
