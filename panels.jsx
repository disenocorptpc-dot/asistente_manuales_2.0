/* global React, ReactDOM, TEMPLATES, TEMPLATE_LIST, TEMPLATE_BODIES, PAGE_SIZES, newSlide, SEED_SLIDES, uid */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "pageSize": "A4_landscape"
}/*EDITMODE-END*/;

/* ───────── Page chrome (header + footer on every slide) ───────── */
function PageChrome({ globals, slideIndex, total, slideLabel }) {
  return (
    <>
      <div className="page-chrome-header">
        <div className="page-chrome-header__right" style={{ position: 'absolute', top: 52, right: 32 }}>
          {globals.logoData ? (
            <img src={globals.logoData} alt="" />
          ) : (
            <img src="ds/logo-palace-default.svg" alt="Palace" style={{ height: 22, opacity: 0.7 }} />
          )}
        </div>
      </div>
      <div className="page-chrome-footer">
        <div>{slideLabel || ''}</div>
        <div>
          {globals.title || 'Manual de producción'}
          {globals.suffix ? ' · ' + globals.suffix : ''}
          {' — '}
          {globals.property || 'Propiedad'}
        </div>
        <div className="pn">
          {globals.date || ''}
        </div>
      </div>
    </>
  );
}

/* ───────── Slide renderer ───────── */
function SlideRenderer({ slide, globals, index, total, onUpdate, pageSize, scale = 1 }) {
  const Body = TEMPLATE_BODIES[slide.template];
  const tpl = TEMPLATES[slide.template];
  const update = (patch) => onUpdate({ ...slide, data: { ...slide.data, ...patch } });
  const dims = PAGE_SIZES[pageSize];
  return (
    <div
      className="page"
      style={{
        width: dims.w,
        height: dims.h,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {slide.template !== 'cover' && (
        <PageChrome
          globals={globals}
          slideIndex={index}
          total={total}
          slideLabel={tpl.name.toUpperCase()}
        />
      )}
      <Body data={slide.data} update={update} globals={globals} />
    </div>
  );
}

/* ───────── Slide thumbnail (mini preview) ───────── */
function SlideThumb({ slide, globals, index, total, pageSize }) {
  const dims = PAGE_SIZES[pageSize];
  const ref = useRef(null);
  const [scale, setScale] = useState(0.18);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      setScale(w / dims.w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [dims.w]);
  return (
    <div className="slide-card__thumb" ref={ref}>
      <div className="slide-card__thumb-inner">
        <div
          className="slide-card__thumb-stage"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: dims.w,
            height: dims.h,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <SlideRenderer
            slide={slide}
            globals={globals}
            index={index}
            total={total}
            onUpdate={() => {}}
            pageSize={pageSize}
            scale={1}
          />
        </div>
      </div>
    </div>
  );
}

/* ───────── Slides Panel ───────── */
function SlidesPanel({ slides, globals, activeId, setActiveId, setSlides, pageSize }) {
  const [showAdd, setShowAdd] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState({ id: null, where: null });

  const onDragStart = (id, e) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragOverCard = (id, e) => {
    e.preventDefault();
    if (dragId === id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const where = (e.clientY - rect.top) > rect.height / 2 ? 'below' : 'above';
    setDragOver({ id, where });
  };
  const onDrop = () => {
    if (!dragId || !dragOver.id || dragId === dragOver.id) {
      setDragId(null); setDragOver({ id: null, where: null }); return;
    }
    const next = [...slides];
    const fromIdx = next.findIndex(s => s.id === dragId);
    const moved = next.splice(fromIdx, 1)[0];
    let toIdx = next.findIndex(s => s.id === dragOver.id);
    if (dragOver.where === 'below') toIdx += 1;
    next.splice(toIdx, 0, moved);
    setSlides(next);
    setDragId(null); setDragOver({ id: null, where: null });
  };

  const duplicate = (s) => {
    const idx = slides.findIndex(x => x.id === s.id);
    const copy = { ...s, id: uid(), data: JSON.parse(JSON.stringify(s.data)) };
    const next = [...slides];
    next.splice(idx + 1, 0, copy);
    setSlides(next);
    setActiveId(copy.id);
  };
  const remove = (s) => {
    if (slides.length <= 1) return;
    const idx = slides.findIndex(x => x.id === s.id);
    const next = slides.filter(x => x.id !== s.id);
    setSlides(next);
    if (activeId === s.id) {
      setActiveId(next[Math.min(idx, next.length - 1)].id);
    }
  };

  return (
    <aside className="slides-panel" style={{ position: 'relative' }}>
      <div className="panel-header">
        <h3>Slides</h3>
        <span className="count">{slides.length}</span>
      </div>
      <div className="slides-list">
        {slides.map((s, i) => {
          const tpl = TEMPLATES[s.template];
          const isActive = s.id === activeId;
          const isDragging = dragId === s.id;
          const isDropAbove = dragOver.id === s.id && dragOver.where === 'above';
          const isDropBelow = dragOver.id === s.id && dragOver.where === 'below';
          return (
            <div
              key={s.id}
              className={
                'slide-card' +
                (isActive ? ' is-active' : '') +
                (isDragging ? ' is-dragging' : '') +
                (isDropAbove ? ' is-drop-target-above' : '') +
                (isDropBelow ? ' is-drop-target-below' : '')
              }
              draggable
              onClick={() => setActiveId(s.id)}
              onDragStart={(e) => onDragStart(s.id, e)}
              onDragOver={(e) => onDragOverCard(s.id, e)}
              onDragEnd={() => { setDragId(null); setDragOver({ id: null, where: null }); }}
              onDrop={onDrop}
            >
              <div className="slide-card__head">
                <div className="slide-card__index">{String(i + 1).padStart(2, '0')}</div>
                <div className="slide-card__type">{tpl.name}</div>
                <button
                  className="slide-card__menu"
                  onClick={(e) => { e.stopPropagation(); duplicate(s); }}
                  title="Duplicar"
                ><i className="ti ti-copy"></i></button>
                <button
                  className="slide-card__menu"
                  onClick={(e) => { e.stopPropagation(); remove(s); }}
                  title="Eliminar"
                  style={{ opacity: slides.length <= 1 ? 0.3 : 1 }}
                ><i className="ti ti-trash"></i></button>
              </div>
              <SlideThumb
                slide={s}
                globals={globals}
                index={i}
                total={slides.length}
                pageSize={pageSize}
              />
            </div>
          );
        })}
      </div>
      <div className="slides-panel__footer">
        <button className="add-slide-trigger" onClick={() => setShowAdd(v => !v)}>
          <i className="ti ti-plus"></i>
          Agregar slide
        </button>
      </div>
      {showAdd && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
            onClick={() => setShowAdd(false)}
          />
          <div className="add-slide-popover">
            <div className="add-slide-popover__title">Plantillas</div>
            {TEMPLATE_LIST.map(tpl => (
              <button
                key={tpl.id}
                className="add-slide-popover__item"
                onClick={() => {
                  const s = newSlide(tpl.id);
                  setSlides([...slides, s]);
                  setActiveId(s.id);
                  setShowAdd(false);
                }}
              >
                <div className="add-slide-popover__item-icon">
                  <i className={'ti ti-' + tpl.icon}></i>
                </div>
                <div className="add-slide-popover__item-text">
                  <span className="add-slide-popover__item-name">{tpl.name}</span>
                  <span className="add-slide-popover__item-desc">{tpl.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

/* ───────── Inspector (right panel) ───────── */
function Inspector({ slide, globals, setGlobals, onUpdateSlide }) {
  const [tab, setTab] = useState('slide'); // 'slide' | 'project'
  if (!slide) {
    return (
      <aside className="inspector">
        <div className="inspector__body">
          <div className="empty-state">
            <i className="ti ti-mouse"></i>
            <h4>Selecciona una slide</h4>
            <p>Edita su contenido aquí o directamente sobre el lienzo.</p>
          </div>
        </div>
      </aside>
    );
  }
  const tpl = TEMPLATES[slide.template];
  const update = (patch) => onUpdateSlide({ ...slide, data: { ...slide.data, ...patch } });

  return (
    <aside className="inspector">
      <div className="inspector__tabs">
        <button
          className={'inspector__tab' + (tab === 'slide' ? ' is-active' : '')}
          onClick={() => setTab('slide')}
        >Slide</button>
        <button
          className={'inspector__tab' + (tab === 'project' ? ' is-active' : '')}
          onClick={() => setTab('project')}
        >Proyecto</button>
      </div>
      <div className="inspector__body">
        {tab === 'slide' ? (
          <SlideInspector slide={slide} tpl={tpl} update={update} />
        ) : (
          <ProjectInspector globals={globals} setGlobals={setGlobals} />
        )}
      </div>
    </aside>
  );
}

function SlideInspector({ slide, tpl, update }) {
  const d = slide.data;
  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-section__title">Plantilla</h4>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '10px 12px',
          background: 'var(--bg-alternative)',
          borderRadius: 8,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: 'white', border: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg-weak)',
          }}>
            <i className={'ti ti-' + tpl.icon}></i>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{tpl.name}</span>
            <span style={{ fontSize: 11, color: 'var(--fg-weak)' }}>{tpl.desc}</span>
          </div>
        </div>
      </div>

      {tpl.id === 'cover' && <>
        <FieldGroup title="Contenido">
          <Field label="Título principal" value={d.itemTitle} onChange={v => update({ itemTitle: v })} />
        </FieldGroup>
        <FieldGroup title="Imagen">
          <AssetField value={d.assetMontaje} onChange={v => update({ assetMontaje: v })} label="Render de portada" />
        </FieldGroup>
      </>}

      {tpl.id === 'montaje' && <>
        <FieldGroup title="Contenido">
          <Field label="Etiqueta" value={d.label} onChange={v => update({ label: v })} />
        </FieldGroup>
        <FieldGroup title="Imagen">
          <AssetField value={d.assetMontaje} onChange={v => update({ assetMontaje: v })} label="Render de montaje" />
        </FieldGroup>
      </>}

      {tpl.id === 'descriptivo' && <>
        <FieldGroup title="Contenido">
          <Field label="Etiqueta superior" value={d.sectionLabel} onChange={v => update({ sectionLabel: v })} />
          <Field label="Título" value={d.itemTitle} onChange={v => update({ itemTitle: v })} />
          <Field label="Descripción" value={d.descripcion} onChange={v => update({ descripcion: v })} multiline />
        </FieldGroup>
        <FieldGroup title="Cotas">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Ancho" value={d.cotaAncho} onChange={v => update({ cotaAncho: v })} compact />
            <Field label="Alto" value={d.cotaAlto} onChange={v => update({ cotaAlto: v })} compact />
          </div>
        </FieldGroup>
        <FieldGroup title="Imágenes">
          <AssetField value={d.assetVector} onChange={v => update({ assetVector: v })} label="Vector flat" />
          <AssetField value={d.assetRender} onChange={v => update({ assetRender: v })} label="Render aislado" />
        </FieldGroup>
      </>}

      {tpl.id === 'explosivo' && <>
        <FieldGroup title="Contenido">
          <Field label="Etiqueta" value={d.sectionLabel} onChange={v => update({ sectionLabel: v })} />
          <Field label="Título" value={d.itemTitle} onChange={v => update({ itemTitle: v })} />
        </FieldGroup>
        <FieldGroup title="Imagen">
          <AssetField value={d.assetExplosivo} onChange={v => update({ assetExplosivo: v })} label="Render explosivo" />
        </FieldGroup>
        <FieldGroup title="Anotaciones">
          {d.annotations.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                value={a.num}
                onChange={(e) => {
                  const next = [...d.annotations];
                  next[i] = { ...a, num: e.target.value };
                  update({ annotations: next });
                }}
                style={{
                  width: 50, fontSize: 12, padding: '6px 8px',
                  border: '1px solid var(--border-default)', borderRadius: 6, outline: 0,
                  fontVariantNumeric: 'tabular-nums', textAlign: 'center',
                }}
              />
              <input
                value={a.label}
                onChange={(e) => {
                  const next = [...d.annotations];
                  next[i] = { ...a, label: e.target.value };
                  update({ annotations: next });
                }}
                style={{
                  flex: 1, fontSize: 12, padding: '6px 8px',
                  border: '1px solid var(--border-default)', borderRadius: 6, outline: 0,
                }}
              />
              <button
                className="btn--icon"
                onClick={() => {
                  const next = d.annotations.filter(x => x.id !== a.id);
                  update({ annotations: next });
                }}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--fg-weak)',
                }}
              ><i className="ti ti-x"></i></button>
            </div>
          ))}
          <button
            onClick={() => {
              const num = String(d.annotations.length + 1).padStart(2, '0');
              update({ annotations: [...d.annotations, { id: Date.now(), num, label: 'Nueva anotación' }] });
            }}
            style={{
              fontSize: 12, color: 'white', background: 'var(--bg-accent)',
              fontWeight: 500, padding: '8px 12px', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', marginTop: 4, border: 0, cursor: 'pointer',
            }}
          ><i className="ti ti-plus"></i> Agregar bullet</button>
          <p style={{ fontSize: 10.5, color: 'var(--fg-weak)', lineHeight: 1.4, margin: '6px 0 0' }}>
            Tras agregarlo, haz clic en la imagen para colocarlo. Puedes arrastrarlo para reposicionarlo.
          </p>
        </FieldGroup>
      </>}

      {tpl.id === 'planos' && <>
        <FieldGroup title="Contenido">
          <Field label="Etiqueta" value={d.sectionLabel} onChange={v => update({ sectionLabel: v })} />
          <Field label="Título" value={d.itemTitle} onChange={v => update({ itemTitle: v })} />
        </FieldGroup>
        <FieldGroup title="Plano">
          <AssetField value={d.assetPlano} onChange={v => update({ assetPlano: v })} label="Plano técnico" />
        </FieldGroup>
        <FieldGroup title="Cotas">
          {d.cotas.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                value={c.label}
                onChange={(e) => {
                  const next = [...d.cotas];
                  next[i] = { ...c, label: e.target.value };
                  update({ cotas: next });
                }}
                style={{
                  flex: 1, fontSize: 12, padding: '6px 8px',
                  border: '1px solid var(--border-default)', borderRadius: 6, outline: 0,
                }}
              />
              <input
                value={c.value}
                onChange={(e) => {
                  const next = [...d.cotas];
                  next[i] = { ...c, value: e.target.value };
                  update({ cotas: next });
                }}
                style={{
                  width: 80, fontSize: 12, padding: '6px 8px',
                  border: '1px solid var(--border-default)', borderRadius: 6, outline: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
              <button
                onClick={() => update({ cotas: d.cotas.filter(x => x.id !== c.id) })}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--fg-weak)',
                }}
              ><i className="ti ti-x"></i></button>
            </div>
          ))}
          <button
            onClick={() => update({ cotas: [...d.cotas, { id: Date.now(), label: 'Nueva cota', value: '0.00 m' }] })}
            style={{
              fontSize: 12, color: 'var(--fg-accent)', fontWeight: 500,
              padding: '6px 0', display: 'flex', alignItems: 'center', gap: 4,
            }}
          ><i className="ti ti-plus"></i> Agregar cota</button>
        </FieldGroup>
      </>}

      {tpl.id === 'materiales' && <>
        <FieldGroup title="Contenido">
          <Field label="Etiqueta" value={d.sectionLabel} onChange={v => update({ sectionLabel: v })} />
          <Field label="Título" value={d.itemTitle} onChange={v => update({ itemTitle: v })} />
        </FieldGroup>
        <FieldGroup title="Materiales">
          {d.materiales.map((m, i) => (
            <div key={m.id} style={{
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: 10,
              marginBottom: 10,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.6px', color: 'var(--fg-weak)', textTransform: 'uppercase' }}>
                  Material {i + 1}
                </span>
                <button
                  onClick={() => update({ materiales: d.materiales.filter(x => x.id !== m.id) })}
                  style={{ color: 'var(--fg-weak)', fontSize: 12 }}
                ><i className="ti ti-x"></i></button>
              </div>
              <CompactField label="Tipo" value={m.tipo} onChange={(v) => {
                const next = [...d.materiales]; next[i] = { ...m, tipo: v }; update({ materiales: next });
              }} />
              <CompactField label="Material" value={m.material} onChange={(v) => {
                const next = [...d.materiales]; next[i] = { ...m, material: v }; update({ materiales: next });
              }} />
              <CompactField label="Acabado" value={m.acabado} onChange={(v) => {
                const next = [...d.materiales]; next[i] = { ...m, acabado: v }; update({ materiales: next });
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id={`pantone-${m.id}`}
                  checked={m.showPantone !== false}
                  onChange={(e) => {
                    const next = [...d.materiales];
                    next[i] = { ...m, showPantone: e.target.checked };
                    update({ materiales: next });
                  }}
                  style={{ margin: 0 }}
                />
                <label htmlFor={`pantone-${m.id}`} style={{ fontSize: 10.5, color: 'var(--fg-weak)', minWidth: 56 }}>Pantone</label>
                <input
                  value={m.pantone || ''}
                  disabled={m.showPantone === false}
                  onChange={(e) => {
                    const next = [...d.materiales]; next[i] = { ...m, pantone: e.target.value }; update({ materiales: next });
                  }}
                  style={{
                    flex: 1, fontSize: 12, padding: '6px 8px',
                    border: '1px solid var(--border-default)', borderRadius: 6, outline: 0,
                    opacity: m.showPantone === false ? 0.4 : 1,
                  }}
                />
              </div>
            </div>
          ))}
          <button
            onClick={() => update({ materiales: [...d.materiales, { id: Date.now(), tipo: 'Nuevo', material: '—', acabado: '—', pantone: '—', asset: null }] })}
            style={{
              fontSize: 12, color: 'var(--fg-accent)', fontWeight: 500,
              padding: '6px 0', display: 'flex', alignItems: 'center', gap: 4,
            }}
          ><i className="ti ti-plus"></i> Agregar material</button>
        </FieldGroup>
      </>}

      <div className="inspector-section">
        <p style={{ fontSize: 11, color: 'var(--fg-weak)', lineHeight: 1.5, margin: 0 }}>
          <i className="ti ti-info-circle" style={{ verticalAlign: 'middle', marginRight: 4 }}></i>
          También puedes editar texto haciendo clic directamente sobre el lienzo.
        </p>
      </div>
    </>
  );
}

function ProjectInspector({ globals, setGlobals }) {
  const fileRef = useRef(null);
  const handleLogo = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setGlobals({ ...globals, logoData: e.target.result });
    reader.readAsDataURL(file);
  };
  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-section__title">Datos del proyecto</h4>
        <Field label="Título del proyecto" value={globals.title} onChange={v => setGlobals({ ...globals, title: v })} />
        <Field label="Sufijo / variante" value={globals.suffix} onChange={v => setGlobals({ ...globals, suffix: v })} placeholder="BP, BV, etc." />
        <Field label="Propiedad / hotel" value={globals.property} onChange={v => setGlobals({ ...globals, property: v })} />
        <Field label="Fecha de elaboración" value={globals.date} onChange={v => setGlobals({ ...globals, date: v })} placeholder="Ej. 12 Abril 2026" />
        <Field label="Departamento" value={globals.dept} onChange={v => setGlobals({ ...globals, dept: v })} />
        <Field label="Corporativo" value={globals.corp} onChange={v => setGlobals({ ...globals, corp: v })} />
      </div>
      <div className="inspector-section">
        <h4 className="inspector-section__title">Logotipo del proyecto</h4>
        {globals.logoData ? (
          <div className="asset-preview" style={{ aspectRatio: '3/1', background: 'white' }}>
            <img src={globals.logoData} alt="" />
            <button
              className="asset-preview__remove"
              onClick={() => setGlobals({ ...globals, logoData: null })}
            >×</button>
          </div>
        ) : (
          <div className="asset-drop" onClick={() => fileRef.current?.click()}>
            <i className="ti ti-photo-plus"></i>
            <span className="asset-drop__title">Subir logotipo</span>
            <span className="asset-drop__hint">PNG / SVG · aparece en cabecera</span>
            <input
              ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => handleLogo(e.target.files[0])}
            />
          </div>
        )}
      </div>
      <div className="inspector-section">
        <p style={{ fontSize: 11, color: 'var(--fg-weak)', lineHeight: 1.5, margin: 0 }}>
          <i className="ti ti-info-circle" style={{ verticalAlign: 'middle', marginRight: 4 }}></i>
          Estos datos aparecen automáticamente en el header y footer de todas las slides.
        </p>
      </div>
    </>
  );
}

