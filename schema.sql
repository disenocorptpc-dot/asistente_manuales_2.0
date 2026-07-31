-- Debe reflejar la tabla de producción documentada en AGENTS.md:
-- (id, name, property, data, updated_at). Sin `property`, el INSERT de
-- functions/api/projects.js falla y no se puede guardar en local.
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    property TEXT,
    data TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
