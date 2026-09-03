#!/usr/bin/env node
/*
 * finalize-node24.mjs — nodejs_v24 运行时发版收尾：写 apps/nodejs_v24.json、
 * 拷贝图标到 assets/nodejs_v24/，移除 pending。
 * 用法： node scripts/finalize-node24.mjs --repo OWNER/NAME --tag <release-tag> --dist <fpk-dir>
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const REPO = opt('--repo', process.env.REPO || 'yoqie/FnDepot');
const TAG = opt('--tag', '');
const DIST = opt('--dist', path.join(ROOT, 'dist'));
if (!TAG) { console.error('missing --tag'); process.exit(1); }

const readJson = async (p, d) => JSON.parse(await fs.readFile(p, 'utf8').catch(() => JSON.stringify(d)));
const writeJson = (p, o) => fs.writeFile(p, JSON.stringify(o, null, 2) + '\n');

const pend = await readJson(path.join(ROOT, 'pending.json'), []);
const entry = pend.find((e) => e.slug === 'nodejs_v24');
if (!entry) { console.log('no nodejs_v24 pending, skip'); process.exit(0); }
const meta = await readJson(path.join(ROOT, 'build', 'nodejs_v24', 'meta.json'), null);
if (!meta) { console.log('no meta, skip'); process.exit(1); }

const infos = {};
for (const plat of ['x86', 'arm']) {
  const info = await readJson(path.join(DIST, `nodejs_v24-${plat}.fpk-info.json`), null);
  if (!info) { console.log(`missing fpk-info for ${plat}, skip`); process.exit(1); }
  infos[plat] = info;
}

const assetDir = path.join(ROOT, 'assets', 'nodejs_v24');
await fs.mkdir(assetDir, { recursive: true });
await fs.copyFile(path.join(ROOT, 'build', 'nodejs_v24', 'fnos', 'ICON.PNG'), path.join(assetDir, 'ICON.PNG'));
await fs.writeFile(path.join(assetDir, 'README.md'),
  `# Node.js v24\n\nNode.js® v24 LTS 运行时，作为 DeepSeek Harness 等应用的运行时依赖（安装路径 /var/apps/nodejs_v24/target）。\n\n- 上游版本：${meta.upstream}\n- 官网：https://nodejs.org\n`);

const detailPath = path.join(ROOT, 'apps', 'nodejs_v24.json');
const detail = await readJson(detailPath, null) || { app_name: 'nodejs_v24', releases: {} };
detail.releases = detail.releases || {};
if (!detail.releases[entry.version]) {
  const pkgs = {};
  for (const plat of ['x86', 'arm']) {
    pkgs[plat] = {
      download_url: `https://github.com/${REPO}/releases/download/${TAG}/${infos[plat].file}`,
      sha256: infos[plat].sha256,
      size: infos[plat].size,
    };
  }
  detail.releases[entry.version] = {
    changelog: `跟随官方 Node.js v24 LTS ${meta.upstream} 自动打包。`,
    updated_at: new Date().toISOString(),
    packages: pkgs,
  };
}
const vers = Object.keys(detail.releases).sort().reverse();
for (const v of vers.slice(100)) delete detail.releases[v];
await writeJson(detailPath, detail);
await writeJson(path.join(ROOT, 'pending.json'), pend.filter((e) => e.slug !== 'nodejs_v24'));
console.log(`nodejs_v24: finalized ${entry.version}`);