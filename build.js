'use strict';
const fs = require('fs');
const path = require('path');

/* ============ SITE_URL ============ */
function deriveSiteURL() {
  if (process.env.SITE_URL && process.env.SITE_URL.trim()) {
    return process.env.SITE_URL.trim().replace(/\/+$/, '');
  }
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo) {
    const [owner, name] = repo.split('/');
    if (owner && name) return `https://${owner}.github.io/${name}`;
  }
  return 'https://example.com';
}
const SITE_URL = deriveSiteURL();

/* ============ CONFIG ============ */
const SITE_NAME = 'Sarkari Info';
const SITE_DESC = 'Jharkhand और Central Government Jobs, Yojana, News और Free Tools।';
const CONTACT_EMAIL = 'contact@example.com';
const HOME_LIMIT = { job: 3, yojana: 3, news: 3, tool: 4 };
const TYPES = {
  job:    { path: 'jobs',   label: 'Jobs',   emoji: '💼', sub: 'नई सरकारी भर्ती और अपडेट' },
  yojana: { path: 'yojana', label: 'Yojana', emoji: '🌸', sub: 'नई सरकारी योजनाएं' },
  news:   { path: 'news',   label: 'News',   emoji: '📰', sub: 'जरूरी खबरें' },
  tool:   { path: 'tools',  label: 'Tools',  emoji: '🛠️', sub: 'उपयोगी tools' }
};

const ROOT = process.cwd();
const OUT = path.join(ROOT, '_site');

/* ============ READ SOURCE ============ */
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
const srcIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const extract = (name) => {
  const re = new RegExp(`<!--\\s*BUILD:${name}\\s*-->([\\s\\S]*?)<!--\\s*\\/BUILD:${name}\\s*-->`);
  const m = srcIndex.match(re);
  return m ? m[1].trim() : '';
};

const CSS = (srcIndex.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const HEADER = extract('HEADER');
const FOOTER = extract('FOOTER');
const SOCIAL = extract('SOCIAL');
const BACKTOP = extract('BACKTOP');
const COMMON_JS = extract('COMMON_JS');

if (!CSS || !HEADER || !FOOTER) {
  console.error('❌ index.html me BUILD blocks missing');
  process.exit(1);
}

/* ============ HELPERS ============ */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stripHTML = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); };
const sortByDate = (arr) => [...arr].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });
const write = (p, c) => { ensureDir(path.dirname(p)); fs.writeFileSync(p, c); };

function isValidDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y,m,d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d;
}

/* Root prefix: '/' + '' for homepage, '..' for section, '../..' for article */
function rewriteLinks(html, root) {
  const map = [
    [/href="\.\/"/g, `href="${root || './'}"`],
    [/href="jobs\/"/g, `href="${root}jobs/"`],
    [/href="yojana\/"/g, `href="${root}yojana/"`],
    [/href="news\/"/g, `href="${root}news/"`],
    [/href="tools\/"/g, `href="${root}tools/"`],
    [/href="about\.html"/g, `href="${root}about.html"`],
    [/href="contact\.html"/g, `href="${root}contact.html"`],
    [/href="privacy\.html"/g, `href="${root}privacy.html"`],
    [/href="disclaimer\.html"/g, `href="${root}disclaimer.html"`],
  ];
  let out = html;
  for (const [re, to] of map) out = out.replace(re, to);
  return out;
}

/* ============ VALIDATE ============ */
function validate() {
  const errors = [];
  if (!Array.isArray(data.articles)) { errors.push('articles must be array'); return errors; }
  const seen = new Set();
  data.articles.forEach((a, i) => {
    if (!a.id) errors.push(`[${i}] missing id`);
    else if (seen.has(a.id)) errors.push(`[${i}] duplicate id: ${a.id}`);
    else seen.add(a.id);
    if (a.id && !/^[a-z0-9-]+$/i.test(a.id)) errors.push(`[${i}] invalid id: ${a.id}`);
    if (!a.type || !TYPES[a.type]) errors.push(`[${i}] invalid type: ${a.type}`);
    if (!a.title) errors.push(`[${i}] missing title`);
    if (!a.date || !isValidDate(a.date)) errors.push(`[${i}] invalid date: ${a.date}`);
    if (!a.description) errors.push(`[${i}] missing description`);
    if (!a.content) errors.push(`[${i}] missing content`);
  });
  return errors;
}

/* ============ CARD ============ */
function cardHTML(a, href) {
  const cat = TYPES[a.type];
  const tagHTML = a.tag ? `<span class="tag ${a.tag === "NEW" ? "new" : "hot"}">${esc(a.tag)}</span>` : "";
  if (a.type === 'tool') {
    return `<a class="card tool" href="${href}"><div class="tool-icon">${esc(a.icon||"🛠️")}</div><strong>${esc(a.title)}</strong><small>${esc(a.description||"")}</small></a>`;
  }
  return `<a class="card" href="${href}"><div class="card-top"><h3>${esc(a.title)}</h3>${tagHTML}</div><div class="card-meta"><span>${cat.emoji} ${cat.label}</span><span>${fmtDate(a.date)}</span></div><p>${esc(a.description||"")}</p><span class="card-link">पूरा पढ़ें →</span></a>`;
}

