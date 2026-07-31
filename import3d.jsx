/* global React, loadThree */
/* ───────── Importador 3D — Fase 1 ─────────
   Lee un FBX/OBJ en el navegador, extrae nombres, materiales y cotas,
   y precarga las slides Montaje, Descriptivo, Explosivo, Planos y Materiales.
   Three.js entra por import map desde index.html y se carga en diferido, al
   primer uso, vía window.loadThree().                                        */

const { useState: useState3, useRef: useRef3, useCallback: useCallback3 } = React;

/* ───────── Unidades ───────── */

/* cm por unidad de archivo. FBX guarda UnitScaleFactor justamente en esta escala. */
const CM_PER_UNIT = { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 };

/* Lee UnitScaleFactor de la cabecera de un FBX binario.
   El valor va precedido por el tag de tipo 'D' (0x44) y es un double LE.
   Devuelve null si no se encuentra — el llamador cae a centímetros. */
function detectFbxUnitScale(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const key = 'UnitScaleFactor';
  const limit = Math.min(bytes.length, 1 << 20); // la metadata vive al inicio del archivo
  for (let i = 0; i < limit - key.length; i++) {
    let hit = true;
    for (let k = 0; k < key.length; k++) {
      if (bytes[i + k] !== key.charCodeAt(k)) { hit = false; break; }
    }
    if (!hit) continue;
    const stop = Math.min(i + key.length + 96, bytes.length - 9);
    for (let j = i + key.length; j < stop; j++) {
      if (bytes[j] !== 0x44) continue;
      const v = view.getFloat64(j + 1, true);
      if (Number.isFinite(v) && v > 0 && v < 1e5) return v;
    }
  }
  return null;
}

function unitFromScale(factor) {
  if (factor == null) return null;
  const hit = Object.keys(CM_PER_UNIT).find(u => Math.abs(CM_PER_UNIT[u] - factor) < 1e-6);
  return hit || null;
}

/* ───────── Nombres → texto legible ─────────
   La convención del equipo ya codifica material, calibre y espesor.
   Aquí sólo se limpia el ruido del exportador; NO se inventa información. */

const EXPORTER_NOISE = /(?:[._-]?(?:Curve|Mesh|Plane|Cube|Circle|Text|Object|Shape)\d*)+$/i;

/* Sufijo de duplicado de Blender: 001–099 al final, con o sin separador.
   Se restringe a 0XX para no mutilar números legítimos como "Modulo_120"
   ni el calibre en "cal_20". Sin esto, "cal_20"+"001" se lee como calibre 20001. */
const DUP_SUFFIX = /[._-]?0\d{2}$/;

/* Blender también concatena el nombre completo al duplicar dentro de una curva:
   "Acrilico_pintado_de_3mmAcrilico_pintado_de_3mm001". Colapsa la repetición. */
function collapseRepeat(s) {
  const t = s.trim();
  for (const sep of ['', ' ', '_']) {
    const half = (t.length - sep.length) / 2;
    if (!Number.isInteger(half) || half < 3) continue;
    const a = t.slice(0, half);
    const b = t.slice(half + sep.length);
    if (a.toLowerCase() === b.toLowerCase()) return a;
  }
  return t;
}

const ACCENTS = {
  acrilico: 'acrílico', laton: 'latón', aluminio: 'aluminio', lamina: 'lámina',
  plastico: 'plástico', metalico: 'metálico', vinil: 'vinil', translucido: 'translúcido',
  organico: 'orgánico', hexagonal: 'hexagonal', automotriz: 'automotriz',
  difusor: 'difusor', iluminacion: 'iluminación', anodizado: 'anodizado',
};

