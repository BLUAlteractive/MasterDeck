import { getFace } from '@deckforge/game-core';

export const cardArtDimensions = { width: 240, height: 336 } as const;
const ink = '#172c38';
const redInk = '#a53543';
// Original geometric paths, authored here; no external images, fonts or trademark artwork.
function suitShape(suit: string, color: string): string {
  switch (suit) {
    case 'HEARTS':
      return (
        '<path d="M0 27 C-8 15 -30 2 -30 -15 C-30 -39 -5 -40 0 -23 C5 -40 30 -39 30 -15 C30 2 8 15 0 27Z" fill="' +
        color +
        '"/>'
      );
    case 'DIAMONDS':
      return '<path d="M0 -38 L27 -3 L0 32 L-27 -3Z" fill="' + color + '"/>';
    case 'SPADES':
      return (
        '<path d="M0 -39 C-10 -23 -32 -13 -32 3 C-32 22 -12 27 -4 13 L-9 33 L9 33 L4 13 C12 27 32 22 32 3 C32 -13 10 -23 0 -39Z" fill="' +
        color +
        '"/>'
      );
    case 'CLUBS':
      return (
        '<g fill="' +
        color +
        '"><circle cx="0" cy="-23" r="17"/><circle cx="-17" cy="4" r="17"/><circle cx="17" cy="4" r="17"/><path d="M-4 7 L-10 33 L10 33 L4 7Z"/></g>'
      );
    default:
      throw new Error('Unknown suit');
  }
}
function frame(contents: string, background: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="336" viewBox="0 0 240 336"><rect x="2" y="2" width="236" height="332" rx="15" fill="' +
    background +
    '" stroke="#b7c4c7" stroke-width="2"/>' +
    contents +
    '</svg>'
  );
}
export function pipPositions(
  rank: number,
): readonly (readonly [number, number])[] {
  const two = [
    [120, 104],
    [120, 232],
  ] as const;
  const four = [
    [78, 104],
    [162, 104],
    [78, 232],
    [162, 232],
  ] as const;
  const six = [78, 162].flatMap((x) =>
    [104, 168, 232].map((y) => [x, y] as const),
  );
  const eight = [78, 162].flatMap((x) =>
    [88, 141, 195, 248].map((y) => [x, y] as const),
  );
  switch (rank) {
    case 2:
      return two;
    case 3:
      return [...two, [120, 168]];
    case 4:
      return four;
    case 5:
      return [...four, [120, 168]];
    case 6:
      return six;
    case 7:
      return [...six, [120, 136]];
    case 8:
      return [...six, [120, 136], [120, 200]];
    case 9:
      return [...eight, [120, 168]];
    case 10:
      return [...eight, [120, 114], [120, 222]];
    default:
      throw new Error('Pip layout is only defined for ranks two through ten.');
  }
}
export function renderCardFaceSvg(faceId: string): string {
  const face = getFace(faceId);
  const color =
    face.suit === 'HEARTS' || face.suit === 'DIAMONDS' ? redInk : ink;
  const corner =
    '<text x="22" y="44" fill="' +
    color +
    '" font-family="serif" font-weight="bold" font-size="28">' +
    face.rankLabel +
    '</text><g transform="translate(29 66) scale(.25)">' +
    suitShape(face.suit, color) +
    '</g>';
  let center: string;
  if (face.rank <= 10) {
    center = pipPositions(face.rank)
      .map(
        ([x, y]) =>
          '<g transform="translate(' +
          x +
          ' ' +
          y +
          ') scale(.43)">' +
          suitShape(face.suit, color) +
          '</g>',
      )
      .join('');
  } else if (face.rank === 14) {
    center =
      '<g transform="translate(120 168)">' +
      suitShape(face.suit, color) +
      '</g>';
  } else {
    center =
      '<path d="M52 168 L120 82 L188 168 L120 254Z" fill="none" stroke="#d6d7c9" stroke-width="2"/><text x="120" y="180" text-anchor="middle" font-family="serif" font-size="64" fill="' +
      color +
      '">' +
      face.rankLabel +
      '</text><g transform="translate(120 219) scale(.3)">' +
      suitShape(face.suit, color) +
      '</g>';
  }
  return frame(
    '<title>' +
      face.label +
      '</title>' +
      corner +
      '<g transform="translate(240 336) rotate(180)">' +
      corner +
      '</g>' +
      center,
    '#fbf8ee',
  );
}
export function renderCardBackSvg(): string {
  const lattice = Array.from({ length: 7 }, (_, i) => {
    const y = 51 + i * 39;
    return (
      '<path d="M28 ' +
      y +
      ' L120 ' +
      (y - 29) +
      ' L212 ' +
      y +
      ' L120 ' +
      (y + 29) +
      'Z" fill="none" stroke="#7191a7" stroke-width="1"/>'
    );
  }).join('');
  return frame(
    '<title>Original blue geometric card back</title><rect x="15" y="15" width="210" height="306" rx="9" fill="none" stroke="#c6d3d7" stroke-width="2"/>' +
      lattice +
      '<path d="M83 168 L120 125 L157 168 L120 211Z" fill="#203f58" stroke="#c6d3d7" stroke-width="2"/><circle cx="120" cy="168" r="11" fill="none" stroke="#c6d3d7" stroke-width="2"/>',
    '#203f58',
  );
}
