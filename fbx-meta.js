/* ───────── Lector de metadatos del FBX ─────────
   Lee las custom properties que escribe el addon de Blender (blender-addon/
   manual_meta.py) y que FBXLoader tira a la basura.

   Por qué hace falta: FBXLoader de three.js parsea el árbol FBX completo pero
   sólo expone lo que necesita para armar la escena — transformData,
   originalName y unitScaleFactor. Cualquier propiedad de usuario se pierde.
   Así que aquí se recorre el mismo archivo por segunda vez, en paralelo, y se
   saca únicamente lo que interesa.

   Es baratísimo a pesar de sonar caro: sólo se leen cabeceras de nodo y strings.
   Los arrays de geometría — que son el 99% del archivo y lo único comprimido —
   se saltan por longitud, sin descomprimir nada.

   Cómo casan las llaves con lo que entrega FBXLoader:
     · materiales → `material.name`, que FBXLoader copia crudo del attrName.
     · objetos    → `obj.userData.originalName`, crudo. NO `obj.name`, que pasa
                    por sanitizeNodeName y convierte los espacios en guiones
                    bajos ("Letra de canal" → "Letra_de_canal").
   Los strings del FBX binario se truncan en el primer byte nulo, igual que hace
   BinaryReader.getString de FBXLoader, para que las llaves sean idénticas.     */

