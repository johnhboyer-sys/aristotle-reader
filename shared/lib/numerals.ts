// Greek alphabetic numerals, as the redesign numbers books, themes and guide
// sections: Α, Β, Γ … Θ, then Ι, ΙΑ, ΙΒ (Laws XI, XII). Capitals with no
// keraia, matching the inscription lettering. Stigma (Ϛ) stands for 6 and
// koppa (Ϟ) for 90; 1–99 is all the site needs.
const UNITS = ['', 'Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ϛ', 'Ζ', 'Η', 'Θ'];
const TENS = ['', 'Ι', 'Κ', 'Λ', 'Μ', 'Ν', 'Ξ', 'Ο', 'Π', 'Ϟ'];

export function greekNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new RangeError(`greekNumeral: ${n} is outside 1–99`);
  return TENS[Math.floor(n / 10)] + UNITS[n % 10];
}
