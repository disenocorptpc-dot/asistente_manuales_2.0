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
      spellCheck={true}
      lang="es"
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

/* Slot: clickable / drop-target image area with working pan+zoom */
function Slot({ value, onChange, label, style, contain = false, tightFit = false }) {
  const inputRef = useRefS(null);
  const containerRef = useRefS(null);
  const [over, setOver] = useStateS(false);
  const [isAdjusting, setIsAdjusting] = useStateS(false);

  // Normalize value: supports legacy string, legacy {url,x,y}, or new {url,scale,panX,panY}
  const imgUrl = value && typeof value === 'object' ? value.url : (value || null);
  const scale   = value && typeof value === 'object' ? (value.scale ?? 1) : 1;
  // panX/panY: % offset from center. 0 = centered.
  // Migrate from old x/y (0-100, center=50) → panX/panY (center=0)
  const panX = value && typeof value === 'object'
    ? (value.panX !== undefined ? value.panX : (value.x !== undefined ? (value.x - 50) * 0.5 : 0))
    : 0;
  const panY = value && typeof value === 'object'
    ? (value.panY !== undefined ? value.panY : (value.y !== undefined ? (value.y - 50) * 0.5 : 0))
    : 0;

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange({ url: e.target.result, scale: 1, panX: 0, panY: 0 });
    reader.readAsDataURL(file);
  };

  const handleUpdate = (patch) => {
    onChange({ url: imgUrl, scale, panX, panY, ...patch });
  };

  // Pan limit: how far we can push the image before it reveals white
  // At scale=1 → panLimit=0 (can't pan). At scale=2 → panLimit=50, etc.
  const panLimit = (scale - 1) * 50;

  const startDrag = (e) => {
    if (!isAdjusting) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const initPanX = panX;
    const initPanY = panY;
    const move = (ev) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Convert pixel delta to % of container, adjusted for scale
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      const lim = Math.max(0, panLimit);
      handleUpdate({
        panX: Math.max(-lim, Math.min(lim, initPanX + dx)),
        panY: Math.max(-lim, Math.min(lim, initPanY + dy)),
      });
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
      ref={containerRef}
      className={'slot ' + (imgUrl ? 'has-image ' : '') + (over ? 'is-over ' : '') + (isAdjusting ? 'is-adjusting' : '')}
      style={{ ...style, position: 'relative', overflow: 'hidden' }}
      onClick={() => { if (!imgUrl) inputRef.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files[0]); }}
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
            src={imgUrl}
            alt=""
            onMouseDown={startDrag}
            draggable={false}
            style={{
              width: tightFit ? 'auto' : '100%',
              height: tightFit ? 'auto' : '100%',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: contain ? 'contain' : 'cover',
              // Single unified transform: translate first (in container space), then scale
              transform: `translate(${panX}%, ${panY}%) scale(${scale})`,
              transformOrigin: 'center center',
              cursor: isAdjusting ? 'grab' : 'default',
              transition: isAdjusting ? 'none' : 'transform 0.2s',
              pointerEvents: isAdjusting ? 'auto' : 'none',
              userSelect: 'none',
              display: 'block',
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
                <input
                  type="range" min="1" max="4" step="0.05"
                  value={scale}
                  onChange={e => {
                    const newScale = parseFloat(e.target.value);
                    const newLim = Math.max(0, (newScale - 1) * 50);
                    handleUpdate({
                      scale: newScale,
                      panX: Math.max(-newLim, Math.min(newLim, panX)),
                      panY: Math.max(-newLim, Math.min(newLim, panY)),
                    });
                  }}
                />
                <i className="ti ti-zoom-in" style={{ fontSize: 14 }}></i>
              </div>
              <div className="adjust-row" style={{ justifyContent: 'center', gap: 8, marginTop: 4 }}>
                <button
                  className="adjust-reset"
                  onClick={() => handleUpdate({ scale: 1, panX: 0, panY: 0 })}
                  title="Resetear posición"
                >⌂ Reset</button>
                <button
                  className="adjust-done"
                  onClick={(e) => { e.stopPropagation(); setIsAdjusting(false); }}
                >Aceptar</button>
              </div>
              <div className="adjust-hint">Arrastra para mover · Rueda para zoom</div>
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
    <div style={{ position: 'absolute', inset: 0, background: 'url("ds/Back.webp") center/cover no-repeat', overflow: 'hidden' }}>


      {/* Bottom right logo (Palace wordmark on brand) */}
      <div style={{ position: 'absolute', bottom: 56, right: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
        {globals?.logoData ? (
          <img src={globals.logoData} alt="" style={{ height: 36, maxWidth: 180, objectFit: 'contain' }} />
        ) : (
          <img src="ds/logo-palace-default.svg" alt="Palace" style={{ height: 36, filter: 'brightness(0) invert(1)' }} />
        )}
      </div>

      {/* Center-left content */}
      <div style={{
        position: 'absolute', left: 64, top: '50%',
        transform: 'translateY(-50%)', right: 200,
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ width: 60, height: 1, background: cyanStrong }}/>
        
        {/* Subtitulo 1: projectType */}
        <InlineText
          value={data.projectType !== undefined ? data.projectType : 'TIPO DE PROYECTO'}
          onChange={(v) => update({ projectType: v })}
          style={{ fontSize: 18, fontWeight: 500, letterSpacing: '1.5px', textTransform: 'uppercase', color: cyan }}
        />
        
        {/* Titulo Principal: itemTitle */}
        <InlineText
          value={data.itemTitle}
          onChange={(v) => update({ itemTitle: v })}
          style={{ fontSize: 56, fontWeight: 400, lineHeight: 1.0, letterSpacing: '-1.6px', color: 'white' }}
        />

        {/* Subtitulo 2: siteName / property */}
        <InlineText
          value={data.siteName !== undefined ? data.siteName : (globals?.property || 'UBICACIÓN')}
          onChange={(v) => update({ siteName: v })}
          style={{ fontSize: 24, fontWeight: 300, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.85)' }}
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
            flex: 1,
            background: '#fafafa',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '44px',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'relative', display: 'inline-flex', maxWidth: '100%', maxHeight: '100%' }}>
              <Slot
                value={data.assetVector}
                onChange={(v) => update({ assetVector: v })}
                label="Vector flat"
                style={{
                  background: 'transparent',
                  border: data.assetVector ? '0' : undefined,
                  width: data.assetVector ? 'auto' : '100%',
                  height: data.assetVector ? 'auto' : '100%',
                  minWidth: data.assetVector ? 0 : 200,
                  minHeight: data.assetVector ? 0 : 200,
                }}
                contain={true}
                tightFit={true}
              />
              {/* Width cota */}
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: -24,
                display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-grey-600)',
              }}>
                <div style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.4 }} />
                <InlineText
                  value={data.cotaAncho}
                  onChange={(v) => update({ cotaAncho: v })}
                  style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.4px', whiteSpace: 'nowrap' }}
                />
                <div style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.4 }} />
              </div>
              {/* Height cota */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: -28,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--color-grey-600)',
              }}>
                <div style={{ flex: 1, width: 1, background: 'currentColor', opacity: 0.4 }} />
                <InlineText
                  value={data.cotaAlto}
                  onChange={(v) => update({ cotaAlto: v })}
                  style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.4px', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}
                />
                <div style={{ flex: 1, width: 1, background: 'currentColor', opacity: 0.4 }} />
              </div>
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
              >
                {a.num}
                {/* Remove badge — visible on hover */}
                {isHover && (
                  <div
                    data-bullet
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    onClick={(e) => {
                      e.stopPropagation();
                      update({ annotations: data.annotations.filter(x => x.id !== a.id) });
                      setHoverId(null);
                    }}
                    style={{
                      position: 'absolute',
                      top: -8, right: -8,
                      width: 14, height: 14,
                      borderRadius: '50%',
                      background: '#ef4444',
                      color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                      zIndex: 4,
                      lineHeight: 1,
                    }}
                    title="Quitar bullet"
                  >×</div>
                )}
              </div>
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
                {/* Remove bullet from sidebar */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    update({ annotations: data.annotations.filter(x => x.id !== a.id) });
                  }}
                  style={{
                    opacity: isHover ? 1 : 0,
                    transition: 'opacity 120ms',
                    width: 18, height: 18,
                    borderRadius: '50%',
                    background: '#ef4444',
                    color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                    flexShrink: 0, marginTop: 4,
                    cursor: 'pointer',
                  }}
                  title="Quitar bullet"
                >×</button>
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
