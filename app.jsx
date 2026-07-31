/* global React, ReactDOM, SEED_SLIDES, PAGE_SIZES, SlidesPanel, Inspector, SlideRenderer, TWEAK_DEFAULTS */
const { useState: useStateA, useEffect: useEffectA, useRef: useRefA, useCallback: useCallbackA } = React;

/* Compress a base64 dataURL or {url, ...} object to a smaller JPEG for storage */
function compressDataUrl(src) {
  const url = (src && typeof src === 'object') ? src.url : src;
  if (!url || !url.startsWith('data:image/')) return Promise.resolve(src);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 2400;
      const ratio = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * ratio);
      const h = Math.round(img.naturalHeight * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/webp', 0.85);
      resolve(src && typeof src === 'object' ? { ...src, url: compressed } : compressed);
    };
    img.onerror = () => resolve(src);
    img.src = url;
  });
}

async function compressSlideImages(slides) {
  return Promise.all(slides.map(async (slide) => {
    const data = { ...slide.data };
    const keys = Object.keys(data).filter(k => k.startsWith('asset'));
    for (const k of keys) {
      if (data[k]) data[k] = await compressDataUrl(data[k]);
    }
    if (data.materiales && Array.isArray(data.materiales)) {
      data.materiales = await Promise.all(data.materiales.map(async (m) => {
        if (m.asset) return { ...m, asset: await compressDataUrl(m.asset) };
        return m;
      }));
    }
    return { ...slide, data };
  }));
}