function cleanToken(raw) {
  let s = String(raw || '').trim();
  s = s.replace(DUP_SUFFIX, '');
  s = s.replace(EXPORTER_NOISE, '');
  s = s.replace(DUP_SUFFIX, '');
  s = collapseRepeat(s);
  s = s.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

function prettyName(raw) {
  const s = cleanToken(raw);
  if (!s) return 'Pieza sin nombre';
  const words = s.split(' ').map(w => {
    const low = w.toLowerCase();
    return ACCENTS[low] || w;
  });
  const first = words[0];
  words[0] = first.charAt(0).toUpperCase() + first.slice(1);
  return words.join(' ');
}

/* Espesor y calibre declarados en el nombre — el "contrato de datos" del equipo. */
function readSpecs(raw) {
  const s = String(raw || '');
  const specs = {};
  const mm = s.match(/(\d+(?:[.,]\d+)?)\s*mm/i);
  if (mm) specs.espesorMm = parseFloat(mm[1].replace(',', '.'));
  const cm = s.match(/(\d+(?:[.,]\d+)?)\s*cm(?![a-z])/i);
  if (!mm && cm) specs.espesorMm = parseFloat(cm[1].replace(',', '.')) * 10;
  const cal = s.match(/cal(?:ibre)?[._\s-]*(\d+)/i);
  if (cal) specs.calibre = parseInt(cal[1], 10);
  return specs;
}

/* ───────── Extracción ───────── */

/* Salud topológica de una malla. En una malla cerrada y limpia toda arista pertenece
   a exactamente 2 triángulos. Aristas con 3+ caras delatan geometría interna duplicada
   (típico de un booleano que dejó caras adentro) y aristas con 1 cara delatan huecos.

   Importa porque la silueta depende de ese emparejamiento: donde se rompe, el contorno
   sale fragmentado. Más vale avisarlo que entregar un plano roto sin decir nada. */
function checkManifold(THREE, mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes && geo.attributes.position;
  if (!pos) return { clean: true, loose: 0, over: 0, edges: 0 };
  const idx = geo.index;
  const count = idx ? idx.count : pos.count;
  const Q = 100000, q = n => Math.round(n * Q);
  const v = new THREE.Vector3();
  const keyOf = (i) => {
    v.fromBufferAttribute(pos, i);
    return q(v.x) + ',' + q(v.y) + ',' + q(v.z);
  };
  const edges = new Map();
  for (let i = 0; i < count; i += 3) {
    const t = [
      keyOf(idx ? idx.getX(i) : i),
      keyOf(idx ? idx.getX(i + 1) : i + 1),
      keyOf(idx ? idx.getX(i + 2) : i + 2),
    ];
    for (let e = 0; e < 3; e++) {
      const k1 = t[e], k2 = t[(e + 1) % 3];
      if (k1 === k2) continue;
      const key = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let loose = 0, over = 0;
  edges.forEach(n => { if (n === 1) loose++; else if (n > 2) over++; });
  return { clean: loose === 0 && over === 0, loose, over, edges: edges.size };
}

function extractPieces(THREE, root) {
  const pieces = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const tris = obj.geometry.index
      ? obj.geometry.index.count / 3
      : (obj.geometry.attributes.position ? obj.geometry.attributes.position.count / 3 : 0);
    pieces.push({
      rawName: obj.name || '',
      rawMaterial: (mat && mat.name) || '',
      name: prettyName(obj.name),
      material: prettyName((mat && mat.name) || 'Sin material'),
      /* Sobre el nombre ya limpio: si no, el sufijo de duplicado contamina el calibre. */
      specs: readSpecs(cleanToken(obj.name) + ' ' + cleanToken((mat && mat.name) || '')),
      size: { x: size.x, y: size.y, z: size.z },
      center: { x: center.x, y: center.y, z: center.z },
      volume: size.x * size.y * size.z,
      triangles: Math.round(tris),
      health: checkManifold(THREE, obj),
      object: obj,
    });
  });
  return pieces;
}

/* Eje de despiece = eje de MENOR dimensión del conjunto (el "espesor").
   En piezas tipo panel/letrero corresponde al eje de las capas de fabricación.
   Descartado: eje de mayor dispersión entre centros — revuelve piezas coplanares. */
function thicknessAxis(size) {
  if (size.x <= size.y && size.x <= size.z) return 'x';
  if (size.y <= size.x && size.y <= size.z) return 'y';
  return 'z';
}

/* Ancho / alto / profundidad: la profundidad es siempre el espesor;
   los otros dos ejes conservan su orden canónico x → y → z. */
function dimensionRoles(size) {
  const thick = thicknessAxis(size);
  const rest = ['x', 'y', 'z'].filter(a => a !== thick);
  return { ancho: rest[0], alto: rest[1], fondo: thick };
}

/* ───────── Render ───────── */

/* Encaje exacto de una cámara ortográfica sobre un bbox, desde una dirección dada. */
function frameOrtho(THREE, camera, box, dir, aspect, pad = 1.08) {
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
  camera.position.copy(center).addScaledVector(dir.clone().normalize(), radius * 4);
  camera.up.set(0, 1, 0);
  if (Math.abs(dir.clone().normalize().y) > 0.999) camera.up.set(0, 0, -1);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  const toCam = new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const min = new THREE.Vector2(Infinity, Infinity);
  const max = new THREE.Vector2(-Infinity, -Infinity);
  const c = [box.min, box.max];
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(
      c[(i >> 0) & 1].x, c[(i >> 1) & 1].y, c[(i >> 2) & 1].z
    ).applyMatrix4(toCam);
    min.x = Math.min(min.x, p.x); max.x = Math.max(max.x, p.x);
    min.y = Math.min(min.y, p.y); max.y = Math.max(max.y, p.y);
  }
  let halfW = ((max.x - min.x) / 2) * pad;
  let halfH = ((max.y - min.y) / 2) * pad;
  if (halfW / halfH < aspect) halfW = halfH * aspect; else halfH = halfW / aspect;

  const offX = (max.x + min.x) / 2;
  const offY = (max.y + min.y) / 2;
  camera.left = offX - halfW; camera.right = offX + halfW;
  camera.bottom = offY - halfH; camera.top = offY + halfH;
  camera.near = -radius * 10; camera.far = radius * 10;
  camera.updateProjectionMatrix();
  return camera;
}

