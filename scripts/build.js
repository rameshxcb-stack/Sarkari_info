'use strict';
const fs = require('fs');
const path = require('path');

/* ========== SITE_URL (auto-derive) ========== */
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
const BASE = new URL(SITE_URL).pathname.replace(/\/$/, '');

/* ========== CONFIG ========== */
const SITE_NAME = 'Sarkari Info';
const SITE_DESC = 'Jharkhand और Central Government Jobs, Yojana, News और Free Tools।';
const CONTACT_EMAIL = 'contact@sarkariinfo.co.in'; // ✅ Real email
const ROOT = process.cwd();
const OUT = path.join(ROOT, '_site');
const TYPES = ['job', 'yojana', 'news', 'tool'];
const TYPE_PATH = { job: 'jobs', yojana: 'yojana', news: 'news', tool: 'tools' };
const TYPE_LABEL = { job: 'Jobs', yojana: 'Yojana', news: 'News', tool: 'Tools' };
const TYPE_EMOJI = { job: '💼', yojana: '🌸', news: '📰', tool: '🛠️' };

/* ========== READ SOURCE ========== */
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const extract = (name) => {
  const re = new RegExp(`<!--\\s*BUILD:${name}\\s*-->([\\s\\S]*?)<!--\\s*\\/BUILD:${name}\\s*-->`);
  const m = indexHtml.match(re);
  return m ? m[1].trim() : '';
};

const cssMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/);
const CSS = cssMatch ? cssMatch[1] : '';
const HEADER = extract('HEADER');
const FOOTER = extract('FOOTER');
const SOCIAL = extract('SOCIAL');
const BACKTOP = extract('BACKTOP');

if (!CSS || !HEADER || !FOOTER) {
  console.error('❌ Missing required BUILD blocks in index.html');
  process.exit(1);
}

/* ========== URL FIX ========== */
function absoluteURLs(html) {
  const map = [
    [/href="\.\/"/g, `href="${BASE}/"`],
    [/href="jobs\/"/g, `href="${BASE}/jobs/"`],
    [/href="yojana\/"/g, `href="${BASE}/yojana/"`],
    [/href="news\/"/g, `href="${BASE}/news/"`],
    [/href="tools\/"/g, `href="${BASE}/tools/"`],
    [/href="about\.html"/g, `href="${BASE}/about.html"`],
    [/href="contact\.html"/g, `href="${BASE}/contact.html"`],
    [/href="privacy\.html"/g, `href="${BASE}/privacy.html"`],
    [/href="disclaimer\.html"/g, `href="${BASE}/disclaimer.html"`],
  ];
  let out = html;
  for (const [re, to] of map) out = out.replace(re, to);
  return out;
}

const HEADER_FIXED = absoluteURLs(HEADER);
const FOOTER_FIXED = absoluteURLs(FOOTER);

/* ========== HELPERS ========== */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stripHTML = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); };
const sortByDate = (arr) => [...arr].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });
const write = (p, c) => { ensureDir(path.dirname(p)); fs.writeFileSync(p, c); };

/* ✅ REAL calendar date validation */
function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y &&
         dt.getUTCMonth() === m - 1 &&
         dt.getUTCDate() === d;
}

const articlePath = (a) => `${BASE}/${TYPE_PATH[a.type]}/${a.id}/`;
const articleFullURL = (a) => `${SITE_URL}/${TYPE_PATH[a.type]}/${a.id}/`;

/* ========== VALIDATE ========== */
function validate() {
  const errors = [];
  if (!Array.isArray(data.articles)) { errors.push('data.articles must be array'); return errors; }
  const seen = new Set();
  data.articles.forEach((a, i) => {
    if (!a.id) errors.push(`[${i}] missing "id"`);
    else if (seen.has(a.id)) errors.push(`[${i}] duplicate id: ${a.id}`);
    else seen.add(a.id);
    if (a.id && !/^[a-z0-9-]+$/i.test(a.id)) errors.push(`[${i}] id must be alphanumeric+hyphens: ${a.id}`);
    if (!a.type) errors.push(`[${i}] missing "type"`);
    else if (!TYPES.includes(a.type)) errors.push(`[${i}] invalid type: ${a.type}`);
    if (!a.title) errors.push(`[${i}] missing "title"`);
    if (!a.date) errors.push(`[${i}] missing "date"`);
    else if (!isValidDateOnly(a.date)) errors.push(`[${i}] invalid calendar date: ${a.date}`);
    if (!a.description) errors.push(`[${i}] missing "description"`);
    if (!a.content) errors.push(`[${i}] missing "content"`);
  });
  return errors;
}

