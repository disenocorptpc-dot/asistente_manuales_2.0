/* POST /api/ai/render  { prompt, imagen }  → { imagen }
   `imagen` va y viene como data URL (base64), que es lo que el canvas produce
   y lo que un <img> consume, así que no hay conversiones intermedias.

   El proveedor es un interruptor, no una decisión de arquitectura:

     AI_RENDER_PROVIDER=gemini      → Gemini 2.5 Flash Image ("Nano Banana").
                                      Se pega mucho a la imagen base, que es
                                      justo lo que se necesita. De pago.
     AI_RENDER_PROVIDER=workers-ai  → Stable Diffusion XL img2img en Cloudflare.
                                      Ya estamos en Cloudflare y tiene cuota
                                      gratuita; se pega menos al original.

   Ninguno es un render de verdad: son imágenes generadas. Sirven como
   referencia visual, nunca como plano de fabricación.                        */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/* data URL → { mime, bytes }. */
function parseDataUrl(s) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(s || '');
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}

/* Ancho y alto de un PNG, leídos del IHDR: firma de 8 bytes, luego longitud (4)
   + "IHDR" (4) + width (4) + height (4). Sirve para pedirle al modelo la misma
   forma que la imagen base, en vez de aceptar el cuadrado que da por default. */
function pngSize(bytes) {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;   // no es PNG
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = dv.getUint32(16);
  const h = dv.getUint32(20);
  if (!w || !h || w > 4096 || h > 4096) return null;
  return { w, h };
}

function toDataUrl(bytes, mime) {
  let bin = '';
  const chunk = 0x8000;   // por bloques: btoa con un spread de 3 MB revienta la pila
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

async function conGemini(env, prompt, img) {
  const key = env.GEMINI_API_KEY;
  if (!key) {
    return json({
      error: 'sin_configurar',
      mensaje: 'Falta GEMINI_API_KEY. Nota: la generación de imágenes de Google '
             + 'no está incluida en el tier gratuito; requiere cuenta de pago.',
    }, 501);
  }
  const modelo = env.AI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: img.mime, data: btoa(String.fromCharCode.apply(null, img.bytes)) } },
          { text: prompt },
        ],
      }],
    }),
  });

  const cuerpo = await r.text();
  if (!r.ok) {
    return json({ error: 'gemini', status: r.status, mensaje: cuerpo.slice(0, 800) }, 502);
  }
  let data;
  try { data = JSON.parse(cuerpo); } catch (e) { return json({ error: 'respuesta_invalida' }, 502); }

  const partes = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const imagen = partes.find(p => p.inlineData || p.inline_data);
  if (!imagen) {
    const texto = partes.map(p => p.text || '').join(' ').trim();
    return json({
      error: 'sin_imagen',
      mensaje: texto || 'El modelo no devolvió imagen. Suele pasar cuando la cuenta no tiene generación de imágenes habilitada.',
    }, 502);
  }
  const inline = imagen.inlineData || imagen.inline_data;
  const mime = inline.mimeType || inline.mime_type || 'image/png';
  return json({ imagen: `data:${mime};base64,${inline.data}`, proveedor: 'gemini', modelo });
}