/* ============ HTML SHELL ============ */
function htmlHead({ title, desc, url, ogType = 'website', ld = null }) {
  return `<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=5">
<meta name="theme-color" content="#0b7a53">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23087a52'/%3E%3Ctext x='50' y='68' font-family='Arial' font-weight='900' font-size='60' fill='white' text-anchor='middle'%3ES%3C/text%3E%3C/svg%3E">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hind:wght@400;500;600;700&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
<style>${CSS}</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${SOCIAL}
${HEADER}
<main id="main">`;
}

const htmlFoot = `${BACKTOP}
${FOOTER}
${COMMON_JS}
</body>
</html>`;

/* ============ PAGES ============ */
function buildHomepage() {
  const homeURL = `${SITE_URL}/`;
  const seo = `<title>${esc(SITE_NAME)} — Jobs, Yojana, News & Tools</title>
<meta name="description" content="${esc(SITE_DESC)}">
<link rel="canonical" href="${esc(homeURL)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(SITE_NAME)} — Jobs, Yojana, News & Tools">
<meta property="og:description" content="${esc(SITE_DESC)}">
<meta property="og:url" content="${esc(homeURL)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(SITE_NAME)} — Jobs, Yojana, News & Tools">
<meta name="twitter:description" content="${esc(SITE_DESC)}">`;

  let html = srcIndex.replace(/<!--\s*BUILD:SEO\s*-->[\s\S]*?<!--\s*\/BUILD:SEO\s*-->/, seo);

  // Inject cards for each section
  Object.keys(TYPES).forEach(type => {
    const items = sortByDate(data.articles.filter(a => a.type === type)).slice(0, HOME_LIMIT[type] || 3);
    const cards = items.map(a => cardHTML(a, `${TYPES[type].path}/${a.id}/`)).join('');
    html = html.replace(`<!-- BUILD:CARDS:${type} -->`, cards || '<div class="empty">अभी कोई content नहीं।</div>');
  });

  return html;
}

function buildSectionPage(type) {
  const cfg = TYPES[type];
  const root = '../';
  const url = `${SITE_URL}/${cfg.path}/`;
  const title = `All ${cfg.label} — ${SITE_NAME}`;
  const desc = `सभी latest ${cfg.label} की जानकारी एक जगह।`;
  const items = sortByDate(data.articles.filter(a => a.type === type));

  const head = htmlHead({ title, desc, url }).replace(HEADER, rewriteLinks(HEADER, root));
  const cards = items.map(a => cardHTML(a, `../${cfg.path}/${a.id}/`.replace(`../${cfg.path}/${cfg.path}/`, '../'))).join('');

  // Simpler: from section page at /{type}/, article link is just {id}/
  const cards2 = items.map(a => cardHTML(a, `${a.id}/`)).join('');

  const body = `
<section class="section">
<div class="container">
<div class="section-head">
<div>
<div class="breadcrumb"><a href="${root}">Home</a> <span>›</span> <span>${cfg.label}</span></div>
<h1 class="section-title">All ${cfg.label}</h1>
<p class="section-sub">${cfg.sub}</p>
</div>
</div>
<div class="grid${type === 'tool' ? ' tools' : ''}">${cards2 || '<div class="empty">अभी कोई content नहीं।</div>'}</div>
</div>
</section>
</main>`;

  // Replace header and footer with rewritten versions
  let html = head + body + htmlFoot;
  html = html.replace(FOOTER, rewriteLinks(FOOTER, root));
  return html;
}

function buildArticlePage(a) {
  const cfg = TYPES[a.type];
  const root = '../../';
  const url = `${SITE_URL}/${cfg.path}/${a.id}/`;
  const title = `${a.title} — ${SITE_NAME}`;
  const desc = stripHTML(a.description || a.content).slice(0, 158);

  const ld = {
    "@context": "https://schema.org",
    "@type": a.type === 'news' ? 'NewsArticle' : 'Article',
    "headline": a.title,
    "description": desc,
    "datePublished": a.date,
    "dateModified": a.date,
    "author": { "@type": "Organization", "name": SITE_NAME },
    "publisher": { "@type": "Organization", "name": SITE_NAME },
    "mainEntityOfPage": url
  };

  const head = htmlHead({ title, desc, url, ogType: 'article', ld });
  const shareText = encodeURIComponent(a.title + ' — ' + url);

  const body = `
<section class="section">
<div class="container">
<div class="article-wrap">
<div class="breadcrumb">
<a href="${root}">Home</a> <span>›</span>
<a href="../">${cfg.label}</a> <span>›</span>
<span>${esc(a.title.length > 40 ? a.title.slice(0,40)+'…' : a.title)}</span>
</div>
<h1 class="article-title">${esc(a.title)}</h1>
<div class="article-meta">
<span class="cat">${cfg.emoji} ${cfg.label}</span>
<span>${fmtDate(a.date)}</span>
</div>
<div class="article-body">${a.content}</div>
<div class="share-row">
<strong>Share:</strong>
<a class="share-btn wa" href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener" aria-label="WhatsApp">WA</a>
<a class="share-btn tg" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(a.title)}" target="_blank" rel="noopener" aria-label="Telegram">TG</a>
<a class="share-btn fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener" aria-label="Facebook">FB</a>
<a class="share-btn tw" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(a.title)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener" aria-label="X">X</a>
<button class="share-btn cp" id="shareCopy" aria-label="Copy link">Copy</button>
</div>
</div>
</div>
</section>
</main>`;

  let html = head + body + htmlFoot;
  html = html.replace(HEADER, rewriteLinks(HEADER, root));
  html = html.replace(FOOTER, rewriteLinks(FOOTER, root));
  return html;
}