/* ========== HTML SHELL ========== */
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
${HEADER_FIXED}
<main id="main">`;
}

const COMMON_JS = `<script>
(function(){
  "use strict";
  var btn=document.getElementById('menuBtn'),nav=document.getElementById('primaryNav');
  if(btn&&nav){
    btn.addEventListener('click',function(){var o=!nav.classList.contains('active');nav.classList.toggle('active',o);document.body.classList.toggle('menu-open',o);btn.textContent=o?'✕':'☰';btn.setAttribute('aria-expanded',String(o));});
    nav.addEventListener('click',function(e){if(e.target.closest('.nav-link')&&window.innerWidth<=1080){nav.classList.remove('active');document.body.classList.remove('menu-open');btn.textContent='☰';}});
    document.addEventListener('click',function(e){if(!e.target.closest('.header')&&nav.classList.contains('active')){nav.classList.remove('active');document.body.classList.remove('menu-open');btn.textContent='☰';}});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&nav.classList.contains('active')){nav.classList.remove('active');document.body.classList.remove('menu-open');btn.textContent='☰';}});
  }
  var socials=document.querySelectorAll('.social-float'),btt=document.getElementById('backToTop');
  var onScroll=function(){var y=window.scrollY;Array.prototype.forEach.call(socials,function(s){s.classList.toggle('show',y>280);});if(btt)btt.classList.toggle('show',y>600);};
  onScroll();window.addEventListener('scroll',onScroll,{passive:true});
  if(btt)btt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
  var cp=document.getElementById('shareCopy');
  if(cp)cp.addEventListener('click',function(){if(navigator.clipboard){navigator.clipboard.writeText(location.href).then(function(){var o=cp.textContent;cp.textContent='✓';cp.style.background='#087a52';setTimeout(function(){cp.textContent=o;cp.style.background='';},1500);});}});
})();
</script>`;

const htmlFoot = `${BACKTOP}
${FOOTER_FIXED}
${COMMON_JS}
</body>
</html>`;

/* ========== ✅ HOMEPAGE (with SEO injected) ========== */
function buildHomepage() {
  const homeURL = `${SITE_URL}/`;
  const title = 'Sarkari Info — Jobs, Yojana, News & Tools';
  const desc = SITE_DESC;

  const seoBlock = `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(homeURL)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(homeURL)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">`;

  // Replace BUILD:SEO block
  let html = indexHtml.replace(
    /<!--\s*BUILD:SEO\s*-->[\s\S]*?<!--\s*\/BUILD:SEO\s*-->/,
    seoBlock
  );

  // Remove existing title tag (we injected one)
  html = html.replace(/<title>[^<]*<\/title>\s*(?=<link rel="icon")/, '');

  return html;
}

/* ========== ARTICLE PAGE ========== */
function buildArticlePage(a) {
  const cat = TYPE_LABEL[a.type], emoji = TYPE_EMOJI[a.type];
  const url = articleFullURL(a);
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
<a href="${BASE}/">Home</a> <span>›</span>
<a href="${BASE}/${TYPE_PATH[a.type]}/">${cat}</a> <span>›</span>
<span>${esc(a.title.length > 40 ? a.title.slice(0,40)+'…' : a.title)}</span>
</div>
<h1 class="article-title">${esc(a.title)}</h1>
<div class="article-meta">
<span class="cat">${emoji} ${cat}</span>
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

  return head + body + htmlFoot;
}

/* ========== SECTION PAGE ========== */
function buildSectionPage(type, articles) {
  const cat = TYPE_LABEL[type], emoji = TYPE_EMOJI[type];
  const url = `${SITE_URL}/${TYPE_PATH[type]}/`;
  const title = `All ${cat} — ${SITE_NAME}`;
  const desc = `सभी latest ${cat} की जानकारी एक जगह।`;

  const head = htmlHead({ title, desc, url });

  const cards = articles.map(a => {
    const tagHTML = a.tag ? `<span class="tag ${a.tag === "NEW" ? "new" : "hot"}">${esc(a.tag)}</span>` : "";
    const href = articlePath(a);
    if (type === 'tool') {
      return `<a class="card tool" href="${href}"><div class="tool-icon">${esc(a.icon || "🛠️")}</div><strong>${esc(a.title)}</strong><small>${esc(a.description || "")}</small></a>`;
    }
    return `<a class="card" href="${href}"><div class="card-top"><h3>${esc(a.title)}</h3>${tagHTML}</div><div class="card-meta"><span>${emoji} ${cat}</span><span>${fmtDate(a.date)}</span></div><p>${esc(a.description || "")}</p><span class="card-link">पूरा पढ़ें →</span></a>`;
  }).join("");

  const body = `
<section class="section">
<div class="container">
<div class="section-head">
<div>
<div class="breadcrumb"><a href="${BASE}/">Home</a> <span>›</span> <span>${cat}</span></div>
<h1 class="section-title">All ${cat}</h1>
<p class="section-sub">सभी latest ${cat}</p>
</div>
</div>
<div class="grid${type === 'tool' ? ' tools' : ''}">${cards || '<div class="empty">अभी कोई content नहीं।</div>'}</div>
</div>
</section>
</main>`;

  return head + body + htmlFoot;
}

