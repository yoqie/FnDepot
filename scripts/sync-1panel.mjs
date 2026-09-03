#!/usr/bin/env node
/*
 * sync-1panel.mjs — 跟随 1Panel 面板本体（官方 CDN v1 LTS），为双架构生成
 * fnOS 原生 FPK 工程，并刷新 fnpack.json / apps/1panel.json / README.md。
 *
 * 用法： node scripts/sync-1panel.mjs [--repo OWNER/NAME]
 * 版本来源：https://resource.1panel.pro/stable/latest（v1 LTS，如 v1.10.34-lts），
 *           v2 已拆分 agent+core 二进制布局，与本打包不兼容，暂不跟。
 * 新版本出现时把 {slug:'1panel',version} 写入 pending.json（工作流据此打包发版）。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const REPO = opt('--repo', process.env.REPO || 'yoqie/FnDepot');

const readJson = async (p, d) => JSON.parse(await fs.readFile(p, 'utf8').catch(() => JSON.stringify(d)));
const writeJson = (p, o) => fs.writeFile(p, JSON.stringify(o, null, 2) + '\n');

const r = await fetch('https://resource.1panel.pro/stable/latest', { headers: { 'User-Agent': 'fnpanel-sync' } });
const latest = ((await r.text()).trim().replace(/^v/, '')) || '';
if (!latest) throw new Error('cannot resolve 1panel latest version');
console.log('upstream latest:', latest);

const dir = path.join(ROOT, 'build', '1panel');
const metaPath = path.join(dir, 'meta.json');
const prev = await readJson(metaPath, null);
// 指纹只跟上游版本走：工程文件是静态的，版本不变就不用动
const fingerprint = crypto.createHash('sha256').update('1panel@' + latest).digest('hex').slice(0, 16);
const version = `${latest}-1`; // fnOS 侧 fpk 版本：上游版本 + 本源打包序号

if (prev && prev.fingerprint === fingerprint) {
  console.log('1panel: unchanged', prev.version);
} else {
  const status = prev ? 'updated' : 'added';
  await writeJson(metaPath, {
    slug: '1panel', appname: '1panel', displayName: '1Panel',
    desc: '开源服务器运维管理面板，提供可视化的 Linux 服务器管理。',
    version, upstream: latest, categories: ['系统工具'],
    maintainer_url: 'https://github.com/1Panel-dev/1Panel',
    fingerprint, updated_at: new Date().toISOString(),
  });
  await writeJson(path.join(ROOT, 'pending.json'), [{ slug: '1panel', version, upstream: latest }]);
  console.log(`1panel: ${status} ${version}`);
}

// ---- 索引骨架 + 详情元数据（releases 由 finalize 维护）----
const source = await readJson(path.join(ROOT, 'source.json'), {});
const fnpack = await readJson(path.join(ROOT, 'fnpack.json'), null) || { schema_version: '2', source_info: {}, apps: {} };
fnpack.schema_version = '2';
fnpack.source_info = {
  name: source.name || '1Panel 跟随源', author: source.author || 'FnDepot',
  homepage: source.homepage || '', description: source.description || '',
};
fnpack.apps = fnpack.apps || {};
const meta = await readJson(metaPath, null);
if (meta) {
  fnpack.apps['1panel'] = { details_url: 'apps/1panel.json', details_updated_at: meta.updated_at };
  await fs.mkdir(path.join(ROOT, 'apps'), { recursive: true });
  const detailPath = path.join(ROOT, 'apps', '1panel.json');
  const detail = await readJson(detailPath, null) || { app_name: '1panel', releases: {} };
  Object.assign(detail, {
    app_name: '1panel', display_name: '1Panel',
    desc: '开源服务器运维管理面板，提供可视化的 Linux 服务器管理。',
    platform: ['x86', 'arm'], categories: ['系统工具'],
    icon_url: `https://raw.githubusercontent.com/${REPO}/main/assets/1panel/ICON.PNG`,
    readme_url: `https://raw.githubusercontent.com/${REPO}/main/assets/1panel/README.md`,
    bug_report_url: `https://github.com/${REPO}/issues`,
    maintainer: '1Panel-dev', maintainer_url: 'https://github.com/1Panel-dev/1Panel',
    distributor: source.author || 'FnDepot', distributor_url: `https://github.com/${REPO}`,
    run_as: 'root', install_type: 'root', is_docker: false, service_port: '10086',
  });
  detail.releases = detail.releases || {};
  await writeJson(detailPath, detail);
}
await writeJson(path.join(ROOT, 'fnpack.json'), fnpack);

// README：1panel 放首行，其余 Docker 型应用（apps.allowlist.txt）随后
const rows = [];
if (meta) rows.push(`| [1Panel](build/1panel/) | 开源服务器运维管理面板，提供可视化的 Linux 服务器管理。 | ${meta.upstream} |`);
const allowlist = (await fs.readFile(path.join(ROOT, 'apps.allowlist.txt'), 'utf8'))
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
for (const slug of allowlist) {
  const m = await readJson(path.join(ROOT, 'build', slug, 'meta.json'), null);
  if (!m || m.appname === '1panel') continue;
  rows.push(`| ${m ? `[${m.displayName}](build/${slug}/)` : slug} | ${m ? m.desc : '—'} | ${m ? m.version : '—'} |`);
}
await fs.writeFile(path.join(ROOT, 'README.md'),
  `# FnDepot · 1Panel 跟随源\n\n飞牛 fnOS 个人第三方应用源——由 GitHub Actions 跟随 [1Panel 官方](https://github.com/1Panel-dev/1Panel) 自动打包更新（面板本体为原生 FPK，其余为 Docker 型 FPK）。\n\n` +
  `- 源地址（添加到 FnDepot/AppCenter 第三方源）：\`https://github.com/${REPO}\` 或 \`https://raw.githubusercontent.com/${REPO}/main/fnpack.json\`\n` +
  `- 跟随：1Panel 面板本体（v1 LTS，官方 CDN）+ \`apps.allowlist.txt\` 名单中的应用市场应用\n` +
  `- 同步频率：每天一次（可手动触发），有新版本时自动打包 FPK 并发布 Release。\n\n## 应用列表\n\n| 应用 | 描述 | 上游版本 |\n|------|------|----------|\n${rows.join('\n')}\n`);
console.log('done.');
