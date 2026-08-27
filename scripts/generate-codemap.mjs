#!/usr/bin/env node
/**
 * generate-codemap.mjs — regenerates the machine-extractable parts of docs/map/.
 *
 * Design contract:
 *   - This script OWNS the files it writes. Never hand-edit them; edits are lost.
 *   - Human prose lives in docs/map/descriptions.json, keyed by a stable symbol id
 *     ("<relative/path.ts>#<Symbol>" or "...#<Class>.<method>"). The generator merges
 *     those descriptions into the generated tables, so regenerating never destroys prose.
 *   - Hand-written narrative files (00-architecture.md, 11-business-rules.md, CODEMAP.md)
 *     are never touched by this script.
 *
 * Run:  node scripts/generate-codemap.mjs
 * The same script runs inside the B2C repo (it auto-detects which areas exist).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CODEMAP_ROOT ? path.resolve(process.env.CODEMAP_ROOT) : path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'docs', 'map');
const DESC_FILE = path.join(OUT, 'descriptions.json');
const TODO_FILE = path.join(OUT, '_undescribed.txt');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const IGNORE = new Set(['node_modules', '.next', 'dist', 'build', '.git', 'coverage', '.turbo', 'uploads']);
const RESERVED = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'do', 'else', 'try',
  'constructor', 'function', 'new', 'typeof', 'await', 'yield', 'super', 'this', 'import', 'export']);

// Areas are detected, so this script is portable to the B2C repo unchanged.
const AREA_DEFS = [
  { key: 'backend',  label: 'Backend (NestJS)',      dir: 'backend/src' },
  { key: 'frontend', label: 'Frontend (Next.js)',    dir: 'frontend/src' },
  { key: 'mobile',   label: 'Mobile (React Native)', dir: 'mobile' },
  { key: 'site',     label: 'B2C Site (Next.js)',    dir: 'src' },
];
const AREAS = AREA_DEFS.filter((a) => fs.existsSync(path.join(ROOT, a.dir)));

// ─────────────────────────────── fs helpers ───────────────────────────────

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

const _lineCache = new Map();
const readLines = (f) => {
  if (!_lineCache.has(f)) _lineCache.set(f, fs.readFileSync(f, 'utf8').split('\n'));
  return _lineCache.get(f);
};

// ───────────────────────────── descriptions ──────────────────────────────

let DESCRIPTIONS = {};
if (fs.existsSync(DESC_FILE)) {
  try { DESCRIPTIONS = JSON.parse(fs.readFileSync(DESC_FILE, 'utf8')); }
  catch (e) { console.error(`! could not parse ${rel(DESC_FILE)}: ${e.message}`); process.exit(1); }
}
const wanted = new Set();
function desc(key) {
  wanted.add(key);
  return DESCRIPTIONS[key] ?? '';
}

// ─────────────────────────────── prisma ──────────────────────────────────

function parsePrisma() {
  const file = path.join(ROOT, 'backend/prisma/schema.prisma');
  if (!fs.existsSync(file)) return { models: [], enums: [] };
  const lines = readLines(file);
  const models = [], enums = [];
  let cur = null, kind = null;

  lines.forEach((line, i) => {
    const m = line.match(/^model\s+(\w+)\s*\{/);
    const e = line.match(/^enum\s+(\w+)\s*\{/);
    if (m) { cur = { name: m[1], line: i + 1, table: null, fields: [] }; kind = 'model'; return; }
    if (e) { cur = { name: e[1], line: i + 1, values: [] }; kind = 'enum'; return; }
    if (cur && /^\}/.test(line)) { (kind === 'model' ? models : enums).push(cur); cur = null; kind = null; return; }
    if (!cur) return;

    if (kind === 'enum') {
      const v = line.trim();
      if (v && !v.startsWith('//') && !v.startsWith('@@')) cur.values.push(v.split(/\s/)[0]);
      return;
    }
    const tm = line.match(/@@map\("([^"]+)"\)/);
    if (tm) { cur.table = tm[1]; return; }
    if (/^\s*@@/.test(line) || /^\s*\/\//.test(line) || !line.trim()) return;
    const f = line.match(/^\s{2,}(\w+)\s+(\w+)(\[\])?(\?)?/);
    if (!f) return;
    const [, name, type, arr, opt] = f;
    cur.fields.push({
      name, base: type, type: type + (arr || '') + (opt || ''),
      map: (line.match(/@map\("([^"]+)"\)/) || [])[1] || null,
      list: !!arr, optional: !!opt,
      id: /@id/.test(line), unique: /@unique/.test(line),
      relation: /@relation/.test(line),
      line: i + 1,
    });
  });

  // A field is a relation if its base type is another model.
  const names = new Set(models.map((m) => m.name));
  for (const m of models) for (const f of m.fields) if (names.has(f.base)) f.relation = true;
  return { models, enums };
}

// ────────────────────────────── controllers ──────────────────────────────

const HTTP = /^@(Get|Post|Patch|Put|Delete)\(/;

function parseControllers(files) {
  const endpoints = [];
  for (const file of files.filter((f) => f.endsWith('.controller.ts'))) {
    const lines = readLines(file);
    let pending = [], cls = null, base = '', clsDecos = [];
    let depth = 0; // paren depth of an unterminated multi-line decorator

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();

      // A decorator can span many lines (@UseInterceptors(FileInterceptor({...}))).
      // Keep folding lines into it until its parens balance, or the buffer is lost.
      if (depth > 0) {
        pending[pending.length - 1] += ' ' + t;
        depth += parenDelta(t);
        continue;
      }
      if (t.startsWith('@')) { pending.push(t); depth = parenDelta(t); continue; }
      if (!t || t.startsWith('//') || t.startsWith('*')) continue; // keep pending across blanks/comments

      const cm = t.match(/^export class (\w+)/);
      if (cm) {
        cls = cm[1];
        clsDecos = pending;
        const c = clsDecos.find((d) => d.startsWith('@Controller'));
        base = c ? ((c.match(/@Controller\(\s*['"`]([^'"`]*)['"`]/) || [])[1] ?? '') : '';
        pending = [];
        continue;
      }

      const http = pending.find((d) => HTTP.test(d));
      const mm = raw.match(/^  (?:public |private |protected )?(?:async )?([a-zA-Z_$][\w$]*)\s*\(/);
      if (http && mm && cls && !RESERVED.has(mm[1])) {
        const verb = http.match(HTTP)[1].toUpperCase();
        const sub = (http.match(/\(\s*['"`]([^'"`]*)['"`]/) || [])[1] ?? '';
        const segs = ['api', base, sub].filter(Boolean).join('/').replace(/\/+/g, '/');
        const decos = [...clsDecos, ...pending];

        endpoints.push({
          file, line: i + 1, controller: cls, handler: mm[1], verb, path: '/' + segs,
          roles: pickArgs(decos, 'Roles'),
          permissions: pickArgs(decos, 'Permissions'),
          public: decos.some((d) => d.startsWith('@Public(')),
          guards: pickBare(decos, 'UseGuards'),
          upload: decos.some((d) => d.startsWith('@UseInterceptors(')),
          dto: findDto(lines, i),
          calls: findServiceCall(lines, i),
        });
      }
      pending = [];
    }
  }
  return endpoints;
}

// Net unclosed parens on a line, ignoring those inside string literals.
function parenDelta(line) {
  const bare = line.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
  return (bare.match(/\(/g) || []).length - (bare.match(/\)/g) || []).length;
}

const pickArgs = (decos, name) => {
  const d = decos.find((x) => x.startsWith(`@${name}(`));
  if (!d) return [];
  return [...d.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
};
const pickBare = (decos, name) => {
  const d = decos.find((x) => x.startsWith(`@${name}(`));
  if (!d) return [];
  return (d.match(/\(([^)]*)\)/) || [, ''])[1].split(',').map((s) => s.trim()).filter(Boolean);
};

function findDto(lines, start) {
  for (let i = start; i < Math.min(start + 25, lines.length); i++) {
    const m = lines[i].match(/@Body\(\)\s*\w+\s*:\s*(\w+)/);
    if (m) return m[1];
    if (/^\s{2}\)/.test(lines[i]) || /\)\s*\{\s*$/.test(lines[i])) break;
  }
  return null;
}

function findServiceCall(lines, start) {
  const seen = [];
  for (let i = start; i < Math.min(start + 60, lines.length); i++) {
    if (i > start && /^  @/.test(lines[i])) break;      // next handler's decorator
    if (i > start && /^  \}/.test(lines[i])) { scan(lines[i]); break; }
    scan(lines[i]);
  }
  function scan(l) {
    for (const m of l.matchAll(/this\.(\w+)\.(\w+)\(/g)) {
      const pair = `${m[1]}.${m[2]}`;
      if (!seen.includes(pair) && !/^(logger|prisma)\./.test(pair)) seen.push(pair);
    }
  }
  return seen.slice(0, 3);
}

// ──────────────────────────── classes & exports ──────────────────────────

function parseClasses(files) {
  const classes = [];
  for (const file of files) {
    const lines = readLines(file);
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
      const cm = lines[i].match(/^export (?:abstract )?class (\w+)/);
      if (cm) { cur = { name: cm[1], file, line: i + 1, end: lines.length, methods: [] }; classes.push(cur); continue; }
      if (!cur) continue;
      if (/^\}/.test(lines[i])) { cur.end = i + 1; cur = null; continue; }
      const mm = lines[i].match(/^  (?:(private|public|protected) )?(?:(static) )?(?:(async) )?([a-zA-Z_$][\w$]*)\s*[(<]/);
      if (!mm) continue;
      const name = mm[4];
      if (RESERVED.has(name)) continue;
      cur.methods.push({ name, visibility: mm[1] || 'public', static: !!mm[2], async: !!mm[3], line: i + 1 });
    }
  }
  // Second pass: a method body runs to the next method (or the class close brace).
  // From it we extract the Prisma models and sibling services the method touches —
  // the single most useful column for tracing behaviour without opening the file.
  for (const c of classes) {
    const lines = readLines(c.file);
    c.methods.forEach((m, idx) => {
      const to = idx + 1 < c.methods.length ? c.methods[idx + 1].line - 1 : c.end;
      m.touches = extractTouches(lines.slice(m.line - 1, to).join('\n'));
    });
  }
  return classes;
}

const PRISMA_OPS = 'findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy';

function extractTouches(body) {
  const models = new Set(), services = new Set();
  for (const m of body.matchAll(new RegExp(`(?:this\\.prisma|tx|prisma)\\.(\\w+)\\.(?:${PRISMA_OPS})\\(`, 'g'))) models.add(m[1]);
  for (const m of body.matchAll(/this\.(\w*(?:Service|Gateway|Client))\.(\w+)\(/g)) services.add(`${m[1]}.${m[2]}`);
  return { models: [...models], services: [...services] };
}

function parseExports(files) {
  const out = [];
  for (const file of files) {
    const lines = readLines(file);
    lines.forEach((l, i) => {
      let m;
      if ((m = l.match(/^export (?:default )?(?:async )?function\s+(\w+)/))) out.push({ name: m[1], kind: 'function', file, line: i + 1 });
      else if ((m = l.match(/^export (?:const|let)\s+(\w+)/))) out.push({ name: m[1], kind: 'const', file, line: i + 1 });
      else if ((m = l.match(/^export (?:abstract )?class\s+(\w+)/))) out.push({ name: m[1], kind: 'class', file, line: i + 1 });
      else if ((m = l.match(/^export (?:type|interface|enum)\s+(\w+)/))) out.push({ name: m[1], kind: 'type', file, line: i + 1 });
    });
  }
  return out;
}

// ────────────────────────────── frontend routes ──────────────────────────

const API_CALL = /\bapi\.(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*[`'"]([^`'"]+)/g;

function parseRoutes(area) {
  const appDir = path.join(ROOT, area.dir, 'app');
  if (!fs.existsSync(appDir)) return [];
  return walk(appDir)
    .filter((f) => /(^|\/)(page|route)\.tsx?$/.test(f.split(path.sep).join('/')))
    .map((f) => {
      const src = fs.readFileSync(f, 'utf8');
      const r = path.relative(appDir, f).split(path.sep);
      const kind = r[r.length - 1].startsWith('route') ? 'route-handler' : 'page';
      const segs = r.slice(0, -1).filter((s) => !/^\(.*\)$/.test(s));
      const calls = [...src.matchAll(API_CALL)]
        .map((m) => `${m[1].toUpperCase()} ${m[2].replace(/\$\{[^}]*\}/g, ':x')}`);
      const perms = [...src.matchAll(/\b(?:usePermission|hasPermission|can)\(\s*[`'"]([^`'"]+)/g)].map((m) => m[1]);
      return {
        route: '/' + segs.join('/'), kind, file: f, loc: src.split('\n').length,
        group: (r.find((s) => /^\(.*\)$/.test(s)) || '').replace(/[()]/g, ''),
        calls: [...new Set(calls)], perms: [...new Set(perms)],
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

// ─────────────────────────────── rendering ───────────────────────────────

const STAMP = '<!-- GENERATED by scripts/generate-codemap.mjs — do not hand-edit. Prose lives in descriptions.json. -->';
const esc = (s) => String(s).replace(/\|/g, '\\|');
const write = (name, body) => {
  fs.writeFileSync(path.join(OUT, name), body.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
  console.log(`  wrote docs/map/${name}`);
};

function renderDataModel({ models, enums }) {
  const L = [`# 01 — Data Model`, '', STAMP, '',
    `Prisma schema: \`backend/prisma/schema.prisma\` — **${models.length} models**, **${enums.length} enums**.`, '',
    `Jump: [Models](#models) · [Enums](#enums)`, '', '## Models', ''];

  for (const m of models.sort((a, b) => a.name.localeCompare(b.name))) {
    const key = `backend/prisma/schema.prisma#${m.name}`;
    const scalars = m.fields.filter((f) => !f.relation);
    const rels = m.fields.filter((f) => f.relation);
    L.push(`### ${m.name}`, '');
    L.push(`\`${m.table ?? '—'}\` · schema.prisma:${m.line} · ${scalars.length} fields, ${rels.length} relations`, '');
    const d = desc(key);
    if (d) L.push(d, '');
    L.push('| Field | Type | Column | Flags |', '|---|---|---|---|');
    for (const f of scalars) {
      const flags = [f.id && 'PK', f.unique && 'unique', f.optional && 'nullable'].filter(Boolean).join(', ');
      L.push(`| \`${f.name}\` | ${esc(f.type)} | ${f.map ? `\`${f.map}\`` : '—'} | ${flags || '—'} |`);
    }
    L.push('');
    if (rels.length) L.push(`**Relations:** ${rels.map((f) => `\`${f.name}\`→${f.type}`).join(' · ')}`, '');
  }

  L.push('## Enums', '');
  for (const e of enums.sort((a, b) => a.name.localeCompare(b.name))) {
    L.push(`- **${e.name}** (schema.prisma:${e.line}) — ${e.values.map((v) => `\`${v}\``).join(', ')}`);
  }
  return L.join('\n');
}

function renderApi(endpoints) {
  const byController = new Map();
  for (const e of endpoints) {
    if (!byController.has(e.controller)) byController.set(e.controller, []);
    byController.get(e.controller).push(e);
  }
  const L = [`# 02 — Backend API`, '', STAMP, '',
    `**${endpoints.length} endpoints** across **${byController.size} controllers**. Global prefix \`/api\`.`, '',
    `Auth column: \`public\` = no token · \`ROLE\` = @Roles · \`perm:x\` = @Permissions.`, '', ];

  L.push('## Controllers', '');
  for (const name of [...byController.keys()].sort()) {
    L.push(`- [${name}](#${name.toLowerCase()}) — ${byController.get(name).length} endpoints`);
  }
  L.push('');

  for (const name of [...byController.keys()].sort()) {
    const eps = byController.get(name);
    L.push(`### ${name}`, '', `\`${rel(eps[0].file)}\``, '');
    L.push('| Method | Path | Handler | Auth | Calls | Purpose |', '|---|---|---|---|---|---|');
    for (const e of eps.sort((a, b) => a.path.localeCompare(b.path))) {
      const auth = e.public ? '`public`'
        : [...e.roles, ...e.permissions.map((p) => `perm:${p}`)].map((x) => `\`${x}\``).join(' ') || '`authed`';
      const calls = e.calls.length ? e.calls.map((c) => `\`${c}\``).join(' ') : '—';
      const key = `${rel(e.file)}#${e.controller}.${e.handler}`;
      L.push(`| ${e.verb} | \`${esc(e.path)}\` | \`${e.handler}\`:${e.line} | ${auth} | ${calls} | ${esc(desc(key)) || '_—_'} |`);
    }
    L.push('');
  }
  return L.join('\n');
}

function renderRoutes(routesByArea) {
  const total = [...routesByArea.values()].flat().length;
  const L = [`# 07 — Frontend Routes`, '', STAMP, '', `**${total} routes.**`, ''];
  for (const [label, routes] of routesByArea) {
    if (!routes.length) continue;
    L.push(`## ${label}`, '');
    L.push('| Route | File | LOC | Calls | Permissions | Purpose |', '|---|---|---|---|---|---|');
    for (const r of routes) {
      const key = `${rel(r.file)}#default`;
      const calls = r.calls.length ? `${r.calls.length}` : '—';
      const perms = r.perms.length ? `${r.perms.length}` : '—';
      L.push(`| \`${esc(r.route)}\` | \`${rel(r.file)}\` | ${r.loc} | ${calls} | ${perms} | ${esc(desc(key)) || '_—_'} |`);
    }
    L.push('');
    const big = routes.filter((r) => r.loc > 800);
    if (big.length) {
      L.push(`<details><summary>API calls & permission keys per route</summary>`, '');
      for (const r of routes.filter((x) => x.calls.length || x.perms.length)) {
        L.push(`**\`${r.route}\`**`, '');
        if (r.calls.length) L.push(`- calls: ${r.calls.map((c) => `\`${c}\``).join(', ')}`);
        if (r.perms.length) L.push(`- perms: ${r.perms.map((c) => `\`${c}\``).join(', ')}`);
        L.push('');
      }
      L.push('</details>', '');
    }
  }
  return L.join('\n');
}

function renderSymbolIndex(rows) {
  const L = [`# 12 — Symbol Index`, '', STAMP, '',
    `**${rows.length} symbols**, A–Z. This is the "where does X live" lookup.`, '',
    `Kinds: \`class\` \`method\` \`function\` \`const\` \`type\` \`endpoint\` \`model\`.`, ''];
  const groups = new Map();
  for (const r of rows) {
    const c = /^[a-zA-Z]/.test(r.name) ? r.name[0].toUpperCase() : '#';
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(r);
  }
  L.push([...groups.keys()].sort().map((c) => `[${c}](#${c === '#' ? 'symbol' : c.toLowerCase()})`).join(' · '), '');
  for (const c of [...groups.keys()].sort()) {
    L.push(`## ${c === '#' ? 'Symbol' : c}`, '', '| Symbol | Kind | Location |', '|---|---|---|');
    for (const r of groups.get(c).sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file))) {
      L.push(`| \`${esc(r.name)}\` | ${r.kind} | \`${rel(r.file)}:${r.line}\` |`);
    }
    L.push('');
  }
  return L.join('\n');
}


// ───────────────────────── backend service maps (03–06) ──────────────────

const moduleOf = (file) => {
  const r = rel(file);
  const m = r.match(/^backend\/src\/([^/]+)\//);
  return m ? m[1] : '_root';
};

const BACKEND_GROUPS = [
  { out: '03-backend-services-ops.md', title: '03 — Backend Services · Operations',
    blurb: 'Jobs, dispatch, the location tree, fleet and counterparties. This is where the core transport workflow lives.',
    mods: ['traffic-jobs', 'dispatch', 'locations', 'vehicles', 'drivers', 'reps', 'suppliers',
           'job-locks', 'job-service-types', 'import-templates', 'extras', 'customers', 'agents'] },
  { out: '04-backend-services-finance.md', title: '04 — Backend Services · Finance & Reporting',
    blurb: 'Fees, invoices, payments, tariffs, Odoo-ready exports and every report.',
    mods: ['finance', 'payments', 'export', 'reports', 'driver-tariffs', 'public-prices'] },
  { out: '05-backend-services-portals.md', title: '05 — Backend Services · Portals & B2C',
    blurb: 'The driver / rep / supplier / partner portals and the public B2C booking surface. All portal status transitions and evidence capture live here.',
    mods: ['driver-portal', 'rep-portal', 'supplier-portal', 'partner', 'guest-bookings', 'b2c', 'contact-messages'] },
  { out: '06-backend-platform.md', title: '06 — Backend Platform',
    blurb: 'Cross-cutting machinery: auth, RBAC, sessions, settings, messaging, storage, cron and shared utilities.',
    mods: ['auth', 'users', 'permissions', 'sessions', 'settings', 'email', 'notifications',
           'push-notifications', 'whatsapp-notifications', 'google-drive', 'ai-parser', 'common',
           'prisma', 'activity-logs', 'user-preferences', '_root'] },
];

const KIND_OF = (name) =>
  /Service$/.test(name) ? 'service' : /Controller$/.test(name) ? 'controller'
  : /Guard$/.test(name) ? 'guard' : /Strategy$/.test(name) ? 'strategy'
  : /Module$/.test(name) ? 'module' : /Dto$/.test(name) ? 'dto'
  : /Filter$|Interceptor$|Pipe$/.test(name) ? 'middleware' : 'class';

function renderServiceGroup(group, classes, exports_) {
  const mine = classes
    .filter((c) => group.mods.includes(moduleOf(c.file)))
    .filter((c) => !['module', 'dto'].includes(KIND_OF(c.name)))
    .sort((a, b) => moduleOf(a.file).localeCompare(moduleOf(b.file)) || a.name.localeCompare(b.name));

  const L = [`# ${group.title}`, '', STAMP, '', group.blurb, '',
    `**${mine.length} classes**, **${mine.reduce((n, c) => n + c.methods.length, 0)} methods**.`, '',
    '`Touches` lists the Prisma models a method reads or writes and the sibling services it calls — ' +
    'enough to trace a data path without opening the file.', ''];

  let lastMod = null;
  for (const c of mine) {
    const mod = moduleOf(c.file);
    if (mod !== lastMod) { L.push(`## \`${mod}\``, ''); lastMod = mod; }
    L.push(`### ${c.name}`, '');
    L.push(`\`${rel(c.file)}:${c.line}\` · ${KIND_OF(c.name)} · ${c.methods.length} methods`, '');
    const d = desc(`${rel(c.file)}#${c.name}`);
    if (d) L.push(d, '');
    if (!c.methods.length) { L.push('_No methods._', ''); continue; }
    L.push('| Method | Vis | Line | Touches | Purpose |', '|---|---|---|---|---|');
    for (const m of c.methods) {
      const t = [...m.touches.models.map((x) => `\`${x}\``), ...m.touches.services.map((x) => `\`${x}\``)];
      const touches = t.length ? t.slice(0, 5).join(' ') + (t.length > 5 ? ` +${t.length - 5}` : '') : '—';
      const key = `${rel(c.file)}#${c.name}.${m.name}`;
      L.push(`| \`${m.name}\` | ${m.visibility === 'public' ? 'pub' : m.visibility.slice(0, 4)} | ${m.line} | ${touches} | ${esc(desc(key)) || '_—_'} |`);
    }
    L.push('');
  }

  // Free functions and constants in this group's modules — geofence maths, score
  // utils, service-type tables. These carry real business rules and are easy to
  // miss because they live outside any class.
  const classNames = new Set(classes.map((c) => c.name));
  const loose = exports_
    .filter((e) => rel(e.file).startsWith('backend/src/'))
    .filter((e) => group.mods.includes(moduleOf(e.file)))
    .filter((e) => !(e.kind === 'class' && classNames.has(e.name)))
    .filter((e) => e.kind !== 'class');
  if (loose.length) {
    L.push('## Standalone exports', '',
      `${loose.length} free functions, constants and types in these modules.`, '');
    const byFile = new Map();
    for (const e of loose) {
      if (!byFile.has(e.file)) byFile.set(e.file, []);
      byFile.get(e.file).push(e);
    }
    for (const f of [...byFile.keys()].sort()) {
      L.push(`### \`${rel(f)}\``, '');
      const d = desc(`${rel(f)}#__file__`);
      if (d) L.push(d, '');
      L.push('| Export | Kind | Line | Purpose |', '|---|---|---|---|');
      for (const e of byFile.get(f).sort((a, b) => a.line - b.line)) {
        L.push(`| \`${e.name}\` | ${e.kind} | ${e.line} | ${esc(desc(`${rel(f)}#${e.name}`)) || '_—_'} |`);
      }
      L.push('');
    }
  }
  return L.join('\n');
}

// ──────────────────── shared frontend / mobile maps (08–09) ──────────────

function renderShared(title, spec, exports_, classes) {
  const inScope = (f) => spec.include.some((d) => rel(f).startsWith(d)) &&
                         !spec.exclude?.some((d) => rel(f).startsWith(d));
  const byFile = new Map();
  for (const e of exports_.filter((x) => inScope(x.file))) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push(e);
  }
  for (const c of classes.filter((x) => inScope(x.file))) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
  }

  const total = [...byFile.values()].reduce((n, v) => n + v.length, 0);
  const L = [`# ${title}`, '', STAMP, '', spec.blurb, '',
    `**${byFile.size} files**, **${total} exported symbols**.`, ''];

  const dirOf = (f) => rel(f).split('/').slice(0, -1).join('/');
  const dirs = [...new Set([...byFile.keys()].map(dirOf))].sort();
  for (const dir of dirs) {
    L.push(`## \`${dir}/\``, '');
    const files = [...byFile.keys()].filter((f) => dirOf(f) === dir).sort();
    for (const f of files) {
      const loc = readLines(f).length;
      L.push(`### \`${rel(f).split('/').pop()}\``, '', `\`${rel(f)}\` · ${loc} lines`, '');
      const d = desc(`${rel(f)}#__file__`);
      if (d) L.push(d, '');
      const syms = byFile.get(f);
      if (!syms.length) { L.push('_No exports._', ''); continue; }
      L.push('| Export | Kind | Line | Purpose |', '|---|---|---|---|');
      for (const sname of syms.sort((a, b) => a.line - b.line)) {
        const key = `${rel(f)}#${sname.name}`;
        L.push(`| \`${sname.name}\` | ${sname.kind} | ${sname.line} | ${esc(desc(key)) || '_—_'} |`);
      }
      L.push('');
    }
  }
  return L.join('\n');
}

// ──────────────────────────────── main ───────────────────────────────────

console.log(`codemap: root=${ROOT}`);
console.log(`codemap: areas=${AREAS.map((a) => a.key).join(', ') || 'none'}`);
fs.mkdirSync(OUT, { recursive: true });

const filesByArea = new Map(AREAS.map((a) => [a.key, walk(path.join(ROOT, a.dir))]));
const allFiles = [...filesByArea.values()].flat();

const prisma = parsePrisma();
const backendFiles = filesByArea.get('backend') ?? [];
const endpoints = parseControllers(backendFiles);
const classes = parseClasses(allFiles);
const exports_ = parseExports(allFiles);

const routesByArea = new Map();
for (const a of AREAS) {
  const r = parseRoutes(a);
  if (r.length) routesByArea.set(a.label, r);
}

// Flat symbol index: exports + class methods + prisma models + endpoints.
const symbolRows = [
  ...exports_.map((e) => ({ name: e.name, kind: e.kind, file: e.file, line: e.line })),
  ...classes.flatMap((c) => c.methods.map((m) => ({
    name: `${c.name}.${m.name}`, kind: 'method', file: c.file, line: m.line,
  }))),
  ...prisma.models.map((m) => ({
    name: m.name, kind: 'model', file: path.join(ROOT, 'backend/prisma/schema.prisma'), line: m.line,
  })),
  ...endpoints.map((e) => ({
    name: `${e.verb} ${e.path}`, kind: 'endpoint', file: e.file, line: e.line,
  })),
];

if (prisma.models.length) write('01-data-model.md', renderDataModel(prisma));
if (endpoints.length) write('02-backend-api.md', renderApi(endpoints));
if (backendFiles.length) for (const g of BACKEND_GROUPS) write(g.out, renderServiceGroup(g, classes, exports_));
if (routesByArea.size) write('07-frontend-routes.md', renderRoutes(routesByArea));
if (filesByArea.has('frontend')) write('08-frontend-shared.md', renderShared(
  '08 — Frontend Shared', {
    include: ['frontend/src/components', 'frontend/src/lib', 'frontend/src/hooks', 'frontend/src/stores', 'frontend/src/types'],
    blurb: 'Everything the dashboard and portal pages reuse: shared components, API client, i18n, permission registry, hooks and stores.',
  }, exports_, classes));
if (filesByArea.has('mobile')) write('09-mobile.md', renderShared(
  '09 — Mobile Apps', {
    include: ['mobile/apps', 'mobile/packages'], exclude: ['mobile/preview'],
    blurb: 'Four React Native apps (driver, rep, supplier, guest) over shared `packages/shared` (API, i18n, types) and `packages/ui`.',
  }, exports_, classes));
write('12-symbol-index.md', renderSymbolIndex(symbolRows));

// Description coverage — this is the phase-2/3/4 worklist.
if (!fs.existsSync(DESC_FILE)) fs.writeFileSync(DESC_FILE, '{}\n');
const missing = [...wanted].filter((k) => !DESCRIPTIONS[k]).sort();
const stale = Object.keys(DESCRIPTIONS).filter((k) => !wanted.has(k)).sort();
fs.writeFileSync(TODO_FILE,
  `# Symbols with no description yet — regenerate to refresh.\n` +
  `# ${wanted.size - missing.length}/${wanted.size} described.\n` +
  (stale.length ? `\n# STALE (description exists, symbol gone):\n${stale.map((s) => `! ${s}`).join('\n')}\n\n` : '') +
  missing.join('\n') + '\n');

console.log(`codemap: ${allFiles.length} files · ${endpoints.length} endpoints · ${classes.length} classes · ` +
  `${symbolRows.length} symbols · ${prisma.models.length} models · ${[...routesByArea.values()].flat().length} routes`);
console.log(`codemap: descriptions ${wanted.size - missing.length}/${wanted.size}` +
  (stale.length ? ` · ${stale.length} stale` : ''));