/* ========== LEGAL PAGE ========== */
function buildLegalPage(filename, title, content) {
  const url = `${SITE_URL}/${filename}`;
  const head = htmlHead({ title: `${title} — ${SITE_NAME}`, desc: `${title} page of ${SITE_NAME}.`, url });
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

/* ========== MAIN ========== */
function main() {
  console.log(`🌐 SITE_URL: ${SITE_URL}`);
  console.log(`📁 BASE:     "${BASE}"`);

  const errors = validate();
  if (errors.length) {
    console.error('❌ data.json validation failed:');
    errors.forEach(e => console.error('   • ' + e));
    process.exit(1);
  }
  console.log(`✅ data.json valid (${data.articles.length} articles)`);

  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });

  // Homepage (with SEO injected)
  write(path.join(OUT, 'index.html'), buildHomepage());
  console.log('📄 index.html (with SEO)');

  // data.json for homepage fetch
  write(path.join(OUT, 'data.json'), JSON.stringify(data, null, 2));

  // Section + article pages
  TYPES.forEach(type => {
    const items = sortByDate(data.articles.filter(a => a.type === type));
    write(path.join(OUT, TYPE_PATH[type], 'index.html'), buildSectionPage(type, items));
    items.forEach(a => {
      write(path.join(OUT, TYPE_PATH[type], a.id, 'index.html'), buildArticlePage(a));
    });
    console.log(`✅ ${TYPE_PATH[type]}/: ${items.length} articles + listing`);
  });

  // Legal pages
  write(path.join(OUT, 'about.html'), buildLegalPage('about.html', 'About Us',
    `<p>${SITE_NAME} एक free information portal है जहाँ Jharkhand और Central Government की jobs, yojana, news, और useful tools की जानकारी आसान भाषा में दी जाती है।</p><h2>हमारा उद्देश्य</h2><p>सही, verified और समय पर जानकारी हर नागरिक तक पहुँचाना।</p><h2>Contact</h2><p>सुझाव के लिए हमें <a href="${BASE}/contact.html">contact करें</a>।</p>`));
  write(path.join(OUT, 'contact.html'), buildLegalPage('contact.html', 'Contact Us',
    `<p>आप हमसे संपर्क कर सकते हैं:</p><h2>Email</h2><p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><h2>Response Time</h2><p>हम 24-48 घंटे में जवाब देते हैं।</p>`));
  write(path.join(OUT, 'privacy.html'), buildLegalPage('privacy.html', 'Privacy Policy',
    `<p>${SITE_NAME} आपकी privacy का सम्मान करता है।</p><h2>Data Collection</h2><p>हम कोई personal data collect नहीं करते।</p><h2>Third-party Links</h2><p>External links की अपनी privacy policy होगी।</p>`));
  write(path.join(OUT, 'disclaimer.html'), buildLegalPage('disclaimer.html', 'Disclaimer',
    `<p>${SITE_NAME} पर दी जानकारी official sources से ली जाती है, त्रुटि के लिए जिम्मेदार नहीं।</p><h2>महत्वपूर्ण</h2><ul><li>आवेदन से पहले official notification पढ़ें</li><li>अंतिम पुष्टि official website से करें</li></ul>`));
  console.log('✅ Legal pages');

  // robots.txt
  write(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // sitemap.xml
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', lastmod: today },
    ...TYPES.map(t => ({ loc: `${SITE_URL}/${TYPE_PATH[t]}/`, priority: '0.9', lastmod: today })),
    ...data.articles.map(a => ({ loc: articleFullURL(a), priority: '0.8', lastmod: a.date })),
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
