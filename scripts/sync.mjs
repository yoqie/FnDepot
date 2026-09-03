#!/usr/bin/env node
/*
 * sync.mjs — 跟随 1Panel 官方源 (1Panel-dev/appstore@dev)，为名单中的应用生成
 * fnOS Docker 型 FPK 工程目录 build/<slug>/fnos/，并刷新 fnpack.json / apps/*.json / README.md。
 *
 * 用法：
 *   node scripts/sync.mjs [--repo OWNER/NAME] [--ref BRANCH]
 *   --repo  将来推送到 GitHub 的仓库（用于生成 details_url 等相对地址以外的绝对地址）
 *           默认读取 env REPO（Action 里传 github.repository），本地可省略。
 *
 * 行为：
 *   - 只处理 apps.allowlist.txt 名单中的应用；
 *   - 每个应用只跟同一 key 下的最新版本目录（如 mysql 只跟 8.4.x，不跟 5.7.x）；
 *   - 新版本出现时把 slug 写入 pending.json（工作流据此决定是否打包发版），
 *     无变化时不碰已有生成文件（版本号、details_updated_at 保持不变）。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const UPSTREAM = 'https://raw.githubusercontent.com/1Panel-dev/appstore/dev';
const API = 'https://api.github.com/repos/1Panel-dev/appstore/contents';

// 1Panel tag key -> FnDepot 固定分类
const CATEGORY_MAP = {
  AI: 'AI赋能', Website: '编程开发', Database: '编程开发', Server: '编程开发',
  Runtime: '编程开发', Tool: '系统工具', Storage: '系统工具', BI: '系统工具',
  CRM: '系统工具', Security: '系统工具', DevTool: '编程开发', DevOps: '系统工具',
  Middleware: '编程开发', Media: '影音娱乐', Email: '系统工具', Game: '游戏地带',
  Local: '系统工具',
};
const DEFAULT_CATEGORY = '系统工具';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const REPO = opt('--repo', process.env.REPO || 'OWNER/NAME');

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'fnpanel-sync' } });
  if (!r.ok) throw new Error(`fetch ${r.status} ${url}`);
  return r.text();
}
async function fetchDir(apiPath) {
  const r = await fetch(`${API}/${apiPath}?ref=dev`, { headers: { 'User-Agent': 'fnpanel-sync' } });
  if (!r.ok) throw new Error(`api ${r.status} ${apiPath}`);
  const j = await r.json();
  return j.filter((e) => e.type === 'dir').map((e) => e.name);
}
const exists = async (p) => !!(await fs.stat(p).catch(() => null));
const readJson = async (p, d) => JSON.parse(await fs.readFile(p, 'utf8').catch(() => JSON.stringify(d)));
const writeJson = (p, o) => fs.writeFile(p, JSON.stringify(o, null, 2) + '\n');

// ---- 轻量提取：只取我们关心的字段，避免引入 YAML 依赖 ----
function pick(re, text, d = '') {
  const m = text.match(re);
  return m ? m[1].trim() : d;
}
function parseAppDataYml(text) {
  const tags = [];
  const m = text.match(/\n\s*tags:\s*\n((?:\s*-\s*.+\n)+)/);
  if (m) for (const line of m[1].split('\n')) {
    const t = line.match(/-\s*(.+)/);
    if (t) tags.push(t[1].trim());
  }
  return {
    name: pick(/^\s*name:\s*(.+)\s*$/m, text),
    title: pick(/^\s*title:\s*(.+)\s*$/m, text),
    description: pick(/^\s*description:\s*(.+)\s*$/m, text),
    key: pick(/^\s*key:\s*(.+)\s*$/m, text),
    website: pick(/^\s*website:\s*(.+)\s*$/m, text),
    github: pick(/^\s*github:\s*(.+)\s*$/m, text),
    shortDescEn: pick(/^\s*shortDescEn:\s*(.+)\s*$/m, text),
    tags,
  };
}
function parseFormFields(text) {
  const fields = [];
  const re = /-\s*default:\s*(\S+)[\s\S]*?envKey:\s*(\S+)/g;
  let m;
  while ((m = re.exec(text))) fields.push({ def: m[1], envKey: m[2] });
  return fields;
}
function cmpVer(a, b) {
  const pa = a.split(/[.\-+_]/).map((x) => (isNaN(+x) ? x : +x));
  const pb = b.split(/[.\-+_]/).map((x) => (isNaN(+x) ? x : +x));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (typeof x === typeof y) { if (x < y) return -1; if (x > y) return 1; }
    else return typeof x === 'number' ? 1 : -1;
  }
  return 0;
}
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---- compose 转换：1Panel 形态 -> fnOS docker-project 形态 ----
function convertCompose(text, appname) {
  const lines = text.split('\n');
  const out = [];
  let skipIndent = -1;
  let portDone = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.match(/^\s*/)[0].length;
    // 跳过 networks 引用块（service 级和顶层，fnOS docker-project 不需要 1panel 外部网络）
    if (/^\s*networks:\s*$/.test(line)) { skipIndent = indent; continue; }
    if (skipIndent >= 0) {
      if (line.trim() === '' || indent > skipIndent) continue;
      skipIndent = -1;
    }
    let s = line.replace(/\$\{CONTAINER_NAME\}/g, appname).replace(/\$CONTAINER_NAME\b/g, appname);
    // 端口：第一条映射走 TRIM_SERVICE_PORT，其余固定为 container:container
    const pm = s.match(/^(\s*-\s*)"\$\{([A-Za-z0-9_]+)\}:(\d+)"\s*$/);
    if (pm) {
      if (!portDone) { s = `${pm[1]}"\${TRIM_SERVICE_PORT}:${pm[3]}"`; portDone = true; }
      else s = `${pm[1]}"${pm[3]}:${pm[3]}"`;
    }
    // 数据卷：./xxx -> ${TRIM_PKGVAR:?}/xxx
    s = s.replace(/^(\s*-\s*)\.\/([^:]+):(.+)$/, `$1\${TRIM_PKGVAR:?}/$2:$3`);
    out.push(s);
  }
  return { compose: out.join('\n'), portMapped: portDone };
}
function firstContainerPort(compose) {
  const m = compose.match(/"\$\{TRIM_SERVICE_PORT\}:(\d+)"/) || compose.match(/"(\d+):\d+"/);
  return m ? m[1] : null;
}

