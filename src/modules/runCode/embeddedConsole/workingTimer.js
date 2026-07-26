function formatWorkingElapsedSeconds(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    const pad = value => String(value).padStart(2, '0');

    if (hours > 0) {
        return `${hours}h${pad(minutes)}m${pad(remainingSeconds)}s`;
    }

    if (minutes > 0) {
        return `${minutes}m${pad(remainingSeconds)}s`;
    }

    return `${remainingSeconds}s`;
}

module.exports = {
    formatWorkingElapsedSeconds
};
