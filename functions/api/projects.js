export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, name, property, updated_at FROM projects ORDER BY property ASC, updated_at DESC'
    ).all();
    return Response.json(results || []);
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { name, property, data } = await request.json();
    const info = await env.DB.prepare(
      'INSERT INTO projects (name, property, data) VALUES (?, ?, ?) RETURNING id'
    ).bind(name, property || '', JSON.stringify(data)).first();
    return Response.json({ id: info.id, name, property });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
