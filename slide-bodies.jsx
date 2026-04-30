/* global React, TEMPLATES */
const { useState: useStateS, useRef: useRefS, useEffect: useEffectS } = React;

/* InlineText: contentEditable that calls onChange with plain text on blur/input */
function InlineText({ value, onChange, className, style, multiline, placeholder }) {
  const ref = useRefS(null);
  useEffectS(() => {
    if (ref.current && ref.current.innerText !== (value || '')) {
      ref.current.innerText = value || '';
    }
  }, [value]);
  return (
    <div
      ref={ref}
      className={'editable ' + (className || '')}
      style={style}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder || ''}
      onBlur={(e) => onChange(e.currentTarget.innerText)}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/* Slot: clickable / drop-target image area */
function Slot({ value, onChange, label, style, contain = true }) {
  const inputRef = useRefS(null);
  const [over, setOver] = useStateS(false);
  const [isAdjusting, setIsAdjusting] = useStateS(false);

  const imgUrl = typeof value === 'object' && value !== null ? value.url : value;
  const scale = typeof value === 'object' && value !== null ? (value.scale || 1) : 1;
  const x = typeof value === 'object' && value !== null ? (value.x || 50) : 50;
  const y = typeof value === 'object' && value !== null ? (value.y || 50) : 50;

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange({ url: e.target.result, scale: 1, x: 50, y: 50 });
    reader.readAsDataURL(file);
  };

  const handleUpdate = (patch) => {
    onChange({ url: imgUrl, scale, x, y, ...patch });
  };

  const imgRef = useRefS(null);
  const startDrag = (e) => {
    if (!isAdjusting) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = x;
    const initialY = y;
    
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const rect = imgRef.current?.parentElement.getBoundingClientRect();
      if (!rect) return;
      // Convert drag distance to percentage of image bounds
      const pctX = initialX - (dx / rect.width) * 100 / scale;
      const pctY = initialY - (dy / rect.height) * 100 / scale;
      handleUpdate({ x: Math.max(0, Math.min(100, pctX)), y: Math.max(0, Math.min(100, pctY)) });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div
      className={'slot ' + (imgUrl ? 'has-image ' : '') + (over ? 'is-over' : '') + (isAdjusting ? ' is-adjusting' : '')}
      style={{ ...style, position: 'relative', overflow: 'hidden' }}
      onClick={() => {
        if (!imgUrl) inputRef.current?.click();
      }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handleFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])}
      />
      {imgUrl ? (
        <>
          <img 
            ref={imgRef}
            src={imgUrl} 
            alt="" 
            onMouseDown={startDrag}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: contain ? 'contain' : 'cover',
              objectPosition: `${x}% ${y}%`,
              transform: `scale(${scale})`,
              cursor: isAdjusting ? 'grab' : 'default',
              transition: isAdjusting ? 'none' : 'transform 0.2s',
              pointerEvents: isAdjusting ? 'auto' : 'none'
            }} 
          />
          {!isAdjusting && (
             <div className="slot__actions">
               <button
                 className="slot__action-btn"
                 onClick={(e) => { e.stopPropagation(); setIsAdjusting(true); }}
                 title="Ajustar imagen"
               ><i className="ti ti-crop"></i></button>
               <button
                 className="slot__action-btn"
                 onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                 title="Reemplazar imagen"
               ><i className="ti ti-replace"></i></button>
               <button
                 className="slot__action-btn slot__action-btn--danger"
                 onClick={(e) => { e.stopPropagation(); onChange(null); }}
                 title="Quitar imagen"
               ><i className="ti ti-x"></i></button>
             </div>
          )}
          {isAdjusting && (
            <div className="slot__adjust-panel" onClick={e => e.stopPropagation()}>
              <div className="adjust-row">
                <i className="ti ti-zoom-out" style={{ fontSize: 14 }}></i>
                <input type="range" min="0.5" max="3" step="0.05" value={scale} onChange={e => handleUpdate({ scale: parseFloat(e.target.value) })} />
                <i className="ti ti-zoom-in" style={{ fontSize: 14 }}></i>
              </div>
              <div className="adjust-hint">Arrastra para mover</div>
              <button className="adjust-done" onClick={(e) => { e.stopPropagation(); setIsAdjusting(false); }}>Aceptar</button>
            </div>
          )}
        </>
      ) : (
        <div className="slot__placeholder">
          <i className="ti ti-photo-plus"></i>
          <span>{label || 'Arrastra o haz clic'}</span>
        </div>
      )}
    </div>
  );
}