function addStudioLights(THREE, scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdcdcdc, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(1, 1.6, 1.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(-1.2, 0.4, -1);
  scene.add(fill);
}

/* ───────── Silueta del alzado frontal ─────────
   Para una vista plana de frente lo que se necesita es la silueta, no las aristas
   duras: la silueta no arrastra el ruido de la triangulación y no tiene problema de
   líneas ocultas, porque de frente no hay nada que ocultar.

   Cómo se obtiene: se toman los triángulos cuya normal mira a la cámara y de ellos
   las aristas que aparecen UNA sola vez. En una malla cerrada cada arista pertenece a
   dos triángulos; si dentro del subconjunto frontal aparece una vez, está en el borde.
   Eso entrega el contorno exterior y, como bucles aparte, los barrenos y calados.

   Los segmentos salen en unidades del archivo, así que esta misma lista es la que
   alimentará el SVG acotado de la Fase 2. */

/* Ejes del plano de proyección para una vista frontal sobre `axis`. */
function planeAxes(axis) {
  if (axis === 'z') return { h: 'x', v: 'y' };
  if (axis === 'y') return { h: 'x', v: 'z' };
  return { h: 'z', v: 'y' };
}

function silhouetteSegments(THREE, pieces, axis, faceThresholdDeg = 35) {
  const { h, v } = planeAxes(axis);
  const view = new THREE.Vector3(); view[axis] = 1;
  const cosLimit = Math.cos((faceThresholdDeg * Math.PI) / 180);
  const Q = 1000; // cuantización a 1/1000 de unidad, para emparejar aristas compartidas
  const q = n => Math.round(n * Q);

  /* Agrupado POR PIEZA, no en una lista plana. Tres placas de la caja de luz tienen
     contornos casi idénticos y al aplanarlos se pisan entre sí. Además el SVG de la
     Fase 2 necesita una capa por pieza, para que el taller corte por material. */
  const groups = [];

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3();

  pieces.forEach(piece => {
    const geo = piece.object.geometry;
    const pos = geo.attributes && geo.attributes.position;
    if (!pos) return;
    const idx = geo.index;
    const count = idx ? idx.count : pos.count;
    const m = piece.object.matrixWorld;
    const edges = new Map();

    for (let i = 0; i < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m);
      ab.subVectors(b, a); ac.subVectors(c, a);
      nrm.crossVectors(ab, ac);
      const len = nrm.length();
      if (len < 1e-9) continue;           // triángulo degenerado
      nrm.divideScalar(len);
      /* Sólo UN lado de la placa. Si se aceptan cara frontal y trasera a la vez, sus
         contornos proyectan idénticos y cada arista del borde queda contada dos veces,
         así que el filtro de "aparece una sola vez" las descarta todas. */
      if (nrm.dot(view) < cosLimit) continue;

      const tri = [a, b, c];
      for (let e = 0; e < 3; e++) {
        const p1 = tri[e], p2 = tri[(e + 1) % 3];
        const k1 = q(p1[h]) + ':' + q(p1[v]);
        const k2 = q(p2[h]) + ':' + q(p2[v]);
        if (k1 === k2) continue;
        const key = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
        const hit = edges.get(key);
        if (hit) hit.n++;
        else edges.set(key, { n: 1, x1: p1[h], y1: p1[v], x2: p2[h], y2: p2[v] });
      }
    }
    const own = [];
    edges.forEach(ed => { if (ed.n === 1) own.push(ed); });
    if (own.length) groups.push({ piece, segments: own });
  });

  return groups;
}

/* Total de segmentos en todos los grupos. */
function countSegments(groups) {
  return groups.reduce((n, g) => n + g.segments.length, 0);
}

/* Dibuja la silueta con Canvas 2D. Evita el tope de 1 px de las líneas de WebGL
   y permite grosor real; es también el mismo paso que luego emite SVG. */
function renderSilhouette(groups, opts) {
  const W = opts.width || 1600;
  const H = opts.height || 1200;
  const margin = 28;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const segments = groups.reduce((acc, g) => acc.concat(g.segments), []);
  if (!segments.length) return canvas.toDataURL('image/png');

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  segments.forEach(s => {
    minX = Math.min(minX, s.x1, s.x2); maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2); maxY = Math.max(maxY, s.y1, s.y2);
  });
  const scale = Math.min((W - margin * 2) / (maxX - minX || 1), (H - margin * 2) / (maxY - minY || 1));
  const offX = (W - (maxX - minX) * scale) / 2;
  const offY = (H - (maxY - minY) * scale) / 2;
  const tx = x => offX + (x - minX) * scale;
  const ty = y => H - offY - (y - minY) * scale;  // Y del canvas crece hacia abajo

  ctx.strokeStyle = '#14181d';
  ctx.lineWidth = opts.lineWidth || 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  segments.forEach(s => {
    ctx.moveTo(tx(s.x1), ty(s.y1));
    ctx.lineTo(tx(s.x2), ty(s.y2));
  });
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

/* Recorta el marco blanco sobrante y devuelve también la caja usada, para poder
   reubicar las anotaciones del explosivo, que se calculan sobre el marco completo. */
function cropToContent(srcCanvas, margin = 16) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(srcCanvas, 0, 0);
  const d = tctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i] < 248 || d[i + 1] < 248 || d[i + 2] < 248) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { url: tmp.toDataURL('image/png'), rect: { x: 0, y: 0, w, h } };
  minX = Math.max(0, minX - margin); minY = Math.max(0, minY - margin);
  maxX = Math.min(w - 1, maxX + margin); maxY = Math.min(h - 1, maxY + margin);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  const octx = out.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, cw, ch);
  octx.drawImage(tmp, minX, minY, cw, ch, 0, 0, cw, ch);
  return { url: out.toDataURL('image/png'), rect: { x: minX, y: minY, w: cw, h: ch } };
}

