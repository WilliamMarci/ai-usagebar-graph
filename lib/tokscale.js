import Gio from 'gi://Gio';

export function loadContributionGraph(cancellable = null) {
    let proc;
    try {
        proc = Gio.Subprocess.new(
            ['tokscale', '--json', 'graph', '--no-spinner'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
        );
    } catch (_) {
        return Promise.resolve([]);
    }
    return new Promise(resolve => {
        proc.communicate_utf8_async(null, cancellable, (p, result) => {
            try {
                const [, stdout] = p.communicate_utf8_finish(result);
                const doc = JSON.parse(stdout);
                resolve(Array.isArray(doc.contributions) ? doc.contributions : []);
            } catch (_) {
                resolve([]);
            }
        });
    });
}
