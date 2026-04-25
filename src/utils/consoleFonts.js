const vscode = require('vscode');
const { execFile } = require('child_process');
const config = require('./config');

const FONT_CACHE_SCHEMA_VERSION = 1;
const FONT_CACHE_SCHEMA_KEY = 'stata-all-in-one.consoleFontCache.schemaVersion';
const FONT_CACHE_VERSION_KEY = 'stata-all-in-one.consoleFontCache.extensionVersion';
const FONT_CACHE_PLATFORM_PREFIX = 'stata-all-in-one.consoleFontCache.platform.';

const PLATFORM_FONT_CANDIDATES = Object.freeze({
    darwin: [
        {
            id: 'sf-mono',
            probeFamilies: ['SF Mono'],
            stack: '"SF Mono", "PingFang SC", Menlo, Monaco, monospace'
        },
        {
            id: 'menlo',
            probeFamilies: ['Menlo'],
            stack: 'Menlo, "PingFang SC", Monaco, monospace'
        },
        {
            id: 'monaco',
            probeFamilies: ['Monaco'],
            stack: 'Monaco, "PingFang SC", Menlo, monospace'
        }
    ],
    win32: [
        {
            id: 'consolas',
            probeFamilies: ['Consolas'],
            stack: 'Consolas, "Microsoft YaHei UI", "Lucida Console", "Courier New", monospace'
        },
        {
            id: 'cascadia-mono',
            probeFamilies: ['Cascadia Mono'],
            stack: '"Cascadia Mono", "Microsoft YaHei UI", Consolas, "Lucida Console", monospace'
        },
        {
            id: 'lucida-console',
            probeFamilies: ['Lucida Console'],
            stack: '"Lucida Console", "Microsoft YaHei UI", Consolas, "Courier New", monospace'
        },
        {
            id: 'courier-new',
            probeFamilies: ['Courier New'],
            stack: '"Courier New", "Microsoft YaHei UI", Consolas, "Lucida Console", monospace'
        }
    ],
    linux: [
        {
            id: 'dejavu-sans-mono',
            probeFamilies: ['DejaVu Sans Mono'],
            stack: '"DejaVu Sans Mono", "Noto Sans CJK SC", "Liberation Mono", "Noto Sans Mono", monospace'
        },
        {
            id: 'liberation-mono',
            probeFamilies: ['Liberation Mono'],
            stack: '"Liberation Mono", "Noto Sans CJK SC", "DejaVu Sans Mono", "Noto Sans Mono", monospace'
        },
        {
            id: 'noto-sans-mono',
            probeFamilies: ['Noto Sans Mono'],
            stack: '"Noto Sans Mono", "Noto Sans CJK SC", "DejaVu Sans Mono", "Liberation Mono", monospace'
        },
        {
            id: 'ubuntu-mono',
            probeFamilies: ['Ubuntu Mono'],
            stack: '"Ubuntu Mono", "Noto Sans CJK SC", "DejaVu Sans Mono", "Liberation Mono", monospace'
        }
    ]
});

const DEFAULT_PLATFORM_STACKS = Object.freeze({
    darwin: 'Menlo, "PingFang SC", Monaco, monospace',
    win32: 'Consolas, "Microsoft YaHei UI", "Lucida Console", "Courier New", monospace',
    linux: '"DejaVu Sans Mono", "Noto Sans CJK SC", "Liberation Mono", "Noto Sans Mono", monospace',
    fallback: 'monospace'
});

function getPlatformCandidates(platform = process.platform) {
    return PLATFORM_FONT_CANDIDATES[platform] || PLATFORM_FONT_CANDIDATES.linux;
}

function getPlatformCacheKey(platform = process.platform) {
    return `${FONT_CACHE_PLATFORM_PREFIX}${platform}`;
}

function getEditorFontFamily() {
    const configured = vscode.workspace.getConfiguration('editor').get('fontFamily', '');
    return typeof configured === 'string' ? configured.trim() : '';
}

function getDefaultPlatformFallbackStack(platform = process.platform) {
    return DEFAULT_PLATFORM_STACKS[platform] || DEFAULT_PLATFORM_STACKS.fallback;
}

function getConsoleFontWebviewOptions(context) {
    const platform = process.platform;
    const cached = context.globalState.get(getPlatformCacheKey(platform), null);
    const availableStacks = Array.isArray(cached && cached.availableStacks) ? cached.availableStacks : [];
    return {
        fontMode: config.getConsoleFontMode(),
        editorFontFamily: getEditorFontFamily(),
        customFontFamily: config.getConsoleCustomFontFamily(),
        systemFallbackFamily: availableStacks[0] || getDefaultPlatformFallbackStack(platform)
    };
}

