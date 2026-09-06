import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const requested = process.argv[2] || 'http://localhost:3000';
const origin = new URL(requested);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
if (
  origin.username ||
  origin.password ||
  (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))
) {
  throw new Error(
    'Supply an HTTPS origin, or HTTP on localhost. No credentials in the URL.',
  );
}
try {
  writeFileSync(
    '.env',
    [
      `FORUM_ORIGIN=${origin.origin}`,
      'UAF_PORT=3000',
      `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`,
      `UAF_ADMIN_TOKEN=${randomBytes(32).toString('hex')}`,
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Created private .env configuration. Run: docker compose up --build -d',
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.error(
    '.env already exists. Kept the existing configuration and secrets.',
  );
  process.exitCode = 1;
}
