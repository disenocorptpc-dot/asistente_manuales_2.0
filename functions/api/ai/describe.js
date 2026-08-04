/* POST /api/ai/describe  { prompt } → { texto }
   Redacción de descripciones con Gemini. Va por Function y no desde el
   navegador porque una API key en el cliente es una key pública.

   Los modelos de texto sí entran en el tier gratuito de Google AI Studio, así
   que esto funciona sin tarjeta. Los de imagen no — ver render.js.           */

const MODELO_DEFAULT = 'gemini-2.5-flash';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const key = env.GEMINI_API_KEY;
  if (!key) {
    /* 501 y no 500: no está roto, está sin configurar. La UI lo distingue y
       ofrece el puente manual a AI Studio en vez de un error rojo. */
    return json({
      error: 'sin_configurar',
      mensaje: 'Falta GEMINI_API_KEY. En local va en .dev.vars; en producción, '
             + 'en las variables de entorno de Cloudflare Pages.',
    }, 501);
  }

  let prompt;
  try {
    ({ prompt } = await request.json());
  } catch (e) {
    return json({ error: 'json_invalido' }, 400);
  }
  if (!prompt || typeof prompt !== 'string') {
    return json({ error: 'falta_prompt' }, 400);
  }
  /* Tope de cordura: un prompt de descripción ronda los 1.5 KB. Un megabyte
     significa que algo se está enviando por error. */
  if (prompt.length > 20000) {
    return json({ error: 'prompt_muy_largo' }, 413);
  }

  const modelo = env.AI_TEXT_MODEL || MODELO_DEFAULT;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
      }),
    });
  } catch (e) {
    return json({ error: 'red', mensaje: String(e) }, 502);
  }

  const cuerpo = await r.text();
  if (!r.ok) {
    /* El mensaje de Google se pasa tal cual: distingue "key inválida" de
       "cuota agotada" de "modelo no existe", y adivinar sería peor. */
    return json({ error: 'gemini', status: r.status, mensaje: cuerpo.slice(0, 600) }, 502);
  }

  let data;
  try {
    data = JSON.parse(cuerpo);
  } catch (e) {
    return json({ error: 'respuesta_invalida' }, 502);
  }

  const cand = data.candidates && data.candidates[0];
  const partes = (cand && cand.content && cand.content.parts) || [];
  const texto = partes.map(p => p.text || '').join('').trim();

  if (!texto) {
    return json({
      error: 'sin_texto',
      mensaje: cand && cand.finishReason
        ? `El modelo no devolvió texto (${cand.finishReason}).`
        : 'El modelo no devolvió texto.',
    }, 502);
  }

  return json({ texto, modelo });
}
