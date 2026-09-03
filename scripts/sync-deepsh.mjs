#!/usr/bin/env node
/*
 * sync-deepsh.mjs — 跟随官方 npm 源 @deepseek-ai/dsh 最新版本。
 * 新版本出现时写 pending.json（工作流据此打包发版）+ 更新 meta.json。
 * 用法： node scripts/sync-deepsh.mjs [--repo OWNER/NAME]
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJson = async (p, d) => JSON.parse(await fs.readFile(p, 'utf8').catch(() => JSON.stringify(d)));
const writeJson = (p, o) => fs.writeFile(p, JSON.stringify(o, null, 2) + '\n');

// latest dist-tag from npm
const info = await (await fetch('https://registry.npmjs.org/@deepseek-ai/dsh', { headers: { 'User-Agent': 'fnpanel-sync' } })).json();
const latest = info['dist-tags']?.latest || '';
if (!latest) throw new Error('cannot resolve @deepseek-ai/dsh latest version');
console.log('upstream latest:', latest);

const dir = path.join(ROOT, 'build', 'deepseek_harness');
const metaPath = path.join(dir, 'meta.json');
const prev = await readJson(metaPath, null);
const fingerprint = crypto.createHash('sha256').update('deepseek_harness@' + latest).digest('hex').slice(0, 16);
const version = `${latest}`;

if (prev && prev.fingerprint === fingerprint) {
  console.log('deepseek_harness: unchanged', prev.version);
} else {
  const status = prev ? 'updated' : 'added';
  await writeJson(metaPath, {
    slug: 'deepseek_harness', appname: 'deepseek_harness', displayName: 'DeepSeek Harness',
    desc: 'DeepSeek Harness 官方原生版：内置完整 DSH 运行时与 Agent 能力，端口 3080。',
    version, upstream: latest, categories: ['AI赋能', '系统工具'],
    maintainer_url: 'https://github.com/deepseek-ai/dsh',
    fingerprint, updated_at: new Date().toISOString(),
  });
  await writeJson(path.join(ROOT, 'pending.json'),
    JSON.parse(await fs.readFile(path.join(ROOT, 'pending.json'), 'utf8').catch(() => '[]'))
      .concat([{ slug: 'deepseek_harness', version }]));
  console.log(`deepseek_harness: ${status} ${latest}`);
}
console.log('done.');