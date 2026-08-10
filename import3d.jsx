/* global React, loadThree */
/* ───────── Importador 3D — Fase 1 ─────────
   Lee un GLB/OBJ en el navegador, extrae nombres, materiales y cotas,
   y precarga las slides Montaje, Descriptivo, Explosivo, Planos y Materiales.
   Three.js entra por import map desde index.html y se carga en diferido, al
   primer uso, vía window.loadThree().                                        */

const { useState: useState3, useRef: useRef3, useCallback: useCallback3 } = React;

/* ───────── Unidades ───────── */

/* cm por unidad de salida. El GLB no necesita elegirla — glTF fija 1 unidad =
   1 metro siempre — pero OBJ no declara escala, así que se deja a mano. */
const CM_PER_UNIT = { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 };

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

/* ───────── Metadatos del addon de Blender ─────────
   Cuando el GLB viene del addon, el dato declarado le gana a lo deducido del
   nombre: el nombre es una convención y los metadatos son una afirmación.

   A diferencia de FBXLoader, GLTFLoader SÍ conserva las custom properties:
   las vuelca tal cual en `userData` a partir de `extras` (spec de glTF), así
   que no hace falta releer el archivo por segunda vez. El addon las escribe
   con el mismo prefijo `mn_` y valor JSON-string que usaba para FBX; sólo
   cambia de dónde se leen. */

/* El nombre CRUDO del nodo, que es la llave con la que el addon lo grabó.
   `obj.name` no sirve: comprobado con GLTFExporter/GLTFLoader (three@0.169) que
   GLTFLoader TAMBIÉN sanitiza espacios a guiones bajos al armar la escena —
   igual que hacía FBXLoader — pero deja el nombre tal cual del glTF en
   `userData.name` antes de sanearlo, así que de ahí se lee. */
function rawObjectName(obj) {
  return (obj.userData && obj.userData.name) || obj.name || '';
}

function jsonSeguro(txt) {
  try {
    const o = JSON.parse(txt);
    return o && typeof o === 'object' ? o : null;
  } catch (e) {
    return null;
  }
}

/* Recorre la escena ya cargada y junta los `mn_meta`/`mn_proyecto` que
   GLTFLoader dejó en `userData` de mallas y materiales. Nunca lanza: sin
   metadatos la app debe seguir funcionando igual que antes. */
function readGlbMeta(root) {
  const materiales = {};
  const objetos = {};
  const avisos = [];
  let proyecto = null;

  const rootUd = (root && root.userData) || {};
  if (rootUd.mn_proyecto && !proyecto) proyecto = jsonSeguro(rootUd.mn_proyecto);
  if (rootUd.proyecto && !proyecto) {
    proyecto = typeof rootUd.proyecto === 'string' ? { nombre: rootUd.proyecto } : rootUd.proyecto;
  }

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const ud = obj.userData || {};
    if (ud.mn_proyecto && !proyecto) proyecto = jsonSeguro(ud.mn_proyecto);
    if (ud.proyecto && !proyecto) {
      proyecto = typeof ud.proyecto === 'string' ? { nombre: ud.proyecto } : ud.proyecto;
    }

    if (ud.mn_meta) {
      const nombre = rawObjectName(obj);
      const meta = nombre && jsonSeguro(ud.mn_meta);
      if (meta) {
        if (ud.usar_explode !== undefined) meta.usar_explode = ud.usar_explode;
        if (ud.explode_vector !== undefined) meta.explode_vector = ud.explode_vector;
        if (ud.explode_dist_cm !== undefined) meta.explode_dist_cm = ud.explode_dist_cm;
        if (objetos[nombre]) avisos.push(`Hay más de un objeto llamado "${nombre}"; se usó el último.`);
        objetos[nombre] = meta;
      }
    } else if (ud.pieza_nombre || ud.pieza_id || ud.material || ud.proceso || ud.capa || ud.usar_explode) {
      const nombre = rawObjectName(obj);
      if (nombre) {
        const meta = {
          nombre: ud.pieza_nombre || nombre,
          pieza_id: ud.pieza_id || '',
          capa: ud.capa || '',
          material: ud.material || '',
          proceso: ud.proceso || '',
          acabado: ud.acabado || '',
          cantidad: typeof ud.cantidad === 'number' ? ud.cantidad : 1,
          incluir: ud.incluir !== false,
          orden_ensamble: ud.orden_ensamble || 0,
          nota_taller: ud.nota_taller || '',
          usar_explode: ud.usar_explode,
          explode_vector: ud.explode_vector,
          explode_dist_cm: ud.explode_dist_cm,
        };
        if (objetos[nombre]) avisos.push(`Hay más de un objeto llamado "${nombre}"; se usó el último.`);
        objetos[nombre] = meta;
      }
    }

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (!mat) return;
      const mud = mat.userData || {};
      if (mud.mn_proyecto && !proyecto) proyecto = jsonSeguro(mud.mn_proyecto);
      if (mud.proyecto && !proyecto) {
        proyecto = typeof mud.proyecto === 'string' ? { nombre: mud.proyecto } : mud.proyecto;
      }
      if (mud.mn_meta && mat.name) {
        const meta = jsonSeguro(mud.mn_meta);
        if (meta) {
          if (materiales[mat.name]) avisos.push(`Hay más de un material llamado "${mat.name}"; se usó el último.`);
          materiales[mat.name] = meta;
        }
      }
    });
  });

  const tieneMetadatos = rootUd.palace_schema === 1 || Object.keys(objetos).length > 0;
  return { materiales, objetos, proyecto, avisos, tieneMetadatos, palaceSchema: rootUd.palace_schema };
}

