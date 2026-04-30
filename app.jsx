/* global React, ReactDOM, SEED_SLIDES, PAGE_SIZES, SlidesPanel, Inspector, SlideRenderer, TWEAK_DEFAULTS */
const { useState: useStateA, useEffect: useEffectA, useRef: useRefA, useCallback: useCallbackA } = React;

/* Compress a base64 dataURL or {url, ...} object to a smaller JPEG for storage */
function compressDataUrl(src) {
  const url = (src && typeof src === 'object') ? src.url : src;
  if (!url || !url.startsWith('data:image/')) return Promise.resolve(src);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      const ratio = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * ratio);
      const h = Math.round(img.naturalHeight * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.6);
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
    setSlides(curr => curr.map(s => s.id === next.id ? next : s));
  }, []);

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

  // Save / Load Project
  const saveProject = async () => {
    showToast('Guardando…');
    try {
      const compressedSlides = await compressSlideImages(slides);
      const payload = { version: 2, slides: compressedSlides, globals };
      if (projectId) {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: globals.title || 'manual', data: payload })
        });
        if (!res.ok) throw new Error(await res.text());
        showToast('Proyecto actualizado ✓');
      } else {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: globals.title || 'manual', data: payload })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setProjectId(data.id);
        showToast('Proyecto guardado ✓');
      }
    } catch (e) {
      showToast('Error al guardar: ' + e.message);
      console.error(e);
    }
  };

  const loadProjectsList = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjectList(data);
      setShowProjects(true);
    } catch (e) {
      showToast('Error cargando proyectos');
      console.error(e);
    }
  };

  const loadProject = async (id) => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      const row = await res.json();
      const data = row.data;
      if (data.slides) {
        setSlides(data.slides);
        setActiveId(data.slides[0]?.id);
        if (data.globals) setGlobals(data.globals);
        setProjectId(row.id);
        setShowProjects(false);
        showToast('Proyecto cargado');
      }
    } catch (e) {
      showToast('No se pudo cargar el proyecto');
      console.error(e);
    }
  };

  const exportPdf = async () => {
    if (!window.html2canvas || !window.jspdf) {
      showToast('Cargando librerías PDF…');
      return;
    }
    showToast('Generando PDF…');
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
          scale: 2,
          useCORS: true,
          allowTaint: true,
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
      pdf.save(`${globals.title || 'manual'}.pdf`);
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
            <input value={globals.title} onChange={(e) => setGlobals({ ...globals, title: e.target.value })}/>
          </div>
          <div className="pm-field pm-field--suffix">
            <label>Variante</label>
            <input value={globals.suffix} onChange={(e) => setGlobals({ ...globals, suffix: e.target.value })}/>
          </div>
          <div className="pm-field pm-field--prop">
            <label>Propiedad</label>
            <input value={globals.property} onChange={(e) => setGlobals({ ...globals, property: e.target.value })}/>
          </div>
          <div className="pm-field pm-field--date">
            <label>Fecha</label>
            <input value={globals.date} onChange={(e) => setGlobals({ ...globals, date: e.target.value })}/>
          </div>
        </div>

        <div className="topbar__actions">
          <button className="btn btn--ghost" onClick={loadProjectsList}>
            <i className="ti ti-folder-open"></i> Abrir
          </button>
          <button className="btn btn--ghost" onClick={saveProject}>
            <i className="ti ti-device-floppy"></i> Guardar
          </button>
          <div className="btn-divider"/>
          <button className="btn btn--primary" onClick={exportPdf}>
            <i className="ti ti-file-download"></i> Exportar PDF
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
      {showProjects && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: '#fff', padding: 24, borderRadius: 8, width: 400, maxWidth: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Proyectos guardados</h3>
              <button className="btn btn--ghost" onClick={() => setShowProjects(false)} style={{ padding: 4 }}><i className="ti ti-x"></i></button>
            </div>
            {projectList.length === 0 ? (
              <p style={{ color: '#666', fontSize: 14 }}>No hay proyectos guardados.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {projectList.map(p => (
                  <button key={p.id} className="btn" style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px', border: '1px solid #ddd' }} onClick={() => loadProject(p.id)}>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{new Date(p.updated_at).toLocaleString()}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
            />
          </div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
