# Arquitectura del Sistema — Asistente de Manuales 2.0

Este documento describe la arquitectura interna, decisiones técnicas y flujos de datos del **Asistente de Manuales 2.0** de The Palace Company.

---

## 1. Visión General de la Arquitectura

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          Navegador Web (Cliente)                       │
│                                                                        │
│  ┌─────────────────────────┐             ┌──────────────────────────┐  │
│  │   Canvas Editorial 2D   │             │   Visor Three.js 3D      │  │
│  │   (React 18 + CSS Vars) │ ◄────────── │   (GLTF / Draco Loader)  │  │
│  └────────────┬────────────┘             └─────────────▲────────────┘  │
│               │                                        │               │
│               ▼                                        │               │
│  ┌─────────────────────────┐                           │               │
│  │   Motor de Exportación  │                           │ Archivos .glb │
│  │   (@page Vectorial/PDF) │                           │               │
│  └─────────────────────────┘                           │               │
└───────────────┬────────────────────────────────────────┼───────────────┘
                │ HTTP REST                              │
                ▼                                        │
┌────────────────────────────────────────────────────────┴───────────────┐
│                    Cloudflare Pages Functions (V8 Runtime)             │
│                                                                        │
│   /api/projects       /api/projects/[id]     /api/ai/describe          │
│   (CRUD de Manuales)   (Detalle / Update)     (Google Gemini 2.5)       │
│                                                                        │
│   /api/upload         /uploads/[filename]    /api/ai/render            │
│   (Subida a R2)       (Carga de Assets)      (Gemini / Workers AI)     │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │                                        │
                ▼                                        ▼
┌──────────────────────────────┐        ┌────────────────────────────────┐
│   Cloudflare D1 (SQLite)     │        │   Cloudflare R2 Storage        │
│   Tabla: projects            │        │   Bucket de Renders e Imágenes │
└──────────────────────────────┘        └────────────────────────────────┘
```

---

## 2. Árbol de Componentes del Frontend

La aplicación se ejecuta sin empaquetadores pesados en el cliente gracias a Babel Standalone y React 18, permitiendo desarrollo ágil y despliegue estático sin fase de compilación intermedia:

1. **`index.html`**:
   - Inyecta hojas de estilo base (`ds/colors_and_type.css`, `editor.css`).
   - Carga librerías core: React 18, Three.js r128, GLTFLoader, DracoLoader, Lucide, jsPDF, html2canvas.
   - Monta el componente raíz `<App />`.

2. **`app.jsx` (Orquestador Principal)**:
   - **Estado Global (`globals`, `slides`, `activeSlideId`)**:
     - `globals`: Título del proyecto, propiedad, fecha, formato de página (`pageSize`), logotipo corporativo en base64 (`logoData`).
     - `slides`: Arreglo ordenado de diapositivas con sus identificadores únicos y datos específicos.
   - **Toolbar Superior (`.topbar`)**:
     - Edición en línea de título, propiedad y fecha.
     - Botón de guardado en la nube con indicador de sincronización.
     - Botón de **Importar 3D**.
     - Menú desplegable de **Exportar PDF** (Vectorial Nativo vs. Snapshot).
     - Gestor de manuales y proyectos guardados.
   - **Lienzo Editorial (`.canvas`)**:
     - Cálculo de escala responsiva automática para ajustar la diapositiva al viewport sin distorsión:
       $$\text{scale} = \min\left(\frac{\text{viewportWidth} - 64}{\text{slideDims.w}}, \frac{\text{viewportHeight} - 64}{\text{slideDims.h}}\right)$$
     - Selector de formato segmentado `[ Carta | 16:9 ]`.

3. **`panels.jsx`**:
   - **`SlidesPanel` (Lateral Izquierdo)**: Navegación de miniaturas, reordenamiento (drag & drop / botones), duplicado, borrado y adición de diapositivas.
   - **`PageChrome`**: Cromo institucional perimetral presente en todas las páginas (excepto la portada), conteniendo el logotipo de Palace, título del proyecto, propiedad, fecha y paginador.
   - **`SlideInspector` (Lateral Derecho)**: Formulario dinámico reactivo para editar cotas, etiquetas, textos, imágenes y el switch de **Scrim Cinematográfico**.

4. **`slide-bodies.jsx`**:
   - Contiene la implementación de los cuerpos editables:
     - `<CoverBody />`
     - `<MontajeBody />`
     - `<DescriptivoBody />`
     - `<ExplosivoBody />`
     - `<PlanosBody />`
     - `<MaterialesBody />`
   - Primitivas clave: `<InlineText />` (edición tipográfica inline) y `<Slot />` (ranuras de imagen con pan, zoom, arrastre y soporte de IA).

---

## 3. Decisiones de Arquitectura Registradas (ADRs)

### ADR-01: Reemplazo de `mix-blend-mode: difference` por Scrim Cinematográfico
* **Contexto**: Se buscaba colocar textos sobre la imagen de montaje a pantalla completa sin márgenes blancos. Inicialmente se utilizó `mix-blend-mode: difference`.
* **Problema Encontrado**: Matemáticamente, `|fondo - 255|` con tonos medios (~128 como maderas, mármoles y concreto) produce el mismo valor del fondo (127), causando que el texto desaparezca o se vea embarrado. Además, invertía luces cálidas a cianes psicodélicos.
* **Decisión**: Implementar dos gradientes **Scrim** suaves de desvanecimiento superior (112px) e inferior (96px) con `pointer-events: none`, manteniendo textos y logotipo en **blanco puro sólido** sin sombras paralelas artificiales.
* **Resultado**: 100% de legibilidad garantizada en cualquier fotografía (diurna, nocturna o tonos medios) con acabado editorial de lujo.

### ADR-02: Estandarización Exclusiva a Formatos Carta y 16:9
* **Contexto**: Existía un formato A4 que generaba confusión operativa entre los departamentos de obra e ingeniería.
* **Decisión**: Eliminar A4 y dejar exclusivamente:
  * **Carta Horizontal** (`1056 × 816 px` / `279.4 × 215.9 mm`): Estándar físico para carpetas de contratistas y talleres.
  * **16:9 Widescreen** (`1280 × 720 px` / `338.7 × 190.5 mm`): Estándar digital para pantallas y juntas ejecutivas.
* **Resultado**: Flujo de exportación sin ambigüedades y adaptación instantánea del canvas y las reglas `@page`.

### ADR-03: Motor de Exportación PDF Dual
* **Contexto**: `html2canvas` rasteriza las diapositivas a imágenes fijas, produciendo PDFs pesados (>15 MB), texto no seleccionable y cotas borrosas al hacer zoom.
* **Decisión**: Introducir el modo **PDF Vectorial (Nativo)** inyectando en el DOM la regla `@page { size: ${wMM}mm ${hMM}mm; margin: 0; }` y disparando `window.print()`.
* **Resultado**: Texto seleccionable, líneas vectoriales nítidas en planos técnicos y reducción de peso a ~1–2 MB por archivo.

---

## 4. Pipeline de Persistencia (Cloudflare D1)

* **Motor**: SQLite distribuido sin servidor (Cloudflare D1).
* **Base de Datos**: `manuales-db` (`4ebd1f32-0b58-4f9e-b1c7-f824d034e88f`).
* **Tabla `projects`**:
  ```sql
  CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      property TEXT,
      data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```
* **Ordenamiento**: Todas las consultas a `/api/projects` ordenan por `updated_at DESC` para que el usuario encuentre de inmediato sus trabajos recientes.