(function () {
  'use strict';

  const MAGIC = 'Kaydara FBX Binary';
  const PREFIJO = 'mn_';          // debe coincidir con el addon
  const CLAVE_META = 'mn_meta';
  const CLAVE_PROYECTO = 'mn_proyecto';

  const utf8 = new TextDecoder('utf-8');

  /* Los offsets y longitudes crecen a 64 bits desde la versión 7500. */
  function lector(buffer) {
    const dv = new DataView(buffer);
    return {
      dv,
      u8: new Uint8Array(buffer),
      size: buffer.byteLength,
      wide: false,
      /* Los tamaños reales de archivo caben de sobra en un Number. */
      largo(o) { return this.wide ? Number(this.dv.getBigUint64(o, true)) : this.dv.getUint32(o, true); },
      anchoLargo() { return this.wide ? 8 : 4; },
      cadena(o, len) {
        const fin = this.u8.subarray(o, o + len);
        const nulo = fin.indexOf(0);
        return utf8.decode(nulo >= 0 ? fin.subarray(0, nulo) : fin);
      },
    };
  }

  /* Lee una propiedad y devuelve { valor, siguiente }. Sólo interesan los
     strings; de lo demás basta con saber cuánto ocupa para poder saltarlo. */
  function propiedad(r, o) {
    const tipo = String.fromCharCode(r.u8[o]);
    o += 1;
    switch (tipo) {
      case 'C': return { valor: r.u8[o] !== 0, siguiente: o + 1 };
      case 'Y': return { valor: r.dv.getInt16(o, true), siguiente: o + 2 };
      case 'I': return { valor: r.dv.getInt32(o, true), siguiente: o + 4 };
      case 'F': return { valor: r.dv.getFloat32(o, true), siguiente: o + 4 };
      case 'D': return { valor: r.dv.getFloat64(o, true), siguiente: o + 8 };
      case 'L': return { valor: Number(r.dv.getBigInt64(o, true)), siguiente: o + 8 };
      case 'S': {
        const len = r.dv.getUint32(o, true);
        return { valor: r.cadena(o + 4, len), siguiente: o + 4 + len };
      }
      case 'R': {
        const len = r.dv.getUint32(o, true);
        return { valor: null, siguiente: o + 4 + len };
      }
      /* Arrays: longitud, codificación y bytes ya comprimidos. Se salta el
         payload entero — nunca hay metadatos ahí. */
      case 'f': case 'd': case 'l': case 'i': case 'b': {
        const comprimido = r.dv.getUint32(o + 8, true);
        return { valor: null, siguiente: o + 12 + comprimido };
      }
      default:
        /* Tipo desconocido: no se puede saber cuánto ocupa, así que no se puede
           seguir leyendo este nivel sin inventar. Se aborta y quien llama decide. */
        return null;
    }
  }

  /* Lee un nodo. `interesa(nombre)` decide si vale la pena bajar a sus hijos;
     devolver false salta el subárbol de un brinco. Con eso, Geometry —que es
     casi todo el archivo— cuesta cero. */
  function nodo(r, o, interesa) {
    const w = r.anchoLargo();
    const fin = r.largo(o);
    const numProps = r.largo(o + w);
    const largoProps = r.largo(o + w * 2);
    const largoNombre = r.u8[o + w * 3];
    /* Registro nulo: marca el final de una lista de hijos. */
    if (fin === 0) return { nulo: true, fin: o + w * 3 + 1 };

    let c = o + w * 3 + 1;
    const nombre = r.cadena(c, largoNombre);
    c += largoNombre;

    const props = [];
    const finProps = c + largoProps;
    for (let i = 0; i < numProps; i++) {
      const p = propiedad(r, c);
      if (!p) return { nombre, props, hijos: [], fin };   // tipo raro: se corta aquí
      props.push(p.valor);
      c = p.siguiente;
    }
    c = finProps;   // la longitud declarada manda sobre lo que se sumó

    const hijos = [];
    if (interesa(nombre) && c < fin) {
      while (c < fin) {
        const h = nodo(r, c, interesa);
        if (!h) break;
        if (h.nulo) { c = h.fin; break; }
        hijos.push(h);
        if (h.fin <= c) break;    // sin avance: archivo corrupto, no colgarse
        c = h.fin;
      }
    }
    return { nombre, props, hijos, fin };
  }

  /* Extrae de un nodo Material/Model sus custom properties con nuestro prefijo.
     En FBX cada propiedad de usuario es un nodo P con la forma
     [nombre, tipo, label, flags, valor]. */
  function propsDeUsuario(n) {
    const out = {};
    const p70 = n.hijos.find(h => h.nombre === 'Properties70');
    if (!p70) return out;
    p70.hijos.forEach(p => {
      if (p.nombre !== 'P') return;
      const clave = p.props[0];
      if (typeof clave !== 'string' || clave.indexOf(PREFIJO) !== 0) return;
      const valor = p.props.length > 4 ? p.props[4] : null;
      if (typeof valor === 'string') out[clave] = valor;
    });
    return out;
  }

  function jsonSeguro(txt) {
    try {
      const o = JSON.parse(txt);
      return o && typeof o === 'object' ? o : null;
    } catch (e) {
      return null;
    }
  }

  /* Devuelve { materiales, objetos, proyecto, avisos } o null si el archivo no
     es un FBX binario legible. Nunca lanza: sin metadatos la app debe seguir
     funcionando igual que antes, y este lector es opcional por definición. */
  function readFbxMeta(buffer) {
    const avisos = [];
    try {
      const r = lector(buffer);
      if (r.size < 32) return null;
      if (r.cadena(0, MAGIC.length) !== MAGIC) {
        /* FBX ASCII u otro formato: el addon exporta binario, así que esto sólo
           pasa si el archivo se re-exportó desde otra herramienta. */
        return { materiales: {}, objetos: {}, proyecto: null, avisos: ['El FBX no es binario; no se pueden leer los metadatos.'] };
      }
      const version = r.dv.getUint32(23, true);
      r.wide = version >= 7500;

      /* Sólo se baja a Objects y, dentro, a Material/Model y su Properties70. */
      const interesa = (nombre) => (
        nombre === '' || nombre === 'Objects' || nombre === 'Material' ||
        nombre === 'Model' || nombre === 'Properties70'
      );

      let objetosNodo = null;
      let o = 27;
      while (o < r.size - 13) {
        const n = nodo(r, o, interesa);
        if (!n || n.nulo || n.fin <= o) break;
        if (n.nombre === 'Objects') { objetosNodo = n; break; }
        o = n.fin;
      }
      if (!objetosNodo) return { materiales: {}, objetos: {}, proyecto: null, avisos };

      const materiales = {};
      const objetos = {};
      let proyecto = null;

      objetosNodo.hijos.forEach(h => {
        if (h.nombre !== 'Material' && h.nombre !== 'Model') return;
        const props = propsDeUsuario(h);
        if (!Object.keys(props).length) return;

        /* props[1] es el attrName: el mismo string del que FBXLoader saca
           material.name y userData.originalName. */
        const nombre = typeof h.props[1] === 'string' ? h.props[1] : '';
        if (!nombre) return;

        if (props[CLAVE_PROYECTO] && !proyecto) {
          proyecto = jsonSeguro(props[CLAVE_PROYECTO]);
        }
        const meta = props[CLAVE_META] ? jsonSeguro(props[CLAVE_META]) : null;
        if (!meta) return;

        const destino = h.nombre === 'Material' ? materiales : objetos;
        if (destino[nombre]) {
          /* Dos datablocks con el mismo nombre: el .blend permite 'Gold' y
             'gold', y el FBX los trunca igual. No hay forma de desempatarlos
             por nombre, que es lo único que FBXLoader expone. */
          avisos.push(`Hay más de un ${h.nombre === 'Material' ? 'material' : 'objeto'} llamado "${nombre}"; se usó el último.`);
        }
        destino[nombre] = meta;
      });

      return { materiales, objetos, proyecto, avisos };
    } catch (e) {
      console.warn('[fbx-meta] no se pudieron leer los metadatos:', e);
      return null;
    }
  }

  window.readFbxMeta = readFbxMeta;
})();
