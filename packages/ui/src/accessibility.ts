/** sRGB relative luminance; used for auditable palette checks, not a certification. */
export function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    if (!/^#[a-f\d]{6}$/i.test(hex)) throw new Error('EXPECTED_RGB_HEX');
    const channels = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return (
      channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
    );
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
