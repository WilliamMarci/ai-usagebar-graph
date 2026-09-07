import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function executable() {
    return GLib.find_program_in_path('tokscale')
        ?? GLib.build_filenamev([GLib.get_home_dir(), '.npm-global', 'bin', 'tokscale']);
}

export function loadContributionGraph(cancellable = null) {
    let proc;
    try {
        proc = Gio.Subprocess.new(
            [executable(), '--json', 'graph', '--no-spinner'],
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

export function loadSubscriptionUsage(provider, cancellable = null) {
    let proc;
    try {
        proc = Gio.Subprocess.new([executable(), 'usage', '--json'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
    } catch (e) {
        return Promise.reject(e);
    }
    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(null, cancellable, (p, result) => {
            try {
                const [, stdout] = p.communicate_utf8_finish(result);
                const rows = JSON.parse(stdout);
                const found = rows.find(row => row.provider === provider);
                if (!found)
                    throw new Error(`${provider}: TokScale returned no quota data`);
                resolve(found);
            } catch (e) {
                reject(e);
            }
        });
    });
}
