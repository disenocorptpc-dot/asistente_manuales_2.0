CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    property TEXT,
    data TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO projects (name, property, data, updated_at) VALUES 
(
  'Manual de Producción — Almare',
  'Moon Palace Cancún',
  '{"version":2,"slides":[{"id":"s1","template":"cover","data":{"projectType":"PROPUESTA DE DISEÑO","itemTitle":"SEÑALÉTICA LOBBY PRINCIPAL","siteName":"MOON PALACE CANCÚN"}},{"id":"s2","template":"descriptivo","data":{"itemTitle":"TOTEM DE BIENVENIDA","sectionLabel":"ESPECIFICACIONES TÉCNICAS","descripcion":"Estructura de aluminio compuesto con pintura automotriz mate. Logotipo calado e iluminado con luz LED cálida 3000K.","cotaAncho":"120 cm","cotaAlto":"240 cm"}}],"globals":{"title":"Manual de Producción — Almare","property":"Moon Palace Cancún","corp":"Corporativo THG","dept":"Departamento de Diseño Gráfico"}}',
  CURRENT_TIMESTAMP
),
(
  'Guía de Identidad & Señalética Exterior',
  'Le Blanc Spa Resort',
  '{"version":2,"slides":[{"id":"s1","template":"cover","data":{"projectType":"GUÍA DE IDENTIDAD","itemTitle":"PLACA HABITACIÓN VIP","siteName":"LE BLANC CANCÚN"}},{"id":"s2","template":"descriptivo","data":{"itemTitle":"PLACA HABITACIÓN PRESIDENCIAL","sectionLabel":"MATERIALES","descripcion":"Latón cepillado de 3mm grabado con ácido y pintura horneada en tono titanio satinado.","cotaAncho":"40 cm","cotaAlto":"15 cm"}}],"globals":{"title":"Guía de Identidad & Señalética Exterior","property":"Le Blanc Spa Resort","corp":"Corporativo THG","dept":"Diseño Señalético"}}',
  DATETIME('now', '-2 hours')
),
(
  'Manual de Stand Expo Hostelería 2026',
  'Corporativo Palace',
  '{"version":2,"slides":[{"id":"s1","template":"cover","data":{"projectType":"PROYECTO ESPECIAL","itemTitle":"STAND PRINCIPAL EXPO 2026","siteName":"CENTRO DE CONVENCIONES"}},{"id":"s2","template":"montaje","data":{"label":"Render General del Stand"}}],"globals":{"title":"Manual de Stand Expo Hostelería 2026","property":"Corporativo Palace","corp":"Corporativo THG","dept":"Arquitectura Comercial"}}',
  DATETIME('now', '-1 day')
),
(
  'Catálogo de Uniformes & Materiales VIP',
  'Beach Palace',
  '{"version":2,"slides":[{"id":"s1","template":"cover","data":{"projectType":"CATÁLOGO CORPORATIVO","itemTitle":"PINES Y GAFETES","siteName":"BEACH PALACE CANCÚN"}}],"globals":{"title":"Catálogo de Uniformes & Materiales VIP","property":"Beach Palace","corp":"Corporativo THG","dept":"Diseño Corporativo"}}',
  DATETIME('now', '-3 days')
);