function metaDeObjeto(meta, obj) {
  if (!meta || !meta.objetos) return null;
  return meta.objetos[rawObjectName(obj)] || null;
}

function metaDeMaterial(meta, mat) {
  if (!meta || !meta.materiales || !mat) return null;
  return meta.materiales[mat.name] || null;
}

function findPieceOwner(obj, root, meta) {
  let curr = obj;
  let candidate = obj;
  while (curr && curr !== root) {
    const ud = curr.userData || {};
    const objName = rawObjectName(curr);
    const hasMeta = (meta && meta.objetos && meta.objetos[objName]);
    if (ud.pieza_id || ud.mn_meta || hasMeta || ud.pieza_nombre) {
      candidate = curr;
      break;
    }
    if (curr.parent && curr.parent !== root) {
      curr = curr.parent;
    } else {
      break;
    }
  }
  return candidate;
}

function extractPieces(THREE, root, meta) {
  const pieces = [];
  const excluidas = [];
  const piecesByOwner = new Map();

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const owner = findPieceOwner(obj, root, meta);
    const objMeta = metaDeObjeto(meta, owner) || metaDeObjeto(meta, obj);

    /* Marcado como helper en Blender: fuera de la lista Y fuera de los renders. */
    if (objMeta && objMeta.incluir === false) {
      obj.visible = false;
      const n = prettyName(rawObjectName(owner)) || prettyName(rawObjectName(obj));
      if (!excluidas.includes(n)) excluidas.push(n);
      return;
    }
    obj.visible = true;

    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;

    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const matMeta = metaDeMaterial(meta, mat);
    const tris = obj.geometry.index
      ? obj.geometry.index.count / 3
      : (obj.geometry.attributes.position ? obj.geometry.attributes.position.count / 3 : 0);

    const ownerKey = owner.id || owner.uuid || rawObjectName(owner);

    if (piecesByOwner.has(ownerKey)) {
      const existing = piecesByOwner.get(ownerKey);
      existing.triangles += Math.round(tris);
      existing.meshObjects.push(obj);
      return;
    }

    const ownerBox = new THREE.Box3().setFromObject(owner);
    const size = ownerBox.getSize(new THREE.Vector3());
    const center = ownerBox.getCenter(new THREE.Vector3());

    const specs = readSpecs(cleanToken(owner.name || obj.name) + ' ' + cleanToken((mat && mat.name) || ''));
    if (matMeta && matMeta.espesor_mm) specs.espesorMm = matMeta.espesor_mm;
    if (matMeta && matMeta.calibre) specs.calibre = matMeta.calibre;

    const entry = {
      rawName: owner.name || obj.name || '',
      rawMaterial: (mat && mat.name) || '',
      name: (objMeta && objMeta.nombre) || prettyName(owner.name || obj.name),
      material: (matMeta && matMeta.nombre) || prettyName((mat && mat.name) || 'Sin material'),
      cantidad: (objMeta && objMeta.cantidad) || 1,
      meta: objMeta || null,
      matMeta: matMeta || null,
      specs,
      size: { x: size.x, y: size.y, z: size.z },
      center: { x: center.x, y: center.y, z: center.z },
      volume: size.x * size.y * size.z,
      triangles: Math.round(tris),
      health: checkManifold(THREE, obj),
      object: owner,
      meshObjects: [obj],
    };

    piecesByOwner.set(ownerKey, entry);
    pieces.push(entry);
  });
  return { pieces, excluidas };
}

