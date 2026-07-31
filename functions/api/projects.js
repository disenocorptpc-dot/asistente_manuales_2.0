export async function onRequestGet(context) {
  const { env } = context;
  const db = env ? (env.DB || env['manuales-db']) : null;
  if (!db) return Response.json([]);
  try {
    const { results } = await db.prepare(
      'SELECT id, name, property, updated_at FROM projects ORDER BY updated_at DESC'
    ).all();
    return Response.json(results || []);
  } catch (e) {
    try {
      const { results } = await db.prepare(
        'SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC'
      ).all();
      return Response.json(results || []);
    } catch (err) {
      return Response.json([]);
    }
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env ? (env.DB || env['manuales-db']) : null;
  if (!db) return new Response('Database missing', { status: 500 });
  try {
    const { name, property, data } = await request.json();
    const info = await db.prepare(
      'INSERT INTO projects (name, property, data) VALUES (?, ?, ?) RETURNING id'
    ).bind(name, property || '', JSON.stringify(data)).first();
    return Response.json({ id: info.id, name, property });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}



