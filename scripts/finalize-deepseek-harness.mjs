#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = process.argv[2] || 'yoqie/FnDepot';
const version = process.argv[3];
if (!version) throw new Error('usage: node scripts/finalize-deepseek-harness.mjs <version>');

const detailPath = path.join(root, 'apps', 'deepseek-harness.json');
const detail = JSON.parse(await fs.readFile(detailPath, 'utf8'));
detail.updated_at = new Date().toISOString();
detail.releases[version] = {
  version,
  release_note: `DeepSeek Harness ${version}，内置离线运行时、插件市场与插件自更新。`,
  updated_at: new Date().toISOString(),
  packages: {
    arm: {
      version,
      download_url: `https://github.com/${repo}/releases/download/deepseek-harness-${version}/deepseek-harness_${version}_arm.fpk`,
    },
    x86: {
      version,
      download_url: `https://github.com/${repo}/releases/download/deepseek-harness-${version}/deepseek-harness_${version}_x86.fpk`,
    },
  },
};

await fs.writeFile(detailPath, JSON.stringify(detail, null, 2) + '\n');
await fs.writeFile(path.join(root, 'build', 'deepseek-harness', 'meta.json'), JSON.stringify({
  slug: 'deepseek-harness',
  appname: 'deepseek-harness',
  displayName: 'DeepSeek Harness',
  desc: detail.desc,
  version,
  upstream: version,
  categories: detail.categories,
  maintainer_url: detail.maintainer_url,
  updated_at: detail.updated_at,
}, null, 2) + '\n');