/* Caja del conjunto, contando SÓLO las piezas del manual.
   `Box3.setFromObject(root)` incluye a los descendientes invisibles, así que un
   helper apagado se colaría en las cotas y en el encuadre de la cámara. */
function boxOfPieces(THREE, pieces) {
  const box = new THREE.Box3();
  pieces.forEach(p => box.expandByObject(p.object));
  return box;
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

/* ───────── Silueta del alzado frontal ───────── */

function planeAxes(axis) {
  if (axis === 'z') return { h: 'x', v: 'y' };
  if (axis === 'y') return { h: 'x', v: 'z' };
  return { h: 'z', v: 'y' };
}

function silhouetteSegments(THREE, pieces, axis, faceThresholdDeg = 18) {
  const { h, v } = planeAxes(axis);
  const cosLimit = Math.cos((faceThresholdDeg * Math.PI) / 180);
  const Q = 1000;
  const q = n => Math.round(n * Q);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3();

  /* 1. Detectar si la cara frontal apunta hacia +axis o -axis */
  let sumAxisNrm = 0;
  pieces.forEach(piece => {
    const geo = piece.object.geometry;
    const pos = geo.attributes && geo.attributes.position;
    if (!pos) return;
    const idx = geo.index;
    const count = idx ? idx.count : pos.count;
    const m = piece.object.matrixWorld;
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
      if (len > 1e-9) sumAxisNrm += nrm[axis] / len;
    }
  });

  const viewDirSign = sumAxisNrm < 0 ? -1 : 1;
  const view = new THREE.Vector3(); view[axis] = viewDirSign;

  const groups = [];

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
      if (len < 1e-9) continue;
      nrm.divideScalar(len);

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
    const box = boxOfPieces(THREE, pieces);
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

    /* — Explosivo: despiece con contrato u orientación radial idéntica a JARVIS viewer — */
    const ordered = pieces.slice().sort((a, b) => a.center[axis] - b.center[axis]);
    const cajaTotal = boxOfPieces(THREE, pieces);
    const centroTotal = cajaTotal.getCenter(new THREE.Vector3());

    const faceSize = Math.max(...['x', 'y', 'z'].filter(k => k !== axis).map(k => size[k]));
    const gap = opts.spread != null ? opts.spread : 0.16;
    let step = faceSize * gap;
    const maxTotal = faceSize * 3.2;   // tope, para que 40 piezas no generen un listón infinito
    if (step * (ordered.length - 1) > maxTotal) step = maxTotal / Math.max(1, ordered.length - 1);
    const mid = (ordered.length - 1) / 2;
    const shifts = new Map();
    ordered.forEach((p, i) => {
      const shiftVec = new THREE.Vector3();
      const m = p.meta || {};
      const ud = (p.object && p.object.userData) || {};
      const usarExplode = m.usar_explode !== undefined ? m.usar_explode : (ud.usar_explode !== undefined ? ud.usar_explode : (m.explode_vector != null || ud.explode_vector != null));
      const v = m.explode_vector || ud.explode_vector || null;
      const distCm = m.explode_dist_cm !== undefined ? m.explode_dist_cm : (ud.explode_dist_cm !== undefined ? ud.explode_dist_cm : null);

      if (usarExplode || distCm !== null || (Array.isArray(v) && v.length === 3)) {
        const dCm = distCm != null ? distCm : 25;
        if (dCm === 0) {
          // Estática (0 cm): no se desplaza en absoluto
          shiftVec.set(0, 0, 0);
        } else {
          const distM = dCm / 100;
          const vArr = v || [0, 0, 0];
          const dir = new THREE.Vector3(vArr[0] || 0, vArr[2] || 0, -(vArr[1] || 0));
          if (dir.lengthSq() > 0) dir.normalize();
          shiftVec.copy(dir).multiplyScalar(distM);
        }
      } else {
        const _pBox = new THREE.Box3().setFromObject(p.object);
        const dir = _pBox.getCenter(new THREE.Vector3()).sub(centroTotal);
        if (dir.lengthSq() < 1e-10) dir.set(0, 1, 0);
        dir.normalize();

        const distM = (step * (Math.abs(i - mid) + 1)) * 0.8;
        shiftVec.copy(dir).multiplyScalar(distM);
      }

      /* Transformar la dirección del vector al espacio LOCAL del padre del objeto
         para que la rotación o parenting en Blender no distorsione el despiece */
      if (p.object && p.object.parent) {
        p.object.parent.updateWorldMatrix(true, false);
        const invParentRot = new THREE.Matrix3().setFromMatrix4(p.object.parent.matrixWorld).invert();
        shiftVec.applyMatrix3(invParentRot);
      }

      shifts.set(p, shiftVec);
      p.object.position.add(shiftVec);
    });
    root.updateMatrixWorld(true);

    const exBox = boxOfPieces(THREE, pieces);
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
    ordered.forEach(p => { p.object.position.sub(shifts.get(p)); });
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
      const mm = list.find(p => p.matMeta) ? list.find(p => p.matMeta).matMeta : null;

      let descripcion;
      let fuente = 'nombres';
      if (mm && mm.descripcion) {
        /* Escrita a mano en Blender: se respeta tal cual. Quien la escribió sabe
           más que cualquier redacción automática. */
        descripcion = mm.descripcion;
        fuente = 'blender';
      } else {
        /* Sin descripción, se enuncian los datos capturados. Nunca se inventa:
           redactar de verdad es trabajo del panel de IA. */
        const bits = [];
        if (mm) {
          if (mm.acabado) bits.push(`Acabado: ${mm.acabado}.`);
          if (mm.color) bits.push(`Color: ${mm.color}.`);
          if (mm.proceso) bits.push(`Proceso: ${mm.proceso}.`);
          if (mm.proveedor) bits.push(`Proveedor: ${mm.proveedor}.`);
          if (mm.notas) bits.push(mm.notas.replace(/\.?$/, '.'));
          if (bits.length) fuente = 'metadatos';
        }
        /* Espesor y calibre van con los demás datos del material; la frase de
           piezas cierra. Al revés quedaba "Proceso: … 1 pieza: … Calibre: 20". */
        if (esp.length) bits.push(`Espesor declarado: ${Array.from(new Set(esp)).join(' / ')} mm.`);
        if (cal.length) bits.push(`Calibre: ${Array.from(new Set(cal)).join(' / ')}.`);
        bits.push(`${list.length} ${list.length === 1 ? 'pieza' : 'piezas'}: ${list.map(p => p.name).join(', ')}.`);
        descripcion = bits.join(' ');
      }

      return {
        id: i + 1,
        material,
        descripcion,
        asset: null,
        /* Insumo del panel de IA: los campos crudos y las piezas del grupo, para
           poder rearmar el prompt sin volver a parsear el GLB. */
        _meta: mm || null,
        _fuente: fuente,
        _piezas: list.map(p => p.name),
      };
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
  const { pieces, views, unit, itemTitle, meta } = result;
  const proy = (meta && meta.proyecto) || null;
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
  /* Lo capturado en el addon: dicho, no interpretado. */
  if (proy && proy.ubicacion) draft.push(`Montaje: ${proy.ubicacion.replace(/\.?$/, '.')}`);
  if (proy && proy.iluminado) draft.push('Pieza iluminada.');
  if (proy && proy.notas) draft.push(proy.notas.replace(/\.?$/, '.'));
  draft.push('Pendiente de redacción: herrajes, anclaje, tolerancias y procesos de taller.');
  const descripcion = draft.join(' ');

  /* El nombre de proyecto capturado en Blender le gana al nombre del archivo:
     "Letra R — Palace" describe mejor que "LETRA_R". */
  const titulo = (proy && proy.proyecto) || itemTitle;

  return {
    cover: { itemTitle: titulo },
    montaje: { assetMontaje: views.montaje },
    descriptivo: {
      itemTitle: titulo,
      descripcion,
      cotaAncho: fmtWith(u, anchoCm),
      cotaAlto: fmtWith(u, altoCm),
      assetRender: views.montaje,
      assetVector: views.plano,
    },
    explosivo: {
      itemTitle: titulo,
      assetExplosivo: views.explosivo,
      annotations,
      observaciones: omitted > 0
        ? `Despiece automático sobre el eje de espesor (${views.axis.toUpperCase()}). ${pieces.length} piezas detectadas; se anotaron las primeras ${annotations.length}. Faltan ${omitted} por revisar.`
        : `Despiece automático sobre el eje de espesor (${views.axis.toUpperCase()}). ${pieces.length} piezas detectadas.`,
    },
    planos: {
      itemTitle: titulo,
      assetPlano: views.plano,
      cotas: [
        { id: 1, label: 'Ancho total', value: fmtWith(u, anchoCm) },
        { id: 2, label: 'Altura total', value: fmtWith(u, altoCm) },
        { id: 3, label: 'Profundidad', value: fmtWith(u, fondoCm) },
      ],
    },
    materiales: { itemTitle: titulo, materiales: buildMaterialRows(pieces) },
  };
}

