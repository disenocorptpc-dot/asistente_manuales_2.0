# AGENTS.md — Reglas y Contexto Crítico del Proyecto

> **IMPORTANTE PARA CUALQUIER AGENTE DE IA (Antigravity, Claude, Cursor, ChatGPT, etc.)**:
> Lee este archivo ANTES de modificar código o realizar despliegues en este repositorio.

---

## 📌 Contexto del Proyecto

- **Nombre del Proyecto**: Asistente de Manuales 2.0 — Palace Company
- **Repositorio Git**: `https://github.com/disenocorptpc-dot/asistente_manuales_2.0.git`
- **Producción URL**: `https://asistente-manuales-2-0.pages.dev/`
- **Infraestructura Cloud**: Cloudflare Pages con Functions (`functions/api/*`) y Cloudflare D1 Database.
- **Addon de Blender (repo aparte)**: `https://github.com/disenocorptpc-dot/glb_manuales_addon`
  (reemplaza a `fbx_manuales_addon`, archivado). Produce los metadatos
  (`mn_meta`, `mn_proyecto`) que la app lee de los GLB. Desde el cambio de
  formato FBX → GLB, esos metadatos ya no se leen con un parser aparte: viajan
  como *custom properties* → `extras` del glTF (`export_extras=True`), y
  `GLTFLoader` los deja solos en `userData` al parsear (ver `readGlbMeta` en
  `import3d.jsx`). Los dos lados comparten un contrato de datos documentado en
  el README de ese repo: si cambias uno, cambias el otro, o la app deja de
  encontrar los metadatos **en silencio**.

---

## ⚠️ Reglas de Oro (CRÍTICAS PARA CUALQUIER IA)

### 1. Base de Datos de Producción D1 (NUNCA romper o alterar el binding)
- **Nombre de Base de Datos D1**: `manuales-db`
- **UUID real de D1 en Cloudflare**: `4ebd1f32-0b58-4f9e-b1c7-f824d034e88f`
- **Binding Variable**: `DB`
- 🚫 **PROHIBIDO**: NUNCA reemplazar los endpoints `/api/projects` o `/api/projects/[id]` con arreglos de datos simulados (*mock data* / *demo data*) para entornos de producción.
- 🚫 **PROHIBIDO**: NUNCA alterar ni borrar la tabla `projects` (`id`, `name`, `property`, `data`, `updated_at`) de la base de datos D1.

### 2. Archivo `wrangler.toml`
El archivo `wrangler.toml` DEBE contener siempre la definición correcta de D1:
```toml
name = "asistente-manuales"
compatibility_date = "2026-07-31"
pages_build_output_dir = "."

[[d1_databases]]
binding = "DB"
database_name = "manuales-db"
database_id = "4ebd1f32-0b58-4f9e-b1c7-f824d034e88f"
```

### 3. Protocolo de Verificación tras Cambios
1. Probar componentes UI y funciones localmente (`npx wrangler pages dev .`).
2. Tras realizar `git push origin main --tags`, verificar el endpoint `/api/projects` para asegurar que devuelva los manuales reales de la base de datos D1 de produccion.

---

## 🧠 Registro de Hallazgos y Decisiones de Arquitectura (v2.4.0 — 2026-08-10)

### 1. Sincronización del Contrato de Datos GLB (`palace_schema` + `pieza_id`)
- `import3d.jsx` lee metadatos tanto del esquema legacy (`mn_meta` JSON) como de `palace_schema` v2 (custom properties individuales `userData.pieza_id`, `userData.capa`, `userData.material`, etc.).
- Si un GLB cuenta con contrato/metadatos, `import3d.jsx` solo cataloga piezas legítimas y mantiene visibles todas las mallas reales del ensamble sin descartarlas ni generar piezas basura (mallas auxiliares o cubos/planos de estudio).

### 2. Agrupamiento de Submallas por Objeto Principal (`findPieceOwner`)
- Para evitar que mallas compuestas o letras (ej. `Curve0011` a `Curve0018` de un letrero) se separen en pedacitos sueltos durante la vista de despiece, `extractPieces` agrupa todas las submallas bajo el objeto o nodo contenedor principal (`owner`).
- Las piezas se desplazan como un solo cuerpo sólido rígido, logrando un despiece explosivo 100% idéntico al del Visor JARVIS.

### 3. Matriz de Transformación en Despiece (`invParentRot`)
- Al calcular los desplazamientos 3D de las piezas en `import3d.jsx`, el vector de movimiento se transforma al espacio local del objeto padre (`p.object.parent.matrixWorld.invert()`).
- Esto evita que objetos rotados o emparentados en Blender sufran desplazamientos dispares en direcciones equivocadas.

### 4. Silueta y Proyección de Alzado Frontal (`silhouetteSegments`)
- Se implementó la detección automática de la orientación de las normales (`viewDirSign` +1 / -1) para procesar correctamente piezas orientadas hacia `+Z` o `-Z` en Blender.
- Se ajustó el umbral de angulación de caras a `18°`, previniendo que los biseles a 30°/45° de las aristas borren el contorno exterior de las letras o figuras.
- Las funciones de recorrido iteran defensivamente las submallas reales (`piece.meshObjects`), previniendo errores de lectura de `.geometry.attributes`.