function buildLegalPage(filename, title, content) {
  const root = './';
  const url = `${SITE_URL}/${filename}`;
  const head = htmlHead({ title: `${title} — ${SITE_NAME}`, desc: `${title} of ${SITE_NAME}.`, url });
  const body = `
<section class="section">
<div class="container">
<div class="article-wrap">
<h1 class="article-title">${title}</h1>
<div class="article-body">${content}</div>
</div>
</div>
</section>
</main>`;
  return head + body + htmlFoot;
}

/* ============ MAIN ============ */
function main() {
  console.log(`🌐 SITE_URL: ${SITE_URL}`);

  const errors = validate();
  if (errors.length) {
    console.error('❌ data.json validation failed:');
    errors.forEach(e => console.error('   • ' + e));
    process.exit(1);
  }
  console.log(`✅ data.json valid (${data.articles.length} articles)`);

  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });

  // Homepage (with cards injected)
  write(path.join(OUT, 'index.html'), buildHomepage());
  console.log('📄 index.html');

  // data.json for JS fallback
  write(path.join(OUT, 'data.json'), JSON.stringify(data, null, 2));

  // Section + article pages
  Object.keys(TYPES).forEach(type => {
    const cfg = TYPES[type];
    write(path.join(OUT, cfg.path, 'index.html'), buildSectionPage(type));
    const items = data.articles.filter(a => a.type === type);
    items.forEach(a => {
      write(path.join(OUT, cfg.path, a.id, 'index.html'), buildArticlePage(a));
    });
    console.log(`✅ /${cfg.path}/: ${items.length} articles + listing`);
  });

  // Legal pages
  write(path.join(OUT, 'about.html'), buildLegalPage('about.html', 'About Us',
    `<p>${SITE_NAME} एक free information portal है जहाँ Jharkhand और Central Government की jobs, yojana, news, और useful tools की जानकारी आसान भाषा में दी जाती है।</p><h2>हमारा उद्देश्य</h2><p>सही, verified और समय पर जानकारी हर नागरिक तक पहुँचाना।</p>`));
  write(path.join(OUT, 'contact.html'), buildLegalPage('contact.html', 'Contact Us',
    `<p>आप हमसे संपर्क कर सकते हैं:</p><h2>Email</h2><p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><p>हम 24-48 घंटे में जवाब देते हैं।</p>`));
  write(path.join(OUT, 'privacy.html'), buildLegalPage('privacy.html', 'Privacy Policy',
    `<p>${SITE_NAME} आपकी privacy का सम्मान करता है।</p><h2>Data Collection</h2><p>हम कोई personal data collect नहीं करते।</p>`));
  write(path.join(OUT, 'disclaimer.html'), buildLegalPage('disclaimer.html', 'Disclaimer',
    `<p>${SITE_NAME} पर दी जानकारी official sources से ली जाती है, त्रुटि के लिए जिम्मेदार नहीं।</p><h2>महत्वपूर्ण</h2><ul><li>आवेदन से पहले official notification पढ़ें</li><li>अंतिम पुष्टि official website से करें</li></ul>`));
  console.log('✅ Legal pages');

  // robots.txt
  write(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // sitemap.xml
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', lastmod: today },
    ...Object.keys(TYPES).map(t => ({ loc: `${SITE_URL}/${TYPES[t].path}/`, priority: '0.9', lastmod: today })),
    ...data.articles.map(a => ({ loc: `${SITE_URL}/${TYPES[a.type].path}/${a.id}/`, priority: '0.8', lastmod: a.date })),
    { loc: `${SITE_URL}/about.html`, priority: '0.3', lastmod: today },
    { loc: `${SITE_URL}/contact.html`, priority: '0.3', lastmod: today },
    { loc: `${SITE_URL}/privacy.html`, priority: '0.3', lastmod: today },
    { loc: `${SITE_URL}/disclaimer.html`, priority: '0.3', lastmod: today }
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${esc(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  write(path.join(OUT, 'sitemap.xml'), sitemap);
  console.log('✅ sitemap.xml + robots.txt');

  console.log('🎉 Build complete → _site/');
}

main();
