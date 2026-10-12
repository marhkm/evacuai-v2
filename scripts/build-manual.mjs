// Builds docs/user-manual.html from docs/USER-MANUAL.md in the EvacuAI app's look (one self-contained file that opens
// offline). Run: npm run manual. CI fails if the HTML is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { Marked } from 'marked';

const src = readFileSync(new URL('../docs/USER-MANUAL.md', import.meta.url), 'utf8');

// GitHub-style heading ids, so the manual's own "#1-run-evacuai-…" links work in the HTML too.
const slug = text => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
const strip = text => text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const toc = [];

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const id = slug(strip(html));
      if (depth === 2 || depth === 3) toc.push({ depth, id, text: strip(html) });
      return depth === 1 ? '' : `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${depth}>\n`;
    },
    code({ text, lang }) {
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return `<div class="code"><pre><code${lang ? ` data-lang="${lang}"` : ''}>${esc}</code></pre><button type="button" class="copy" aria-label="Copy">Copy</button></div>\n`;
    },
    table(token) {
      return `<div class="table-wrap">${this.constructor.prototype.table.call(this, token)}</div>`;
    },
    blockquote({ tokens }) {
      return `<aside class="tip">${this.parser.parse(tokens)}</aside>\n`;
    },
  },
});

const [intro, ...rest] = src.split(/\n(?=## 1\. )/); // the intro (title, contents list, roles) becomes the welcome card
const body = marked.parse(rest.join('\n'));
toc.length = 0; // rebuild the contents from the real sections only
marked.parse(rest.join('\n'));
const introHtml = new Marked({ gfm: true }).parse(
  intro.replace(/^# .*\n/, '').replace(/This manual walks through[\s\S]*?\n\n(?=\*\*Who uses what)/, ''),
);

const nav = toc.map(h => `<a class="toc-${h.depth}" href="#${h.id}">${h.text}</a>`).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EvacuAI User Manual</title>
<meta name="description" content="How to run EvacuAI with Docker and use every function of the mobile app and the admin dashboard.">
<style>
  :root {
    --primary: #1a7a3c; --primary-dark: #145f2f; --primary-tint: #e3f1e8; --danger: #c0392b; --amber: #b9770e;
    --text: #111; --muted: #555; --card: #f2f5f3; --border: #cfd8d3; --bg: #fff; --code-bg: #f2f5f3; --route: #eef5fd;
    --radius: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --primary: #4cc276; --primary-dark: #7fd9a0; --primary-tint: #16301f; --danger: #ef6b5d; --amber: #e0a43a;
      --text: #e8ece9; --muted: #a9b5ae; --card: #18201b; --border: #2c3a31; --bg: #0f1411; --code-bg: #18201b; --route: #142133;
    }
  }
  :root[data-theme="dark"] {
    --primary: #4cc276; --primary-dark: #7fd9a0; --primary-tint: #16301f; --danger: #ef6b5d; --amber: #e0a43a;
    --text: #e8ece9; --muted: #a9b5ae; --card: #18201b; --border: #2c3a31; --bg: #0f1411; --code-bg: #18201b; --route: #142133;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; scroll-padding-top: 76px; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  a { color: var(--primary); }
  header.bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 12px 20px;
    background: #1a7a3c; color: #fff; box-shadow: 0 1px 0 rgba(0,0,0,.15); }
  header.bar .logo { width: 36px; height: 36px; flex: none; }
  header.bar h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: .2px; }
  header.bar span { opacity: .85; font-size: 14px; }
  header.bar .spacer { flex: 1; }
  header.bar button { background: rgba(255,255,255,.15); color: #fff; border: 1px solid rgba(255,255,255,.35); border-radius: 20px;
    padding: 6px 14px; font: inherit; font-size: 14px; cursor: pointer; min-height: 36px; }
  .layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 32px; max-width: 1180px; margin: 0 auto; padding: 24px 20px 64px; }
  nav.toc { position: sticky; top: 84px; align-self: start; max-height: calc(100vh - 100px); overflow: auto; padding-right: 8px; }
  nav.toc strong { display: block; color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .6px; margin: 4px 0 8px; }
  nav.toc a { display: block; text-decoration: none; color: var(--text); border-radius: 8px; padding: 5px 10px; font-size: 15px; line-height: 1.35; }
  nav.toc a.toc-2 { font-weight: 700; margin-top: 8px; }
  nav.toc a.toc-3 { color: var(--muted); padding-left: 22px; font-size: 14px; }
  nav.toc a:hover, nav.toc a.active { background: var(--primary-tint); color: var(--primary-dark); }
  main { min-width: 0; max-width: 820px; }
  .welcome { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; margin-bottom: 8px; }
  .welcome p:first-child { font-size: 19px; margin-top: 0; }
  h2 { font-size: 28px; color: var(--primary); margin: 48px 0 12px; padding-top: 8px; border-top: 1px solid var(--border); }
  h3 { font-size: 20px; margin: 32px 0 8px; }
  h2 .anchor, h3 .anchor { float: left; margin-left: -1em; padding-right: .3em; color: var(--border); text-decoration: none; visibility: hidden; }
  h2:hover .anchor, h3:hover .anchor { visibility: visible; }
  p, li { max-width: 72ch; }
  li { margin: 4px 0; }
  strong { font-weight: 700; }
  code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .88em; background: var(--code-bg);
    border: 1px solid var(--border); border-radius: 6px; padding: 1px 6px; overflow-wrap: anywhere; }
  .code { position: relative; margin: 12px 0; }
  .code pre { margin: 0; background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; padding-right: 72px; overflow-x: auto; }
  .code pre code { background: none; border: 0; padding: 0; font-size: 14px; overflow-wrap: normal; }
  .code .copy { position: absolute; top: 8px; right: 8px; border: 1px solid var(--primary); background: var(--bg); color: var(--primary);
    border-radius: 20px; padding: 3px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .code .copy.done { background: var(--primary); color: #fff; }
  .table-wrap { overflow-x: auto; margin: 12px 0; border: 1px solid var(--border); border-radius: var(--radius); }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  th { background: var(--card); font-weight: 700; }
  tr:last-child td { border-bottom: 0; }
  aside.tip { background: var(--route); border-left: 4px solid #0b6bcb; border-radius: var(--radius); padding: 4px 16px; margin: 16px 0; }
  hr { display: none; }
  .back { position: fixed; right: 20px; bottom: 20px; background: var(--primary); color: #fff; border-radius: 24px; padding: 10px 16px;
    text-decoration: none; font-weight: 700; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  footer { color: var(--muted); font-size: 14px; margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); }
  details.toc-mobile { display: none; }
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; padding: 16px 16px 64px; }
    nav.toc { display: none; }
    details.toc-mobile { display: block; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; margin-bottom: 16px; }
    details.toc-mobile summary { font-weight: 700; cursor: pointer; min-height: 32px; }
    details.toc-mobile a { display: block; padding: 4px 0; text-decoration: none; }
    details.toc-mobile a.toc-3 { padding-left: 16px; font-size: 15px; color: var(--muted); }
    header.bar span { display: none; }
    h2 { font-size: 24px; }
  }
  @media print {
    header.bar, nav.toc, details.toc-mobile, .back, .code .copy { display: none !important; }
    .layout { display: block; padding: 0; }
    h2 { break-before: page; }
  }
</style>
</head>
<body>
<header class="bar">
  <svg class="logo" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="9" fill="#fff"/><path d="M18 6l10 4v7c0 6.5-4.2 11.4-10 13-5.8-1.6-10-6.5-10-13v-7z" fill="#1a7a3c"/><path d="M16 12h4v6h4l-6 7-6-7h4z" fill="#fff"/></svg>
  <h1>EvacuAI User Manual</h1><span>Docker setup · mobile app · admin dashboard</span>
  <div class="spacer"></div>
  <button type="button" id="theme" aria-label="Switch between light and dark">Dark mode</button>
</header>
<div class="layout">
  <nav class="toc" aria-label="Contents"><strong>Contents</strong>
${nav}
  </nav>
  <main>
    <details class="toc-mobile"><summary>Contents</summary>
${nav}
    </details>
    <section class="welcome">
${introHtml}
    </section>
${body}
    <footer>Generated from docs/USER-MANUAL.md. EvacuAI, UCLM capstone project.</footer>
  </main>
</div>
<a class="back" href="#">↑ Top</a>
<script>
  // Copy buttons on commands.
  document.querySelectorAll('.code .copy').forEach(b => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.parentElement.querySelector('code').innerText);
      b.textContent = 'Copied'; b.classList.add('done');
      setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1500);
    } catch { b.textContent = 'Select and copy'; }
  }));
  // Light / dark, remembered on this device when storage is available.
  const root = document.documentElement, btn = document.getElementById('theme');
  const dark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const label = () => { btn.textContent = dark() ? 'Light mode' : 'Dark mode'; };
  try { const t = localStorage.getItem('evacuai-manual-theme'); if (t) root.dataset.theme = t; } catch {}
  label();
  btn.addEventListener('click', () => {
    root.dataset.theme = dark() ? 'light' : 'dark'; label();
    try { localStorage.setItem('evacuai-manual-theme', root.dataset.theme); } catch {}
  });
  // Highlight the section being read in the contents.
  const links = [...document.querySelectorAll('nav.toc a')];
  const observer = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-80px 0px -70% 0px' });
  document.querySelectorAll('main h2[id], main h3[id]').forEach(h => observer.observe(h));
</script>
</body>
</html>
`;

writeFileSync(new URL('../docs/user-manual.html', import.meta.url), html);
console.log(`docs/user-manual.html: ${toc.length} sections`);
