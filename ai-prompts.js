/* ───────── Construcción de prompts ─────────
   Viven en el cliente, no en la Function, por una razón concreta: así la UI
   puede MOSTRARTE el prompt exacto antes de gastar una llamada, y puedes
   copiarlo a AI Studio a mano si no quieres configurar una API key.

   Regla de oro de los dos prompts: sólo se enuncia lo que viene del archivo o
   del addon. Un manual de fabricación con un dato inventado es peor que un
   manual incompleto, porque el taller no puede distinguirlos.                */

(function () {
  'use strict';

  const ETIQUETAS = {
    nombre: 'Material',
    acabado: 'Acabado',
    color: 'Color',
    proceso: 'Proceso de taller',
    proveedor: 'Proveedor',
    calibre: 'Calibre',
    espesor_mm: 'Espesor (mm)',
    notas: 'Notas del diseñador',
  };

  const ORDEN = ['nombre', 'acabado', 'color', 'espesor_mm', 'calibre', 'proceso', 'proveedor', 'notas'];

  function bloqueProyecto(proy) {
    if (!proy) return '';
    const l = [];
    if (proy.proyecto) l.push(`Proyecto: ${proy.proyecto}`);
    if (proy.cliente) l.push(`Cliente: ${proy.cliente}`);
    if (proy.ubicacion) l.push(`Montaje: ${proy.ubicacion}`);
    if (proy.iluminado) l.push('La pieza es iluminada.');
    if (proy.notas) l.push(`Notas del proyecto: ${proy.notas}`);
    return l.length ? `CONTEXTO DEL PROYECTO\n${l.map(x => '· ' + x).join('\n')}\n\n` : '';
  }

  function bloqueMaterial(row) {
    const m = row._meta || {};
    const l = [];
    ORDEN.forEach(k => {
      if (m[k] !== undefined && m[k] !== '' && m[k] !== 0) {
        l.push(`· ${ETIQUETAS[k]}: ${m[k]}`);
      }
    });
    if (!m.nombre) l.unshift(`· Material: ${row.material}`);
    if (row._piezas && row._piezas.length) {
      l.push(`· Piezas que lo usan (${row._piezas.length}): ${row._piezas.join(', ')}`);
    }
    return l.join('\n');
  }

  /* Descripción de UN material para la tabla de materiales y acabados. */
  function buildDescribePrompt(row, proy, ejemplos) {
    const datos = bloqueMaterial(row);

    /* Hueco para el estilo de la casa. Mientras esté vacío, el modelo escribe
       correcto pero genérico: con dos ejemplos reales de manuales aprobados,
       imita el tono en vez de inventarlo. */
    const estilo = (ejemplos && ejemplos.length)
      ? `EJEMPLOS DEL ESTILO DE LA CASA (imita el tono y el nivel de detalle, no el contenido)\n${ejemplos.map(e => '---\n' + e).join('\n')}\n\n`
      : '';

    return (
`Eres el redactor técnico de una empresa que fabrica letreros y mobiliario de diseño industrial. Escribes la ficha de un material para el manual de fabricación que va al taller.

${bloqueProyecto(proy)}${estilo}DATOS CAPTURADOS DE ESTE MATERIAL
${datos}

INSTRUCCIONES
· Escribe en español de México, de 2 a 4 oraciones, en prosa corrida. Sin viñetas, sin encabezados, sin markdown.
· Dirígete a quien va a fabricar la pieza: qué es el material, cómo se procesa y qué cuidados tiene.
· Usa ÚNICAMENTE los datos de arriba. No inventes proveedores, medidas, normas, tiempos ni precios que no aparezcan.
· Si un dato no está, no lo menciones ni escribas que falta. No escribas "no especificado" ni similares.
· No repitas las medidas generales de la pieza: esas ya van acotadas en otra parte del manual.
· Responde sólo con el texto de la descripción, sin comillas ni preámbulo.`
    );
  }

  /* Render fotográfico a partir del prerender de three.js.
     El prompt insiste en NO cambiar la geometría porque el modelo tiende a
     "mejorar" la forma, y una forma mejorada en un manual de fabricación es
     una instrucción equivocada. */
  function buildRenderPrompt(rows, proy) {
    const materiales = (rows || []).map(r => {
      const m = r._meta || {};
      const bits = [m.nombre || r.material];
      if (m.acabado) bits.push(m.acabado);
      if (m.color) bits.push(m.color);
      if (m.render) bits.push(m.render);
      return '· ' + bits.join(' — ');
    }).join('\n');

    const estilo = (proy && proy.estilo_render)
      ? proy.estilo_render
      : 'fotografía de producto, fondo gris neutro, luz suave y difusa, sin texto ni marcas de agua';

    const luz = (proy && proy.iluminado)
      ? '\n· La pieza es iluminada: muestra la iluminación interna encendida, uniforme, sin puntos calientes.'
      : '';

    return (
`Toma la imagen adjunta —un render técnico plano de una pieza— y recréala como una fotografía realista del objeto ya fabricado.

RESPETA EXACTAMENTE:
· La geometría, las proporciones y el ángulo de vista de la imagen original. No cambies la forma, no agregues ni quites piezas, no corrijas la perspectiva.
· La composición y el encuadre.

APLICA LOS MATERIALES REALES:
${materiales || '· Sin metadatos de material: conserva los colores de la imagen original.'}

ESTILO
· ${estilo}${luz}

No agregues personas, texto, cotas, flechas, logotipos ni elementos de escenografía.`
    );
  }

  window.AIPrompts = { buildDescribePrompt, buildRenderPrompt };

  /* ───────── Normalización de la imagen base ─────────
     Los modelos de imagen tienen su propia idea del tamaño de salida: si les
     mandas 882×1133, Stable Diffusion devuelve 512×512 y la pieza sale
     achatada. Aquí se reencuadra la base a un tamaño que el modelo respeta —
     múltiplos de 8, lado largo acotado — y el endpoint lee esas dimensiones
     del PNG para pedirle al modelo exactamente esa forma.

     También baja el peso del envío, que es gratis de paso.                  */

  function cargar(url) {
    return new Promise((ok, err) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => err(new Error('No se pudo leer la imagen base.'));
      im.src = url;
    });
  }

  async function normalizar(url, ladoLargo) {
    const max = ladoLargo || 1024;
    const im = await cargar(url);
    const k = Math.min(1, max / Math.max(im.width, im.height));
    const m8 = n => Math.round(n / 8) * 8;
    let w = m8(im.width * k);
    let h = m8(im.height * k);
    /* Piso del modelo: 256 px por lado. Se sube en bloque para no cambiar la
       proporción, que es justo lo que estamos protegiendo. */
    const piso = 256 / Math.min(w, h);
    if (piso > 1) { w = m8(w * piso); h = m8(h * piso); }
    const c = document.createElement('canvas');
    c.width = Math.max(256, w);
    c.height = Math.max(256, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  window.AIImage = { normalizar };
})();
