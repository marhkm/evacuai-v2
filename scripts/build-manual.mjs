// Builds docs/setup-guide.html and docs/walkthrough.html from their Markdown, in the Signage look. Each is one
// self-contained file (screenshots embedded) that opens offline and can be shared as-is. Run: npm run manual.
// CI fails if the HTML is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { Marked } from 'marked';

const DOCS = [
  { md: 'SETUP-GUIDE.md', html: 'setup-guide.html', title: 'EvacuAI Setup Guide', tagline: 'Run EvacuAI on your own computer',
    description: 'How to install Docker, start EvacuAI on your computer, connect a phone, and fix common problems.' },
  { md: 'WALKTHROUGH.md', html: 'walkthrough.html', title: 'EvacuAI Walkthrough', tagline: 'Test scenarios for every role',
    description: 'Step-by-step test scenarios for students, safety officers, responders and admins, with expected results.' },
];
const docUrl = file => new URL(`../docs/${file}`, import.meta.url);

// GitHub-style heading ids, so the documents' own "#1-…" links work in the HTML too.
const slug = text => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
const strip = text => text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
// Links between the two guides point at their HTML versions.
const linkTo = href => DOCS.reduce((h, d) => h.replace(new RegExp(`^${d.md}`), d.html), href);

function render(src) {
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
      link({ href, title, tokens }) {
        return `<a href="${linkTo(href)}"${title ? ` title="${title}"` : ''}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, text }) {
        const file = readFileSync(docUrl(href));
        const type = href.endsWith('.png') ? 'image/png' : 'image/jpeg';
        return `<figure><img src="data:${type};base64,${file.toString('base64')}" alt="${text}" loading="lazy"><figcaption>${text}</figcaption></figure>`;
      },
      checkbox({ checked }) {
        return `<input type="checkbox" class="check"${checked ? ' checked' : ''} aria-label="Done">`;
      },
    },
  });
  const [intro, ...rest] = src.split(/\n(?=## 1\. )/); // the intro (title, purpose, roles) becomes the welcome card
  const body = marked.parse(rest.join('\n'));
  const introHtml = new Marked({ gfm: true, renderer: { link({ href, tokens }) { return `<a href="${linkTo(href)}">${this.parser.parseInline(tokens)}</a>`; } } })
    .parse(intro.replace(/^# .*\n/, '').replace(/\n(\d+\. \[[^\n]+\n)+/, '\n')); // the sidebar replaces the contents list
  return { body, introHtml, toc };
}

const page = (doc, { body, introHtml, toc }) => {
  const nav = toc.map(h => `<a class="toc-${h.depth}" href="#${h.id}">${h.text}</a>`).join('\n');
  const other = DOCS.find(d => d !== doc);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${doc.title}</title>
<meta name="description" content="${doc.description}">
<style>
  /* Signage colours: red danger/SOS, green safe/exit, amber warning/drill, blue information. */
  :root {
    --danger: #D7263D; --safe: #0B7A55; --warning: #8A5A00; --info: #1A5FCC; --ink: #0B1220; --muted: #4A5568;
    --bg: #FFFFFF; --card: #F4F6FA; --line: #D5DBE5; --tint: #E8F0FE; --safe-tint: #E3F4EC; --radius: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --danger: #FF4D5E; --safe: #2BD48F; --warning: #FFC23D; --info: #4C8DFF; --ink: #E6EAF2; --muted: #A3AEC2;
      --bg: #0B1220; --card: #131B2B; --line: #2A3650; --tint: #14223D; --safe-tint: #10291F;
    }
  }
  :root[data-theme="dark"] {
    --danger: #FF4D5E; --safe: #2BD48F; --warning: #FFC23D; --info: #4C8DFF; --ink: #E6EAF2; --muted: #A3AEC2;
    --bg: #0B1220; --card: #131B2B; --line: #2A3650; --tint: #14223D; --safe-tint: #10291F;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; scroll-padding-top: 76px; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  a { color: var(--info); }
  h1, h2, h3, header.bar strong, nav.toc strong { font-family: "Barlow Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif; text-transform: uppercase; letter-spacing: .03em; }
  header.bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 10px 20px;
    background: #0B1220; color: #fff; border-bottom: 3px solid #D7263D; }
  header.bar .logo { width: 34px; height: 34px; flex: none; }
  header.bar strong { font-size: 22px; font-weight: 700; }
  header.bar span { opacity: .8; font-size: 14px; }
  header.bar .spacer { flex: 1; }
  header.bar a, header.bar button { color: #fff; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.3); border-radius: 20px;
    padding: 6px 14px; font: inherit; font-size: 14px; cursor: pointer; min-height: 36px; text-decoration: none; display: inline-flex; align-items: center; }
  .layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 32px; max-width: 1180px; margin: 0 auto; padding: 24px 20px 64px; }
  nav.toc { position: sticky; top: 84px; align-self: start; max-height: calc(100vh - 100px); overflow: auto; padding-right: 8px; }
  nav.toc strong { display: block; color: var(--muted); font-size: 15px; margin: 4px 0 8px; }
  nav.toc a { display: block; text-decoration: none; color: var(--ink); border-radius: 8px; padding: 5px 10px; font-size: 15px; line-height: 1.35; }
  nav.toc a.toc-2 { font-weight: 700; margin-top: 8px; }
  nav.toc a.toc-3 { color: var(--muted); padding-left: 22px; font-size: 14px; }
  nav.toc a:hover, nav.toc a.active { background: var(--tint); color: var(--ink); }
  main { min-width: 0; max-width: 820px; }
  .welcome { background: var(--card); border: 1px solid var(--line); border-left: 6px solid var(--safe); border-radius: var(--radius); padding: 18px 24px; margin-bottom: 8px; }
  .welcome p:first-child { font-size: 19px; margin-top: 0; }
  h2 { font-size: 32px; color: var(--ink); margin: 48px 0 12px; padding-top: 12px; border-top: 3px solid var(--danger); }
  h3 { font-size: 23px; margin: 32px 0 8px; }
  h2 .anchor, h3 .anchor { float: left; margin-left: -1em; padding-right: .3em; color: var(--line); text-decoration: none; visibility: hidden; }
  h2:hover .anchor, h3:hover .anchor { visibility: visible; }
  p, li { max-width: 72ch; }
  li { margin: 4px 0; }
  li:has(> input.check) { list-style: none; margin-left: -1.4em; }
  input.check { width: 20px; height: 20px; margin: 0 8px 0 0; vertical-align: -4px; accent-color: var(--safe); cursor: pointer; }
  code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .88em; background: var(--card);
    border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; overflow-wrap: anywhere; }
  .code { position: relative; margin: 12px 0; }
  .code pre { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; padding-right: 72px; overflow-x: auto; }
  .code pre code { background: none; border: 0; padding: 0; font-size: 14px; overflow-wrap: normal; }
  .code .copy { position: absolute; top: 8px; right: 8px; border: 1px solid var(--info); background: var(--bg); color: var(--info);
    border-radius: 20px; padding: 3px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .code .copy.done { background: var(--safe); border-color: var(--safe); color: #fff; }
  .table-wrap { overflow-x: auto; margin: 12px 0; border: 1px solid var(--line); border-radius: var(--radius); }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  th { background: var(--card); font-weight: 700; }
  tr:last-child td { border-bottom: 0; }
  aside.tip { background: var(--tint); border-left: 4px solid var(--info); border-radius: var(--radius); padding: 4px 16px; margin: 16px 0; }
  figure { margin: 20px 0; }
  figure img { max-width: 100%; max-height: 560px; border: 1px solid var(--line); border-radius: var(--radius); display: block; }
  figcaption { color: var(--muted); font-size: 14px; margin-top: 6px; }
  hr { display: none; }
  .back { position: fixed; right: 20px; bottom: 20px; background: var(--ink); color: var(--bg); border-radius: 24px; padding: 10px 16px;
    text-decoration: none; font-weight: 700; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  footer { color: var(--muted); font-size: 14px; margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); }
  details.toc-mobile { display: none; }
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; padding: 16px 16px 64px; }
    nav.toc { display: none; }
    details.toc-mobile { display: block; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 14px; margin-bottom: 16px; }
    details.toc-mobile summary { font-weight: 700; cursor: pointer; min-height: 32px; }
    details.toc-mobile a { display: block; padding: 4px 0; text-decoration: none; }
    details.toc-mobile a.toc-3 { padding-left: 16px; font-size: 15px; color: var(--muted); }
    header.bar span, header.bar a { display: none; }
    h2 { font-size: 26px; }
  }
  @media print {
    header.bar, nav.toc, details.toc-mobile, .back, .code .copy { display: none !important; }
    .layout { display: block; padding: 0; }
    h2 { break-before: page; }
    figure { break-inside: avoid; }
  }
</style>
</head>
<body>
<header class="bar">
  <svg class="logo" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="9" fill="#D7263D"/><path d="M18 6l10 4v7c0 6.5-4.2 11.4-10 13-5.8-1.6-10-6.5-10-13v-7z" fill="#fff"/><path d="M16 12h4v6h4l-6 7-6-7h4z" fill="#0B7A55"/></svg>
  <strong>${doc.title}</strong><span>${doc.tagline}</span>
  <div class="spacer"></div>
  <a href="${other.html}">${other.title.replace('EvacuAI ', '')}</a>
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
    <footer>Generated from docs/${doc.md}. EvacuAI, UCLM capstone project.</footer>
  </main>
</div>
<a class="back" href="#">↑ Top</a>
<script>
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  // Copy buttons on commands.
  document.querySelectorAll('.code .copy').forEach(b => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.parentElement.querySelector('code').innerText);
      b.textContent = 'Copied'; b.classList.add('done');
      setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1500);
    } catch { b.textContent = 'Select and copy'; }
  }));
  // Check boxes are remembered on this device, so a tester can come back later.
  const key = 'evacuai-${doc.html}-checks';
  const boxes = [...document.querySelectorAll('input.check')];
  const saved = (store.get(key) ?? '').split(',');
  boxes.forEach((b, i) => { if (saved[i] === '1') b.checked = true; b.addEventListener('change', () => store.set(key, boxes.map(x => (x.checked ? '1' : '0')).join(','))); });
  // Light / dark, remembered on this device.
  const root = document.documentElement, btn = document.getElementById('theme');
  const dark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const label = () => { btn.textContent = dark() ? 'Light mode' : 'Dark mode'; };
  const t = store.get('evacuai-manual-theme'); if (t) root.dataset.theme = t;
  label();
  btn.addEventListener('click', () => { root.dataset.theme = dark() ? 'light' : 'dark'; label(); store.set('evacuai-manual-theme', root.dataset.theme); });
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
};

for (const doc of DOCS) {
  const parts = render(readFileSync(docUrl(doc.md), 'utf8'));
  writeFileSync(docUrl(doc.html), page(doc, parts));
  console.log(`docs/${doc.html}: ${parts.toc.length} sections`);
}
