// Génère la page HTML d'un article (rendue côté serveur pour que les réseaux sociaux
// puissent lire les balises Open Graph : titre, description, image).

function esc(s) {
  return (s === undefined || s === null) ? '' : String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function safeColor(c, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : fallback;
}

// Texte brut -> paragraphes (ligne vide = nouveau paragraphe, retour à la ligne simple = <br>)
function bodyToHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function renderArticle(content, article, baseUrl) {
  const g = content.general || {};
  const primary = safeColor(g.primaryColor, '#0d1c3d');
  const accent = safeColor(g.accentColor, '#c8a24d');
  const clubName = g.clubNameFr || 'Espoir Sportif Bouchemma';

  const url = `${baseUrl}/article/${article.id}`;
  const image = article.photo ? `${baseUrl}${article.photo}` : `${baseUrl}/images/logo.jpg`;
  const description = String(article.summary || '').slice(0, 200);
  const pageTitle = `${article.title} — ${clubName}`;
  const eu = encodeURIComponent(url);
  const et = encodeURIComponent(article.title || '');
  const body = bodyToHtml(article.body);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(clubName)}">
<meta property="og:title" content="${esc(article.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(article.title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="/images/logo.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{--primary:${primary}; --accent:${accent}; --ink:#12172a; --soft:#4b5266; --line:#e2ded0; --paper:#faf9f5;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Source Sans 3',sans-serif; color:var(--ink); background:var(--paper); line-height:1.65; -webkit-font-smoothing:antialiased;}
  h1,h2{font-family:'Oswald',sans-serif; font-weight:600; color:var(--primary);}
  a{color:inherit; text-decoration:none;}
  .top{background:var(--primary); padding:14px 20px;}
  .top-in{max-width:820px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:16px;}
  .brand{display:flex; align-items:center; gap:12px; color:#fff; font-family:'Oswald',sans-serif; font-size:15px; letter-spacing:.03em;}
  .brand img{width:40px; height:40px; border-radius:50%;}
  .back{color:#fff; font-size:14px; border:1px solid rgba(255,255,255,.35); padding:8px 14px;}
  .back:hover{border-color:var(--accent);}
  main{max-width:820px; margin:0 auto; padding:40px 20px 80px;}
  .badge{display:inline-block; background:var(--accent); color:#0b1226; font-family:'Oswald',sans-serif; font-weight:700; font-size:13px; padding:5px 12px; margin-bottom:16px;}
  h1{font-size:clamp(28px,5vw,44px); line-height:1.15; margin-bottom:24px;}
  .cover{width:100%; max-height:480px; object-fit:cover; margin-bottom:28px; background:var(--primary);}
  .lead{font-size:19px; color:var(--soft); font-weight:600; margin-bottom:22px;}
  .text p{font-size:17px; margin-bottom:18px;}
  .share{margin-top:44px; padding-top:26px; border-top:1px solid var(--line);}
  .share h2{font-size:16px; margin-bottom:14px;}
  .share-row{display:flex; flex-wrap:wrap; gap:10px;}
  .sbtn{display:inline-block; padding:11px 18px; font-size:14px; font-weight:700; color:#fff; border:none; cursor:pointer; font-family:inherit;}
  .fb{background:#1877f2;} .wa{background:#25d366;} .x{background:#111;} .cp{background:var(--primary);} .nat{background:var(--accent); color:#0b1226; display:none;}
  .more{display:inline-block; margin-top:36px; color:var(--primary); font-weight:700; border-bottom:2px solid var(--accent);}
</style>
</head>
<body>
<div class="top"><div class="top-in">
  <a href="/" class="brand"><img src="/images/logo.jpg" alt=""><span>${esc(clubName)}</span></a>
  <a href="/#actualites" class="back">← Toutes les actualités</a>
</div></div>
<main>
  ${article.date ? `<span class="badge">${esc(article.date)}</span>` : ''}
  <h1>${esc(article.title)}</h1>
  ${article.photo ? `<img class="cover" src="${esc(article.photo)}" alt="${esc(article.title)}">` : ''}
  ${article.summary ? `<p class="lead">${esc(article.summary)}</p>` : ''}
  <div class="text">${body}</div>

  <div class="share">
    <h2>Partager cet article</h2>
    <div class="share-row">
      <button class="sbtn nat" id="nativeShare">Partager…</button>
      <a class="sbtn fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${eu}">Facebook</a>
      <a class="sbtn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent((article.title || '') + ' ' + url)}">WhatsApp</a>
      <a class="sbtn x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${eu}&text=${et}">X</a>
      <button class="sbtn cp" id="copyLink">Copier le lien</button>
    </div>
  </div>
  <a class="more" href="/#actualites">Voir toutes les actualités</a>
</main>
<script>
  var shareUrl = ${JSON.stringify(url).replace(/</g, '\\u003c')};
  var shareTitle = ${JSON.stringify(article.title || '').replace(/</g, '\\u003c')};
  var copyBtn = document.getElementById('copyLink');
  copyBtn.addEventListener('click', function(){
    var done = function(){ copyBtn.textContent = 'Lien copié ✓'; setTimeout(function(){ copyBtn.textContent = 'Copier le lien'; }, 2200); };
    if (navigator.clipboard) { navigator.clipboard.writeText(shareUrl).then(done); }
    else { var i = document.createElement('input'); i.value = shareUrl; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); done(); }
  });
  if (navigator.share) {
    var nb = document.getElementById('nativeShare');
    nb.style.display = 'inline-block';
    nb.addEventListener('click', function(){ navigator.share({ title: shareTitle, url: shareUrl }).catch(function(){}); });
  }
</script>
</body>
</html>`;
}

function renderNotFound() {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Article introuvable</title></head>
<body style="font-family:sans-serif;text-align:center;padding:80px 20px;"><h1>Article introuvable</h1><p style="margin:16px 0 28px;">Cet article n'existe plus ou le lien est incorrect.</p><a href="/#actualites">← Retour aux actualités</a></body></html>`;
}

module.exports = { renderArticle, renderNotFound };