async function ensureConsoleFontCache(context) {
    const extensionVersion = String((context.extension && context.extension.packageJSON && context.extension.packageJSON.version) || '0.0.0');
    const platform = process.platform;
    const cacheKey = getPlatformCacheKey(platform);
    const currentSchemaVersion = context.globalState.get(FONT_CACHE_SCHEMA_KEY, 0);
    const currentExtensionVersion = context.globalState.get(FONT_CACHE_VERSION_KEY, '0.0.0');
    const currentCache = context.globalState.get(cacheKey, null);
    const isCurrentCacheValid = currentSchemaVersion === FONT_CACHE_SCHEMA_VERSION
        && currentExtensionVersion === extensionVersion
        && currentCache
        && currentCache.platform === platform
        && currentCache.extensionVersion === extensionVersion
        && Array.isArray(currentCache.availableStacks);

    if (isCurrentCacheValid) {
        return currentCache;
    }

    const availableFamilies = await probeInstalledFontFamilies(platform);
    const availableStacks = getPlatformCandidates(platform)
        .filter(candidate => candidate.probeFamilies.some(family => availableFamilies.has(normalizeFontFamilyName(family))))
        .map(candidate => candidate.stack);

    const nextCache = {
        schemaVersion: FONT_CACHE_SCHEMA_VERSION,
        extensionVersion,
        platform,
        availableStacks,
        updatedAt: Date.now()
    };

    await context.globalState.update(FONT_CACHE_SCHEMA_KEY, FONT_CACHE_SCHEMA_VERSION);
    await context.globalState.update(FONT_CACHE_VERSION_KEY, extensionVersion);
    await context.globalState.update(cacheKey, nextCache);

    return nextCache;
}

async function probeInstalledFontFamilies(platform = process.platform) {
    try {
        const rawOutput = await runFontProbeCommand(platform);
        return parseInstalledFontFamilies(rawOutput);
    } catch (error) {
        console.warn(`Stata All in One: Failed to probe installed console fallback fonts on ${platform}:`, error.message);
        return new Set();
    }
}

function runFontProbeCommand(platform) {
    if (platform === 'darwin') {
        return execFileAsync('system_profiler', ['SPFontsDataType', '-json'], { timeout: 15000, maxBuffer: 12 * 1024 * 1024 });
    }
    if (platform === 'win32') {
        return execFileAsync('powershell.exe', ['-NoProfile', '-Command', WINDOWS_FONT_PROBE_SCRIPT], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    }
    return execFileAsync('fc-list', [':', 'family'], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
}

function execFileAsync(command, args, options) {
    return new Promise((resolve, reject) => {
        execFile(command, args, options || {}, (error, stdout, stderr) => {
            if (error) {
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve(String(stdout || ''));
        });
    });
}

function parseInstalledFontFamilies(rawOutput) {
    const output = String(rawOutput || '');
    const families = new Set();

    if (!output) {
        return families;
    }

    if (output.trim().startsWith('{') || output.trim().startsWith('[')) {
        parseJsonFontFamilies(output, families);
        return families;
    }

    output.split(/\r?\n/).forEach(line => {
        line.split(/[;,]/).forEach(part => {
            const cleaned = cleanFontFamilyName(part);
            if (cleaned) {
                families.add(normalizeFontFamilyName(cleaned));
            }
        });
    });

    return families;
}

function parseJsonFontFamilies(rawOutput, target) {
    try {
        const parsed = JSON.parse(rawOutput);
        collectFontNamesFromJson(parsed, target);
    } catch (error) {
        String(rawOutput || '').split(/\r?\n/).forEach(line => {
            const cleaned = cleanFontFamilyName(line);
            if (cleaned) {
                target.add(normalizeFontFamilyName(cleaned));
            }
        });
    }
}

function collectFontNamesFromJson(value, target) {
    if (!value) {
        return;
    }

    if (Array.isArray(value)) {
        value.forEach(item => collectFontNamesFromJson(item, target));
        return;
    }

    if (typeof value === 'object') {
        Object.keys(value).forEach(key => {
            if ((key === 'family' || key === '_name' || key === 'DisplayName') && typeof value[key] === 'string') {
                const cleaned = cleanFontFamilyName(value[key]);
                if (cleaned) {
                    target.add(normalizeFontFamilyName(cleaned));
                }
            }
            collectFontNamesFromJson(value[key], target);
        });
    }
}

function cleanFontFamilyName(value) {
    const cleaned = String(value || '')
        .replace(/\(TrueType\)|\(OpenType\)|\(All Res\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || null;
}

function normalizeFontFamilyName(value) {
    return cleanFontFamilyName(value || '') ? cleanFontFamilyName(value).toLowerCase() : '';
}

const WINDOWS_FONT_PROBE_SCRIPT = [
    '$paths = @(',
    "  'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',",
    "  'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'",
    ');',
    '$names = New-Object System.Collections.Generic.List[string];',
    'foreach ($path in $paths) {',
    '  if (-not (Test-Path $path)) { continue }',
    '  $item = Get-ItemProperty -Path $path;',
    '  foreach ($prop in $item.PSObject.Properties) {',
    "    if ($prop.Name -in 'PSPath','PSParentPath','PSChildName','PSDrive','PSProvider') { continue }",
    "    $name = [string]$prop.Name -replace '\\s*\\((TrueType|OpenType|All Res)\\)\\s*$', '';",
    '    if (-not [string]::IsNullOrWhiteSpace($name)) { $names.Add($name.Trim()) }',
    '  }',
    '}',
    '$names | Sort-Object -Unique | ConvertTo-Json'
].join(' ');

module.exports = {
    ensureConsoleFontCache,
    getConsoleFontWebviewOptions,
    getDefaultPlatformFallbackStack
};
