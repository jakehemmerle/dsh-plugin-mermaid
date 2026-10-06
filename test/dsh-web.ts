import { type ChildProcess, spawn } from 'node:child_process';

export interface DshWeb {
  readonly url: string;
  /** Everything the server printed so far (stdout and stderr interleaved). */
  output(): string;
  /** SIGTERM the server's process group, then SIGKILL after 5 s. Idempotent. */
  stop(): Promise<void>;
}

/** Spawn `dsh web --port 0` against an isolated DSH_HOME in its own process group and wait for its URL. */
export function startDshWeb(home: string, env: Record<string, string> = {}): Promise<DshWeb> {
  const child = spawn(process.env.DSH_BIN ?? 'dsh', ['web', '--no-open', '--port', '0'], {
    env: { ...process.env, ...env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  const stop = (): Promise<void> => stopChild(child);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      void stop();
      reject(new Error(`dsh web did not print its URL:\n${output}`));
    }, 60_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const url = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(output)?.[1];
      if (url === undefined) return;
      clearTimeout(timer);
      resolve({ url, output: () => output, stop });
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`dsh web exited early (${code}):\n${output}`));
    });
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  process.kill(-child.pid, 'SIGTERM');
  const timer = setTimeout(() => {
    try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* already gone */ }
  }, 5_000);
  await exited;
  clearTimeout(timer);
}
