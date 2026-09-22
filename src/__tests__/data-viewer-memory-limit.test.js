const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const READER_PATH = path.resolve(
    __dirname,
    '../modules/runCode/embeddedConsole/dataViewer/consoleDataReader.js'
);
const CONFIG_PATH = path.resolve(__dirname, '../utils/config.js');

// The reader keeps the resolved budget in module state, so these tests run one at
// a time and reset that state afterwards.
const serial = { concurrency: 1 };

/**
 * Load the reader with `vscode.workspace.getConfiguration` returning `limitMb`
 * for the memory-limit setting (or the caller's fallback when undefined).
 */
function loadWithConfig(limitMb) {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return {
                env: { language: 'en' },
                workspace: {
                    getConfiguration: () => ({
                        get: (key, fallback) => (
                            key === 'dataViewerMemoryLimitMB' && limitMb !== undefined
                                ? limitMb
                                : fallback
                        )
                    })
                }
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[READER_PATH];
    delete require.cache[CONFIG_PATH];
    let reader;
    try {
        // The reader resolves the configured budget as it loads, so the stub has
        // to be installed for the whole require.
        reader = require(READER_PATH);
    } finally {
        Module._load = originalLoad;
    }
    // The reader re-reads a fresh config module on every budget lookup; drop it
    // so a later lookup does not reuse this load's copy.
    delete require.cache[CONFIG_PATH];
    return reader;
}

const FIXTURE_METADATA = {
    headers: 'firm_id year industry region ownership listed firm_name ind_code reg_code uuid revenue assets roa leverage cash_ratio employees patent_cnt growth_rate tiny_value audit_fee esg_score sub_branch_flag remark'.split(' '),
    types: ['long', 'int', 'byte', 'byte', 'byte', 'byte', 'str43', 'str3', 'str4', 'str17', 'long', 'double', 'float', 'double', 'double', 'int', 'byte', 'double', 'double', 'double', 'double', 'byte', 'strL']
};

test('the memory limit setting raises the capture budget', serial, () => {
    const reader = loadWithConfig(4096);
    assert.equal(reader.getCaptureBudget(), 4096 * 1024 * 1024);

    const small = loadWithConfig(64);
    assert.equal(small.getCaptureBudget(), 64 * 1024 * 1024);
});

test('an invalid or missing setting falls back to the default budget', serial, () => {
    for (const value of [undefined, 0, -5, 'nonsense', NaN]) {
        const reader = loadWithConfig(value);
        assert.equal(
            reader.getCaptureBudget(),
            reader.DEFAULT_CAPTURE_BUDGET_MB * 1024 * 1024,
            `value ${String(value)} must fall back to the default`
        );
    }
});

test('the default budget accommodates a realistic large browse', serial, () => {
    // The 210 MB / 1.45M-row test dataset costs ~350 MB of capture buffer, so
    // 1024 MB must cover it and plain `br` works without touching the setting.
    const reader = loadWithConfig(undefined);
    const bytes = reader.estimateCaptureBytes(FIXTURE_METADATA, 1450000);
    assert.ok(bytes / 1048576 > 200, 'the estimate should be in the hundreds of MB');
    assert.ok(
        bytes <= reader.getCaptureBudget(),
        `${(bytes / 1048576).toFixed(0)} MB must fit the ${reader.getCaptureBudget() / 1048576} MB default`
    );
});

test('an explicit override wins over the configured setting', serial, () => {
    const reader = loadWithConfig(4096);
    assert.equal(reader.getCaptureBudget(), 4096 * 1024 * 1024, 'the setting applies by default');

    reader.setCaptureBudget(8 * 1024 * 1024);
    assert.equal(reader.getCaptureBudget(), 8 * 1024 * 1024, 'the override wins');

    // Clearing the override drops back to the built-in default; the configured
    // setting is only re-read while no override is installed.
    reader.setCaptureBudget(0);
    assert.equal(reader.getCaptureBudget(), reader.DEFAULT_CAPTURE_BUDGET_MB * 1024 * 1024);

    // A reader loaded with no override picks the setting up again.
    const reloaded = loadWithConfig(4096);
    assert.equal(reloaded.getCaptureBudget(), 4096 * 1024 * 1024);
});
