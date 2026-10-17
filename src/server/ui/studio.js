/* Presentation and navigation helpers. The Bedrock editors keep their existing API. */
(() => {
  const screens = {
    projects: ['Projets', 'Retrouvez vos créations et commencez votre prochain add-on.', 'chest'],
    items: ['Éditeur d’items', 'Objets, armes, outils : imaginez le prochain indispensable de votre inventaire.', 'diamond_sword'],
    blocks: ['Blocs', 'De nouvelles matières pour construire votre propre univers.', 'stone_bricks'],
    recipes: ['Recettes de craft', 'Assemblez les ingrédients. Inventez de nouvelles possibilités.', 'crafting_table'],
    mobs: ['Mobs & entités', 'Donnez du caractère et des comportements à vos créatures.', 'zombie_spawn_egg'],
    loot: ['Tables de butin', 'Choisissez les récompenses qui attendent vos joueurs.', 'bundle'],
    textures: ['Bibliothèque de textures', 'Tous les pixels de votre projet, au même endroit.', 'painting'],
    sounds: ['Sons', 'Ajoutez une nouvelle dimension à votre univers.', 'jukebox'],
    skins: ['Skins', 'Dessinez un personnage qui ne ressemble qu’à vous.', 'armor_stand'],
    deploy: ['Exporter & installer', 'Vérifiez votre add-on et préparez-le pour Minecraft Bedrock.', 'ender_eye'],
    history: ['Historique', 'Retrouvez les versions enregistrées de votre projet.', 'clock'],
  };
  let projects = [], saved = 'Enregistré', saveError = false, renderVersion = 0;
  let query = '', order = 'recent', lastFocus = null;
  const formatDate = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Date inconnue' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const modal = (id, open = true) => document.getElementById(id).classList.toggle('show', open);
  function openHelp() { modal('studioHelp'); }
  function openCreate() {
    modal('newProjectModal');
    document.getElementById('newProjectError').textContent = '';
    setTimeout(() => document.getElementById('np_name').focus(), 0);
  }
  function closeMenu() {
    document.body.classList.remove('menu-open');
    document.getElementById('menuToggle').setAttribute('aria-expanded', 'false');
    updateMobileMenu();
  }
  function updateMobileMenu() {
    const side = document.querySelector('.side');
    const mobile = matchMedia('(max-width:900px)').matches;
    side.inert = mobile && !document.body.classList.contains('menu-open');
  }
  document.getElementById('menuToggle').onclick = () => {
    const open = document.body.classList.toggle('menu-open');
    document.getElementById('menuToggle').setAttribute('aria-expanded', String(open));
    updateMobileMenu();
    if (open) document.querySelector('#nav a.on').focus();
  };
  document.getElementById('menuScrim').onclick = closeMenu;
  matchMedia('(max-width:900px)').addEventListener('change', updateMobileMenu);
  updateMobileMenu();
  document.getElementById('helpButton').onclick = openHelp;
  let light = false;
  try { light = localStorage.getItem('mcstudio-theme') === 'light'; } catch {}
  function applyTheme() {
    document.body.classList.toggle('light', light);
    const b = document.getElementById('themeButton');
    b.textContent = light ? '☾' : '☼';
    b.title = b.ariaLabel = light ? 'Activer le thème sombre' : 'Activer le thème clair';
  }
  applyTheme();
  document.getElementById('themeButton').onclick = () => {
    light = !light; applyTheme();
    try { localStorage.setItem('mcstudio-theme', light ? 'light' : 'dark'); } catch {}
  };
  document.querySelectorAll('#nav a[data-view]').forEach(a => {
    a.href = '#';
    a.title = screens[a.dataset.view][0];
    const originalClick = a.onclick;
    a.onclick = e => { e.preventDefault(); originalClick(e); closeMenu(); };
    a.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); a.click(); } });
  });
  function saveState() {
    document.querySelectorAll('.save-state').forEach(el => {
      el.textContent = saved;
      el.classList.toggle('dirty', saved === 'Modifications en cours');
      el.classList.toggle('failed', saveError);
    });
  }
  save = async function(silent) {
    saved = 'Enregistrement…'; saveError = false; saveState();
    // Existing callers expect the project to be replaced by the server response.
    try {
      if (!state.project) return false;
      state.project = await api('PUT', '/api/projects/' + state.project.id, state.project);
      saved = 'Enregistré';
      if (!silent) toast('Projet enregistré');
      return true;
    } catch (e) {
      saved = 'Échec de sauvegarde'; saveError = true;
      toast('Enregistrement impossible : ' + e.message, true);
      return false;
    } finally { saveState(); }
  };
  document.getElementById('content').addEventListener('input', e => {
    if (state.view !== 'projects' && e.target.matches('input:not([type=search]),textarea,select')) {
      saved = 'Modifications en cours'; saveError = false; saveState();
    }
  });
  const originalRender = render;
  render = function(...args) {
    const content = document.getElementById('content');
    const version = ++renderVersion;
    content.dataset.view = state.view;
    content.dataset.renderId = String(version);
    if (window._prevViewer?.dispose) { window._prevViewer.dispose(); window._prevViewer = null; }
    document.querySelectorAll('#nav [data-view]').forEach(a => {
      const active = a.dataset.view === state.view;
      a.classList.toggle('on', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      const field = { items:'items', recipes:'recipes', blocks:'blocks', mobs:'mobs', loot:'lootTables', sounds:'sounds', skins:'skins' }[a.dataset.view];
      let badge = a.querySelector('.nav-count');
      if (field && state.project) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'nav-count'; a.append(badge); }
        badge.textContent = (state.project[field] || []).length;
      } else badge?.remove();
    });
    let output;
    try { output = originalRender.apply(this, args); }
    catch (e) { showRenderError(e, version); return; }
    const decorate = () => {
      if (version !== renderVersion || state.view === 'projects') return;
      document.getElementById('topTitle').textContent = screens[state.view][0];
      if (!content.querySelector('.editor-heading')) {
        const h = document.createElement('div'); h.className = 'editor-heading';
        h.innerHTML = `<div><div class="eyebrow">${esc(state.project?.name || 'VOTRE PROJET')}</div><h1>${screens[state.view][0]}</h1><p>${screens[state.view][1]}</p></div><span class="save-state" role="status"></span>`;
        content.prepend(h);
      }
      saveState(); addInputLabels(content);
    };
    if (output?.then) output.then(decorate).catch(e => showRenderError(e, version));
    else decorate();
    return output;
  };
  function showRenderError(e, version) {
    if (version !== renderVersion) return;
    const c = document.getElementById('content');
    c.innerHTML = `<div class="card"><h3>Impossible d’afficher cet espace</h3><p class="muted">${esc(e.message || 'Vérifiez que le studio est démarré.')}</p><button id="retryView">Réessayer</button></div>`;
    document.getElementById('retryView').onclick = () => render();
  }
  let labelCounter = 0;
  function addInputLabels(root) {
    root.querySelectorAll('label').forEach(l => {
      if (l.htmlFor || l.querySelector('input,select,textarea')) return;
      const input = l.nextElementSibling;
      if (input?.matches('input,select,textarea')) {
        if (!input.id) input.id = 'studio-field-' + (++labelCounter);
        l.htmlFor = input.id;
      }
    });
  }
  viewProjects = async function(c) {
    const version = renderVersion;
    c.innerHTML = '<div class="card"><div class="empty" role="status">Ouverture de votre atelier…</div></div>';
    const response = await api('GET', '/api/projects');
    if (version !== renderVersion || state.view !== 'projects') return;
    projects = response.projects || [];
    c.innerHTML = `
      <div class="workspace-title"><div><div class="eyebrow">VOTRE ATELIER BEDROCK</div><h1>Un monde à créer.</h1><p>Vos idées. Vos règles. Vos add-ons.</p></div><button class="primary" data-new-project><span aria-hidden="true">＋</span> Nouveau projet</button></div>
      <section class="hero" aria-labelledby="heroTitle"><div class="hero-copy"><span class="eyebrow">DE L’IDÉE AU PREMIER PIXEL</span><h2 id="heroTitle">Tout commence<br>par <em>un bloc d’imagination.</em></h2><p>Créez des objets, dessinez vos textures et donnez vie à votre univers Minecraft. Tout est dans votre atelier.</p><div class="hero-tags"><span>Éditeur de textures</span><span>Aperçu 3D</span><span>Export .mcaddon</span></div></div><div class="hero-art" aria-hidden="true"><span class="art-spark spark1">✦</span><img class="floating-item" src="mcicons/diamond_pickaxe.png" alt=""><div class="voxel one"><i class="front"></i><i class="right"></i><i class="topface"></i></div><div class="voxel two"><i class="front"></i><i class="right"></i><i class="topface"></i></div><div class="voxel three"><i class="front"></i><i class="right"></i><i class="topface"></i></div><span class="art-spark spark2">✧</span><span class="art-caption">BUILD SOMETHING YOURS.</span></div></section>
      <div class="library-layout"><section aria-labelledby="libraryTitle"><div class="section-heading"><h2 id="libraryTitle">Mes projets <span class="count-badge">${projects.length}</span></h2><span class="shortcut-hint">Votre bibliothèque d’add-ons</span></div><div class="library-tools"><div class="search-field"><input id="projectSearch" type="search" aria-label="Rechercher un projet" placeholder="Rechercher un projet…" value="${esc(query)}"></div><select id="projectSort" aria-label="Trier les projets"><option value="recent">Dernière modification</option><option value="name">Nom du projet</option><option value="items">Nombre d’items</option></select></div><div id="projectGrid" class="projects-grid" aria-live="polite"></div></section>
      <aside class="library-aside" aria-label="Bien démarrer"><div class="guide-card"><h3>Votre premier add-on ?</h3><div class="guide-step"><span class="step-num">01</span><div><h4>Posez les fondations</h4><p>Créez un projet et choisissez son nom et son namespace.</p></div></div><div class="guide-step"><span class="step-num">02</span><div><h4>Faites-le vôtre</h4><p>Ajoutez des items, des blocs et des textures uniques.</p></div></div><div class="guide-step"><span class="step-num">03</span><div><h4>À vous de jouer</h4><p>Exportez votre .mcaddon pour le tester dans Minecraft.</p></div></div><button class="text-button" data-help>Ouvrir le guide de démarrage ↗</button></div><div class="format-card"><strong>Conçu pour Bedrock.</strong><p>Behavior pack + resource pack réunis dans un seul export. Un projet organisé, prêt à être testé.</p></div></aside></div><footer class="library-footer"><span>Creator Studio · Votre atelier de création Minecraft</span><span>Imaginez. Assemblez. Explorez.</span></footer>`;
    document.getElementById('projectSort').value = order;
    document.getElementById('projectSearch').oninput = e => { query = e.target.value; paintProjects(); };
    document.getElementById('projectSort').onchange = e => { order = e.target.value; paintProjects(); };
    paintProjects();
  };
  function paintProjects() {
    const q = normalize(query.trim());
    const results = projects.filter(p => normalize(p.name).includes(q)).sort((a,b) => order === 'name' ? a.name.localeCompare(b.name, 'fr') : order === 'items' ? b.items-a.items : new Date(b.updatedAt)-new Date(a.updatedAt));
    const icons = ['chest','diamond','diamond_pickaxe','emerald','crafting_table','enchanted_book'];
    const grid = document.getElementById('projectGrid');
    if (!grid) return;
    grid.innerHTML = results.map(p => `<button class="project-card" data-open-project="${esc(p.id)}"><div class="project-cover"><span class="project-icon"><img src="mcicons/${icons[projects.indexOf(p)%icons.length]}.png" alt=""></span><span class="project-type">BEDROCK ADD-ON</span></div><h3>${esc(p.name)}</h3><div class="project-meta">${p.items || 0} item${p.items === 1 ? '' : 's'} · Behavior & resource packs</div><div class="project-bottom"><span>Modifié le ${formatDate(p.updatedAt)}</span><span class="open-arrow"><span class="open-text">Ouvrir </span>↗</span></div></button>`).join('') + (!results.length ? `<div class="library-empty"><h3>${q ? 'Aucun projet trouvé' : 'Votre prochaine aventure commence ici.'}</h3><p>${q ? 'Essayez un autre nom ou effacez la recherche.' : 'Créez votre premier projet pour donner vie à vos idées.'}</p>${q ? '<button data-reset-search>Effacer la recherche</button>' : '<button class="primary" data-new-project>Créer mon premier projet</button>'}</div>` : '') + (results.length ? '<button class="project-card new-project-card" data-new-project><span class="plus" aria-hidden="true">＋</span><strong>Une nouvelle idée ?</strong><small>Créer un projet</small></button>' : '');
  }
  document.getElementById('content').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-new-project')) openCreate();
    if (b.hasAttribute('data-help')) openHelp();
    if (b.hasAttribute('data-reset-search')) { query = ''; document.getElementById('projectSearch').value = ''; paintProjects(); }
    if (b.dataset.openProject) {
      b.disabled = true;
      try { await openProject(b.dataset.openProject); saved = 'Enregistré'; saveError = false; saveState(); }
      catch (err) { b.disabled = false; toast('Impossible d’ouvrir le projet : ' + err.message, true); }
    }
  });
  let customNamespace = false;
  document.getElementById('np_ns').oninput = () => { customNamespace = true; };
  document.getElementById('np_name').oninput = e => {
    if (!customNamespace) document.getElementById('np_ns').value = normalize(e.target.value).replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0,32);
  };
  document.getElementById('newProjectForm').onsubmit = async e => {
    e.preventDefault();
    const button = document.getElementById('np_go'), error = document.getElementById('newProjectError');
    button.disabled = true; error.textContent = '';
    try {
      const p = await api('POST', '/api/projects', { name:document.getElementById('np_name').value.trim(), namespace:document.getElementById('np_ns').value.trim(), mcVersion:document.getElementById('np_ver').value, description:document.getElementById('np_desc').value.trim() });
      await openProject(p.id); modal('newProjectModal', false);
      e.target.reset(); customNamespace = false; saved = 'Enregistré'; saveState(); toast('Votre nouvel atelier est prêt !');
    } catch (err) { error.textContent = err.message; }
    finally { button.disabled = false; }
  };
  // One searchable navigation surface, also available entirely from the keyboard.
  function openCommands() {
    modal('commandModal');
    document.getElementById('commandEmpty').hidden = true;
    document.getElementById('commandSearch').value = '';
    document.getElementById('commandList').innerHTML = Object.entries(screens).map(([key,[name,desc,icon]]) => `<button class="quick-option" data-command="${key}"><img src="mcicons/${icon}.png" alt=""><span>${name}<small>${esc(desc)}</small></span><span aria-hidden="true">↗</span></button>`).join('');
    setTimeout(() => document.getElementById('commandSearch').focus(), 0);
  }
  document.getElementById('commandButton').onclick = openCommands;
  document.getElementById('commandSearch').oninput = e => {
    const q = normalize(e.target.value);
    document.querySelectorAll('[data-command]').forEach(b => { b.hidden = !normalize(b.textContent).includes(q); });
    document.getElementById('commandEmpty').hidden = !!document.querySelector('[data-command]:not([hidden])');
  };
  document.getElementById('commandList').onclick = e => {
    const b = e.target.closest('[data-command]'); if (!b) return;
    if (b.dataset.command !== 'projects' && !state.project) { toast('Créez ou ouvrez un projet pour accéder aux éditeurs.', true); return; }
    modal('commandModal', false); document.querySelector(`#nav [data-view="${b.dataset.command}"]`).click();
  };
  document.getElementById('commandSearch').onkeydown = e => {
    const buttons = [...document.querySelectorAll('[data-command]:not([hidden])')];
    if (e.key === 'Enter' && buttons.length) { e.preventDefault(); buttons[0].click(); }
    if (e.key === 'ArrowDown' && buttons.length) { e.preventDefault(); buttons[0].focus(); }
  };
  document.getElementById('commandList').onkeydown = e => {
    if (!['ArrowDown','ArrowUp'].includes(e.key)) return;
    const buttons = [...document.querySelectorAll('[data-command]:not([hidden])')], i = buttons.indexOf(document.activeElement);
    e.preventDefault(); buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };
  const focusable = root => [...root.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length && !el.closest('[hidden]'));
  let activeDialog = null;
  const dialogObserver = new MutationObserver(() => {
    const shown = [...document.querySelectorAll('.modal.show')].at(-1);
    if (shown && shown !== activeDialog) {
      lastFocus = document.activeElement; activeDialog = shown;
      focusable(shown)[0]?.focus();
    } else if (!shown && activeDialog) {
      activeDialog = null;
      if (lastFocus?.isConnected) lastFocus.focus(); else document.getElementById('content').focus();
    }
  });
  document.querySelectorAll('.modal').forEach(d => {
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    const title = d.querySelector('h3'); if (title?.id) d.setAttribute('aria-labelledby', title.id);
    dialogObserver.observe(d, { attributes: true, attributeFilter: ['class'] });
  });
  document.querySelectorAll('[data-close-modal]').forEach(b => b.onclick = () => modal(b.dataset.closeModal, false));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); if (!document.querySelector('.modal.show')) openCommands(); return;
    }
    const dialog = [...document.querySelectorAll('.modal.show')].at(-1);
    if (dialog) {
      if (e.key === 'Tab') {
        const nodes = focusable(dialog), first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (dialog.id === 'pxModal') document.getElementById('pxCancel').click();
        else dialog.classList.remove('show');
      }
      return;
    }
    if (e.key === 'Escape') { closeMenu(); document.getElementById('menuToggle').focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault(); if (state.project) save(); else toast('Ouvrez un projet pour l’enregistrer.');
    }
  });
  document.getElementById('toast').setAttribute('role', 'status');
  document.getElementById('toast').setAttribute('aria-live', 'polite');
  document.getElementById('content').tabIndex = -1;
  render();
})();
