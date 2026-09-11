# Asistente de Manuales 2.0 — The Palace Company

[![Cloudflare Pages](https://img.shields.io/badge/Deployment-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://asistente-manuales-2-0.pages.dev/)
[![Database](https://img.shields.io/badge/Database-Cloudflare%20D1%20(SQLite)-0051C3?logo=sqlite&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Three.js Engine](https://img.shields.io/badge/3D%20Engine-Three.js%20r128-black?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![AI Powered](https://img.shields.io/badge/AI-Google%20Gemini%202.5-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)

Plataforma web de grado corporativo desarrollada para la **Dirección de Diseño Corporativo de The Palace Company**. Automatiza la creación, edición, catalogación y exportación de manuales técnicos de producción arquitectónica, mobiliario, señalética y acabados.

Conecta directamente el flujo de modelado 3D de **Blender** con un lienzo interactivo de composición editorial, generando despieces explosivos, siluetas ortográficas con cotas y renders asistidos por Inteligencia Artificial en segundos.

---

## 🚀 Características Principales

### 📐 Motor Editorial y Diapositivas Especializadas
* **Plantillas Profesionales Estándar**:
  * **Portada (`cover`)**: Identidad visual corporativa con logotipo Palace, metadatos del proyecto, propiedad y fondo personalizable.
  * **Montaje (`montaje`)**: Render hero a sangrado total (100% *full-bleed*) con degradados **Scrim** cinematográficos superior e inferior, garantizando contraste y legibilidad absoluta sin sombras artificiales.
  * **Descriptivo (`descriptivo`)**: Vista ortográfica frontal, cotas paramétricas (ancho, alto, profundidad), render aislado y ficha técnica de especificaciones.
  * **Explosivo (`explosivo`)**: Despiece técnico 3D con listado de partes, referencias numéricas y vinculación a submallas reales.
  * **Planos (`planos`)**: Planchas técnicas arquitectónicas y tabla de dimensiones integradas.
  * **Materiales (`materiales`)**: Catálogo de muestras fotográficas, acabados, texturas y descripciones de fabricación.
* **Formatos de Salida Exclusivos**:
  * **Carta Horizontal (Letter Landscape)**: `1056 × 816 px` (`279.4 × 215.9 mm`) — Estándar para carpetas físicas de contratistas e imprenta.
  * **16:9 Widescreen**: `1280 × 720 px` (`338.7 × 190.5 mm`) — Estándar para presentaciones ejecutivas y pantallas.
  * Alternable con un solo clic directamente desde la barra de herramientas del lienzo.
* **Pre-titulado Dinámico en Cascada**:
  * Al asignar el nombre del proyecto o propiedad, todas las diapositivas y las nuevas que se creen heredan la identidad en tiempo real.

### 🧊 Pipeline 3D Inteligente (Blender → Web)
* **Importación Directa de Archivos 3D**: Admite `GLB`, `glTF` y `OBJ (+ MTL)` con descompresión DRACO integrada.
* **Compatibilidad de Contrato con Blender Addon**: Lee de forma nativa el esquema [`palace_schema` v2](https://github.com/disenocorptpc-dot/glb_manuales_addon) empacado en los `extras` / `userData` del GLB (`pieza_id`, `capa`, `material`).
* **Agrupamiento Jerárquico de Submallas (`findPieceOwner`)**: Evita que mallas compuestas o textos en 3D se fracturen en pedazos individuales al despiezar.
* **Despiece Explosivo con Transformación Mundial Inversa (`invParentRot`)**: Mantiene la orientación real y consistencia espacial de objetos rotados o emparentados en Blender.
* **Generación Automática de Silueta Vectorial Ortográfica (`silhouetteSegments`)**: Algoritmo con umbral de 18° para capturar aristas vivas y biseles sin perder contornos exteriores.

### 🤖 Inteligencia Artificial Generativa
* **Redacción de Fichas Técnicas**: Integración con **Google Gemini 2.5 Flash** para autocompletar descripciones técnicas y acabados a partir de los metadatos del ensamble 3D.
* **Renders Conceptuales (img2img)**: Generación asistida de imágenes con **Gemini 2.5 Flash Image** o **Cloudflare Workers AI (Stable Diffusion XL)** para previsualizar acabados fotorrealistas.

### 📄 Exportación PDF Dual
1. **PDF Vectorial de Alta Fidelidad (Nativo)**:
   * Inyecta reglas CSS `@page` exactas según el formato activo (Carta o 16:9).
   * Texto 100% seleccionable, vectores y cotas nítidos a cualquier escala, y peso de archivo ultraligero (1–2 MB).
2. **Descarga Directa (Snapshot)**:
   * Renderizado inmediato vía `html2canvas` + `jsPDF` para envíos rápidos.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend UI** | React 18, Babel Standalone, HTML5 Canvas, Vanilla CSS3 (Design Tokens) |
| **Gráficos 3D** | Three.js (r128), GLTFLoader, OBJLoader, DRACOLoader |
| **Iconografía & Efectos** | Lucide Icons, Tabler Icons, Canvas Confetti |
| **Generación PDF** | Native Browser Print Engine (`@page`), jsPDF, html2canvas |
| **Backend Serverless** | Cloudflare Pages Functions (V8 Workers runtime) |
| **Base de Datos** | Cloudflare D1 (SQLite distribuido globalmente) |
| **Almacenamiento** | Cloudflare R2 Bucket (activos multimedia e imágenes) |
| **Modelos de IA** | Google Gemini 2.5 (`gemini-2.5-flash`, `gemini-2.5-flash-image`), Cloudflare Workers AI |

---

## 📁 Estructura del Repositorio

```text
asistente_manuales_2.0/
├── functions/                     # Backend Cloudflare Pages Functions
│   ├── api/
│   │   ├── ai/
│   │   │   ├── describe.js       # Endpoint de redacción con Gemini 2.5 Flash
│   │   │   └── render.js         # Endpoint de img2img con Gemini / Workers AI
│   │   ├── projects/
│   │   │   └── [id].js           # GET, PUT, DELETE de un manual específico
│   │   ├── projects.js           # GET (lista ordenada) y POST (crear manual)
│   │   └── upload.js             # Subida de imágenes a R2
│   └── uploads/
│       └── [filename].js         # Servidor de imágenes desde R2
├── ds/                           # Design System y Recursos Gráficos
│   ├── Back.webp                 # Textura/fondo corporativo
│   ├── colors_and_type.css       # Tokens de color, variables CSS y tipografía
│   ├── fonts/                    # Tipografías DM Sans en formato WOFF2
│   ├── logo-palace-default.svg   # Logotipo institucional The Palace Company
│   └── logo-palace-mark.svg      # Isotipo corporativo
├── index.html                    # Entrada HTML5 con orquestador de scripts
├── app.jsx                       # Aplicación React principal (Canvas, Modales, Topbar)
├── panels.jsx                    # Paneles de navegación, cromo corporativo e inspector
├── slide-bodies.jsx              # Definición de cuerpos y slots de diapositivas
├── templates.jsx                 # Modelos de datos, plantillas y tamaños de página
├── import3d.jsx                  # Módulo de importación, despiece y silueta 3D
├── ai-prompts.js                 # Generador de prompts estructurados para IA
├── editor.css                    # Hoja de estilos principal del editor y canvas
├── schema.sql                    # Definición de la tabla D1 projects
├── seed.sql                      # Datos semilla para pruebas locales
├── wrangler.toml                 # Configuración de Cloudflare Pages y bindings D1
├── package.json                  # Dependencias y scripts de desarrollo
├── AGENTS.md                     # Directivas críticas para agentes de IA
└── README.md                     # Documentación general del proyecto
```

---

## 💻 Puesta en Marcha Local

### Prerrequisitos
* **Node.js**: Versión 18.0.0 o superior instalada.
* **npm** o **npx** disponible en tu terminal.

### 1. Clonar el repositorio
```bash
git clone https://github.com/disenocorptpc-dot/asistente_manuales_2.0.git
cd asistente_manuales_2.0
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno locales (Opcional para IA)
Crea un archivo `.dev.vars` en la raíz del proyecto si deseas utilizar las funciones de Inteligencia Artificial en local:
```env
GEMINI_API_KEY="tu-clave-de-google-ai-studio"
AI_TEXT_MODEL="gemini-2.5-flash"
AI_RENDER_PROVIDER="gemini"
AI_IMAGE_MODEL="gemini-2.5-flash-image"
```

### 4. Inicializar la Base de Datos Local (D1 / SQLite)
Crea y puebla la tabla `projects` en tu entorno Miniflare local:
```bash
npm run db:init
```

### 5. Iniciar el Servidor de Desarrollo
```bash
npm run dev
```
La aplicación estará disponible inmediatamente en:
👉 **`http://localhost:8788`**

---

## 🗄️ Esquema de Base de Datos (Cloudflare D1)

La persistencia de los manuales se gestiona mediante Cloudflare D1 bajo la tabla `projects`:

```sql
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    property TEXT,
    data TEXT,                            -- JSON serializado con slides y globals
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Estructura del JSON almacenado en `data`:
```json
{
  "globals": {
    "title": "Letrero Fachada Principal",
    "property": "Moon Palace Cancún",
    "date": "11/09/2026",
    "pageSize": "Letter_landscape",
    "logoData": null
  },
  "slides": [
    { "id": "slide-1", "template": "cover", "data": { ... } },
    { "id": "slide-2", "template": "montaje", "data": { "scrim": true, ... } },
    { "id": "slide-3", "template": "descriptivo", "data": { ... } },
    { "id": "slide-4", "template": "explosivo", "data": { ... } }
  ]
}
```

---

## 🔌 Referencia de la API (Endpoints Serverless)

### Proyectos / Manuales

#### `GET /api/projects`
Retorna la lista de proyectos ordenada por última actualización (`updated_at DESC`).
* **Respuesta 200 OK**:
  ```json
  [
    {
      "id": 12,
      "name": "Mueble Credenza Suite Presidencial",
      "property": "Le Blanc Los Cabos",
      "updated_at": "2026-09-11 15:45:00"
    }
  ]
  ```

#### `POST /api/projects`
Crea un nuevo proyecto en D1.
* **Payload**:
  ```json
  {
    "name": "Letrero Spa",
    "property": "Sun Palace",
    "data": { "globals": { ... }, "slides": [ ... ] }
  }
  ```
* **Respuesta 200 OK**: `{ "id": 13, "name": "Letrero Spa", "property": "Sun Palace" }`

#### `GET /api/projects/:id`
Recupera el proyecto completo con su árbol de diapositivas deserializado.

#### `PUT /api/projects/:id`
Actualiza el nombre, propiedad y contenido del manual, actualizando `updated_at`.

#### `DELETE /api/projects/:id`
Elimina el registro del proyecto en D1.

---

### Inteligencia Artificial

#### `POST /api/ai/describe`
Genera la redacción técnica para la ficha de especificaciones utilizando Google Gemini.
* **Payload**: `{ "prompt": "Redacta especificaciones para letrero acrílico retroiluminado..." }`
* **Respuesta 200 OK**: `{ "texto": "...", "modelo": "gemini-2.5-flash" }`

#### `POST /api/ai/render`
Genera una reinterpretación fotorrealista (img2img) basada en el boceto o render base.
* **Payload**: `{ "prompt": "...", "imagen": "data:image/png;base64,...", "strength": 0.45 }`
* **Respuesta 200 OK**: `{ "imagen": "data:image/png;base64,...", "proveedor": "gemini" }`

---

## 🎨 Integración con Blender ([`glb_manuales_addon`](https://github.com/disenocorptpc-dot/glb_manuales_addon))

Para maximizar la automatización en el Asistente de Manuales:
1. Modela y organiza tu ensamble en Blender.
2. Cada pieza debe contener sus propiedades personalizadas (*Custom Properties*):
   * `pieza_id`: Identificador alfanumérico único (ej. `P-01`, `ESTR-02`).
   * `capa`: Categoría funcional (ej. `Estructura`, `Iluminación`, `Difusor`, `Tornillería`).
   * `material`: Nombre del acabado o especificación de fabricación.
3. Exporta con la opción **Include $\rightarrow$ Custom Properties** habilitada (`export_extras=True`).
4. Al arrastrar el `.glb` en **Importar 3D**, el visor agrupará submallas automáticamente, generará la vista explosiva sincronizada y transferirá las piezas a las diapositivas de Descriptivo, Explosivo y Materiales.

---

## 🔒 Reglas de Despliegue y Producción

> Consultar [AGENTS.md](AGENTS.md) para conocer las directivas de arquitectura obligatorias.

* **Base de Datos de Producción**: Cloudflare D1 `manuales-db` (`4ebd1f32-0b58-4f9e-b1c7-f824d034e88f`).
* **Rama Principal**: Los cambios integrados en `main` se despliegan de forma continua en Cloudflare Pages.
* **Prohibición**: Bajo ninguna circunstancia deben inyectarse datos simulados (*mocks*) en los endpoints de producción.

---

## 👥 Créditos y Autoría

Desarrollado para la **Dirección de Diseño Corporativo** de **The Palace Company**.  
Cancún, Quintana Roo, México — 2026.
