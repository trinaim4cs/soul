/**
 * `npm run web:preview`: the website and PWA as they ship (production bundle, service worker),
 * served at http://localhost:8082 against the LOCAL Supabase stack.
 *
 * Why not `npm run web:export` + `expo serve`: an export reads .env.production, so that dist/
 * talks to the hosted project, and anything tried in a local preview of it (a sign-in code, a
 * like) would reach real servers. This build takes its values from .env only, and refuses to
 * serve a bundle that still names the hosted project. Never deploy this dist/: the host runs
 * its own `npm run web:export` (vercel.json).
 *
 * Node rather than bash: on Windows, `bash` can resolve to WSL, and variables exported there
 * never reach the Windows `npx` it starts.
 */
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { parseEnv } from 'node:util';

process.chdir(join(import.meta.dirname, '..'));

const read = (file) => (existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : null);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const local = read('.env') ?? fail('Missing .env (npm run env:init -- development).');
const url = local.EXPO_PUBLIC_SUPABASE_URL ?? '';
if (!/^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1):/.test(url)) {
  fail(`web:preview is for the local stack; .env points at ${url || 'nothing'}.`);
}

const env = {
  ...process.env,
  ...local,
  APP_ENV: 'development',
  // Otherwise Expo reads the env files itself while bundling, and .env.production wins.
  EXPO_NO_DOTENV: '1',
};

// Fixed arguments only, so running them through the shell (needed for npx on Windows) is safe.
function npx(command) {
  const result = spawnSync(`npx ${command}`, { env, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

npx('expo export --platform web --clear');

const hosted = read('.env.production')?.EXPO_PUBLIC_SUPABASE_URL;
const bundles = join('dist', '_expo', 'static', 'js', 'web');
if (
  hosted &&
  readdirSync(bundles).some((file) => readFileSync(join(bundles, file), 'utf8').includes(hosted))
) {
  fail(`The preview bundle points at the hosted project (${hosted}); not serving it.`);
}

// The host serves a file when one exists and the app otherwise (vercel.json rewrites), so
// deep links and reloads work; `expo serve` has no such fallback for a single-page export.
const types = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};
const port = Number(process.env.PORT) || 8082;
createServer((request, response) => {
  let path = '/';
  try {
    path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    // A malformed address gets the app, like any other unknown path.
  }
  let file = normalize(join('dist', path));
  if (!file.startsWith(`dist${sep}`) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join('dist', 'index.html');
  }
  response.writeHead(200, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(response);
}).listen(port, () => console.log(`Serving the local preview at http://localhost:${port}`));
