# Referencia de la API — Cloudflare Pages Functions

Esta documentación describe todos los endpoints HTTP disponibles en el backend serverless de **Asistente de Manuales 2.0**.

---

## 1. Proyectos y Manuales (`/api/projects`)

### Listar Proyectos
```http
GET /api/projects
```
Retorna un arreglo JSON con todos los manuales registrados en la base de datos D1, ordenados cronológicamente por su fecha de última modificación descendente.

* **Headers requeridos**: Ninguno.
* **Respuesta 200 OK**:
  ```json
  [
    {
      "id": 15,
      "name": "Letrero Principal Lobby",
      "property": "Moon Palace The Grand",
      "updated_at": "2026-09-11 18:30:12"
    },
    {
      "id": 14,
      "name": "Módulo de Recepción A-01",
      "property": "Le Blanc Los Cabos",
      "updated_at": "2026-09-10 14:15:00"
    }
  ]
  ```

---

### Crear Proyecto
```http
POST /api/projects
Content-Type: application/json
```
Crea un nuevo registro en la tabla `projects` de D1 y retorna el identificador autogenerado.

* **Cuerpo de la Petición**:
  ```json
  {
    "name": "Lámpara Colgante Restaurante",
    "property": "Sun Palace",
    "data": {
      "globals": {
        "title": "Lámpara Colgante Restaurante",
        "property": "Sun Palace",
        "date": "11/09/2026",
        "pageSize": "Letter_landscape"
      },
      "slides": [ ... ]
    }
  }
  ```
* **Respuesta 200 OK**:
  ```json
  {
    "id": 16,
    "name": "Lámpara Colgante Restaurante",
    "property": "Sun Palace"
  }
  ```
* **Errores**:
  * `500 Internal Server Error`: Si no existe el binding `DB` o falla la inserción SQL.

---

### Obtener Proyecto Específico
```http
GET /api/projects/:id
```
Recupera el manual completo, deserializando automáticamente el campo JSON `data`.

* **Parámetros**: `id` (Número entero, ID de la fila).
* **Respuesta 200 OK**:
  ```json
  {
    "id": 16,
    "name": "Lámpara Colgante Restaurante",
    "property": "Sun Palace",
    "data": {
      "globals": { ... },
      "slides": [ ... ]
    },
    "updated_at": "2026-09-11 18:35:00"
  }
  ```
* **Errores**:
  * `404 Not Found`: Si el manual con ese ID no existe.

---

### Actualizar Proyecto
```http
PUT /api/projects/:id
Content-Type: application/json
```
Actualiza el nombre, propiedad y contenido del manual, estampando la fecha actual en `updated_at`.

* **Cuerpo de la Petición**:
  ```json
  {
    "name": "Lámpara Colgante Restaurante (Revisión B)",
    "property": "Sun Palace",
    "data": { ... }
  }
  ```
* **Respuesta 200 OK**:
  ```json
  { "message": "Updated successfully" }
  ```

---

### Eliminar Proyecto
```http
DELETE /api/projects/:id
```
Elimina permanentemente el registro en la base de datos D1.

* **Respuesta 200 OK**:
  ```json
  { "message": "Deleted" }
  ```

---

## 2. Multimedia y Archivos (`/api/upload`)

### Subir Imagen a Cloudflare R2
```http
POST /api/upload
Content-Type: multipart/form-data
```
Almacena un archivo de imagen en el bucket R2 configurado en Cloudflare (`env.BUCKET`).

* **Form Data**:
  * `image`: Archivo binario (PNG, JPG, WebP).
* **Respuesta 200 OK**:
  ```json
  { "url": "/uploads/1726084500000-k9x1z.png" }
  ```
* **Errores**:
  * `400 Bad Request`: Si no se adjuntó archivo.

---

## 3. Inteligencia Artificial (`/api/ai/*`)

### Redacción Técnica con Gemini
```http
POST /api/ai/describe
Content-Type: application/json
```
Genera la redacción técnica en lenguaje natural a partir de los metadatos y dimensiones de las piezas.

* **Cuerpo de la Petición**:
  ```json
  {
    "prompt": "Genera una ficha técnica para: Letrero acrílico de 120x40cm con estructura de aluminio anodizado..."
  }
  ```
* **Respuesta 200 OK**:
  ```json
  {
    "texto": "Cuerpo fabricado en perfilería de aluminio con acabado anodizado negro mate...",
    "modelo": "gemini-2.5-flash"
  }
  ```
* **Errores**:
  * `501 Not Implemented`: Falta la variable `GEMINI_API_KEY`.
  * `413 Payload Too Large`: Si el prompt excede los 20,000 caracteres.
  * `502 Bad Gateway`: Error de cuota o comunicación con Google AI Studio.

---

### Render Conceptual Asistido (img2img)
```http
POST /api/ai/render
Content-Type: application/json
```
Reinterpreta una imagen base del canvas para previsualizar acabados y texturas fotorrealistas.

* **Cuerpo de la Petición**:
  ```json
  {
    "prompt": "Modern luxury hotel lobby signage, ambient lighting, high architectural detail",
    "imagen": "data:image/png;base64,...",
    "strength": 0.45
  }
  ```
* **Respuesta 200 OK**:
  ```json
  {
    "imagen": "data:image/png;base64,...",
    "proveedor": "gemini",
    "modelo": "gemini-2.5-flash-image"
  }
  ```
