const SVG_HEADER = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>`;

function makeImage(svgBody: string): HTMLImageElement {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`${SVG_HEADER}${svgBody}</svg>`)}`;
  return image;
}

const C = {
  house: '#fff',
  red: '#b75',
  blue: '#abb',
  yellow: '#f80',
  shade: '#0001',
  shade2: '#0002',
  leaf: '#ac6',
  ui: '#443'
} as const;

const makeHouse = (stroke: string) =>
  makeImage(`
  <path d='M35 65 58 65' stroke='${C.shade2}' stroke-width='6' stroke-linecap='round'/>
  <circle cx='50' cy='50' r='24' fill='${C.house}'/>
  <circle cx='50' cy='50' r='8' fill='none' stroke='${stroke}' stroke-width='3.3'/>
`);

const makeOfficePin = (stroke: string) =>
  makeImage(`
  <rect x='15' y='15' width='70' height='70' rx='12' fill='none' stroke='${stroke}' stroke-width='5'/>
  <circle cx='50' cy='50' r='9' fill='${stroke}'/>
`);

export const sprites = {
  tree: makeImage(`
    <ellipse cx='56' cy='58' rx='21' ry='12' fill='${C.shade}'/>
    <circle cx='37' cy='43' r='13' fill='${C.leaf}'/>
    <circle cx='51' cy='35' r='16' fill='${C.leaf}'/>
    <circle cx='64' cy='46' r='12' fill='${C.leaf}'/>
    <circle cx='47' cy='49' r='11' fill='${C.leaf}'/>
  `),
  villager: makeImage(`
    <ellipse cx='56' cy='74' rx='14' ry='8' fill='${C.shade}'/>
    <circle cx='50' cy='36' r='8' fill='${C.red}'/>
    <path d='M42 46 Q50 43 58 46 L58 69 Q50 72 42 69 Z' fill='${C.ui}'/>
  `),
  houseRed: makeHouse(C.red),
  houseBlue: makeHouse(C.blue),
  houseYellow: makeHouse(C.yellow),
  officeRed: makeOfficePin(C.red),
  officeBlue: makeOfficePin(C.blue),
  officeYellow: makeOfficePin(C.yellow)
};

export function drawSprite(
  image: HTMLImageElement,
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
): void {
  if (!image.complete) return;
  context.drawImage(image, -0.5, -0.5, 1, 1);
}
