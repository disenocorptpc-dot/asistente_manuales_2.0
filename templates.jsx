/* global React */
const { useState, useRef, useEffect, useCallback, useMemo } = React;

/* ───────── Slide template definitions ───────── */
const TEMPLATES = {
  cover: {
    id: 'cover',
    name: 'Portada',
    desc: 'Cubierta corporativa con líneas',
    icon: 'rectangle-vertical',
    defaults: () => ({
      itemTitle: 'BAÑO DE HUÉSPEDES',
    }),
  },
  montaje: {
    id: 'montaje',
    name: 'Montaje',
    desc: 'Render hero a página completa',
    icon: 'frame',
    defaults: () => ({
      label: 'Montaje',
      assetMontaje: null,
    }),
  },
  descriptivo: {
    id: 'descriptivo',
    name: 'Descriptivo',
    desc: 'Vista frontal · cotas · render aislado',
    icon: 'layout-2',
    defaults: () => ({
      itemTitle: 'BAÑO DE HUÉSPEDES',
      sectionLabel: 'PROPUESTA DE DISEÑO',
      descripcion:
        'Madera sólida color avellana clara de 12 mm de espesor. El frente presenta un desbaste de 3 mm para la incrustación de íconos en acrílico de 12 mm con acabado en pintura automotriz, color a definir según ubicación.',
      cotaAncho: '30 cm',
      cotaAlto: '15 cm',
      assetVector: null,
      assetRender: null,
    }),
  },
  explosivo: {
    id: 'explosivo',
    name: 'Explosivo',
    desc: 'Despiece con anotaciones',
    icon: 'package',
    defaults: () => ({
      itemTitle: 'BAÑO DE HUÉSPEDES',
      sectionLabel: 'EXPLOSIVO',
      assetExplosivo: null,
      annotations: [
        { id: 1, num: '01', label: 'Pieza superior — madera sólida', x: 35, y: 22 },
        { id: 2, num: '02', label: 'Cuerpo central — acrílico 12 mm', x: 50, y: 50 },
        { id: 3, num: '03', label: 'Base estructural — herraje oculto', x: 60, y: 78 },
      ],
    }),
  },
  planos: {
    id: 'planos',
    name: 'Planos técnicos',
    desc: 'Vistas con cotas',
    icon: 'rulers',
    defaults: () => ({
      itemTitle: 'BAÑO DE HUÉSPEDES',
      sectionLabel: 'PLANOS TÉCNICOS',
      assetPlano: null,
      cotas: [
        { id: 1, label: 'Ancho total', value: '4.00 m' },
        { id: 2, label: 'Altura total', value: '3.45 m' },
        { id: 3, label: 'Profundidad', value: '0.08 m' },
        { id: 4, label: 'Margen sup.', value: '0.40 m' },
      ],
    }),
  },
  materiales: {
    id: 'materiales',
    name: 'Materiales y acabados',
    desc: 'Especificaciones técnicas',
    icon: 'palette',
    defaults: () => ({
      itemTitle: 'BAÑO DE HUÉSPEDES',
      sectionLabel: 'MATERIALES Y ACABADOS',
      materiales: [
        {
          id: 1,
          tipo: 'Cuerpo principal',
          material: 'Madera sólida — avellana clara',
          acabado: 'Barniz mate',
          pantone: '7499 C',
          showPantone: true,
          asset: null,
        },
        {
          id: 2,
          tipo: 'Íconos frontales',
          material: 'Acrílico inyectado 12 mm',
          acabado: 'Pintura automotriz',
          pantone: '432 C',
          showPantone: true,
          asset: null,
        },
        {
          id: 3,
          tipo: 'Anclaje',
          material: 'Espárragos en aluminio',
          acabado: 'Anodizado natural',
          pantone: '',
          showPantone: false,
          asset: null,
        },
      ],
    }),
  },
};

const TEMPLATE_LIST = Object.values(TEMPLATES);

/* ───────── Helpers ───────── */
const uid = () => Math.random().toString(36).slice(2, 9);
const newSlide = (templateId) => ({
  id: uid(),
  template: templateId,
  data: TEMPLATES[templateId].defaults(),
});

/* Initial seed */
const SEED_SLIDES = [
  newSlide('cover'),
  newSlide('montaje'),
  newSlide('descriptivo'),
  newSlide('explosivo'),
  newSlide('planos'),
  newSlide('materiales'),
];

/* Page sizes. wMM/hMM are the canonical print dimensions; w/h are 96dpi pixel equivalents for screen. */
const PAGE_SIZES = {
  A4_landscape:     { w: 1123, h: 794, wMM: 297,    hMM: 210,    label: 'A4 (horizontal)' },
  Letter_landscape: { w: 1056, h: 816, wMM: 279.4,  hMM: 215.9,  label: 'Carta (horizontal)' },
  '16x9':           { w: 1280, h: 720, wMM: 338.67, hMM: 190.5,  label: '16:9' },
};

window.TEMPLATES = TEMPLATES;
window.TEMPLATE_LIST = TEMPLATE_LIST;
window.PAGE_SIZES = PAGE_SIZES;
window.uid = uid;
window.newSlide = newSlide;
window.SEED_SLIDES = SEED_SLIDES;