/* Reubica un punto en % del marco completo a % del marco recortado. */
function remapPct(xPct, yPct, rect, W, H) {
  return {
    x: Math.max(2, Math.min(98, ((xPct / 100) * W - rect.x) / rect.w * 100)),
    y: Math.max(2, Math.min(98, ((yPct / 100) * H - rect.y) / rect.h * 100)),
  };
}

/* Dirección de cámara derivada del eje de despiece, en vez de un isométrico fijo.
   Con el isométrico fijo el resultado sólo se veía bien cuando el espesor caía en Z;
   si el eje era otro, la separación se iba en escorzo y las capas se encimaban.
   Queda a unos 50° del eje: de frente las capas se tapan, de canto no se ve la cara. */
function viewDirFor(THREE, axis) {
  const d = new THREE.Vector3();
  const others = ['x', 'y', 'z'].filter(k => k !== axis);
  d[axis] = 0.66;
  d[others[0]] = 0.58;
  d[others[1]] = 0.44;
  return d.normalize();
}

/* Genera las tres vistas y las coordenadas de anotación del explosivo. */
function renderViews(THREE, root, pieces, opts) {
  const W = opts.width || 1600;
  const H = opts.height || 1200;
  const aspect = W / H;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0xffffff, 1);

  const out = {};
  try {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const axis = opts.axis || thicknessAxis(size);
    const iso = viewDirFor(THREE, axis);

    /* — Montaje: pieza armada, isométrica — */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    addStudioLights(THREE, scene);
    scene.add(root);
    const cam = new THREE.OrthographicCamera();
    frameOrtho(THREE, cam, box, iso, aspect);
    renderer.render(scene, cam);
    out.montaje = cropToContent(canvas).url;

    /* — Explosivo: piezas separadas sobre el eje de espesor — */
    const ordered = pieces.slice().sort((a, b) => a.center[axis] - b.center[axis]);

    /* La separación se mide contra el TAMAÑO DE CARA de la pieza, no contra su
       dimensión mayor repartida entre los huecos. Antes: 100 cm de ancho × 0.55 / 9
       huecos = 6 cm de separación entre placas de 100 cm — se veían encimadas porque
       lo estaban. Ahora `spread` es el hueco como fracción de la cara, así que no se
       encoge al crecer el número de piezas. */
    const faceSize = Math.max(...['x', 'y', 'z'].filter(k => k !== axis).map(k => size[k]));
    const gap = opts.spread != null ? opts.spread : 0.16;
    let step = faceSize * gap;
    const maxTotal = faceSize * 3.2;   // tope, para que 40 piezas no generen un listón infinito
    if (step * (ordered.length - 1) > maxTotal) step = maxTotal / Math.max(1, ordered.length - 1);
    const mid = (ordered.length - 1) / 2;
    const shifts = new Map();
    ordered.forEach((p, i) => {
      const delta = (i - mid) * step;
      shifts.set(p, delta);
      p.object.position[axis] += delta;
    });
    root.updateMatrixWorld(true);

    const exBox = new THREE.Box3().setFromObject(root);
    const exCam = new THREE.OrthographicCamera();
    frameOrtho(THREE, exCam, exBox, iso, aspect, 1.16);
    renderer.render(scene, exCam);
    const exCrop = cropToContent(canvas);
    out.explosivo = exCrop.url;

    /* Anotaciones: proyectar el centro de cada pieza y reubicar sobre el recorte. */
    out.annotations = ordered.map((p) => {
      const wc = new THREE.Box3().setFromObject(p.object).getCenter(new THREE.Vector3());
      const ndc = wc.clone().project(exCam);
      const m = remapPct((ndc.x + 1) / 2 * 100, (1 - ndc.y) / 2 * 100, exCrop.rect, W, H);
      return { piece: p, x: m.x, y: m.y };
    });

    /* Restaurar posiciones para no dejar el modelo desarmado. */
    ordered.forEach(p => { p.object.position[axis] -= shifts.get(p); });
    root.updateMatrixWorld(true);

    scene.remove(root);

    /* — Plano: silueta del alzado frontal, en Canvas 2D — */
    const segs = silhouetteSegments(THREE, pieces, axis);
    out.plano = renderSilhouette(segs, { width: W, height: H });
    out.silhouette = segs;      // agrupado por pieza — insumo del SVG acotado (Fase 2)
    out.segmentCount = countSegments(segs);

    out.axis = axis;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return out;
}

/* ───────── Nombres → contenido de slides ───────── */

/* Una sola unidad para todo el juego de cotas, elegida por la dimensión mayor.
   Redondear a metros con 2 decimales borraba justo lo que distingue una pieza
   de 5.2 cm de un ensamble de 5.6 cm: en un plano de taller esos 4 mm importan. */
function pickDimUnit(maxCm) {
  if (maxCm >= 300) return { div: 100, suffix: 'm', dec: 3 };
  if (maxCm >= 10) return { div: 1, suffix: 'cm', dec: 1 };
  return { div: 0.1, suffix: 'mm', dec: 0 };
}
function fmtWith(u, cm) { return (cm / u.div).toFixed(u.dec) + ' ' + u.suffix; }

