/**
 * Stata engine operation queue
 *
 * Every operation that touches the Stata engine — user Console execution,
 * variable/metadata queries, Data Viewer reads, plugin preparation — has to run
 * one at a time. The native bridge keeps per-execution state (output polling,
 * command slot, capture buffer) that simply cannot represent two concurrent
 * commands, and Stata itself is single-threaded.
 *
 * Design constraints:
 *  - strictly FIFO, so a Viewer read can never be interleaved into the middle
 *    of a user command;
 *  - out-of-band signals (Break, clear output, capture cancel) must NOT wait
 *    behind the queue, otherwise the stop button stops working during the very
 *    long command it is meant to interrupt;
 *  - a rejected task must never stall the queue;
 *  - re-entrant calls made from inside a task (a read transaction running
 *    several commands) must not deadlock by queueing behind themselves.
 */

function createOperationQueue() {
    /** @type {Array<{task: function, resolve: function, reject: function, label: string}>} */
    const pending = [];
    let running = false;
    let idleWaiters = [];
    let completed = 0;
    let currentLabel = '';

    function drainIdleWaiters() {
        if (running || pending.length || !idleWaiters.length) {
            return;
        }
        const waiters = idleWaiters;
        idleWaiters = [];
        for (const resolve of waiters) {
            resolve();
        }
    }

    function runNext() {
        if (running) {
            return;
        }
        const entry = pending.shift();
        if (!entry) {
            drainIdleWaiters();
            return;
        }
        running = true;
        currentLabel = entry.label;
        let result;
        try {
            result = entry.task();
        } catch (error) {
            running = false;
            currentLabel = '';
            completed += 1;
            entry.reject(error);
            runNext();
            return;
        }
        Promise.resolve(result).then(
            (value) => {
                running = false;
                currentLabel = '';
                completed += 1;
                entry.resolve(value);
                runNext();
            },
            (error) => {
                running = false;
                currentLabel = '';
                completed += 1;
                entry.reject(error);
                runNext();
            }
        );
    }

    /**
     * Queue a task. Returns a promise that settles with the task result.
     * @param {function(): any} task
     * @param {string} [label] diagnostics only
     */
    function enqueue(task, label = '') {
        if (typeof task !== 'function') {
            return Promise.reject(new TypeError('Queue task must be a function.'));
        }
        return new Promise((resolve, reject) => {
            pending.push({ task, resolve, reject, label });
            runNext();
        });
    }

    function isRunning() {
        return running;
    }

    function depth() {
        return pending.length + (running ? 1 : 0);
    }

    function whenIdle() {
        if (!running && !pending.length) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            idleWaiters.push(resolve);
        });
    }

    function getStats() {
        return {
            running,
            currentLabel,
            pending: pending.length,
            completed
        };
    }

    return { enqueue, isRunning, depth, whenIdle, getStats };
}

module.exports = { createOperationQueue };
