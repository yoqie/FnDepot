#!/usr/bin/env node
/*
 * sync-node24.mjs — 跟随官方 Node.js v24 LTS，为 nodejs_v24 运行时应用探测最新版本。
 * 版本来源：https://nodejs.org/dist/index.json（取最高的 v24.x LTS）。
 * 新版本出现时写 pending.json（工作流据此打包发版）。
 * 用法： node scripts/sync-node24.mjs [--repo OWNER/NAME]
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJson = async (p, d) => JSON.parse(await fs.readFile(p, 'utf8').catch(() => JSON.stringify(d)));
const writeJson = (p, o) => fs.writeFile(p, JSON.stringify(o, null, 2) + '\n');

const idx = await (await fetch('https://nodejs.org/dist/index.json', { headers: { 'User-Agent': 'fnpanel-sync' } })).json();
const v24 = idx.find((x) => x.version.startsWith('v24.') && x.lts);
if (!v24) throw new Error('cannot resolve node v24 LTS');
const latest = v24.version.replace(/^v/, '');
console.log('node v24 LTS:', latest);

const dir = path.join(ROOT, 'build', 'nodejs_v24');
const metaPath = path.join(dir, 'meta.json');
const prev = await readJson(metaPath, null);
const fingerprint = crypto.createHash('sha256').update('nodejs_v24@' + latest).digest('hex').slice(0, 16);
const version = latest;

if (prev && prev.fingerprint === fingerprint) {
  console.log('nodejs_v24: unchanged', prev.version);
} else {
  const status = prev ? 'updated' : 'added';
  await writeJson(metaPath, {
    slug: 'nodejs_v24', appname: 'nodejs_v24', displayName: 'Node.js v24',
    desc: 'Node.js® v24 LTS 运行时，作为 DeepSeek Harness 等应用的运行时依赖。',
    version, upstream: latest, categories: ['编程开发'],
    maintainer_url: 'https://nodejs.org/',
    fingerprint, updated_at: new Date().toISOString(),
  });
  await writeJson(path.join(ROOT, 'pending.json'),
    JSON.parse(await fs.readFile(path.join(ROOT, 'pending.json'), 'utf8').catch(() => '[]'))
      .concat([{ slug: 'nodejs_v24', version }]));
  console.log(`nodejs_v24: ${status} ${latest}`);
}
console.log('done.');