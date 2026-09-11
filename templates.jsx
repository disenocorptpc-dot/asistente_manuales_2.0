/* global React */
const { useState, useRef, useEffect, useCallback, useMemo } = React;

const ReadOnlyContext = React.createContext(false);
window.ReadOnlyContext = ReadOnlyContext;


/* ───────── Slide template definitions ───────── */
const TEMPLATES = {
  cover: {
    id: 'cover',
    name: 'Portada',
    desc: 'Cubierta corporativa con líneas',
    icon: 'rectangle-vertical',
    defaults: (projectName = '', property = '') => ({
      projectType: 'PROPUESTA DE DISEÑO',
      itemTitle: projectName || 'NOMBRE DEL PROYECTO',
      siteName: property || 'UBICACIÓN',
    }),
  },
  montaje: {
    id: 'montaje',
    name: 'Montaje',
    desc: 'Render hero a página completa',
    icon: 'frame',
    defaults: (projectName = '') => ({
      label: 'Montaje',
      assetMontaje: null,
    }),
  },
  descriptivo: {
    id: 'descriptivo',
    name: 'Descriptivo',
    desc: 'Vista frontal · cotas · render aislado',
    icon: 'layout-2',
    defaults: (projectName = '') => ({
      itemTitle: projectName || 'DESCRIPCIÓN GENERAL',
      sectionLabel: 'PROPUESTA DE DISEÑO',
      descripcion: '',
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
    defaults: (projectName = '') => ({
      itemTitle: projectName || 'DESPIECE EXPLOSIVO',
      sectionLabel: 'EXPLOSIVO',
      assetExplosivo: null,
      annotations: [
        { id: 1, num: '01', label: 'Pieza superior', x: 35, y: 22 },
        { id: 2, num: '02', label: 'Cuerpo central', x: 50, y: 50 },
        { id: 3, num: '03', label: 'Base estructural', x: 60, y: 78 },
      ],
      observaciones: '',
    }),
  },
  planos: {
    id: 'planos',
    name: 'Planos técnicos',
    desc: 'Vistas con cotas',
    icon: 'rulers',
    defaults: (projectName = '') => ({
      itemTitle: projectName || 'PLANOS TÉCNICOS',
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
    defaults: (projectName = '') => ({
      itemTitle: projectName || 'MATERIALES Y ACABADOS',
      sectionLabel: 'MATERIALES Y ACABADOS',
      materiales: [
        {
          id: 1,
          material: 'Material principal',
          descripcion: 'Descripción y acabado del material.',
          asset: null,
        },
        {
          id: 2,
          material: 'Material secundario',
          descripcion: 'Detalle de composición y acabado.',
          asset: null,
        },
        {
          id: 3,
          material: 'Herrajes / Anclaje',
          descripcion: 'Sistema de fijación o ensamble.',
          asset: null,
        },
      ],
    }),
  },
};

const TEMPLATE_LIST = Object.values(TEMPLATES);

/* ───────── Helpers ───────── */
const uid = () => Math.random().toString(36).slice(2, 9);
const newSlide = (templateId, projectName = '', property = '') => ({
  id: uid(),
  template: templateId,
  data: TEMPLATES[templateId].defaults(projectName, property),
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
  Letter_landscape: { w: 1056, h: 816, wMM: 279.4,  hMM: 215.9,  label: 'Carta (horizontal)' },
  '16x9':           { w: 1280, h: 720, wMM: 338.67, hMM: 190.5,  label: '16:9' },
};

window.TEMPLATES = TEMPLATES;
window.TEMPLATE_LIST = TEMPLATE_LIST;
window.PAGE_SIZES = PAGE_SIZES;
window.uid = uid;
window.newSlide = newSlide;
window.SEED_SLIDES = SEED_SLIDES;
