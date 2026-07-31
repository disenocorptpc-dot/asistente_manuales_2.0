export async function onRequestGet(context) {
  const { env, params } = context;
  const db = env ? (env.DB || env['manuales-db']) : null;
  const id = params.id;
  if (!db) return new Response(JSON.stringify({ error: 'Database missing' }), { status: 500 });
  try {
    const project = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    if (!project) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    const dataObj = typeof project.data === 'string' ? JSON.parse(project.data) : project.data;
    return Response.json({ id: project.id, name: project.name, property: project.property || '', data: dataObj, updated_at: project.updated_at });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const db = env ? (env.DB || env['manuales-db']) : null;
  const id = params.id;
  if (!db) return new Response('Database missing', { status: 500 });
  try {
    const { name, property, data } = await request.json();
    await db.prepare(
      'UPDATE projects SET name = ?, property = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(name, property || '', JSON.stringify(data), id).run();
    return Response.json({ message: 'Updated successfully' });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const db = env ? (env.DB || env['manuales-db']) : null;
  const id = params.id;
  if (!db) return new Response('Database missing', { status: 500 });
  try {
    await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    return Response.json({ message: 'Deleted' });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}


