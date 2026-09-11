# Guía de Integración con Blender — Pipeline 3D

Esta guía documenta el flujo de trabajo para artistas 3D, diseñadores industriales y modeladores en Blender que preparan modelos para el **Asistente de Manuales 2.0**.

---

## 1. El Addon de Blender (`glb_manuales_addon`)

El repositorio del complemento para Blender se encuentra en:  
👉 [`https://github.com/disenocorptpc-dot/glb_manuales_addon`](https://github.com/disenocorptpc-dot/glb_manuales_addon)

Este addon automatiza la asignación de metadatos, nombrado de piezas y exportación con las banderas de glTF requeridas.

---

## 2. Contrato de Datos (`palace_schema` v2)

Cuando se exporta un archivo `.glb`, los metadatos viajan empacados en los `extras` del nodo glTF (`export_extras=True`). En el navegador, `GLTFLoader` los deposita automáticamente en el campo `mesh.userData`.

### Campos Obligatorios por Pieza:

| Propiedad | Tipo | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `pieza_id` | `String` | Identificador alfanumérico único para el despiece y lista de partes. | `"P-01"`, `"ESTR-02"`, `"LET-A"` |
| `capa` | `String` | Categoría funcional o capa técnica en el manual. | `"Estructura"`, `"Iluminación"`, `"Acrílico"` |
| `material` | `String` | Nombre técnico del acabado o material para la tabla de especificaciones. | `"Aluminio anodizado negro mate"`, `"Acrílico opalino 5mm"` |
| `descripcion` | `String` | Descripción opcional del proceso o tratamiento. | `"Corte láser con doblez perimetral"` |

---

## 3. Reglas de Modelado en Blender

### A. Agrupamiento de Submallas (`findPieceOwner`)
En piezas complejas (por ejemplo, un letrero tipográfico donde cada letra es una curva convertida en malla `Curve001`, `Curve002`, etc.):
* **Solución**: Agrupa las submallas bajo un objeto padre contenedor (*Empty* o malla principal) y asigna las propiedades personalizadas al objeto padre.
* El algoritmo `extractPieces` del visor agrupará todas las submallas bajo el mismo dueño (`owner`), permitiendo que se desplacen juntas durante la explosión 3D.

### B. Transformaciones y Orígenes (Espacio Local vs. Mundo)
* Al despiezar en 3D, el visor web calcula los desplazamientos en el espacio local del objeto padre mediante la matriz de rotación inversa (`invParentRot`):
  ```javascript
  p.object.parent.matrixWorld.invert()
  ```
* **Recomendación**: Antes de exportar, aplica las escalas en Blender (`Ctrl + A` $\rightarrow$ *Apply All Transforms*) para garantizar proporciones 1:1 consistentes.

### C. Orientación de Vistas y Normales
* El algoritmo de silueta ortográfica detecta automáticamente la orientación del modelo (`viewDirSign` $+1 / -1$) para aceptar piezas orientadas hacia $+Z$ o $-Z$.
* Mantén las normales de las caras orientadas hacia afuera (*Recalculate Outside* con `Shift + N` en Blender).

---

## 4. Parámetros de Exportación en Blender (glTF 2.0 / GLB)

Si exportas manualmente sin el addon, asegúrate de activar:

```text
Formato: glTF Binary (.glb)
Include:
  ☑ Custom Properties (¡CRÍTICO! Sin esto no viajan pieza_id, capa ni material)
  ☑ Selected Objects (Recomendado para no exportar cámaras ni luces de estudio)
Transform:
  ☑ +Y Up
Geometry:
  ☑ Apply Modifiers
  ☑ Compression (Opcional, Draco habilitado en la web)
```

---

## 5. Detección de Siluetas y Cotas (`silhouetteSegments`)

El Asistente de Manuales proyecta el contorno del ensamble en un lienzo 2D frontal:
* **Umbral de ángulo**: `18°` — diseñado específicamente para conservar biseles y aristas redondeadas sin perder el contorno perimetral.
* Las dimensiones máximas de la caja envolvente (*Bounding Box*) se calculan automáticamente y se inyectan en los campos de cota:
  * **Ancho ($X$)**
  * **Alto ($Y$)**
  * **Profundidad ($Z$)**
