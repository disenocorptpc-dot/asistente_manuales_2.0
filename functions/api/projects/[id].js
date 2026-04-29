export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;
  try {
    const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    if (!project) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    return Response.json({ id: project.id, name: project.name, data: JSON.parse(project.data), updated_at: project.updated_at });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const id = params.id;
  try {
    const { name, data } = await request.json();
    await env.DB.prepare('UPDATE projects SET name = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(name, JSON.stringify(data), id)
      .run();
    return Response.json({ message: 'Updated successfully' });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