/* ───────── Parseo del archivo ───────── */

async function parseFile(file, onProgress) {
  if (onProgress) onProgress('Cargando motor 3D…');
  const { THREE, GLTFLoader, OBJLoader, DRACOLoader } = await loadThree();
  if (onProgress) onProgress('Leyendo geometría…');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let root, detectedUnit = null, meta = null;

  if (ext === 'glb') {
    const buf = await file.arrayBuffer();
    detectedUnit = 'm';   // glTF fija 1 unidad = 1 metro siempre, por spec
    const gltf = await new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      if (DRACOLoader) {
        const draco = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(draco);
      }
      loader.parse(buf, '', resolve, reject);
    });
    root = gltf.scene;
    /* GLTFLoader ya deja los `extras` del addon en `userData` al parsear,
       así que los metadatos se leen recorriendo la escena, no el buffer. */
    meta = readGlbMeta(root);
  } else if (ext === 'obj') {
    const text = await file.text();
    root = new OBJLoader().parse(text);
  } else {
    throw new Error(`Formato no soportado: .${ext}. Usa GLB u OBJ.`);
  }

  const { pieces, excluidas } = extractPieces(THREE, root, meta);
  if (!pieces.length) {
    throw new Error(excluidas.length
      ? `Las ${excluidas.length} mallas del archivo están marcadas como "no es pieza del manual" en Blender.`
      : 'El archivo no contiene mallas legibles.');
  }

  /* Sobre las piezas, NO sobre `root`: Box3.setFromObject no mira `visible`,
     así que un helper apagado seguiría inflando las medidas del conjunto. */
  const size = boxOfPieces(THREE, pieces).getSize(new THREE.Vector3());
  return {
    THREE, root, pieces, meta, excluidas,
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
  /* Redacciones de IA aceptadas, por material. Se guardan aparte de las filas
     para que regenerar las vistas no borre lo que ya se aprobó. */
  const [descIA, setDescIA] = useState3({});
  const [iaBusy, setIaBusy] = useState3(null);      // nombre del material en curso
  const [iaError, setIaError] = useState3('');
  const [verPrompt, setVerPrompt] = useState3(null); // { titulo, texto }
  const [renderIA, setRenderIA] = useState3(null);
  const [renderBusy, setRenderBusy] = useState3(false);
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
    if (ext !== 'glb' && ext !== 'obj') {
      setError(`Formato no soportado: .${ext}. Usa GLB u OBJ.`);
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

  /* Filas de material tal como quedarían en la slide, para poder revisarlas —
     y redactarlas — antes de aplicar. */
  const matRows = React.useMemo(
    () => (parsed ? buildMaterialRows(parsed.pieces) : []),
    [parsed]
  );
  const proyecto = (parsed && parsed.meta && parsed.meta.proyecto) || null;

  const pedirDescripcion = async (row) => {
    setIaBusy(row.material);
    setIaError('');
    try {
      const prompt = window.AIPrompts.buildDescribePrompt(row, proyecto);
      const r = await fetch('/api/ai/describe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.mensaje || data.error || `HTTP ${r.status}`);
      setDescIA(prev => ({ ...prev, [row.material]: data.texto }));
    } catch (e) {
      setIaError(e.message || String(e));
    } finally {
      setIaBusy(null);
    }
  };

  const pedirRender = async () => {
    setRenderBusy(true);
    setIaError('');
    try {
      const prompt = window.AIPrompts.buildRenderPrompt(matRows, proyecto);
      const base = await window.AIImage.normalizar(views.montaje, 1024);
      const r = await fetch('/api/ai/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, imagen: base }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.mensaje || data.error || `HTTP ${r.status}`);
      setRenderIA(data.imagen);
    } catch (e) {
      setIaError(e.message || String(e));
    } finally {
      setRenderBusy(false);
    }
  };

  const togglePiece = (piece) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(piece)) next.delete(piece); else next.add(piece);
      return next;
    });
  };

  const apply = () => {
    const itemTitle = cleanToken(fileName.replace(/\.(glb|obj)$/i, '')).toUpperCase();
    const patches = buildSlidePatches({
      pieces: parsed.pieces,
      views: { ...views, plano: planoUrl || views.plano },
      unit, totalSize: parsed.totalSize, itemTitle,
      meta: parsed.meta,
    });

    /* Las redacciones aprobadas ganan, y los campos internos (_meta, _piezas)
       NO se aplican: sirvieron para armar el prompt y de ahí en adelante sólo
       engordarían el manual guardado en D1. */
    if (patches.materiales) {
      patches.materiales.materiales = patches.materiales.materiales.map(r => {
        const { _meta, _fuente, _piezas, ...limpia } = r;
        return { ...limpia, descripcion: descIA[r.material] || r.descripcion };
      });
    }
    /* El render con IA sustituye al prerender en las slides que muestran la
       pieza armada. El plano y el explosivo se quedan con el técnico: ahí la
       fidelidad geométrica es el punto. */
    if (renderIA) {
      if (patches.montaje) patches.montaje.assetMontaje = renderIA;
      if (patches.descriptivo) patches.descriptivo.assetRender = renderIA;
    }

    const filtered = {};
    Object.keys(patches).forEach(k => { if (enabled[k] && present.has(k)) filtered[k] = patches[k]; });

    /* El contexto para renderizar con IA se guarda en el manual, no en el modal:
       el botón de la slide sigue existiendo mañana, cuando este import ya se
       cerró y el manual se abrió de nuevo desde la base de datos. */
    const aiMeta = {
      proyecto,
      materiales: matRows.map(r => ({
        material: r.material,
        _meta: r._meta,
      })),
    };

    onApply(filtered, parsed.pieces.length, aiMeta);
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
                {fileName || 'GLB u OBJ — el modelo se procesa en tu navegador y no se sube; '
                  + 'sólo el render y los datos del material salen, y sólo si pides IA'}
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
              <span className="asset-drop__title">Arrastra el GLB u OBJ de la pieza</span>
              <span className="asset-drop__hint">
                Se leen nombres, materiales y cotas. Los nombres de las mallas son el brief:
                <br />conviene el patrón <code>Funcion_Material_Espesor</code>.
              </span>
              <input ref={inputRef} type="file" accept=".glb,.obj" style={{ display: 'none' }}
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
                    <span className="i3d-detected" title="glTF fija 1 unidad = 1 metro, siempre">
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

              {/* Estado de los metadatos del addon. Va arriba y en grande porque es
                  lo primero que hay que saber: si no llegaron, todo lo de abajo se
                  está deduciendo de nombres y conviene enterarse antes de aplicar. */}
              {(() => {
                const m = parsed.meta;
                const nMat = m ? Object.keys(m.materiales || {}).length : 0;
                const nObj = m ? Object.keys(m.objetos || {}).length : 0;
                const proy = (m && m.proyecto) || null;
                const avisos = (m && m.avisos) || [];
                const excluidas = parsed.excluidas || [];

                if (!nMat && !nObj && !proy) {
                  return (
                    <div className="i3d-meta i3d-meta--none">
                      <i className="ti ti-info-circle"></i>
                      <div>
                        <strong>Este archivo no trae metadatos de manual.</strong>
                        <span>
                          Todo lo de abajo se está deduciendo de los nombres de mallas y
                          materiales. Para describir materiales, exporta a GLB desde Blender
                          con el addon (con "Custom Properties" activado en el exportador).
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="i3d-meta">
                    <div className="i3d-meta__head">
                      <i className="ti ti-database-cog"></i>
                      <strong>Metadatos del addon</strong>
                      <span className="i3d-meta__counts">
                        {nMat} {nMat === 1 ? 'material' : 'materiales'} · {nObj} {nObj === 1 ? 'pieza' : 'piezas'} descritas
                      </span>
                    </div>
                    {proy && (
                      <dl className="i3d-meta__grid">
                        {proy.proyecto && <><dt>Proyecto</dt><dd>{proy.proyecto}</dd></>}
                        {proy.cliente && <><dt>Cliente</dt><dd>{proy.cliente}</dd></>}
                        {proy.ubicacion && <><dt>Montaje</dt><dd>{proy.ubicacion}</dd></>}
                        {proy.iluminado && <><dt>Iluminación</dt><dd>Pieza iluminada</dd></>}
                        {proy.estilo_render && <><dt>Estilo de render</dt><dd>{proy.estilo_render}</dd></>}
                      </dl>
                    )}
                    {excluidas.length > 0 && (
                      <p className="i3d-meta__note">
                        <i className="ti ti-eye-off"></i>
                        Fuera del manual por marca en Blender: {excluidas.join(', ')}.
                        No entran en la lista ni en los renders.
                      </p>
                    )}
                    {avisos.map((a, i) => (
                      <p key={i} className="i3d-meta__note i3d-meta__note--warn">
                        <i className="ti ti-alert-triangle"></i>{a}
                      </p>
                    ))}
                  </div>
                );
              })()}

              {/* Vistas y lista de piezas EN PARALELO: al apagar una pieza hay que poder
                  ver cómo cambia el alzado en el mismo golpe de vista. */}
              <div className="i3d-review">
                <div className="i3d-views">
                  {['montaje', 'explosivo', 'plano'].map(k => {
                    const src = k === 'plano' ? planoUrl : (k === 'montaje' && renderIA ? renderIA : views[k]);
                    return (
                      <figure key={k} className={'i3d-view' + (k === 'plano' ? ' i3d-view--wide' : '')}>
                        {src
                          ? <img src={src} alt={k} />
                          : <div className="i3d-view__empty">Sin piezas visibles</div>}
                        {/* Sólo sobre el montaje: es la única vista donde una
                            imagen generada aporta algo. En el alzado y el
                            explosivo la fidelidad geométrica ES el contenido. */}
                        {k === 'montaje' && (
                          <div className="i3d-view__ai">
                            <button
                              className="i3d-aibtn"
                              disabled={renderBusy}
                              onClick={pedirRender}
                              title="Recrea esta imagen como foto realista, con los materiales de los metadatos"
                            >
                              {renderBusy
                                ? <><i className="ti ti-loader-2 i3d-spin"></i> Renderizando…</>
                                : <><i className="ti ti-sparkles"></i> {renderIA ? 'Renderizar otra vez' : 'Renderizar con IA'}</>}
                            </button>
                            <button
                              className="i3d-aibtn i3d-aibtn--ghost"
                              onClick={() => setVerPrompt({
                                titulo: 'Prompt del render',
                                texto: window.AIPrompts.buildRenderPrompt(matRows, proyecto),
                              })}
                              title="Ver el prompt exacto que se enviaría"
                            ><i className="ti ti-eye"></i></button>
                            {renderIA && (
                              <button
                                className="i3d-aibtn i3d-aibtn--ghost"
                                onClick={() => setRenderIA(null)}
                                title="Volver al prerender técnico"
                              ><i className="ti ti-arrow-back-up"></i></button>
                            )}
                          </div>
                        )}
                        <figcaption>
                          {k === 'plano'
                            ? `Alzado${hidden.size ? ` · ${hidden.size} oculta${hidden.size > 1 ? 's' : ''}` : ''}`
                            : (k === 'montaje' && renderIA ? 'Montaje · imagen generada con IA' : k)}
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
                          {/* Los chips van juntos en UNA celda del grid: son
                              condicionales, y sueltos empujaban la columna de
                              segmentos a una posición distinta en cada fila. */}
                          <span className="i3d-row__chips">
                            {p.specs.espesorMm
                              ? <span className="i3d-chip">{p.specs.espesorMm} mm</span>
                              : <span className="i3d-chip i3d-chip--muted" title="El nombre no declara espesor">sin esp.</span>}
                            {p.matMeta && (
                              <span
                                className="i3d-chip i3d-chip--meta"
                                title={'Metadatos del material:\n' + Object.keys(p.matMeta)
                                  .filter(k => k !== 'v' && k !== 'tipo' && k !== 'blender_nombre')
                                  .map(k => `· ${k}: ${p.matMeta[k]}`).join('\n')}
                              >{p.matMeta.descripcion ? 'descrito' : 'con datos'}</span>
                            )}
                            {p.health && !p.health.clean && (
                              <span
                                className="i3d-chip i3d-chip--bad"
                                title={`Malla no cerrada: ${p.health.over} aristas con 3+ caras, ${p.health.loose} sueltas (de ${p.health.edges}). El contorno del alzado puede salir fragmentado.`}
                              >malla sucia</span>
                            )}
                          </span>
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

              {/* Descripciones de material: lo que va a quedar escrito en la
                  slide, revisable ANTES de aplicar. Es también el lugar donde
                  se ve si los campos capturados en Blender alcanzaron. */}
              <div className="i3d-section">
                <div className="i3d-section__head">
                  <h4>Descripciones de material</h4>
                  {Object.keys(descIA).length > 0 && (
                    <button className="i3d-linkbtn" onClick={() => setDescIA({})}>
                      Descartar las redacciones de IA
                    </button>
                  )}
                </div>
                {iaError && (
                  <p className="i3d-ai-error">
                    <i className="ti ti-alert-triangle"></i>
                    {iaError}
                    <span> Puedes ver el prompt con el ojo y pegarlo en AI Studio a mano.</span>
                  </p>
                )}
                <div className="i3d-mats">
                  {matRows.map(row => {
                    const texto = descIA[row.material] || row.descripcion;
                    const deIA = !!descIA[row.material];
                    return (
                      <div className="i3d-mat" key={row.material}>
                        <div className="i3d-mat__head">
                          <strong>{row.material}</strong>
                          <span className={'i3d-chip i3d-chip--' + (
                            deIA ? 'meta' : (row._fuente === 'blender' ? 'meta' : (row._fuente === 'metadatos' ? '' : 'muted'))
                          )}>
                            {deIA ? 'redactado con IA'
                              : row._fuente === 'blender' ? 'escrito en Blender'
                              : row._fuente === 'metadatos' ? 'armado con metadatos'
                              : 'sólo nombres'}
                          </span>
                          <button
                            className="i3d-aibtn"
                            disabled={iaBusy === row.material}
                            onClick={() => pedirDescripcion(row)}
                          >
                            {iaBusy === row.material
                              ? <><i className="ti ti-loader-2 i3d-spin"></i> Redactando…</>
                              : <><i className="ti ti-sparkles"></i> {deIA ? 'Otra vez' : 'Redactar con IA'}</>}
                          </button>
                          <button
                            className="i3d-aibtn i3d-aibtn--ghost"
                            onClick={() => setVerPrompt({
                              titulo: `Prompt · ${row.material}`,
                              texto: window.AIPrompts.buildDescribePrompt(row, proyecto),
                            })}
                            title="Ver el prompt exacto que se enviaría"
                          ><i className="ti ti-eye"></i></button>
                        </div>
                        <p className="i3d-mat__desc">{texto}</p>
                      </div>
                    );
                  })}
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

        {/* Ver el prompt sirve para dos cosas: juzgar si los metadatos alcanzan
            antes de gastar una llamada, y copiarlo a AI Studio a mano cuando no
            hay API key configurada. */}
        {verPrompt && (
          <div className="i3d-prompt" onClick={() => setVerPrompt(null)}>
            <div className="i3d-prompt__card" onClick={e => e.stopPropagation()}>
              <div className="i3d-prompt__head">
                <strong>{verPrompt.titulo}</strong>
                <button
                  className="i3d-aibtn i3d-aibtn--ghost"
                  onClick={() => navigator.clipboard && navigator.clipboard.writeText(verPrompt.texto)}
                  title="Copiar para pegarlo en AI Studio"
                ><i className="ti ti-copy"></i> Copiar</button>
                <button className="modal-close-btn" onClick={() => setVerPrompt(null)}>
                  <i className="ti ti-x"></i>
                </button>
              </div>
              <pre>{verPrompt.texto}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.Import3DModal = Import3DModal;
/* Exportado para pruebas y para la Fase 2 (plano acotado vectorial). */
window.Import3DInternals = {
  readGlbMeta, prettyName, readSpecs, cleanToken,
  thicknessAxis, dimensionRoles, buildMaterialRows, buildSlidePatches, CM_PER_UNIT,
  parseFile, renderViews, extractPieces, frameOrtho,
  silhouetteSegments, renderSilhouette, countSegments, planeAxes, viewDirFor,
  pickDimUnit, fmtWith,
};