async function conWorkersAI(env, prompt, img, strengthPedido) {
  if (!env.AI) {
    return json({
      error: 'sin_configurar',
      mensaje: 'Falta el binding AI de Workers AI. Agrega [ai] binding = "AI" a '
             + 'wrangler.toml. En local necesita sesión de wrangler (wrangler login).',
    }, 501);
  }
  const modelo = env.AI_IMAGE_MODEL || '@cf/stabilityai/stable-diffusion-xl-base-1.0';
  /* `strength` es la libertad que se le da: bajo respeta el prerender, alto
     inventa. 0.45 es el punto donde el material cambia pero la silueta no. */
  /* El default vive en el entorno; el cliente puede pedir otro valor (un
     control de "qué tanta libertad" en la UI). Se acota a 0–1 porque va directo
     a una API que cobra. */
  const base = Number(env.AI_RENDER_STRENGTH || 0.45);
  const pedido = Number(strengthPedido);
  const strength = Number.isFinite(pedido) && pedido > 0 && pedido <= 1 ? pedido : base;

  const entrada = {
    prompt,
    image: Array.from(img.bytes),
    strength,
    num_steps: 20,
  };
  /* Sin width/height explícitos, Stable Diffusion devuelve 512×512 y una pieza
     vertical sale achatada. Los límites del modelo son 256–2048 y múltiplos
     de 8; la base ya viene normalizada así desde el cliente. */
  const dim = pngSize(img.bytes);
  if (dim) {
    const ajusta = n => Math.min(2048, Math.max(256, Math.round(n / 8) * 8));
    /* INVERTIDOS a propósito. Comprobado contra el modelo: mandando
       width=800/height=1024 devuelve una imagen de 1024×800. El modelo trata
       estos campos como las dimensiones del tensor (alto, ancho), no como
       ancho y alto de imagen. Sin este cruce, una pieza vertical sale
       horizontal. Si algún día se cambia de modelo, hay que volver a medirlo. */
    entrada.width = ajusta(dim.h);
    entrada.height = ajusta(dim.w);
  }

  let salida;
  try {
    salida = await env.AI.run(modelo, entrada);
  } catch (e) {
    /* Los errores de Workers AI llegan con el stack completo de wrangler, que
       en un aviso sobre la imagen es ilegible. Se queda la primera línea, y el
       caso más común —no haber hecho login— se traduce a una instrucción. */
    const bruto = String((e && e.message) || e);
    const primera = bruto.split('\n')[0].trim();
    if (/not logged in/i.test(bruto)) {
      return json({
        error: 'sin_sesion',
        mensaje: 'Workers AI necesita sesión de Cloudflare. Corre `npx wrangler login` '
               + 'en la carpeta del proyecto y reinicia el servidor.',
      }, 501);
    }
    return json({ error: 'workers_ai', mensaje: primera }, 502);
  }

  /* Puede devolver stream o ArrayBuffer según el modelo. */
  let bytes;
  if (salida instanceof ReadableStream) {
    bytes = new Uint8Array(await new Response(salida).arrayBuffer());
  } else if (salida instanceof ArrayBuffer) {
    bytes = new Uint8Array(salida);
  } else if (salida && salida.image) {
    return json({ imagen: `data:image/png;base64,${salida.image}`, proveedor: 'workers-ai', modelo });
  } else {
    return json({ error: 'respuesta_invalida', mensaje: 'Workers AI devolvió algo inesperado.' }, 502);
  }
  return json({ imagen: toDataUrl(bytes, 'image/png'), proveedor: 'workers-ai', modelo });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let prompt, imagen, strength;
  try {
    ({ prompt, imagen, strength } = await request.json());
  } catch (e) {
    return json({ error: 'json_invalido' }, 400);
  }
  if (!prompt || !imagen) return json({ error: 'falta_prompt_o_imagen' }, 400);

  const img = parseDataUrl(imagen);
  if (!img) return json({ error: 'imagen_invalida', mensaje: 'Se esperaba una data URL base64.' }, 400);
  /* ~6 MB de bytes reales. Los prerender rondan 200 KB; más que esto es un
     accidente y sólo sirve para quemar cuota. */
  if (img.bytes.length > 6 * 1024 * 1024) {
    return json({ error: 'imagen_muy_grande' }, 413);
  }

  const proveedor = env.AI_RENDER_PROVIDER || 'gemini';
  if (proveedor === 'workers-ai') return conWorkersAI(env, prompt, img, strength);
  if (proveedor === 'gemini') return conGemini(env, prompt, img);
  return json({ error: 'proveedor_desconocido', mensaje: `AI_RENDER_PROVIDER="${proveedor}"` }, 500);
}
