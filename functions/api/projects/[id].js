import { memoryStore } from '../projects.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = Number(params.id);
  
  if (!env || !env.DB) {
    const p = memoryStore.find(item => item.id === id);
    if (!p) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    const dataObj = typeof p.data === 'string' ? JSON.parse(p.data) : p.data;
    return Response.json({ id: p.id, name: p.name, property: p.property || '', data: dataObj, updated_at: p.updated_at });
  }

  try {
    const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    if (!project) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    const dataObj = typeof project.data === 'string' ? JSON.parse(project.data) : project.data;
    return Response.json({ id: project.id, name: project.name, property: project.property || '', data: dataObj, updated_at: project.updated_at });
  } catch (e) {
    const p = memoryStore.find(item => item.id === id);
    if (p) return Response.json({ id: p.id, name: p.name, property: p.property || '', data: p.data, updated_at: p.updated_at });
    return new Response(e.message, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const id = Number(params.id);
  const { name, property, data } = await request.json();

  if (!env || !env.DB) {
    const idx = memoryStore.findIndex(item => item.id === id);
    if (idx !== -1) {
      memoryStore[idx] = {
        ...memoryStore[idx],
        name: name || memoryStore[idx].name,
        property: property !== undefined ? property : memoryStore[idx].property,
        data: data || memoryStore[idx].data,
        updated_at: new Date().toISOString()
      };
    }
    return Response.json({ message: 'Updated successfully' });
  }

  try {
    await env.DB.prepare(
      'UPDATE projects SET name = ?, property = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(name, property || '', JSON.stringify(data), id).run();
    return Response.json({ message: 'Updated successfully' });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = Number(params.id);

  if (!env || !env.DB) {
    const idx = memoryStore.findIndex(item => item.id === id);
    if (idx !== -1) memoryStore.splice(idx, 1);
    return Response.json({ message: 'Deleted' });
  }

  try {
    await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    return Response.json({ message: 'Deleted' });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