// ---- 单应用同步 ----
async function syncApp(slug, source) {
  const dir = `apps/${slug}`;
  let appYml;
  try {
    appYml = await fetchText(`${UPSTREAM}/${dir}/data.yml`);
  } catch { return { slug, status: 'missing-upstream' }; }
  const meta = parseAppDataYml(appYml);
  const versions = (await fetchDir(dir)).filter((v) => /^[\dv]/.test(v));
  if (!versions.length) return { slug, status: 'no-versions' };
  const latest = versions.sort(cmpVer).pop();
  const [verYml, composeRaw, readme] = await Promise.all([
    fetchText(`${UPSTREAM}/${dir}/${latest}/data.yml`).catch(() => ''),
    fetchText(`${UPSTREAM}/${dir}/${latest}/docker-compose.yml`),
    fetchText(`${UPSTREAM}/${dir}/README.md`).catch(() => ''),
  ]);
  let logo;
  try {
    const r = await fetch(`${UPSTREAM}/${dir}/logo.png`);
    logo = Buffer.from(await r.arrayBuffer());
  } catch { logo = null; }

  const appname = (meta.key || slug).toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const fields = parseFormFields(verYml);
  const { compose, portMapped } = convertCompose(composeRaw, appname);
  const containerPort = firstContainerPort(compose) || fields[0]?.def || '8080';
  const portField = portMapped
    ? fields.find((f) => composeRaw.includes(`\${${f.envKey}}`)) || fields[0]
    : fields[0];
  const defaultPort = String(portField?.def || containerPort);

  const categories = [...new Set(meta.tags.map((t) => CATEGORY_MAP[t]).filter(Boolean))].slice(0, 2);
  if (!categories.length) categories.push(DEFAULT_CATEGORY);
  const displayName = meta.name || slug;
  const desc = meta.title || meta.description || displayName;

  const buildDir = path.join(ROOT, 'build', slug);
  const metaPath = path.join(buildDir, 'meta.json');
  const prev = await readJson(metaPath, null);
  const fingerprint = crypto.createHash('sha256')
    .update([latest, compose, defaultPort].join('\n')).digest('hex').slice(0, 16);
  if (prev && prev.fingerprint === fingerprint) return { slug, status: 'unchanged', version: prev.version };

  // 写 FPK 工程
  const fnos = path.join(buildDir, 'fnos');
  await fs.rm(fnos, { recursive: true, force: true });
  await fs.mkdir(path.join(fnos, 'docker'), { recursive: true });
  await fs.mkdir(path.join(fnos, 'cmd'), { recursive: true });
  await fs.mkdir(path.join(fnos, 'config'), { recursive: true });
  await fs.mkdir(path.join(fnos, 'wizard'), { recursive: true });
  await fs.mkdir(path.join(fnos, 'ui', 'images'), { recursive: true });

  await fs.writeFile(path.join(fnos, 'docker', 'docker-compose.yaml'), compose);
  await fs.writeFile(path.join(fnos, 'cmd', 'main'), DOCKER_MAIN);
  await fs.writeFile(path.join(fnos, 'cmd', 'service-setup'),
    SERVICE_SETUP.replace(/__CONTAINER_PORT__/g, containerPort).replace(/__APPNAME__/g, appname));
  await fs.writeFile(path.join(fnos, 'config', 'privilege'),
    JSON.stringify({ defaults: { 'run-as': 'package' }, username: appname, groupname: appname }, null, 4) + '\n');
  await fs.writeFile(path.join(fnos, 'config', 'resource'), JSON.stringify({
    'port-config': { 'protocol-file': `${displayName}.sc` },
    'data-share': { shares: [{ name: displayName, permission: { rw: [appname] } }] },
    'docker-project': { projects: [{ name: appname, path: 'docker' }] },
  }, null, 4) + '\n');
  await fs.writeFile(path.join(fnos, 'wizard', 'install'), JSON.stringify([{
    stepTitle: '安装说明',
    items: [{ type: 'tips', helpText: `${escHtml(desc)}<br>上游版本 ${escHtml(latest)}，由本源自动跟随打包。` }],
  }], null, 2) + '\n');
  await fs.writeFile(path.join(fnos, 'wizard', 'config'), JSON.stringify([{
    stepTitle: displayName,
    items: [{
      type: 'text', field: 'wizard_port', label: 'Web UI 端口',
      initValue: String(defaultPort),
      rules: [
        { required: true, message: '请输入端口号' },
        { pattern: '^[0-9]+$', message: '端口必须是数字' },
      ],
    }],
  }], null, 2) + '\n');
  await fs.writeFile(path.join(fnos, 'ui', 'config'), JSON.stringify({
    '.url': {
      [`${displayName}.Application`]: {
        title: displayName, desc, 'icon': 'images/{0}.png',
        type: 'url', port: String(defaultPort), protocol: 'http', url: '/', allUsers: true,
      },
    },
  }, null, 2) + '\n');
  await fs.writeFile(path.join(fnos, `${displayName}.sc`),
    `[${displayName}]\ntitle="${displayName}"\ndesc="${displayName}"\nport_forward="yes"\nsrc.ports="${defaultPort}/tcp"\ndst.ports="${defaultPort}/tcp"\n`);
  const pad = (k, v) => `${k}${' '.repeat(Math.max(1, 16 - k.length))}= ${v}\n`;
  await fs.writeFile(path.join(fnos, 'manifest'),
    pad('appname', appname) + pad('version', latest) + pad('display_name', displayName) +
    pad('platform', 'all') + pad('maintainer', '1Panel') +
    pad('maintainer_url', 'https://github.com/1Panel-dev/appstore') +
    pad('distributor', source.author) + pad('distributor_url', `https://github.com/${REPO}`) +
    pad('desktop_uidir', 'ui') + pad('desktop_applaunchname', `${displayName}.Application`) +
    pad('service_port', defaultPort) + pad('desc', desc) + pad('source', 'thirdparty') + pad('checksum', ''));
  if (logo) {
    await fs.writeFile(path.join(fnos, 'ICON.PNG'), logo);
    await fs.writeFile(path.join(fnos, 'ICON_256.PNG'), logo);
    await fs.writeFile(path.join(fnos, 'ui', 'images', '256.png'), logo);
  }
  await fs.writeFile(path.join(buildDir, 'README.md'),
    `# ${displayName}\n\n${desc}\n\n- 上游：1Panel 官方源 \`${slug}\` / ${latest}\n` +
    (meta.website ? `- 官网：${meta.website}\n` : '') + (meta.github ? `- 仓库：${meta.github}\n` : '') +
    `\n${readme ? readme.slice(0, 6000) : ''}\n`);
  await writeJson(metaPath, {
    slug, appname, displayName, desc, version: latest, defaultPort, containerPort,
    categories, maintainer_url: meta.github || 'https://github.com/1Panel-dev/appstore',
    fingerprint, updated_at: new Date().toISOString(),
  });
  return { slug, status: prev ? 'updated' : 'added', version: latest };
}