function FieldGroup({ title, children }) {
  return (
    <div className="inspector-section">
      <h4 className="inspector-section__title">{title}</h4>
      {children}
    </div>
  );
}
function Field({ label, value, onChange, multiline, placeholder, compact }) {
  return (
    <div className="field">
      <label>{label}</label>
      {multiline ? (
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4}/>
      ) : (
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}/>
      )}
    </div>
  );
}
function CompactField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10.5, color: 'var(--fg-weak)', minWidth: 64 }}>{label}</span>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1, fontSize: 12, padding: '6px 8px',
          border: '1px solid var(--border-default)', borderRadius: 6, outline: 0,
        }}
      />
    </div>
  );
}
function AssetField({ value, onChange, label }) {
  const ref = useRef(null);
  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target.result);
    reader.readAsDataURL(file);
  };
  return value ? (
    <div className="asset-preview" style={{ marginBottom: 10 }}>
      <img src={value} alt={label} />
      <button className="asset-preview__remove" onClick={() => onChange(null)}>×</button>
    </div>
  ) : (
    <div
      className="asset-drop"
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('is-over'); }}
      onDragLeave={(e) => e.currentTarget.classList.remove('is-over')}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('is-over');
        handleFile(e.dataTransfer.files[0]);
      }}
      style={{ marginBottom: 10 }}
    >
      <i className="ti ti-cloud-upload"></i>
      <span className="asset-drop__title">{label}</span>
      <span className="asset-drop__hint">Arrastra, pega (Ctrl+V) o haz clic</span>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])}/>
    </div>
  );
}

window.SlideRenderer = SlideRenderer;
window.SlidesPanel = SlidesPanel;
window.Inspector = Inspector;
window.PageChrome = PageChrome;
window.TWEAK_DEFAULTS = TWEAK_DEFAULTS;