function buildMaterialRows(pieces) {
  const groups = new Map();
  pieces.forEach(p => {
    const key = p.material;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return Array.from(groups.entries())
    .sort((a, b) => {
      const va = a[1].reduce((s, p) => s + p.volume, 0);
      const vb = b[1].reduce((s, p) => s + p.volume, 0);
      return vb - va;
    })
    .map(([material, list], i) => {
      const esp = list.map(p => p.specs.espesorMm).filter(Boolean);
      const cal = list.map(p => p.specs.calibre).filter(Boolean);
      const bits = [`${list.length} ${list.length === 1 ? 'pieza' : 'piezas'}: ${list.map(p => p.name).join(', ')}.`];
      if (esp.length) bits.push(`Espesor declarado: ${Array.from(new Set(esp)).join(' / ')} mm.`);
      if (cal.length) bits.push(`Calibre: ${Array.from(new Set(cal)).join(' / ')}.`);
      return { id: i + 1, material, descripcion: bits.join(' '), asset: null };
    });
}

const MAX_ANNOTATIONS = 8;

/* Las piezas se apilan sobre el eje de espesor, así que sus centros se proyectan muy
   juntos y las viñetas se solapan. Repulsión suave: las separa lo mínimo sin alejarlas
   de su pieza. El diseñador las puede arrastrar después. */
function spreadBullets(points, minDist = 6.5, iterations = 60) {
  const pts = points.map(p => ({ ...p }));
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        const push = (minDist - d) / 2 + 0.01;
        const ux = d < 1e-4 ? Math.cos(i) : dx / d;
        const uy = d < 1e-4 ? Math.sin(i) : dy / d;
        pts[i].x -= ux * push; pts[i].y -= uy * push;
        pts[j].x += ux * push; pts[j].y += uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return pts.map(p => ({
    ...p,
    x: Math.max(3, Math.min(97, p.x)),
    y: Math.max(3, Math.min(97, p.y)),
  }));
}

/* Traduce el resultado del import a parches por plantilla. */
function buildSlidePatches(result) {
  const { pieces, views, unit, itemTitle } = result;
  const f = CM_PER_UNIT[unit];
  const total = result.totalSize;
  const roles = dimensionRoles(total);
  const anchoCm = total[roles.ancho] * f;
  const altoCm = total[roles.alto] * f;
  const fondoCm = total[roles.fondo] * f;

  /* Varias piezas comparten nombre (5 × "Acrílico pintado de 3mm"); el material es
     lo único que las distingue, así que se añade sólo cuando hace falta. */
  const nameCount = {};
  const pairCount = {};
  pieces.forEach(p => {
    nameCount[p.name] = (nameCount[p.name] || 0) + 1;
    const pair = p.name + '|' + p.material;
    pairCount[pair] = (pairCount[pair] || 0) + 1;
  });

  const annotations = spreadBullets((views.annotations || []).slice(0, MAX_ANNOTATIONS))
    .map((a, i) => {
      const pc = a.piece;
      const esp = pc.specs.espesorMm;
      const bits = [pc.name];
      if (nameCount[pc.name] > 1 && pc.material) bits.push(pc.material);
      if (esp) {
        bits.push(`${esp} mm`);
      } else if (pairCount[pc.name + '|' + pc.material] > 1) {
        /* Nombre y material repetidos: el archivo no las distingue.
           Se desempata con el espesor medido de la geometría — el "≈" lo marca
           como medido, no declarado en el nombre. */
        const thin = Math.min(pc.size.x, pc.size.y, pc.size.z) * f * 10;
        bits.push(`≈${thin < 10 ? thin.toFixed(1) : Math.round(thin)} mm`);
      }
      const label = bits.join(' — ');
      return {
        id: i + 1,
        num: String(i + 1).padStart(2, '0'),
        label,
        x: Math.round(a.x * 10) / 10,
        y: Math.round(a.y * 10) / 10,
      };
    });

  const omitted = (views.annotations || []).length - annotations.length;

  /* Borrador del descriptivo. El default de la plantilla habla de madera sólida:
     dejarlo intacto sobre una pieza de acrílico es un error que se puede colar al PDF.
     Aquí sólo se enuncian datos leídos del archivo — la redacción final es Fase 3. */
  const matNames = Array.from(new Set(pieces.map(p => p.material))).filter(m => m && m !== 'Sin material');
  const espesores = Array.from(new Set(pieces.map(p => p.specs.espesorMm).filter(Boolean))).sort((a, b) => a - b);
  const calibres = Array.from(new Set(pieces.map(p => p.specs.calibre).filter(Boolean))).sort((a, b) => a - b);
  const draft = [`Conjunto de ${pieces.length} ${pieces.length === 1 ? 'pieza' : 'piezas'}.`];
  if (matNames.length) draft.push(`Materiales en el modelo: ${matNames.join(', ')}.`);
  if (espesores.length) draft.push(`Espesores declarados: ${espesores.join(' mm, ')} mm.`);
  if (calibres.length) draft.push(`Calibre: ${calibres.join(', ')}.`);
  const u = pickDimUnit(Math.max(anchoCm, altoCm, fondoCm));
  draft.push(`Medidas generales: ${fmtWith(u, anchoCm)} × ${fmtWith(u, altoCm)} × ${fmtWith(u, fondoCm)}.`);
  draft.push('Pendiente de redacción: herrajes, anclaje, tolerancias y procesos de taller.');
  const descripcion = draft.join(' ');

  return {
    cover: { itemTitle },
    montaje: { assetMontaje: views.montaje },
    descriptivo: {
      itemTitle,
      descripcion,
      cotaAncho: fmtWith(u, anchoCm),
      cotaAlto: fmtWith(u, altoCm),
      assetRender: views.montaje,
      assetVector: views.plano,
    },
    explosivo: {
      itemTitle,
      assetExplosivo: views.explosivo,
      annotations,
      observaciones: omitted > 0
        ? `Despiece automático sobre el eje de espesor (${views.axis.toUpperCase()}). ${pieces.length} piezas detectadas; se anotaron las primeras ${annotations.length}. Faltan ${omitted} por revisar.`
        : `Despiece automático sobre el eje de espesor (${views.axis.toUpperCase()}). ${pieces.length} piezas detectadas.`,
    },
    planos: {
      itemTitle,
      assetPlano: views.plano,
      cotas: [
        { id: 1, label: 'Ancho total', value: fmtWith(u, anchoCm) },
        { id: 2, label: 'Altura total', value: fmtWith(u, altoCm) },
        { id: 3, label: 'Profundidad', value: fmtWith(u, fondoCm) },
      ],
    },
    materiales: { itemTitle, materiales: buildMaterialRows(pieces) },
  };
}

/* ───────── Parseo del archivo ───────── */

async function parseFile(file, onProgress) {
  if (onProgress) onProgress('Cargando motor 3D…');
  const { THREE, FBXLoader, OBJLoader } = await loadThree();
  if (onProgress) onProgress('Leyendo geometría…');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let root, detectedUnit = null;

  if (ext === 'fbx') {
    const buf = await file.arrayBuffer();
    detectedUnit = unitFromScale(detectFbxUnitScale(buf));
    root = new FBXLoader().parse(buf, '');
  } else if (ext === 'obj') {
    const text = await file.text();
    root = new OBJLoader().parse(text);
  } else {
    throw new Error(`Formato no soportado: .${ext}. Usa FBX u OBJ.`);
  }

  const pieces = extractPieces(THREE, root);
  if (!pieces.length) throw new Error('El archivo no contiene mallas legibles.');

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return {
    THREE, root, pieces,
    totalSize: { x: size.x, y: size.y, z: size.z },
    detectedUnit,
    triangles: pieces.reduce((s, p) => s + p.triangles, 0),
  };
}

/* ───────── UI ───────── */

const TARGETS = [
  { key: 'cover', label: 'Portada', hint: 'título desde el nombre del archivo' },
  { key: 'montaje', label: 'Montaje', hint: 'render isométrico armado' },
  { key: 'descriptivo', label: 'Descriptivo', hint: 'cotas + render' },
  { key: 'explosivo', label: 'Explosivo', hint: 'despiece + anotaciones' },
  { key: 'planos', label: 'Planos técnicos', hint: 'alzado + cotas' },
  { key: 'materiales', label: 'Materiales y acabados', hint: 'una fila por material' },
];

function Import3DModal({ onClose, onApply, slides }) {
  const [stage, setStage] = useState3('drop'); // drop | working | review | error
  const [msg, setMsg] = useState3('');
  const [error, setError] = useState3('');
  const [parsed, setParsed] = useState3(null);
  const [views, setViews] = useState3(null);
  const [unit, setUnit] = useState3('cm');
  const [spread, setSpread] = useState3(0.16);
  const [axis, setAxis] = useState3(null);   // null = usar la heurística del espesor
  const [hidden, setHidden] = useState3(() => new Set());  // piezas fuera del alzado
  const [fileName, setFileName] = useState3('');
  const [enabled, setEnabled] = useState3(() => {
    const m = {}; TARGETS.forEach(t => { m[t.key] = true; }); return m;
  });
  const inputRef = useRef3(null);

  const present = new Set(slides.map(s => s.template));

  const run = useCallback3(async (file) => {
    setFileName(file.name);
    setStage('working');
    setError('');
    try {
      const p = await parseFile(file, setMsg);
      setParsed(p);
      if (p.detectedUnit) setUnit(p.detectedUnit);
      setMsg('Generando vistas…');
      await new Promise(r => setTimeout(r, 30)); // deja pintar el mensaje
      const v = renderViews(p.THREE, p.root, p.pieces, { spread, axis });
      setViews(v);
      setStage('review');
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setStage('error');
    }
  }, [spread, axis]);

  const regenerate = useCallback3(async (next) => {
    if (!parsed) return;
    setMsg('Regenerando vistas…');
    setStage('working');
    try {
      await new Promise(r => setTimeout(r, 20));
      const v = renderViews(parsed.THREE, parsed.root, parsed.pieces, {
        spread: next && next.spread != null ? next.spread : spread,
        axis: next && next.axis !== undefined ? next.axis : axis,
      });
      setViews(v);
      setStage('review');
    } catch (e) {
      setError(e.message || String(e));
      setStage('error');
    }
  }, [parsed, spread, axis]);

  const pickFile = (file) => {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'fbx' && ext !== 'obj') {
      setError(`Formato no soportado: .${ext}. Usa FBX u OBJ.`);
      setStage('error');
      return;
    }
    run(file);
  };

  /* Segmentos de silueta que aporta cada pieza, para saber quién mete ruido.
     Las tiras LED son 54 contornos diminutos: en el alzado se leen como basura. */
  const segsByPiece = React.useMemo(() => {
    const m = new Map();
    ((views && views.silhouette) || []).forEach(g => m.set(g.piece, g.segments.length));
    return m;
  }, [views]);

  /* Apagar una pieza del alzado sólo filtra grupos y redibuja el canvas: no hay que
     reparsear el archivo ni recalcular la silueta, así que el toggle es instantáneo. */
  const planoUrl = React.useMemo(() => {
    if (!views || !views.silhouette) return views ? views.plano : null;
    const visibles = views.silhouette.filter(g => !hidden.has(g.piece));
    if (!visibles.length) return null;
    return renderSilhouette(visibles, {});
  }, [views, hidden]);

  const togglePiece = (piece) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(piece)) next.delete(piece); else next.add(piece);
      return next;
    });
  };

  const apply = () => {
    const itemTitle = cleanToken(fileName.replace(/\.(fbx|obj)$/i, '')).toUpperCase();
    const patches = buildSlidePatches({
      pieces: parsed.pieces,
      views: { ...views, plano: planoUrl || views.plano },
      unit, totalSize: parsed.totalSize, itemTitle,
    });
    const filtered = {};
    Object.keys(patches).forEach(k => { if (enabled[k] && present.has(k)) filtered[k] = patches[k]; });
    onApply(filtered, parsed.pieces.length);
  };

  const f = CM_PER_UNIT[unit];
  const roles = parsed ? dimensionRoles(parsed.totalSize) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--import3d" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header__title">
            <div className="modal-header__icon"><i className="ti ti-cube-3d-sphere"></i></div>
            <div>
              <h3>Importar 3D</h3>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {fileName || 'FBX u OBJ — se procesa en tu navegador, no se sube a ningún servidor'}
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>

        <div className="modal-body">
          {stage === 'drop' && (
            <div
              className="asset-drop i3d-drop"
              onClick={() => inputRef.current && inputRef.current.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('is-over'); }}
              onDragLeave={e => e.currentTarget.classList.remove('is-over')}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove('is-over');
                pickFile(e.dataTransfer.files[0]);
              }}
            >
              <i className="ti ti-cube-3d-sphere"></i>
              <span className="asset-drop__title">Arrastra el FBX u OBJ de la pieza</span>
              <span className="asset-drop__hint">
                Se leen nombres, materiales y cotas. Los nombres de las mallas son el brief:
                <br />conviene el patrón <code>Funcion_Material_Espesor</code>.
              </span>
              <input ref={inputRef} type="file" accept=".fbx,.obj" style={{ display: 'none' }}
                onChange={e => pickFile(e.target.files[0])} />
            </div>
          )}

          {stage === 'working' && (
            <div className="i3d-working">
              <i className="ti ti-loader-2 i3d-spin"></i>
              <p>{msg}</p>
              <span>Los archivos grandes pueden tardar unos segundos.</span>
            </div>
          )}

          {stage === 'error' && (
            <div className="i3d-error">
              <i className="ti ti-alert-triangle"></i>
              <p>{error}</p>
              <button className="btn btn--ghost" onClick={() => { setStage('drop'); setError(''); }}>
                <i className="ti ti-arrow-left"></i> Probar con otro archivo
              </button>
            </div>
          )}

          {stage === 'review' && parsed && views && (
            <>
              <div className="i3d-summary">
                <div className="i3d-stat">
                  <label>Piezas</label><strong>{parsed.pieces.length}</strong>
                </div>
                <div className="i3d-stat">
                  <label>Triángulos</label><strong>{parsed.triangles.toLocaleString('es-MX')}</strong>
                </div>
                <div className="i3d-stat">
                  <label>Segmentos del alzado</label>
                  <strong>{(views.segmentCount || 0).toLocaleString('es-MX')}</strong>
                </div>
                <div className="i3d-stat i3d-stat--unit">
                  <label>Unidad del archivo</label>
                  <select value={unit} onChange={e => setUnit(e.target.value)}>
                    {Object.keys(CM_PER_UNIT).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  {parsed.detectedUnit && (
                    <span className="i3d-detected" title="Leído de UnitScaleFactor en el FBX">
                      detectado: {parsed.detectedUnit}
                    </span>
                  )}
                </div>
                <div className="i3d-stat">
                  <label>Medidas del conjunto</label>
                  <strong>
                    {(() => {
                      const a = parsed.totalSize[roles.ancho] * f;
                      const b = parsed.totalSize[roles.alto] * f;
                      const c = parsed.totalSize[roles.fondo] * f;
                      const u = pickDimUnit(Math.max(a, b, c));
                      return `${fmtWith(u, a)} × ${fmtWith(u, b)} × ${fmtWith(u, c)}`;
                    })()}
                  </strong>
                </div>
              </div>

              {/* Vistas y lista de piezas EN PARALELO: al apagar una pieza hay que poder
                  ver cómo cambia el alzado en el mismo golpe de vista. */}
              <div className="i3d-review">
                <div className="i3d-views">
                  {['montaje', 'explosivo', 'plano'].map(k => {
                    const src = k === 'plano' ? planoUrl : views[k];
                    return (
                      <figure key={k} className={'i3d-view' + (k === 'plano' ? ' i3d-view--wide' : '')}>
                        {src
                          ? <img src={src} alt={k} />
                          : <div className="i3d-view__empty">Sin piezas visibles</div>}
                        <figcaption>
                          {k === 'plano'
                            ? `Alzado${hidden.size ? ` · ${hidden.size} oculta${hidden.size > 1 ? 's' : ''}` : ''}`
                            : k}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>

                <div className="i3d-section i3d-section--pieces">
                  <div className="i3d-section__head">
                    <h4>Piezas detectadas</h4>
                    {hidden.size > 0 && (
                      <button className="i3d-linkbtn" onClick={() => setHidden(new Set())}>
                        Encender todas
                      </button>
                    )}
                  </div>
                  <p className="i3d-section__hint">
                    Quita la palomita para sacar una pieza del alzado.
                    La columna de la derecha es cuántos segmentos de contorno aporta.
                  </p>
                  <div className="i3d-table">
                    {parsed.pieces.map((p, i) => {
                      const segs = segsByPiece.get(p) || 0;
                      const off = hidden.has(p);
                      return (
                        <label className={'i3d-row' + (off ? ' is-off' : '')} key={i}>
                          <input
                            type="checkbox"
                            checked={!off}
                            onChange={() => togglePiece(p)}
                          />
                          <span className="i3d-row__name">{p.name}</span>
                          <span className="i3d-row__mat">{p.material}</span>
                          <span className="i3d-row__dim">
                            {(p.size.x * f).toFixed(1)} × {(p.size.y * f).toFixed(1)} × {(p.size.z * f).toFixed(1)} cm
                          </span>
                          {p.specs.espesorMm
                            ? <span className="i3d-chip">{p.specs.espesorMm} mm</span>
                            : <span className="i3d-chip i3d-chip--muted" title="El nombre no declara espesor">sin esp.</span>}
                          {p.health && !p.health.clean && (
                            <span
                              className="i3d-chip i3d-chip--bad"
                              title={`Malla no cerrada: ${p.health.over} aristas con 3+ caras, ${p.health.loose} sueltas (de ${p.health.edges}). El contorno del alzado puede salir fragmentado.`}
                            >malla sucia</span>
                          )}
                          <span
                            className="i3d-row__segs"
                            title={`${segs} segmentos de contorno en el alzado.`}
                          >{segs ? segs.toLocaleString('es-MX') : '—'}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="i3d-controls">
                <div className="i3d-spread">
                  <label>Separación del despiece</label>
                  <input type="range" min="0.03" max="0.45" step="0.01" value={spread}
                    onChange={e => setSpread(parseFloat(e.target.value))}
                    onMouseUp={e => regenerate({ spread: parseFloat(e.target.value) })}
                    onTouchEnd={e => regenerate({ spread: parseFloat(e.target.value) })} />
                  <span>{Math.round(spread * 100)}%</span>
                </div>
                <div className="i3d-axis">
                  <label>Eje de despiece</label>
                  <select
                    value={axis || 'auto'}
                    onChange={e => {
                      const v = e.target.value === 'auto' ? null : e.target.value;
                      setAxis(v);
                      regenerate({ axis: v });
                    }}
                  >
                    <option value="auto">Automático ({views.axis.toUpperCase()})</option>
                    <option value="x">X</option>
                    <option value="y">Y</option>
                    <option value="z">Z</option>
                  </select>
                </div>
              </div>

              <div className="i3d-section">
                <h4>Slides que se van a precargar</h4>
                <div className="i3d-targets">
                  {TARGETS.map(t => {
                    const missing = !present.has(t.key);
                    return (
                      <label key={t.key} className={'i3d-target' + (missing ? ' is-missing' : '')}>
                        <input type="checkbox" disabled={missing} checked={!missing && !!enabled[t.key]}
                          onChange={e => setEnabled(s => ({ ...s, [t.key]: e.target.checked }))} />
                        <span className="i3d-target__label">{t.label}</span>
                        <span className="i3d-target__hint">{missing ? 'no existe en este manual' : t.hint}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="i3d-note">
                  <i className="ti ti-info-circle"></i>
                  Sobrescribe el contenido de las slides marcadas. Herrajes, tolerancias,
                  secuencia de montaje y procesos de taller siguen siendo criterio tuyo.
                </p>
              </div>
            </>
          )}
        </div>

        {stage === 'review' && (
          <div className="i3d-footer">
            <button className="btn btn--ghost" onClick={() => { setStage('drop'); setParsed(null); setViews(null); }}>
              <i className="ti ti-arrow-left"></i> Otro archivo
            </button>
            <button className="btn btn--primary" onClick={apply}>
              <i className="ti ti-wand"></i> Precargar slides
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

window.Import3DModal = Import3DModal;
/* Exportado para pruebas y para la Fase 2 (plano acotado vectorial). */
window.Import3DInternals = {
  detectFbxUnitScale, unitFromScale, prettyName, readSpecs, cleanToken,
  thicknessAxis, dimensionRoles, buildMaterialRows, buildSlidePatches, CM_PER_UNIT,
  parseFile, renderViews, extractPieces, frameOrtho,
  silhouetteSegments, renderSilhouette, countSegments, planeAxes, viewDirFor,
  pickDimUnit, fmtWith,
};