const DOCKER_MAIN = `#!/bin/bash
FILE_PATH="\${TRIM_APPDEST}/docker/docker-compose.yaml"
is_docker_running () {
    DOCKER_NAME=""
    if [ -f "$FILE_PATH" ]; then
        DOCKER_NAME=$(cat $FILE_PATH | grep "container_name" | awk -F ':' '{print $2}' | xargs)
    fi
    if [ -n "$DOCKER_NAME" ]; then
        docker inspect $DOCKER_NAME | grep -q '"Status": "running",' || exit 1
        return
    fi
}
case $1 in
start) exit 0 ;;
stop) exit 0 ;;
status) if is_docker_running; then exit 0; else exit 3; fi ;;
*) exit 1 ;;
esac
`;

const SERVICE_SETUP = `#!/bin/bash

service_postinst() {
    mkdir -p "\${TRIM_PKGVAR}/data" 2>/dev/null || true
}

COMPOSE_FILE="\${TRIM_APPDEST}/docker/docker-compose.yaml"
PORT_SAVE="\${TRIM_PKGVAR}/.port"

apply_port() {
    local port="$1"
    [ -z "$port" ] && return
    sed -i 's/"[^"]*:__CONTAINER_PORT__"/"'"\${port}"':__CONTAINER_PORT__"/' "$COMPOSE_FILE"
    echo "\${port}" > "$PORT_SAVE"
}

service_postupgrade() {
    if [ -f "$PORT_SAVE" ]; then
        apply_port "$(cat "$PORT_SAVE")"
    fi
}

service_postconfig() {
    if [ -n "\${wizard_port:-}" ]; then
        apply_port "\${wizard_port}"
    fi
}
`;