function App() {
  const [slides, setSlides] = useStateA(SEED_SLIDES);
  const [activeId, setActiveId] = useStateA(SEED_SLIDES[0].id);
  const [globals, setGlobals] = useStateA({
    title: 'Manual de Producción — Almare',
    suffix: 'BP',
    property: 'Moon Palace Cancún',
    dept: 'Departamento de Diseño Gráfico',
    corp: 'Corporativo THG',
    date: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
    logoData: null,
  });
  const [tweaks, setTweaks] = useStateA(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useStateA(false);
  const [zoom, setZoom] = useStateA(0.6);
  const [autoFit, setAutoFit] = useStateA(true);
  const [toast, setToast] = useStateA(null);
  const [projectId, setProjectId] = useStateA(null);
  const [showProjects, setShowProjects] = useStateA(false);
  const [projectList, setProjectList] = useStateA([]);
  const [searchQuery, setSearchQuery] = useStateA('');
  const [saveMenuOpen, setSaveMenuOpen] = useStateA(false);
  const [isDirty, setIsDirty] = useStateA(false);
  const [lastSavedAt, setLastSavedAt] = useStateA(null);

  // Tweaks protocol
  useEffectA(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setTweaksOpen(true);
      if (d.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const setTweak = (patch) => {
    const next = { ...tweaks, ...patch };
    setTweaks(next);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*');
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  // Auto-fit zoom to canvas area
  const canvasRef = useRefA(null);
  const dims = PAGE_SIZES[tweaks.pageSize] || PAGE_SIZES.A4_landscape;
  useEffectA(() => {
    if (!autoFit) return;
    const fit = () => {
      const el = canvasRef.current;
      if (!el) return;
      const padding = 80;
      const z = Math.min(
        (el.clientWidth - padding) / dims.w,
        (el.clientHeight - padding) / dims.h,
        1
      );
      setZoom(Math.max(0.2, z));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [autoFit, dims.w, dims.h]);

  const activeSlide = slides.find(s => s.id === activeId) || slides[0];
  const activeIndex = slides.findIndex(s => s.id === (activeSlide && activeSlide.id));

  const onUpdateSlide = useCallbackA((next) => {
    setIsDirty(true);
    setSlides(curr => {
      const old = curr.find(s => s.id === next.id);
      if (old && old.template === 'cover' && old.data.itemTitle !== next.data.itemTitle) {
        return curr.map(s => {
          if (s.id === next.id) return next;
          if ('itemTitle' in s.data) {
            return { ...s, data: { ...s.data, itemTitle: next.data.itemTitle } };
          }
          return s;
        });
      }
      return curr.map(s => s.id === next.id ? next : s);
    });
  }, []);

  const updateGlobalsField = (field, value) => {
    setIsDirty(true);
    setGlobals(prev => ({ ...prev, [field]: value }));
  };

  // Paste image from clipboard
  useEffectA(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          const formData = new FormData();
          formData.append('image', file);
          fetch('/api/upload', {
            method: 'POST',
            body: formData
          })
          .then(res => res.json())
          .then(resData => {
            const slide = slides.find(s => s.id === activeId);
            if (!slide) return;
            const data = { ...slide.data };
            const imgKeys = Object.keys(data).filter(k => k.startsWith('asset'));
            const target = imgKeys.find(k => !data[k]);
            if (target) {
              data[target] = resData.url;
              onUpdateSlide({ ...slide, data });
              showToast('Imagen pegada en ' + target.replace('asset', '').toLowerCase());
            }
          })
          .catch(err => {
            showToast('Error subiendo imagen');
            console.error(err);
          });
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [activeId, slides, onUpdateSlide]);

  const saveProject = async (forceAsNew = false) => {
    showToast('Guardando…');
    const currentDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    const updatedGlobals = { ...globals, date: currentDate };
    
    try {
      if (updatedGlobals.logoData) {
        updatedGlobals.logoData = await compressDataUrl(updatedGlobals.logoData);
      }
      setGlobals(updatedGlobals);

      const compressedSlides = await compressSlideImages(slides);
      const payload = { version: 2, slides: compressedSlides, globals: updatedGlobals };
      const body = { name: globals.title || 'manual', property: globals.property || '', data: payload };
      
      if (projectId && !forceAsNew) {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(await res.text());
        setIsDirty(false);
        setLastSavedAt(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
        showToast('Proyecto actualizado ✓');
      } else {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setProjectId(data.id);
        setIsDirty(false);
        setLastSavedAt(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
        showToast(forceAsNew ? 'Guardado como nuevo manual ✓' : 'Proyecto guardado ✓');
      }
      setSaveMenuOpen(false);
    } catch (e) {
      showToast('Error al guardar: ' + e.message);
      console.error(e);
    }
  };

  const loadProjectsList = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjectList(data || []);
      setShowProjects(true);
    } catch (e) {
      showToast('Error cargando proyectos');
      console.error(e);
    }
  };

  const loadProject = async (id) => {
    try {
      showToast('Cargando proyecto...');
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Error en servidor');
      const row = await res.json();
      const data = row.data;
      if (data.slides) {
        setSlides(data.slides);
        setActiveId(data.slides[0]?.id);
        if (data.globals) setGlobals(data.globals);
        setProjectId(row.id);
        setShowProjects(false);
        setIsDirty(false);
        showToast('Proyecto cargado ✓');
      }
    } catch (e) {
      showToast('No se pudo cargar el proyecto');
      console.error(e);
    }
  };

  const duplicateProject = async (id, originalName) => {
    try {
      showToast('Duplicando manual…');
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Error al obtener proyecto');
      const row = await res.json();
      
      const newName = `${originalName || 'Manual'} (Copia)`;
      const body = {
        name: newName,
        property: row.property || '',
        data: row.data
      };
      
      const postRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!postRes.ok) throw new Error(await postRes.text());
      
      // Reload list & notify
      const listRes = await fetch('/api/projects');
      const listData = await listRes.json();
      setProjectList(listData);
      showToast(`Manual duplicado como «${newName}» ✓`);
    } catch (e) {
      showToast('Error al duplicar: ' + e.message);
      console.error(e);
    }
  };

  // Auto-load project from URL if present
  useEffectA(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('project_id');
    if (pid) {
      loadProject(pid);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const deleteProject = async (id, name) => {
    if (!window.confirm(`¿Eliminar «${name}»? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setProjectList(prev => prev.filter(p => p.id !== id));
      if (projectId === id) setProjectId(null);
      showToast('Proyecto eliminado');
    } catch (e) {
      showToast('Error al eliminar: ' + e.message);
      console.error(e);
    }
  };

  const exportPdfVector = () => {
    showToast('Abriendo diálogo de impresión… Selecciona "Guardar como PDF".');
    // Inject @page size dynamically matching active slide dimensions
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `@page { size: ${dims.wMM}mm ${dims.hMM}mm; margin: 0; }`;
    document.head.appendChild(styleEl);

    // Trigger native printing
    window.print();

    // Clean up style
    document.head.removeChild(styleEl);
  };

  const exportPdfLegacy = async () => {
    if (!window.html2canvas || !window.jspdf) {
      showToast('Cargando librerías PDF…');
      return;
    }
    showToast('Generando PDF (Imagen)…');
    const { jsPDF } = window.jspdf;
    const orientation = dims.wMM > dims.hMM ? 'l' : 'p';
    try {
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: [dims.wMM, dims.hMM],
        compress: true,
      });
      // Temporarily show print-container off-screen for capture
      const printContainer = document.querySelector('.print-container');
      const prev = { display: printContainer.style.display, position: printContainer.style.position,
        top: printContainer.style.top, left: printContainer.style.left, zIndex: printContainer.style.zIndex };
      printContainer.style.display = 'block';
      printContainer.style.position = 'fixed';
      printContainer.style.top = '-99999px';
      printContainer.style.left = '0';
      printContainer.style.zIndex = '-1';
      // Small settle delay
      await new Promise(r => setTimeout(r, 120));
      const pages = printContainer.querySelectorAll('.print-page');
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i].querySelector('.page') || pages[i];
        if (i > 0) pdf.addPage([dims.wMM, dims.hMM], orientation);
        const canvas = await window.html2canvas(pageEl, {
          scale: 3,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          width: dims.w,
          height: dims.h,
          windowWidth: dims.w,
          windowHeight: dims.h,
          logging: false,
        });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, dims.wMM, dims.hMM);
      }
      // Restore
      Object.assign(printContainer.style, prev);
      // Build filename: Proyecto - Propiedad - DD-MM
      const slug = (s) => (s || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ');
      const MESES = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12 };
      const parseDateShort = (raw) => {
        if (!raw) return '';
        const m1 = raw.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)/i);
        if (m1) {
          const d = m1[1].padStart(2,'0');
          const mo = String(MESES[m1[2].toLowerCase()] || '').padStart(2,'0');
          return mo ? `${d}-${mo}` : '';
        }
        const m2 = raw.match(/(\d{1,2})[\/\-](\d{1,2})/);
        if (m2) return `${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
        return raw.slice(0,5);
      };
      const parts = [slug(globals.title), slug(globals.property), parseDateShort(globals.date)].filter(Boolean);
      pdf.save(`${parts.join(' - ')} (Imagen).pdf`);
      showToast('PDF descargado ✓');
    } catch (e) {
      showToast('Error generando PDF: ' + e.message);
      console.error(e);
    }
  };

  return (
    <div className="app">
      {/* TOPBAR */}
      <header className="topbar">
        <div className="topbar__brand">
          <img src="ds/logo-palace-mark.svg" alt="Palace" />
          <div className="topbar__title">
            <span className="overline">Asistente</span>
            <span className="name">Manuales de producción</span>
          </div>
        </div>

        <div className="topbar__projectmeta">
          <div className="pm-field pm-field--title">
            <label>Proyecto</label>
            <input value={globals.title} onChange={(e) => updateGlobalsField('title', e.target.value)}/>
          </div>

          <div className="pm-field pm-field--prop">
            <label>Propiedad</label>
            <input value={globals.property} onChange={(e) => updateGlobalsField('property', e.target.value)}/>
          </div>
          <div className="pm-field pm-field--date">
            <label>Fecha</label>
            <input value={globals.date} onChange={(e) => updateGlobalsField('date', e.target.value)}/>
          </div>
        </div>

        <div className="topbar__actions">
          {/* Status Indicator */}
          {isDirty ? (
            <div className="save-status-pill save-status-pill--dirty" title="Hay cambios sin guardar">
              <span className="save-status-dot"></span> Sin guardar
            </div>
          ) : lastSavedAt ? (
            <div className="save-status-pill save-status-pill--saved" title={`Última sincronización: ${lastSavedAt}`}>
              <span className="save-status-dot"></span> {lastSavedAt}
            </div>
          ) : null}

          <button className="btn btn--ghost" onClick={() => { setSearchQuery(''); loadProjectsList(); }}>
            <i className="ti ti-folder-open"></i> Abrir
          </button>

          {/* Save & Save As Split Dropdown */}
          <div className="save-dropdown-wrapper">
            <button className="btn btn--ghost" onClick={() => saveProject(false)}>
              <i className="ti ti-device-floppy"></i> Guardar
            </button>
            <button className="btn btn--ghost" style={{ padding: '0 6px', marginLeft: -4 }} onClick={() => setSaveMenuOpen(v => !v)}>
              <i className="ti ti-chevron-down" style={{ fontSize: 12 }}></i>
            </button>

            {saveMenuOpen && (
              <div className="save-dropdown-menu">
                <button className="save-dropdown-item" onClick={() => saveProject(false)}>
                  <i className="ti ti-device-floppy"></i> Guardar cambios
                </button>
                <button className="save-dropdown-item" onClick={() => saveProject(true)}>
                  <i className="ti ti-copy"></i> Guardar como nuevo manual
                </button>
              </div>
            )}
          </div>

          <div className="btn-divider"/>
          <button className="btn btn--primary" onClick={exportPdfVector} title="Guardar como PDF de alta calidad con texto seleccionable">
            <i className="ti ti-file-type-pdf"></i> Guardar PDF (Texto)
          </button>
          <button className="btn btn--ghost" onClick={exportPdfLegacy} title="Generar PDF de imagen heredado">
            <i className="ti ti-photo"></i> PDF (Imagen)
          </button>
        </div>
      </header>

      {/* SLIDES */}
      <SlidesPanel
        slides={slides}
        globals={globals}
        activeId={activeId}
        setActiveId={setActiveId}
        setSlides={setSlides}
        pageSize={tweaks.pageSize}
      />

      {/* CANVAS */}
      <main className="canvas-area" ref={canvasRef}>
        <div className="canvas-toolbar">
          <button
            className={autoFit ? 'is-active' : ''}
            onClick={() => setAutoFit(v => !v)}
            title="Ajustar a pantalla"
          ><i className="ti ti-arrows-maximize"></i></button>
          <div className="divider"/>
          <button onClick={() => { setAutoFit(false); setZoom(z => Math.max(0.15, z - 0.1)); }} title="Reducir">
            <i className="ti ti-minus"></i>
          </button>
          <span className="zoom-display">{Math.round(zoom * 100)}%</span>
          <button onClick={() => { setAutoFit(false); setZoom(z => Math.min(2, z + 0.1)); }} title="Aumentar">
            <i className="ti ti-plus"></i>
          </button>
          <div className="divider"/>
          <span style={{ fontSize: 11, color: 'var(--fg-weak)', padding: '0 8px' }}>
            {dims.label}
          </span>
        </div>
        <div className="canvas-area__inner">
          <div style={{
            width: dims.w * zoom,
            height: dims.h * zoom,
            position: 'relative',
          }}>
            {activeSlide && (
              <SlideRenderer
                slide={activeSlide}
                globals={globals}
                index={activeIndex}
                total={slides.length}
                onUpdate={onUpdateSlide}
                pageSize={tweaks.pageSize}
                scale={zoom}
              />
            )}
          </div>
        </div>
      </main>

      {/* INSPECTOR */}
      <Inspector
        slide={activeSlide}
        globals={globals}
        setGlobals={setGlobals}
        onUpdateSlide={onUpdateSlide}
      />

      {/* TWEAKS */}
      {tweaksOpen && (
        <div className="tweaks-panel">
          <div className="tweaks-panel__header">
            <span className="tweaks-panel__title">Tweaks</span>
            <button
              onClick={() => {
                setTweaksOpen(false);
                window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
              }}
              style={{ color: 'var(--fg-weak)', fontSize: 14 }}
            ><i className="ti ti-x"></i></button>
          </div>
          <div className="tweaks-panel__body">
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Tamaño de página</div>
            <div className="tweaks-segmented">
              {Object.entries(PAGE_SIZES).map(([key, v]) => (
                <button
                  key={key}
                  className={tweaks.pageSize === key ? 'is-active' : ''}
                  onClick={() => setTweak({ pageSize: key })}
                >
                  {key === 'A4_landscape' ? 'A4' : key === 'Letter_landscape' ? 'Carta' : '16:9'}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--fg-weak)', margin: '12px 0 0', lineHeight: 1.5 }}>
              {dims.label} — {dims.w} × {dims.h} px
            </p>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {/* PROJECTS MODAL */}
      {showProjects && (() => {
        const filteredList = projectList.filter(p => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (p.name || '').toLowerCase().includes(q) || (p.property || '').toLowerCase().includes(q);
        });

        // Group projects by property
        const groups = {};
        filteredList.forEach(p => {
          const grp = p.property || 'Sin propiedad';
          if (!groups[grp]) groups[grp] = [];
          groups[grp].push(p);
        });
        const groupEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

        const formatDateFriendly = (dateStr) => {
          if (!dateStr) return '';
          try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('es-MX', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
          } catch (e) {
            return dateStr;
          }
        };

        return (
          <div className="modal-overlay" onClick={() => setShowProjects(false)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header__title">
                  <div className="modal-header__icon">
                    <i className="ti ti-folder"></i>
                  </div>
                  <div>
                    <h3>Manuales Guardados</h3>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{projectList.length} manuales disponibles</div>
                  </div>
                </div>
                <button className="modal-close-btn" onClick={() => setShowProjects(false)}>
                  <i className="ti ti-x"></i>
                </button>
              </div>

              {/* Search Bar */}
              <div className="modal-search-area">
                <div className="modal-search-box">
                  <i className="ti ti-search search-icon"></i>
                  <input
                    type="text"
                    placeholder="Buscar por nombre de manual o propiedad..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searchQuery && (
                    <button className="clear-btn" onClick={() => setSearchQuery('')}>
                      <i className="ti ti-x"></i>
                    </button>
                  )}
                </div>
              </div>

              {/* Modal Body */}
              <div className="modal-body">
                {filteredList.length === 0 ? (
                  <div style={{ textTransform: 'none', textAlign: 'center', padding: '36px 12px', color: '#64748b' }}>
                    <i className="ti ti-folder-off" style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 8, display: 'block' }}></i>
                    {searchQuery ? `No se encontraron manuales que coincidan con "${searchQuery}"` : 'No hay manuales guardados todavía.'}
                  </div>
                ) : (
                  groupEntries.map(([grp, projects]) => (
                    <div className="project-group" key={grp}>
                      <div className="project-group__header">
                        <i className="ti ti-building"></i> {grp} ({projects.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {projects.map(p => {
                          const isActive = projectId === p.id;
                          return (
                            <div
                              key={p.id}
                              className={`project-card ${isActive ? 'project-card--active' : ''}`}
                              onClick={() => loadProject(p.id)}
                            >
                              <div className="project-card__info">
                                <div className="project-card__header">
                                  <span className="project-card__title">{p.name || 'Sin título'}</span>
                                  {p.property && <span className="project-card__badge">{p.property}</span>}
                                  {isActive && <span className="project-card__active-indicator">● Abierto</span>}
                                </div>
                                <div className="project-card__date">
                                  <i className="ti ti-clock" style={{ fontSize: 13 }}></i>
                                  {formatDateFriendly(p.updated_at)}
                                </div>
                              </div>

                              <div className="project-card__actions" onClick={e => e.stopPropagation()}>
                                <button
                                  className="action-btn action-btn--duplicate"
                                  title="Duplicar este manual como una nueva copia"
                                  onClick={() => duplicateProject(p.id, p.name)}
                                >
                                  <i className="ti ti-copy"></i>
                                </button>
                                <button
                                  className="action-btn action-btn--link"
                                  title="Copiar enlace para compartir"
                                  onClick={() => {
                                    const url = window.location.origin + window.location.pathname + '?project_id=' + p.id;
                                    navigator.clipboard.writeText(url);
                                    showToast('Enlace copiado al portapapeles ✓');
                                  }}
                                >
                                  <i className="ti ti-link"></i>
                                </button>
                                <button
                                  className="action-btn action-btn--danger"
                                  title="Eliminar manual"
                                  onClick={() => deleteProject(p.id, p.name)}
                                >
                                  <i className="ti ti-trash"></i>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* PRINT CONTAINER — only visible when printing */}
      <div className="print-container" aria-hidden="true">
        {slides.map((s, i) => (
          <div className="print-page" key={s.id} style={{ width: dims.w + 'px', height: dims.h + 'px' }}>
            <SlideRenderer
              slide={s}
              globals={globals}
              index={i}
              total={slides.length}
              onUpdate={() => {}}
              pageSize={tweaks.pageSize}
              scale={1}
              readOnly={true}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