/* ============== INDIVIDUAL TEMPLATE BODIES ============== */

function CoverBody({ data, update, globals }) {
  const cyan = '#7dd3fc';
  const cyanStrong = '#38bdf8';
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--color-ocean-blue-900)', overflow: 'hidden' }}>
      <svg
        viewBox="0 0 1000 700"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        {/* Top-left diagonal cluster */}
        <g stroke={cyan} strokeWidth="0.7" fill="none" opacity="0.55">
          {Array.from({ length: 26 }, (_, i) => (
            <line key={'d' + i} x1={-100 + i * 22} y1="0" x2={i * 22 + 200} y2="320" />
          ))}
        </g>
        {/* Right vertical strip */}
        <g stroke={cyan} strokeWidth="0.6" fill="none" opacity="0.45">
          {Array.from({ length: 22 }, (_, i) => (
            <line key={'v' + i} x1={720 + i * 14} y1="0" x2={720 + i * 14} y2="700" />
          ))}
        </g>
        {/* Bottom horizontal strip */}
        <g stroke={cyan} strokeWidth="0.6" fill="none" opacity="0.4">
          {Array.from({ length: 18 }, (_, i) => (
            <line key={'h' + i} x1="0" y1={460 + i * 14} x2="700" y2={460 + i * 14} />
          ))}
        </g>
        {/* Concentric arcs bottom-right (geometric accent) */}
        <g stroke={cyanStrong} strokeWidth="1.2" fill="none" opacity="0.7">
          <circle cx="900" cy="640" r="60" />
          <circle cx="900" cy="640" r="100" />
          <circle cx="900" cy="640" r="140" />
        </g>
        {/* Cross axis */}
        <line x1="80" y1="520" x2="540" y2="520" stroke={cyanStrong} strokeWidth="1.5" opacity="0.9" />
      </svg>

      {/* Top logo (Palace wordmark on brand) */}
      <div style={{ position: 'absolute', top: 56, left: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
        {globals?.logoData ? (
          <img src={globals.logoData} alt="" style={{ height: 36, filter: 'brightness(0) invert(1)' }} />
        ) : (
          <img src="ds/logo-palace-default.svg" alt="Palace" style={{ height: 36, filter: 'brightness(0) invert(1)' }} />
        )}
      </div>

      {/* Right monogram badge */}
      <div style={{
        position: 'absolute', top: 56, right: 64,
        width: 72, height: 72,
        border: `1.5px solid ${cyan}`, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: cyan, fontSize: 28, fontWeight: 400, letterSpacing: '-0.5px' }}>P</span>
      </div>

      {/* Center-left content */}
      <div style={{
        position: 'absolute', left: 64, top: '50%',
        transform: 'translateY(-50%)', right: 200,
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ width: 60, height: 1, background: cyanStrong }}/>
        <InlineText
          value={data.sectionLabel}
          onChange={(v) => update({ sectionLabel: v })}
          style={{ fontSize: 11, fontWeight: 500, letterSpacing: '1.5px', textTransform: 'uppercase', color: cyan }}
        />
        <InlineText
          value={data.itemTitle}
          onChange={(v) => update({ itemTitle: v })}
          style={{ fontSize: 56, fontWeight: 400, lineHeight: 1.0, letterSpacing: '-1.6px', color: 'white' }}
        />
        <InlineText
          value={data.itemSubtitle}
          onChange={(v) => update({ itemSubtitle: v })}
          style={{ fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.5px' }}
        />
      </div>

      {/* Bottom note */}
      <div style={{ position: 'absolute', left: 64, bottom: 56 }}>
        <InlineText
          value={data.coverNote}
          onChange={(v) => update({ coverNote: v })}
          style={{ fontSize: 10, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}
        />
      </div>
    </div>
  );
}

function MontajeBody({ data, update }) {
  return (
    <div style={{ position: 'absolute', inset: 0, paddingTop: 56, paddingBottom: 40 }}>
      <div style={{
        position: 'absolute', top: 56, left: 32, right: 32, bottom: 40,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <InlineText
          value={data.label}
          onChange={(v) => update({ label: v })}
          className="slide-overline"
        />
        <Slot
          value={data.assetMontaje}
          onChange={(v) => update({ assetMontaje: v })}
          label="Render de montaje a página completa"
          style={{ flex: 1 }}
          contain={false}
        />
      </div>
    </div>
  );
}

function DescriptivoBody({ data, update }) {
  return (
    <div className="slide-body">
      {/* overline + title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
        <InlineText
          value={data.sectionLabel}
          onChange={(v) => update({ sectionLabel: v })}
          className="slide-overline"
        />
        <InlineText
          value={data.itemTitle}
          onChange={(v) => update({ itemTitle: v })}
          style={{
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '-0.28px',
            color: 'var(--color-ocean-blue-900)',
            lineHeight: 1.1,
          }}
        />
      </div>

      {/* Two-column area */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 20 }}>
        {/* LEFT: vector flat with cotas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="slide-overline" style={{ fontSize: 9 }}>Vista frontal · vector</div>
          <div style={{
            flex: 1, position: 'relative',
            background: '#fafafa',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            padding: '24px 36px 44px 36px',
          }}>
            <Slot
              value={data.assetVector}
              onChange={(v) => update({ assetVector: v })}
              label="Vector flat"
              style={{
                position: 'absolute',
                top: 24, left: 36, right: 36, bottom: 44,
                background: 'transparent',
                border: data.assetVector ? '0' : undefined,
              }}
            />
            {/* Width cota */}
            <div style={{
              position: 'absolute', left: 36, right: 36, bottom: 16,
              display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-grey-600)',
            }}>
              <div style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.4 }} />
              <InlineText
                value={data.cotaAncho}
                onChange={(v) => update({ cotaAncho: v })}
                style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.4px' }}
              />
              <div style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.4 }} />
            </div>
            {/* Height cota */}
            <div style={{
              position: 'absolute', top: 24, bottom: 44, left: 12,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--color-grey-600)',
            }}>
              <div style={{ flex: 1, width: 1, background: 'currentColor', opacity: 0.4 }} />
              <InlineText
                value={data.cotaAlto}
                onChange={(v) => update({ cotaAlto: v })}
                style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.4px', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              />
              <div style={{ flex: 1, width: 1, background: 'currentColor', opacity: 0.4 }} />
            </div>
          </div>
        </div>

        {/* RIGHT: descripción + render aislado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="slide-overline" style={{ fontSize: 9, marginBottom: 8 }}>Descriptivo</div>
            <InlineText
              multiline
              value={data.descripcion}
              onChange={(v) => update({ descripcion: v })}
              style={{
                fontSize: 11,
                lineHeight: 1.6,
                color: 'var(--color-grey-700)',
                minHeight: 80,
              }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="slide-overline" style={{ fontSize: 9 }}>Render aislado</div>
            <Slot
              value={data.assetRender}
              onChange={(v) => update({ assetRender: v })}
              label="Render aislado"
              style={{ flex: 1 }}
              contain={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExplosivoBody({ data, update }) {
  const [hoverId, setHoverId] = useStateS(null);
  const imgRef = useRefS(null);

  const placeNextBullet = (e) => {
    if (!data.assetExplosivo) return;
    // Don't place if clicking an existing bullet
    if (e.target.closest('[data-bullet]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    // find first annotation without coords; if none, create new
    const next = [...data.annotations];
    const idx = next.findIndex(a => a.x == null || a.y == null);
    if (idx >= 0) {
      next[idx] = { ...next[idx], x, y };
      update({ annotations: next });
    }
  };

  const updateBulletPos = (id, x, y) => {
    const next = data.annotations.map(a => a.id === id ? { ...a, x, y } : a);
    update({ annotations: next });
  };

  const startDrag = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    const container = imgRef.current;
    if (!container) return;
    const move = (ev) => {
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
      updateBulletPos(id, x, y);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const unplaced = data.annotations.filter(a => a.x == null || a.y == null).length;

  return (
    <div className="slide-body">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
        <InlineText
          value={data.sectionLabel}
          onChange={(v) => update({ sectionLabel: v })}
          className="slide-overline"
        />
        <InlineText
          value={data.itemTitle}
          onChange={(v) => update({ itemTitle: v })}
          style={{
            fontSize: 28, fontWeight: 500, letterSpacing: '-0.28px',
            color: 'var(--color-ocean-blue-900)', lineHeight: 1.1,
          }}
        />
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
        {/* Image with bullets */}
        <div
          ref={imgRef}
          style={{ position: 'relative', minHeight: 0 }}
          onClick={placeNextBullet}
        >
          <Slot
            value={data.assetExplosivo}
            onChange={(v) => update({ assetExplosivo: v })}
            label="Render explosivo"
            style={{ position: 'absolute', inset: 0 }}
          />
          {/* Bullets */}
          {data.assetExplosivo && data.annotations.map(a => {
            if (a.x == null || a.y == null) return null;
            const isHover = hoverId === a.id;
            return (
              <div
                key={a.id}
                data-bullet
                onMouseDown={(e) => startDrag(a.id, e)}
                onMouseEnter={() => setHoverId(a.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  position: 'absolute',
                  left: `${a.x}%`,
                  top: `${a.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: isHover ? 26 : 22,
                  height: isHover ? 26 : 22,
                  borderRadius: '50%',
                  background: isHover ? 'var(--color-bronze-600)' : 'var(--color-ocean-blue-900)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 500,
                  cursor: 'grab',
                  border: '2px solid white',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  transition: 'width 120ms, height 120ms, background 120ms',
                  zIndex: 3,
                  userSelect: 'none',
                }}
              >{a.num}</div>
            );
          })}
          {/* Hint when image present and unplaced bullets */}
          {data.assetExplosivo && unplaced > 0 && (
            <div style={{
              position: 'absolute',
              bottom: 8, left: 8,
              background: 'rgba(24, 52, 86, 0.9)',
              color: 'white',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 9,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              pointerEvents: 'none',
              zIndex: 4,
            }}>
              {unplaced} sin colocar · clic en imagen
            </div>
          )}
        </div>

        {/* Annotations sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="slide-overline" style={{ fontSize: 9 }}>Anotaciones</div>
          {data.annotations.map((a, i) => {
            const placed = a.x != null && a.y != null;
            const isHover = hoverId === a.id;
            return (
              <div
                key={a.id}
                onMouseEnter={() => setHoverId(a.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '4px 6px',
                  margin: '-4px -6px',
                  borderRadius: 6,
                  background: isHover ? 'rgba(155,111,65,0.08)' : 'transparent',
                  transition: 'background 120ms',
                }}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: placed
                    ? (isHover ? 'var(--color-bronze-600)' : 'var(--color-ocean-blue-900)')
                    : 'transparent',
                  border: placed ? '0' : '1.5px dashed var(--color-grey-400)',
                  color: placed ? 'white' : 'var(--color-grey-500)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 500, flexShrink: 0,
                }}>{a.num}</div>
                <InlineText
                  value={a.label}
                  onChange={(v) => {
                    const next = [...data.annotations];
                    next[i] = { ...a, label: v };
                    update({ annotations: next });
                  }}
                  multiline
                  style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-grey-700)', flex: 1, paddingTop: 4 }}
                />
              </div>
            );
          })}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const num = String(data.annotations.length + 1).padStart(2, '0');
              update({ annotations: [...data.annotations, { id: Date.now(), num, label: 'Nueva anotación' }] });
            }}
            style={{
              marginTop: 8, padding: '8px 10px',
              fontSize: 11, fontWeight: 500,
              color: 'var(--color-ocean-blue-900)',
              background: 'transparent',
              border: '1px dashed var(--color-grey-400)',
              borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          ><i className="ti ti-plus"></i>Agregar bullet</button>
        </div>
      </div>
    </div>
  );
}

function PlanosBody({ data, update }) {
  return (
    <div className="slide-body">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
        <InlineText
          value={data.sectionLabel}
          onChange={(v) => update({ sectionLabel: v })}
          className="slide-overline"
        />
        <InlineText
          value={data.itemTitle}
          onChange={(v) => update({ itemTitle: v })}
          style={{
            fontSize: 28, fontWeight: 500, letterSpacing: '-0.28px',
            color: 'var(--color-ocean-blue-900)', lineHeight: 1.1,
          }}
        />
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
        <div style={{
          background: '#fafafa',
          border: '1px solid var(--border-default)',
          borderRadius: 4,
          position: 'relative',
        }}>
          <Slot
            value={data.assetPlano}
            onChange={(v) => update({ assetPlano: v })}
            label="Plano técnico con cotas"
            style={{ position: 'absolute', inset: 12, background: 'transparent' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="slide-overline" style={{ fontSize: 9, marginBottom: 12 }}>Cotas y dimensiones</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.cotas.map((c, i) => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px solid var(--border-default)',
                gap: 12,
              }}>
                <InlineText
                  value={c.label}
                  onChange={(v) => {
                    const next = [...data.cotas];
                    next[i] = { ...c, label: v };
                    update({ cotas: next });
                  }}
                  style={{ fontSize: 10.5, color: 'var(--color-grey-600)' }}
                />
                <InlineText
                  value={c.value}
                  onChange={(v) => {
                    const next = [...data.cotas];
                    next[i] = { ...c, value: v };
                    update({ cotas: next });
                  }}
                  style={{
                    fontSize: 11, fontWeight: 500,
                    color: 'var(--color-ocean-blue-900)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialesBody({ data, update }) {
  return (
    <div className="slide-body">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
        <InlineText
          value={data.sectionLabel}
          onChange={(v) => update({ sectionLabel: v })}
          className="slide-overline"
        />
        <InlineText
          value={data.itemTitle}
          onChange={(v) => update({ itemTitle: v })}
          style={{
            fontSize: 28, fontWeight: 500, letterSpacing: '-0.28px',
            color: 'var(--color-ocean-blue-900)', lineHeight: 1.1,
          }}
        />
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {data.materiales.map((m, i) => (
          <div key={m.id} style={{
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            background: 'white',
          }}>
            <Slot
              value={m.asset}
              onChange={(v) => {
                const next = [...data.materiales];
                next[i] = { ...m, asset: v };
                update({ materiales: next });
              }}
              label="Muestra"
              style={{
                aspectRatio: '4/3',
                border: 0,
                borderRadius: 0,
                borderBottom: '1px solid var(--border-default)',
              }}
              contain={false}
            />
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <InlineText
                value={m.tipo}
                onChange={(v) => {
                  const next = [...data.materiales];
                  next[i] = { ...m, tipo: v };
                  update({ materiales: next });
                }}
                className="slide-overline"
                style={{ fontSize: 8.5 }}
              />
              <InlineText
                value={m.material}
                onChange={(v) => {
                  const next = [...data.materiales];
                  next[i] = { ...m, material: v };
                  update({ materiales: next });
                }}
                style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ocean-blue-900)', lineHeight: 1.3 }}
              />
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 9.5, color: 'var(--color-grey-500)' }}>Acabado</span>
                  <InlineText
                    value={m.acabado}
                    onChange={(v) => {
                      const next = [...data.materiales];
                      next[i] = { ...m, acabado: v };
                      update({ materiales: next });
                    }}
                    style={{ fontSize: 10, color: 'var(--color-grey-700)' }}
                  />
                </div>
                {m.showPantone !== false && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 9.5, color: 'var(--color-grey-500)' }}>Pantone</span>
                    <InlineText
                      value={m.pantone}
                      onChange={(v) => {
                        const next = [...data.materiales];
                        next[i] = { ...m, pantone: v };
                        update({ materiales: next });
                      }}
                      style={{ fontSize: 10, color: 'var(--color-grey-700)', fontVariantNumeric: 'tabular-nums' }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TEMPLATE_BODIES = {
  cover: CoverBody,
  montaje: MontajeBody,
  descriptivo: DescriptivoBody,
  explosivo: ExplosivoBody,
  planos: PlanosBody,
  materiales: MaterialesBody,
};

window.InlineText = InlineText;
window.Slot = Slot;
window.TEMPLATE_BODIES = TEMPLATE_BODIES;