// ---- 主流程 ----
const allowlist = (await fs.readFile(path.join(ROOT, 'apps.allowlist.txt'), 'utf8'))
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const source = await readJson(path.join(ROOT, 'source.json'), {});
const results = [];
for (const slug of allowlist) {
  try {
    const r = await syncApp(slug, source);
    console.log(`${r.slug}: ${r.status}${r.version ? ' ' + r.version : ''}`);
    results.push(r);
  } catch (e) { console.log(`${slug}: ERROR ${e.message}`); results.push({ slug, status: 'error', error: e.message }); }
}
const pending = results.filter((r) => r.status === 'added' || r.status === 'updated')
  .map((r) => ({ slug: r.slug, version: r.version }));
await writeJson(path.join(ROOT, 'pending.json'), pending);

// 刷新 fnpack.json 索引骨架 + apps 详情元数据（releases 由 finalize 步骤维护）
const fnpackPath = path.join(ROOT, 'fnpack.json');
const fnpack = await readJson(fnpackPath, null) || { schema_version: '2', source_info: {}, apps: {} };
fnpack.schema_version = '2';
fnpack.source_info = {
  name: source.name || '1Panel 跟随源', author: source.author || 'FnDepot',
  homepage: source.homepage || '', description: source.description || '',
};
fnpack.apps = fnpack.apps || {};
await fs.mkdir(path.join(ROOT, 'apps'), { recursive: true });
const now = new Date().toISOString();
for (const slug of allowlist) {
  const m = await readJson(path.join(ROOT, 'build', slug, 'meta.json'), null);
  if (!m) continue;
  fnpack.apps[m.appname] = {
    details_url: `apps/${slug}.json`,
    details_updated_at: m.updated_at || now,
  };
  const detailPath = path.join(ROOT, 'apps', `${slug}.json`);
  const detail = await readJson(detailPath, null) || { app_name: m.appname, releases: {} };
  detail.app_name = m.appname;
  detail.display_name = m.displayName;
  detail.desc = m.desc;
  detail.platform = ['x86', 'arm'];
  detail.categories = m.categories;
  detail.icon_url = `./${slug}/ICON.PNG`;
  detail.readme_url = `./${slug}/README.md`;
  detail.maintainer = '1Panel';
  detail.maintainer_url = m.maintainer_url;
  detail.distributor = source.author || 'FnDepot';
  detail.distributor_url = `https://github.com/${REPO}`;
  detail.run_as = 'package';
  detail.install_type = '';
  detail.is_docker = true;
  detail.service_port = String(m.defaultPort);
  detail.releases = detail.releases || {};
  await writeJson(detailPath, detail);
}
await writeJson(fnpackPath, fnpack);

// README 应用表
const rows = [];
for (const slug of allowlist) {
  const m = await readJson(path.join(ROOT, 'build', slug, 'meta.json'), null);
  rows.push(`| ${m ? `[${m.displayName}](build/${slug}/)` : slug} | ${m ? m.desc : '—'} | ${m ? m.version : '—'} |`);
}
const readme = `# FnDepot · 1Panel 跟随源\n\n飞牛 fnOS 个人第三方应用源——由 GitHub Actions 跟随 [1Panel 官方源](https://github.com/1Panel-dev/appstore) 自动打包更新（Docker 型 FPK）。\n\n- 源地址（添加到 FnDepot/AppCenter 第三方源）：` +
  `\`https://github.com/${REPO}\` 或 \`https://raw.githubusercontent.com/${REPO}/main/fnpack.json\`\n` +
  `- 跟随名单：\`apps.allowlist.txt\`（每行一个 1Panel 应用 key，只跟同 key 最新版本）\n` +
  `- 同步频率：每天一次（可手动触发），有新版本时自动打包架构无关的 Docker 型 FPK 并发布 Release。\n\n## 应用列表\n\n| 应用 | 描述 | 上游版本 |\n|------|------|----------|\n${rows.join('\n')}\n`;
await fs.writeFile(path.join(ROOT, 'README.md'), readme);
console.log(`done. pending: ${pending.length}`);
