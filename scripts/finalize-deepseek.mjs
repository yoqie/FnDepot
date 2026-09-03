#!/usr/bin/env node
/*
 * finalize-deepseek.mjs — DeepSeek Harness 发版收尾：把 dist/ 里已有的架构 FPK
 * 信息写入 apps/deepseek_harness.json（支持 x86-only，arm 包到达后增补不覆盖），
 * 拷贝图标，移除 pending。
 * 用法： node scripts/finalize-deepseek.mjs --repo OWNER/NAME --tag <release-tag> --dist <fpk-dir>
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const REPO = opt('--repo', process.env.REPO || 'yoqie/FnDepot');
const TAG = opt('--tag', '');
const DIST = opt('--dist', path.join(ROOT, 'dist'));
if (!TAG) { console.error('missing --tag'); process.exit(1); }

const readJson = async (p, d) => JSON.parse(await fs.readFile(p, 'utf8').catch(() => JSON.stringify(d)));
const writeJson = (p, o) => fs.writeFile(p, JSON.stringify(o, null, 2) + '\n');

const pend = await readJson(path.join(ROOT, 'pending.json'), []);
const entry = pend.find((e) => e.slug === 'deepseek_harness');
if (!entry) { console.log('no deepseek_harness pending, skip'); process.exit(0); }
const meta = await readJson(path.join(ROOT, 'build', 'deepseek_harness', 'meta.json'), null);
if (!meta) { console.log('no meta, skip'); process.exit(1); }

const infos = {};
for (const plat of ['x86', 'arm']) {
  const info = await readJson(path.join(DIST, `deepseek_harness-${plat}.fpk-info.json`), null);
  if (info) infos[plat] = info;
}
if (!Object.keys(infos).length) { console.log('no fpk-info found, skip'); process.exit(0); }

const assetDir = path.join(ROOT, 'assets', 'deepseek_harness');
await fs.mkdir(assetDir, { recursive: true });
try {
  await fs.copyFile(path.join(ROOT, 'build', 'deepseek_harness', 'fnos', 'ICON.PNG'), path.join(assetDir, 'ICON.PNG'));
} catch {}
await fs.writeFile(path.join(assetDir, 'README.md'),
  `# DeepSeek Harness\n\nDeepSeek Harness 官方原生版：内置完整 DSH 运行时与 Agent 能力，无第三方封装。\n\n- 上游版本：${meta.upstream}\n- 仓库：https://github.com/deepseek-ai/dsh\n- 端口：3080（TRIM_SERVICE_PORT）\n- 需要系统 PATH 中有 Node.js >=24\n`);

const detailPath = path.join(ROOT, 'apps', 'deepseek_harness.json');
const detail = await readJson(detailPath, null) || { app_name: 'deepseek_harness', releases: {} };
detail.releases = detail.releases || {};
const rel = detail.releases[entry.version] || {
  changelog: `跟随官方 @deepseek-ai/dsh ${meta.upstream} 自动打包。`,
  updated_at: new Date().toISOString(),
  packages: {},
};
for (const plat of Object.keys(infos)) {
  rel.packages[plat] = {
    download_url: `https://github.com/${REPO}/releases/download/${TAG}/${infos[plat].file}`,
    sha256: infos[plat].sha256,
    size: infos[plat].size,
  };
}
rel.updated_at = new Date().toISOString();
detail.releases[entry.version] = rel;
await writeJson(detailPath, detail);
await writeJson(path.join(ROOT, 'pending.json'), pend.filter((e) => e.slug !== 'deepseek_harness'));
console.log(`deepseek_harness: finalized ${entry.version} (${Object.keys(infos).join('+')})`);