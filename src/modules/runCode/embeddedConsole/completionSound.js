const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { performance } = require('perf_hooks');

// Owns both submission accounting and the single native audio player. No Webview
// or Stata engine operation is used to play a completion sound.
function createCompletionSoundService(deps = {}) {
    const config = deps.config || require('../../../utils/config');
    const spawn = deps.spawn || childProcess.spawn;
    const platform = deps.platform || process.platform;
    const now = deps.now || (() => performance.now());
    const schedule = deps.setTimeout || setTimeout;
    const cancel = deps.clearTimeout || clearTimeout;
    const readable = deps.readable || (file => {
        if (!path.isAbsolute(file) || !fs.statSync(file).isFile()) throw new Error('Not an absolute audio file');
        fs.accessSync(file, fs.constants.R_OK);
    });
    const warn = deps.warn || (() => {
        const { showWarn, msg } = require('../../../utils/common');
        showWarn(msg('consoleCompletionSoundInvalid'));
    });
    const notify = deps.notify || (async stopCurrent => {
        const { showInfo, msg } = require('../../../utils/common');
        const action = msg('consoleCompletionSoundStop');
        const selection = await showInfo(msg('consoleCompletionSoundPlaying'), action);
        if (selection === action) stopCurrent();
    });
    const log = deps.log || (error => console.warn('Stata All in One: completion sound:', error));
    let player = null;
    let timer = null;
    let generation = 0;
    let disposed = false;

    function stop() {
        generation += 1;
        if (timer !== null) cancel(timer);
        timer = null;
        const previous = player;
        player = null;
        if (previous) {
            try { previous.kill(); } catch (error) { log(error); }
        }
    }

    function play(settings) {
        stop();
        const id = generation;
        let warned = false;
        let notified = false;
        let deadline = null;
        const active = () => !disposed && id === generation;
        const fallback = error => {
            if (!active()) return;
            log(error);
            if (!warned) {
                warned = true;
                try { Promise.resolve(warn()).catch(log); } catch (error) { log(error); }
            }
            launch('notification', '');
        };
        function launch(ringtone, file) {
            if (!active()) return;
            let command;
            let args;
            if (platform === 'darwin') {
                const sounds = { notification: 'Glass', information: 'Ping', warning: 'Sosumi' };
                command = '/usr/bin/afplay';
                args = [ringtone === 'custom' ? file : `/System/Library/Sounds/${sounds[ringtone]}.aiff`];
            } else if (platform === 'win32') {
                command = 'powershell.exe';
                args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
                    '-File', path.resolve(__dirname, '../../../../scripts/play-completion-sound.ps1')];
            } else {
                log('Unsupported audio platform');
                return;
            }
            let child;
            try {
                child = spawn(command, args, { windowsHide: true, stdio: ['pipe', platform === 'win32' ? 'pipe' : 'ignore', 'pipe'] });
            } catch (error) {
                if (ringtone === 'custom') fallback(error); else log(error);
                return;
            }
            player = child;
            if (!notified) {
                notified = true;
                try {
                    Promise.resolve(notify(() => { if (active()) stop(); })).catch(log);
                } catch (error) { log(error); }
            }
            if (deadline === null) {
                deadline = now() + settings.durationSeconds * 1000;
                // Bound even a broken decoder or hung system player.
                timer = schedule(() => { if (active()) stop(); }, (settings.durationSeconds + (platform === 'win32' ? 8 : 0)) * 1000);
            }
            // PowerShell/WPF startup is not part of the requested playback time.
            // The initial watchdog still bounds a hung loader or decoder.
            if (platform === 'win32' && child.stdout) {
                let readyText = '';
                let ready = false;
                child.stdout.on('data', chunk => {
                    if (!active() || player !== child || ready) return;
                    readyText = (readyText + chunk).slice(-256);
                    if (readyText.includes('SAIO_AUDIO_READY')) {
                        ready = true;
                        deadline = now() + settings.durationSeconds * 1000;
                        if (timer !== null) cancel(timer);
                        timer = schedule(() => { if (active()) stop(); }, settings.durationSeconds * 1000);
                    }
                });
            }
            let errorText = '';
            if (child.stderr) child.stderr.on('data', chunk => { errorText = (errorText + chunk).slice(-2048); });
            if (child.stdin) {
                child.stdin.on('error', () => {});
                child.stdin.end(platform === 'win32'
                    ? JSON.stringify({ ringtone, path: file, durationSeconds: settings.durationSeconds }) + '\n'
                    : undefined);
            }
            let handled = false;
            const ended = error => {
                if (handled) return;
                handled = true;
                if (!active() || player !== child) return;
                player = null;
                if (error) {
                    if (ringtone === 'custom') fallback(error); else { log(error); stop(); }
                } else if (platform === 'darwin' && now() < deadline) {
                    if (timer !== null) cancel(timer);
                    // Avoid a tight spawn loop for a zero-length audio file.
                    timer = schedule(() => {
                        if (!active()) return;
                        const remaining = deadline - now();
                        if (remaining <= 0) { stop(); return; }
                        timer = schedule(() => { if (active()) stop(); }, remaining);
                        launch(ringtone, file);
                    }, Math.min(100, Math.max(0, deadline - now())));
                } else {
                    stop();
                }
            };
            child.once('error', ended);
            child.once('close', code => ended(code === 0 ? null : errorText || `Audio player exited with ${code}`));
        }
        if (settings.ringtone === 'custom') {
            try {
                if (path.extname(settings.customPath).toLowerCase() !== '.mp3') throw new Error('Custom sound must be an MP3 file');
                readable(settings.customPath);
            } catch (error) { fallback(error); return; }
        }
        launch(settings.ringtone, settings.customPath);
    }

    function begin(snapshot) {
        stop();
        const id = generation;
        const settings = { ...(snapshot || config.getConsoleCompletionSound()) };
        let durationMs = 0;
        let executed = false;
        let eligible = true;
        let finished = false;
        return {
            record(result, elapsedMs) {
                if (finished) return;
                executed = true;
                durationMs += Math.max(0, elapsedMs);
                if (!result || result.interrupted || result.forced || result.sessionLost || result.sessionUnavailable
                    || (!result.success && (!Number.isInteger(result.returnCode) || result.returnCode <= 0 || result.returnCode === 1))) {
                    eligible = false;
                }
            },
            abort() { eligible = false; },
            finish() {
                if (finished) return;
                finished = true;
                if (!disposed && id === generation && settings.enabled && config.getConsoleCompletionSound().enabled
                    && executed && eligible && durationMs >= settings.thresholdMinutes * 60000) {
                    try { play(settings); } catch (error) { log(error); }
                }
            }
        };
    }

    return {
        begin,
        stop,
        dispose() { disposed = true; stop(); },
        register(context) {
            const vscode = deps.vscode || require('vscode');
            context.subscriptions.push(this, vscode.commands.registerCommand('stata-all-in-one.stopCompletionSound', () => {
                if (player || timer !== null) stop();
            }), vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('stata-all-in-one.consoleCompletionSound.enabled')
                    && !config.getConsoleCompletionSound().enabled) stop();
            }));
        }
    };
}

let service;
function getService() {
    if (!service) service = createCompletionSoundService();
    return service;
}
module.exports = { createCompletionSoundService, getService };
