# AGENTS.md — Reglas y Contexto Crítico del Proyecto

> **IMPORTANTE PARA CUALQUIER AGENTE DE IA (Antigravity, Claude, Cursor, ChatGPT, etc.)**:
> Lee este archivo ANTES de modificar código o realizar despliegues en este repositorio.

---

## 📌 Contexto del Proyecto

- **Nombre del Proyecto**: Asistente de Manuales 2.0 — Palace Company
- **Repositorio Git**: `https://github.com/disenocorptpc-dot/asistente_manuales_2.0.git`
- **Producción URL**: `https://asistente-manuales-2-0.pages.dev/`
- **Infraestructura Cloud**: Cloudflare Pages con Functions (`functions/api/*`) y Cloudflare D1 Database.

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
