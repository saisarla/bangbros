/* ── StyleAI Frontend ── */

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let apiKey = '';
  let photoFile = null;
  let lastResults = null;

  const state = {
    gender: '',
    skinTone: '',
    personas: [],
    occasions: [],
    budget: 'mid-range',
    age: '',
    bodyType: '',
    notes: ''
  };

  // ─── DOM Refs ─────────────────────────────────────────────────────────────
  const $  = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  const apiKeyInput    = $('apiKeyInput');
  const apiConnectBtn  = $('apiConnectBtn');
  const apiZone        = $('apiZone');
  const apiConnected   = $('apiConnected');
  const disconnectBtn  = $('disconnectBtn');
  const uploadZone     = $('uploadZone');
  const photoInput     = $('photoInput');
  const uploadIdle     = $('uploadIdle');
  const uploadPreview  = $('uploadPreview');
  const previewImg     = $('previewImg');
  const analyseBtn     = $('analyseBtn');
  const errorBanner    = $('errorBanner');
  const formSection    = $('formSection');
  const loadingSection = $('loadingSection');
  const resultsSection = $('resultsSection');
  const redoBtn        = $('redoBtn');
  const loadingSteps   = $('loadingSteps');

  // ─── API Key ──────────────────────────────────────────────────────────────
  apiConnectBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) { showError('Please enter your Groq API key.'); return; }
    apiKey = key;
    apiZone.classList.add('hidden');
    apiConnected.classList.remove('hidden');
  });

  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apiConnectBtn.click();
  });

  disconnectBtn.addEventListener('click', () => {
    apiKey = '';
    apiKeyInput.value = '';
    apiZone.classList.remove('hidden');
    apiConnected.classList.add('hidden');
  });

  // ─── Photo Upload ─────────────────────────────────────────────────────────
  uploadZone.addEventListener('click', () => photoInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'rgba(201,168,76,0.5)';
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '';
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadPhoto(file);
  });

  photoInput.addEventListener('change', () => {
    if (photoInput.files[0]) loadPhoto(photoInput.files[0]);
  });

  function loadPhoto(file) {
    photoFile = file;
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    uploadIdle.classList.add('hidden');
    uploadPreview.classList.remove('hidden');
  }

  // ─── Chip Groups ──────────────────────────────────────────────────────────
  function initChipGroup(containerId, stateKey, opts = {}) {
    const container = $(containerId);
    if (!container) return;
    const max    = parseInt(container.dataset.max || '999');
    const single = container.dataset.single === 'true';

    container.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.value;

        if (single) {
          container.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state[stateKey] = val;
          return;
        }

        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          state[stateKey] = state[stateKey].filter(v => v !== val);
        } else {
          const active = container.querySelectorAll('.chip.active').length;
          if (active >= max) return;
          btn.classList.add('active');
          state[stateKey].push(val);
        }
      });
    });
  }

  // Init chips
  initChipGroup('genderChips', 'gender');
  initChipGroup('personaChips', 'personas');
  initChipGroup('occasionChips', 'occasions');
  initChipGroup('budgetChips', 'budget');
  initChipGroup('bodyChips', 'bodyType');

  // Budget default
  const budgetContainer = $('budgetChips');
  if (budgetContainer) {
    const midBtn = budgetContainer.querySelector('[data-value="mid-range"]');
    if (midBtn) midBtn.classList.add('active');
  }

  // ─── Tone Buttons ─────────────────────────────────────────────────────────
  $$('.tone-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tone-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.skinTone = btn.dataset.value;
    });
  });

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      ['outfits', 'palette', 'wardrobe', 'insights'].forEach((t) => {
        const el = $('tab' + t.charAt(0).toUpperCase() + t.slice(1));
        if (el) el.classList.toggle('hidden', t !== tab);
      });
    });
  });

  // ─── Loading Steps ────────────────────────────────────────────────────────
  let stepInterval = null;
  function startLoadingSteps() {
    let currentStep = 1;
    const steps = loadingSteps.querySelectorAll('.step');
    steps.forEach(s => { s.classList.remove('active', 'done'); });
    steps[0].classList.add('active');

    stepInterval = setInterval(() => {
      if (currentStep < steps.length) {
        steps[currentStep - 1].classList.remove('active');
        steps[currentStep - 1].classList.add('done');
        steps[currentStep].classList.add('active');
        currentStep++;
      }
    }, 1200);
  }
  function stopLoadingSteps() {
    clearInterval(stepInterval);
    loadingSteps.querySelectorAll('.step').forEach(s => {
      s.classList.remove('active');
      s.classList.add('done');
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function hideError() { errorBanner.classList.add('hidden'); }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function tag(cls, html, tag = 'div') {
    return `<${tag} class="${cls}">${html}</${tag}>`;
  }

  function colorBlob(hex, name, why = '', size = 56) {
    return `<div class="color-item">
      <div class="color-blob" style="width:${size}px;height:${size}px;background:${hex};box-shadow:0 4px 16px ${hex}55"></div>
      <div class="color-name">${name}</div>
      ${why ? `<div class="color-why">${why}</div>` : ''}
    </div>`;
  }

  // ─── Analyse ──────────────────────────────────────────────────────────────
  analyseBtn.addEventListener('click', runAnalysis);

  async function runAnalysis() {
    hideError();

    if (!apiKey) { showError('Please connect your Groq API key first.'); return; }
    if (!state.gender) { showError('Please select your gender preference.'); return; }
    if (!state.skinTone) { showError('Please select your skin tone (or let OpenCV auto-detect from your photo).'); return; }

    state.age      = ($('ageInput') || {}).value || '';
    state.notes    = ($('notesInput') || {}).value || '';

    // Build form data
    const fd = new FormData();
    fd.append('api_key', apiKey);
    fd.append('profile', JSON.stringify(state));
    if (photoFile) fd.append('photo', photoFile);

    // Switch to loading
    hide(formSection);
    show(loadingSection);
    hide(resultsSection);
    analyseBtn.disabled = true;
    startLoadingSteps();

    try {
      const res = await fetch('/analyze', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Unknown server error');
      }

      stopLoadingSteps();
      lastResults = data;
      renderResults(data);

      hide(loadingSection);
      show(resultsSection);
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      stopLoadingSteps();
      hide(loadingSection);
      show(formSection);
      showError('Error: ' + err.message);
    } finally {
      analyseBtn.disabled = false;
    }
  }

  // ─── Render Results ───────────────────────────────────────────────────────
  function renderResults(data) {
    const r  = data.recommendations;
    const cv = data.cv_analysis || {};

    renderIdentityBanner(r);
    renderCVPanel(cv, r);
    renderOutfits(r);
    renderPalette(r);
    renderWardrobe(r);
    renderInsights(r, cv);

    // Reset to first tab
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-btn')[0].classList.add('active');
    ['tabOutfits', 'tabPalette', 'tabWardrobe', 'tabInsights'].forEach((id, i) => {
      const el = $(id);
      if (el) el.classList.toggle('hidden', i !== 0);
    });
  }

  function renderIdentityBanner(r) {
    const si  = r.style_identity || {};
    const html = `
      <p class="identity-eyebrow">Your Style Identity</p>
      <h2 class="identity-headline">${si.headline || 'Your Unique Style'}</h2>
      ${si.archetype ? `<p style="font-size:11px;color:var(--gold);letter-spacing:3px;text-transform:uppercase;margin-bottom:12px">${si.archetype}</p>` : ''}
      <p class="identity-desc">${si.description || ''}</p>
      <div class="identity-tags">
        ${(si.signature_elements || []).map(e => `<span class="identity-tag">${e}</span>`).join('')}
      </div>`;
    $('identityBanner').innerHTML = html;
  }

  function renderCVPanel(cv, r) {
    const faces      = cv.faces_detected ?? '—';
    const brightness = cv.brightness     ? Math.round(cv.brightness) : '—';
    const contrast   = cv.contrast       ? Math.round(cv.contrast)   : '—';
    const dims       = cv.dimensions     ? `${cv.dimensions.width}×${cv.dimensions.height}` : '—';
    const tone       = r.skin_analysis?.detected_tone || state.skinTone || '—';
    const undertone  = r.skin_analysis?.undertone || '—';

    const dominantColors = (cv.dominant_colors || []).slice(0, 5).map(c =>
      `<div class="cv-swatch" style="background:${c.hex}" title="${c.hex} (${c.percentage}%)"></div>`
    ).join('');

    const html = `
      <p class="cv-title">OpenCV + PIL Analysis</p>
      <div class="cv-panel-inner">
        <div class="cv-stats">
          <div class="cv-stat"><div class="cv-stat-val">${faces}</div><div class="cv-stat-lbl">Faces</div></div>
          <div class="cv-stat"><div class="cv-stat-val">${dims}</div><div class="cv-stat-lbl">Resolution</div></div>
          <div class="cv-stat"><div class="cv-stat-val">${brightness}</div><div class="cv-stat-lbl">Brightness</div></div>
          <div class="cv-stat"><div class="cv-stat-val">${contrast}</div><div class="cv-stat-lbl">Contrast σ</div></div>
          <div class="cv-stat"><div class="cv-stat-val" style="text-transform:capitalize">${tone}</div><div class="cv-stat-lbl">Skin Tone</div></div>
          <div class="cv-stat"><div class="cv-stat-val" style="text-transform:capitalize">${undertone}</div><div class="cv-stat-lbl">Undertone</div></div>
        </div>
        ${dominantColors ? `<div>
          <div class="cv-title" style="margin-bottom:8px">Dominant Colours (NumPy k-means)</div>
          <div class="cv-swatches">${dominantColors}</div>
        </div>` : ''}
      </div>`;
    $('cvPanel').innerHTML = html;
  }

  function renderOutfits(r) {
    const outfits = r.outfits || [];
    const accents = ['#C9A84C', '#B8860B', '#DAA520'];

    const html = `<div class="outfits-grid">` +
      outfits.map((o, i) => {
        const accent = accents[i % accents.length];
        const pieces = (o.pieces || []).map(p => `
          <div class="piece-row">
            <span class="piece-arrow">▸</span>
            <div class="piece-info">
              <div class="piece-item">${p.item || p}</div>
              ${p.color ? `<div class="piece-color">Colour: ${p.color}</div>` : ''}
              ${p.notes ? `<div class="piece-notes">${p.notes}</div>` : ''}
            </div>
          </div>`).join('');

        const shops = (o.shop_references || o.shop_links || []).map(s =>
          `<a class="shop-link" href="${s.url || '#'}" target="_blank" rel="noopener">↗ ${s.brand || s.label || 'Shop'}</a>`
        ).join('');

        return `<div class="outfit-card">
          <div class="outfit-accent" style="background:${accent}"></div>
          <div class="outfit-head">
            <div>
              <div class="outfit-name">${o.name || `Look ${i + 1}`}</div>
              <div class="outfit-occasion">${o.occasion || ''}</div>
            </div>
            <span class="outfit-mood">${o.mood || o.vibe || 'Curated'}</span>
          </div>
          <div class="outfit-pieces">${pieces}</div>
          ${o.pro_tip ? `<div class="outfit-tip">"${o.pro_tip}"</div>` : ''}
          ${o.avoid_for_this_look ? `<div class="outfit-avoid"><strong>Avoid:</strong> ${o.avoid_for_this_look}</div>` : ''}
          ${shops ? `<div class="shop-links">${shops}</div>` : ''}
        </div>`;
      }).join('') + `</div>`;

    $('tabOutfits').innerHTML = html;
  }

  function renderPalette(r) {
    const cp = r.color_palette  || {};
    const sa = r.skin_analysis  || {};

    const heroColors = (cp.hero_colors || []).map(c => colorBlob(c.hex, c.name, c.why)).join('');
    const neutrals   = (cp.neutrals    || []).map(c => colorBlob(c.hex, c.name, '', 40)).join('');
    const avoidHtml  = (cp.avoid       || []).map(c =>
      `<div class="avoid-item">
        <div class="avoid-blob" style="background:${c.hex}"></div>
        <div>
          <div class="avoid-name">${c.name}</div>
          ${c.why ? `<div style="font-size:10px;color:var(--text3)">${c.why}</div>` : ''}
        </div>
      </div>`).join('');

    const metals = (cp.best_metals || []).map(m => `<span class="metal-tag">${m}</span>`).join('');

    const skinHtml = `
      <div class="skin-grid">
        <div class="skin-field"><label>Tone</label><span class="skin-val" style="text-transform:capitalize">${sa.detected_tone || '—'}
          <span class="confidence-badge">${sa.confidence || 'medium'}</span>
        </span></div>
        <div class="skin-field"><label>Undertone</label><span class="skin-val" style="text-transform:capitalize">${sa.undertone || '—'}</span></div>
        <div class="skin-field" style="grid-column:1/-1"><label>Complexion Notes</label><span class="skin-val" style="color:var(--text2)">${sa.complexion_notes || '—'}</span></div>
      </div>`;

    const html = `<div class="palette-section">
      <div class="palette-card">
        <div class="palette-title">Hero Colours</div>
        <div class="color-swatches">${heroColors}</div>
        ${cp.palette_story ? `<div class="palette-story">"${cp.palette_story}"</div>` : ''}
      </div>
      ${neutrals ? `<div class="palette-card">
        <div class="palette-title">Neutrals</div>
        <div class="color-swatches">${neutrals}</div>
      </div>` : ''}
      ${avoidHtml ? `<div class="palette-card">
        <div class="palette-title">Colours to Avoid</div>
        <div class="avoid-row">${avoidHtml}</div>
      </div>` : ''}
      ${metals ? `<div class="palette-card">
        <div class="palette-title">Best Metals</div>
        <div class="metals-row">${metals}</div>
      </div>` : ''}
      <div class="palette-card">
        <div class="palette-title">Skin Analysis</div>
        ${skinHtml}
      </div>
    </div>`;

    $('tabPalette').innerHTML = html;
  }

  function renderWardrobe(r) {
    const kp = r.wardrobe_blueprint || r.key_pieces || {};

    const essentials = (kp.capsule_essentials || kp.wardrobe_essentials || []).map(p =>
      `<div class="wardrobe-item"><span class="wardrobe-bullet">◈</span>${p}</div>`).join('');

    const investments = (kp.investment_pieces || []).map(p => {
      const name   = typeof p === 'string' ? p : p.item;
      const reason = typeof p === 'string' ? '' : p.reason;
      return `<div class="invest-item">
        <div class="invest-item-name">${name}</div>
        ${reason ? `<div class="invest-item-reason">${reason}</div>` : ''}
      </div>`;
    }).join('');

    const avoidList = (kp.style_mistakes_to_avoid || kp.avoid || []).map(a =>
      `<div class="avoid-list-item"><span class="avoid-x">✕</span>${a}</div>`).join('');

    const html = `<div class="wardrobe-grid">
      <div class="wardrobe-card">
        <div class="wardrobe-title">Capsule Essentials</div>
        ${essentials || '<p style="color:var(--text3);font-size:13px">No data</p>'}
      </div>
      ${investments ? `<div class="invest-card">
        <div class="invest-title">Investment Pieces</div>
        ${investments}
      </div>` : ''}
      ${avoidList ? `<div class="avoid-list-card wardrobe-card">
        <div class="avoid-list-title">Style Mistakes to Avoid</div>
        ${avoidList}
      </div>` : ''}
    </div>`;

    $('tabWardrobe').innerHTML = html;
  }

  function renderInsights(r, cv) {
    const g  = r.grooming_finishing || r.grooming_style || {};
    const ci = r.cv_insights        || {};

    const accessories = (g.key_accessories || g.accessories || []).map(a =>
      `<span class="itag">${a}</span>`).join('');
    const necklines = (ci.neckline_recommendations || []).map(n =>
      `<span class="itag">${n}</span>`).join('');
    const patterns = (ci.pattern_recommendations || []).map(p =>
      `<span class="itag">${p}</span>`).join('');

    const faceRgb = cv.face_avg_color_rgb;
    const rgbSwatch = faceRgb
      ? `<div style="width:40px;height:40px;border-radius:50%;background:rgb(${faceRgb.join(',')});box-shadow:0 4px 16px rgba(${faceRgb.join(',')},0.5);display:inline-block;vertical-align:middle;margin-right:10px"></div>`
      : '';

    const html = `<div class="insights-grid">
      <div class="insight-card">
        <div class="insight-title">Grooming &amp; Finishing</div>
        <div class="insight-grid">
          <div class="insight-field"><label>Hair Direction</label><div class="insight-val">${g.hair_direction || g.hair || '—'}</div></div>
          <div class="insight-field"><label>Fragrance Profile</label><div class="insight-val">${g.fragrance_profile || g.fragrance_notes || '—'}</div></div>
          <div class="insight-field"><label>Key Accessories</label><div class="tag-row">${accessories || '—'}</div></div>
          ${g.eyewear_if_applicable ? `<div class="insight-field"><label>Eyewear</label><div class="insight-val">${g.eyewear_if_applicable}</div></div>` : ''}
        </div>
      </div>
      <div class="insight-card">
        <div class="insight-title">CV Styling Insights</div>
        <div class="insight-grid">
          ${ci.face_shape_estimate ? `<div class="insight-field"><label>Face Shape</label><div class="insight-val" style="text-transform:capitalize">${ci.face_shape_estimate}</div></div>` : ''}
          ${necklines ? `<div class="insight-field"><label>Best Necklines</label><div class="tag-row">${necklines}</div></div>` : ''}
          ${patterns ? `<div class="insight-field"><label>Flattering Patterns</label><div class="tag-row">${patterns}</div></div>` : ''}
          ${ci.silhouette_advice ? `<div class="insight-field" style="grid-column:1/-1"><label>Silhouette Advice</label><div class="insight-val">${ci.silhouette_advice}</div></div>` : ''}
        </div>
      </div>
      ${faceRgb ? `<div class="insight-card">
        <div class="insight-title">Detected Face Colour (OpenCV)</div>
        <div style="display:flex;align-items:center">
          ${rgbSwatch}
          <div>
            <div style="font-size:13px;color:var(--text2)">RGB(${faceRgb.join(', ')})</div>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">Extracted via face-region sampling</div>
          </div>
        </div>
      </div>` : ''}
    </div>`;

    $('tabInsights').innerHTML = html;
  }

  // ─── Redo ─────────────────────────────────────────────────────────────────
  redoBtn.addEventListener('click', () => {
    hide(resultsSection);
    show(formSection);
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

})();
