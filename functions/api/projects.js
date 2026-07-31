// Global memory fallback if D1 DB binding is not attached
let memoryStore = [
  {
    id: 1,
    name: 'Manual de Producción — Almare',
    property: 'Moon Palace Cancún',
    data: {
      version: 2,
      slides: [
        { id: 's1', template: 'cover', data: { projectType: 'PROPUESTA DE DISEÑO', itemTitle: 'SEÑALÉTICA LOBBY PRINCIPAL', siteName: 'MOON PALACE CANCÚN' } },
        { id: 's2', template: 'descriptivo', data: { itemTitle: 'TOTEM DE BIENVENIDA', sectionLabel: 'ESPECIFICACIONES TÉCNICAS', descripcion: 'Estructura de aluminio compuesto con pintura automotriz mate. Logotipo calado e iluminado con luz LED cálida 3000K.', cotaAncho: '120 cm', cotaAlto: '240 cm' } }
      ],
      globals: { title: 'Manual de Producción — Almare', property: 'Moon Palace Cancún', corp: 'Corporativo THG', dept: 'Departamento de Diseño Gráfico' }
    },
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    name: 'Guía de Identidad & Señalética Exterior',
    property: 'Le Blanc Spa Resort',
    data: {
      version: 2,
      slides: [
        { id: 's1', template: 'cover', data: { projectType: 'GUÍA DE IDENTIDAD', itemTitle: 'PLACA HABITACIÓN VIP', siteName: 'LE BLANC CANCÚN' } },
        { id: 's2', template: 'descriptivo', data: { itemTitle: 'PLACA HABITACIÓN PRESIDENCIAL', sectionLabel: 'MATERIALES', descripcion: 'Latón cepillado de 3mm grabado con ácido y pintura horneada en tono titanio satinado.', cotaAncho: '40 cm', cotaAlto: '15 cm' } }
      ],
      globals: { title: 'Guía de Identidad & Señalética Exterior', property: 'Le Blanc Spa Resort', corp: 'Corporativo THG', dept: 'Diseño Señalético' }
    },
    updated_at: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 3,
    name: 'Manual de Stand Expo Hostelería 2026',
    property: 'Corporativo Palace',
    data: {
      version: 2,
      slides: [
        { id: 's1', template: 'cover', data: { projectType: 'PROYECTO ESPECIAL', itemTitle: 'STAND PRINCIPAL EXPO 2026', siteName: 'CENTRO DE CONVENCIONES' } },
        { id: 's2', template: 'montaje', data: { label: 'Render General del Stand' } }
      ],
      globals: { title: 'Manual de Stand Expo Hostelería 2026', property: 'Corporativo Palace', corp: 'Corporativo THG', dept: 'Arquitectura Comercial' }
    },
    updated_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 4,
    name: 'Catálogo de Uniformes & Materiales VIP',
    property: 'Beach Palace',
    data: {
      version: 2,
      slides: [
        { id: 's1', template: 'cover', data: { projectType: 'CATÁLOGO CORPORATIVO', itemTitle: 'PINES Y GAFETES', siteName: 'BEACH PALACE CANCÚN' } }
      ],
      globals: { title: 'Catálogo de Uniformes & Materiales VIP', property: 'Beach Palace', corp: 'Corporativo THG', dept: 'Diseño Corporativo' }
    },
    updated_at: new Date(Date.now() - 86400000 * 3).toISOString()
  }
];

export async function onRequestGet(context) {
  const { env } = context;
  if (!env || !env.DB) {
    const list = memoryStore.map(p => ({
      id: p.id,
      name: p.name,
      property: p.property || '',
      updated_at: p.updated_at
    }));
    return Response.json(list);
  }
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        property TEXT,
        data TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const queryRes = await env.DB.prepare(
      'SELECT id, name, property, updated_at FROM projects ORDER BY updated_at DESC'
    ).all();
    return Response.json(queryRes.results || []);
  } catch (e) {
    return Response.json(memoryStore.map(p => ({ id: p.id, name: p.name, property: p.property || '', updated_at: p.updated_at })));
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { name, property, data } = await request.json();
    if (!env || !env.DB) {
      const newId = memoryStore.length > 0 ? Math.max(...memoryStore.map(p => p.id)) + 1 : 1;
      const newItem = {
        id: newId,
        name: name || 'Manual',
        property: property || '',
        data,
        updated_at: new Date().toISOString()
      };
      memoryStore.unshift(newItem);
      return Response.json({ id: newId, name: newItem.name, property: newItem.property });
    }
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        property TEXT,
        data TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const info = await env.DB.prepare(
      'INSERT INTO projects (name, property, data) VALUES (?, ?, ?) RETURNING id'
    ).bind(name, property || '', JSON.stringify(data)).first();
    return Response.json({ id: info.id, name, property });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
export { memoryStore };


