import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [home, pluginEntry, sessionId = 'session-9fdfdf53-ba1f-4e96-90f0-4a9c253eba5c'] = process.argv.slice(2);
const real = join(homedir(), '.dsh');
const wsKey = '--Users-jake-code--';
const realWs = JSON.parse(readFileSync(join(real, 'storages/workspace.json'), 'utf8'));
const [wsId, ws] = Object.entries(realWs.tables.workspaces).find(([, w]) => w.sessionIds.includes(sessionId));

rmSync(home, { recursive: true, force: true });
mkdirSync(join(home, 'profiles/web'), { recursive: true });
mkdirSync(join(home, 'storages/session_projcache/sessions'), { recursive: true });
cpSync(join(real, 'sessions', wsKey, sessionId), join(home, 'sessions', wsKey, sessionId), { recursive: true });
rmSync(join(home, 'sessions', wsKey, sessionId, 'session.lock'), { force: true });
cpSync(join(real, 'storages/session_projcache/sessions', `${sessionId}.json`), join(home, 'storages/session_projcache/sessions', `${sessionId}.json`));
writeFileSync(join(home, 'storages/workspace.json'), JSON.stringify({
  unit: realWs.unit,
  global: { initialized: true, defaultWorkspaceId: wsId, workspaceIds: [wsId], archivedSessionIds: [], pinnedSessionIds: [] },
  tables: { workspaces: { [wsId]: { ...ws, sessionIds: [sessionId] } } },
}));
writeFileSync(join(home, 'profiles/web/cordis.patch.yml'), [
  '- id: ui-settings-general',
  '  name: "@deepseek-ai/dsh-client-ui-settings-general"',
  '  config:',
  '    welcomeNoticeVersion: 2026-09-28.1',
  ...(pluginEntry ? ['- insert:', '    - id: ui-mermaid', `      name: ${pluginEntry}`] : []),
  '',
].join('\n'));
console.log(`seeded ${home} with ${sessionId}`);
