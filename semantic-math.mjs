const SUPERSCRIPT_TO_ASCII = Object.freeze({
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5",
  "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-",
  "⁽": "(", "⁾": ")", "ⁿ": "n", "ⁱ": "i",
});
const SUBSCRIPT_TO_ASCII = Object.freeze({
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5",
  "₆": "6", "₇": "7", "₈": "8", "₉": "9", "₊": "+", "₋": "-",
  "₍": "(", "₎": ")", "ₐ": "a", "ₑ": "e", "ₕ": "h", "ᵢ": "i",
  "ⱼ": "j", "ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₒ": "o",
  "ₚ": "p", "ᵣ": "r", "ₛ": "s", "ₜ": "t", "ᵤ": "u", "ᵥ": "v", "ₓ": "x",
});
const ASCII_TO_SUPERSCRIPT = Object.freeze(Object.fromEntries(Object.entries(SUPERSCRIPT_TO_ASCII).map(([key, value]) => [value, key])));
const ASCII_TO_SUBSCRIPT = Object.freeze(Object.fromEntries(Object.entries(SUBSCRIPT_TO_ASCII).map(([key, value]) => [value, key])));

const SYMBOLS = Object.freeze({
  alpha: ["α", "alpha"], beta: ["β", "beta"], gamma: ["γ", "gamma"], delta: ["δ", "delta"],
  Gamma: ["Γ", "capital gamma"], Delta: ["Δ", "capital delta"], Theta: ["Θ", "capital theta"],
  Lambda: ["Λ", "capital lambda"], Pi: ["Π", "capital pi"], Psi: ["Ψ", "capital psi"],
  epsilon: ["ε", "epsilon"], varepsilon: ["ε", "epsilon"],
  zeta: ["ζ", "zeta"], eta: ["η", "eta"], theta: ["θ", "theta"], kappa: ["κ", "kappa"],
  lambda: ["λ", "lambda"], mu: ["μ", "mu"], nu: ["ν", "nu"], xi: ["ξ", "xi"],
  tau: ["τ", "tau"], pi: ["π", "pi"], upsilon: ["υ", "upsilon"], chi: ["χ", "chi"], psi: ["ψ", "psi"],
  rho: ["ρ", "rho"], sigma: ["σ", "sigma"], Sigma: ["Σ", "sum"], phi: ["φ", "phi"],
  varphi: ["φ", "phi"], Phi: ["Φ", "capital phi"], omega: ["ω", "omega"], Omega: ["Ω", "ohm"],
  partial: ["∂", "partial derivative"], nabla: ["∇", "nabla"], ell: ["ℓ", "ell"],
  hbar: ["ℏ", "h bar"], aleph: ["ℵ", "aleph"], imath: ["ı", "dotless i"], jmath: ["ȷ", "dotless j"],
  AA: ["Å", "angstrom"], infty: ["∞", "infinity"], degree: ["°", "degrees"], circ: ["°", "degrees"],
});
const OPERATORS = Object.freeze({
  times: ["×", "times"], cdot: ["·", "times"], pm: ["±", "plus or minus"],
  div: ["÷", "divided by"], mp: ["∓", "minus or plus"],
  le: ["≤", "less than or equal to"], leq: ["≤", "less than or equal to"], leqslant: ["⩽", "less than or equal to"],
  ge: ["≥", "greater than or equal to"], geq: ["≥", "greater than or equal to"],
  neq: ["≠", "not equal to"], ne: ["≠", "not equal to"], nleq: ["≰", "not less than or equal to"],
  approx: ["≈", "approximately equal to"], sim: ["∼", "is similar to"], nsim: ["≁", "is not similar to"],
  simeq: ["≃", "is asymptotically equal to"], cong: ["≅", "is congruent to"], ncong: ["≇", "is not congruent to"],
  equiv: ["≡", "is equivalent to"], propto: ["∝", "is proportional to"],
  ll: ["≪", "is much less than"], gg: ["≫", "is much greater than"], lesssim: ["≲", "is less than or similar to"],
  gtrsim: ["≳", "is greater than or similar to"], lessgtr: ["≶", "is less than or greater than"],
  gtrless: ["≷", "is greater than or less than"], lt: ["<", "less than"], nless: ["≮", "is not less than"],
  sum: ["Σ", "sum"], prod: ["∏", "product"], int: ["∫", "integral"], oint: ["∮", "closed surface integral"],
  bigcup: ["⋃", "big union"], bigcap: ["⋂", "big intersection"], bigvee: ["⋁", "big logical or"],
  cap: ["∩", "intersection"], cup: ["∪", "union"], setminus: ["∖", "set minus"],
  in: ["∈", "is an element of"], notin: ["∉", "is not an element of"],
  subset: ["⊂", "is a subset of"], subseteq: ["⊆", "is a subset of or equal to"], subsetneq: ["⊊", "is a proper subset of"],
  nsubseteq: ["⊈", "is not a subset of or equal to"], supset: ["⊃", "is a superset of"], supseteq: ["⊇", "is a superset of or equal to"],
  emptyset: ["∅", "empty set"], varnothing: ["∅", "empty set"],
  parallel: ["∥", "is parallel to"], nparallel: ["∦", "is not parallel to"], perp: ["⊥", "is perpendicular to"],
  mid: ["∣", "divides"], nmid: ["∤", "does not divide"],
  angle: ["∠", "angle"], triangle: ["△", "triangle"],
  square: ["□", "square"], Box: ["□", "square"], blacksquare: ["■", "end of proof"],
  diamond: ["◇", "diamond"], bigcirc: ["○", "circle"], bowtie: ["⋈", "bow tie"],
  checkmark: ["✓", "check mark"], bullet: ["•", "bullet"], star: ["⋆", "star"], ast: ["∗", "asterisk"],
  spadesuit: ["♠", "spade"], heartsuit: ["♥", "heart"], diamondsuit: ["♦", "diamond"], clubsuit: ["♣", "club"],
  oplus: ["⊕", "direct sum"], ominus: ["⊖", "circled minus"], otimes: ["⊗", "tensor product"], odot: ["⊙", "circled dot"],
  to: ["→", "to"], rightarrow: ["→", "to"], longrightarrow: ["⟶", "to"],
  leftarrow: ["←", "from"], longleftarrow: ["⟵", "from"], leftrightarrow: ["↔", "corresponds to"],
  longleftrightarrow: ["⟷", "corresponds to"], mapsto: ["↦", "maps to"], longmapsto: ["⟼", "maps to"],
  uparrow: ["↑", "increases"], downarrow: ["↓", "decreases"], nearrow: ["↗", "increases"], searrow: ["↘", "decreases"],
  Downarrow: ["⇓", "downward implication"],
  nrightarrow: ["↛", "does not proceed to"], curvearrowright: ["↷", "curves to"], rightleftarrows: ["⇄", "is reversible with"],
  Rightarrow: ["⇒", "implies"], Longrightarrow: ["⟹", "implies"], implies: ["⇒", "implies"],
  nRightarrow: ["⇏", "does not imply"], Leftarrow: ["⇐", "is implied by"],
  Leftrightarrow: ["⇔", "is equivalent to"], Longleftrightarrow: ["⟺", "is equivalent to"], iff: ["⇔", "if and only if"],
  rightleftharpoons: ["⇌", "is in equilibrium with"],
  vee: ["∨", "logical or"], lor: ["∨", "logical or"], wedge: ["∧", "logical and"], land: ["∧", "logical and"],
  neg: ["¬", "logical not"], lnot: ["¬", "logical not"], forall: ["∀", "for all"], exists: ["∃", "there exists"],
  nexists: ["∄", "there does not exist"], therefore: ["∴", "therefore"], because: ["∵", "because"],
  colon: [":", "colon"], backslash: ["\\", "backslash"], prime: ["′", "prime"], ddagger: ["‡", "double dagger"],
  dashv: ["⊣", "is implied by"], vdash: ["⊢", "proves"], top: ["⊤", "true"],
  lvert: ["|", "absolute value"], rvert: ["|", "absolute value"], vert: ["|", "vertical bar"],
  lVert: ["‖", "norm"], rVert: ["‖", "norm"], langle: ["⟨", "left angle bracket"], rangle: ["⟩", "right angle bracket"],
  lfloor: ["⌊", "floor"], rfloor: ["⌋", "floor"], lceil: ["⌈", "ceiling"], rceil: ["⌉", "ceiling"],
  lbrace: ["{", "left brace"], rbrace: ["}", "right brace"], diagup: ["/", "slash"],
  cdots: ["⋯", "and so on"], ldots: ["…", "and so on"], dots: ["…", "and so on"], vdots: ["⋮", "and so on vertically"],
  frown: ["⌢", "arc"], succ: ["≻", "succeeds"],
});
const IGNORED_COMMANDS = new Set([
  "left", "right", "middle", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr",
  "displaystyle", "textstyle", "scriptstyle", "limits", "nolimits", "Large", "rm",
]);
// The subset of the above that sizes a delimiter to the expression it wraps.
// The command itself carries no meaning, but the delimiter that follows it has
// to grow with the content, so the two cannot be dropped together.
const DELIMITER_SIZING_COMMANDS = new Set([
  "left", "right", "middle", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr",
]);
const FENCE_DELIMITERS = new Set([
  "(", ")", "[", "]", "{", "}", "|", "‖", "⟨", "⟩", "⌈", "⌉", "⌊", "⌋", "/", "\\", "↑", "↓", "⇑", "⇓",
]);
const SPACING_COMMANDS = new Set([",", ";", ":", "!", "quad", "qquad", " "]);
const STYLE_COMMANDS = Object.freeze({
  mathrm: "normal", textrm: "normal", operatorname: "normal", mathbf: "bold", boldsymbol: "bold",
  mathbb: "double-struck", mathcal: "script", mathscr: "script", mathfrak: "fraktur", mathsf: "sans-serif",
  mathtt: "monospace", mathit: "italic",
});
const TEXT_STYLE_COMMANDS = Object.freeze({ textbf: "bold", textit: "italic", texttt: "monospace" });
const FUNCTION_COMMANDS = new Set([
  "sin", "cos", "tan", "cot", "coth", "sec", "csc", "cosec", "sinh", "cosh", "tanh",
  "arcsin", "arccos", "arctan", "log", "ln", "exp", "lim", "min", "max", "inf", "sup", "det", "gcd", "deg", "arg", "dim", "Re", "Im",
]);
const ACCENT_COMMANDS = Object.freeze({
  vec: "→", overrightarrow: "→", underrightarrow: "→", overleftarrow: "←", overleftrightarrow: "↔", underleftrightarrow: "↔",
  hat: "^", widehat: "^", tilde: "~", widetilde: "~", bar: "¯", overline: "¯", underline: "_", dot: "˙", ddot: "¨",
});
const STRUCTURAL_COMMANDS = new Set([
  "begin", "end", "frac", "dfrac", "tfrac", "binom", "dbinom", "boxed", "ce", "sqrt",
  "overset", "stackrel", "underset", "overbrace", "underbrace", "xrightarrow", "xRightarrow", "xrightleftharpoons",
  "cancel", "smash", "mathrel", "mathbin", "phantom", "hspace", "tag", "pmod", "bmod", "mod", "bond",
  "not", "centernot", "substack", "text", "choose", "atop", "newline", "cr", "hline", "toprule", "midrule", "bottomrule",
]);
export const SUPPORTED_TEX_COMMANDS = Object.freeze([...new Set([
  ...Object.keys(SYMBOLS), ...Object.keys(OPERATORS), ...Object.keys(STYLE_COMMANDS), ...Object.keys(TEXT_STYLE_COMMANDS),
  ...FUNCTION_COMMANDS, ...Object.keys(ACCENT_COMMANDS), ...IGNORED_COMMANDS, ...SPACING_COMMANDS, ...STRUCTURAL_COMMANDS,
])].sort());
const SUPPORTED_TEX_COMMAND_SET = new Set(SUPPORTED_TEX_COMMANDS);

export function unsupportedTexCommands(value) {
  return Object.freeze([...new Set([...String(value ?? "").matchAll(/\\([A-Za-z]+|.)/gu)]
    .map((match) => match[1])
    .filter((command) => /[A-Za-z]/u.test(command) && !SUPPORTED_TEX_COMMAND_SET.has(command)))].sort());
}
const TABLE_ENVIRONMENTS = Object.freeze({
  matrix: Object.freeze({ leftDelimiter: "", rightDelimiter: "", spokenKind: "matrix" }),
  smallmatrix: Object.freeze({ leftDelimiter: "", rightDelimiter: "", spokenKind: "matrix" }),
  bmatrix: Object.freeze({ leftDelimiter: "[", rightDelimiter: "]", spokenKind: "matrix" }),
  Bmatrix: Object.freeze({ leftDelimiter: "{", rightDelimiter: "}", spokenKind: "matrix" }),
  pmatrix: Object.freeze({ leftDelimiter: "(", rightDelimiter: ")", spokenKind: "matrix" }),
  vmatrix: Object.freeze({ leftDelimiter: "|", rightDelimiter: "|", spokenKind: "determinant" }),
  Vmatrix: Object.freeze({ leftDelimiter: "‖", rightDelimiter: "‖", spokenKind: "determinant" }),
  cases: Object.freeze({ leftDelimiter: "{", rightDelimiter: "", spokenKind: "piecewise expression" }),
  array: Object.freeze({ leftDelimiter: "", rightDelimiter: "", spokenKind: "array", columnSpecification: true }),
  aligned: Object.freeze({ leftDelimiter: "", rightDelimiter: "", spokenKind: "aligned expression" }),
  alignedat: Object.freeze({ leftDelimiter: "", rightDelimiter: "", spokenKind: "aligned expression", columnSpecification: true }),
  align: Object.freeze({ leftDelimiter: "", rightDelimiter: "", spokenKind: "aligned expression" }),
  "align*": Object.freeze({ leftDelimiter: "", rightDelimiter: "", spokenKind: "aligned expression" }),
  gathered: Object.freeze({ leftDelimiter: "", rightDelimiter: "", spokenKind: "aligned expression" }),
  split: Object.freeze({ leftDelimiter: "", rightDelimiter: "", spokenKind: "aligned expression" }),
});
const UNIT_SPOKEN = Object.freeze({
  mm: "millimetres", cm: "centimetres", km: "kilometres", m: "metres", s: "seconds",
  ms: "milliseconds", kg: "kilograms", g: "grams", mol: "moles", Hz: "hertz", V: "volts",
  A: "amperes", C: "coulombs", F: "farads", J: "joules", W: "watts", N: "newtons", Pa: "pascals",
});

const INVALID_RENDERED_MATH_PATTERNS = Object.freeze([
  Object.freeze(["textCommandUsedForIntersection", /\\text\s*\{\s*cap\s*\}/iu]),
  Object.freeze(["leftCommandBeforeClosingDelimiter", /\\left\s*\)/u]),
  Object.freeze(["rightCommandBeforeOpeningDelimiter", /\\right\s*\(/u]),
  Object.freeze(["emptyFractionNumerator", /\\frac\s*\{\s*\}\s*\{/u]),
  Object.freeze(["emptyFractionDenominator", /\\frac\s*\{[^{}]+\}\s*\{\s*\}/u]),
  Object.freeze(["invalidRuntimeToken", /\b(?:undefined|NaN)\b|\[object Object\]/u]),
  Object.freeze(["proseAndSplitIntoIdentifiers", /<mrow>\s*<mi>a<\/mi>\s*<mi>n<\/mi>\s*<mi>d<\/mi>\s*<\/mrow>/iu]),
  Object.freeze(["proseParallelogramSplitIntoIdentifiers", /<mrow>\s*<mi>i<\/mi>\s*<mi>s<\/mi>\s*<mi>a<\/mi>(?:\s*<mi>[a-z]<\/mi>){13}\s*<\/mrow>/iu]),
  Object.freeze(["matrixEnvironmentCommandLeak", /(?:^|[^\\])\b(?:begin|end)\s*(?:[bpvV]?matrix|smallmatrix|array|cases|aligned(?:at)?|align|gathered|split)\b/iu]),
  Object.freeze(["matrixEnvironmentMathmlCommandLeak", /<mtext>(?:begin|end)<\/mtext>(?:\s*<mi>[^<]+<\/mi>){3,12}/iu]),
  Object.freeze(["rawTexCommandLeak", /<mtext>\s*\\[A-Za-z]+<\/mtext>/iu]),
]);

export function invalidRenderedMathFound(value) {
  const source = String(value ?? "");
  return Object.freeze(INVALID_RENDERED_MATH_PATTERNS
    .filter(([, pattern]) => pattern.test(source))
    .map(([name]) => name));
}

export const CANONICAL_EQUATION_SOURCES = Object.freeze({
  dielectricSlabRegionCapacitances: String.raw`C_{1} = \frac{\varepsilon _{0} A}{d/4} = \frac{4\varepsilon _{0} A}{d}, C_{2} = \frac{k\varepsilon _{0} A}{3d/4} = \frac{4k\varepsilon _{0} A}{3d}`,
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decodeHtmlEntities(value) {
  const named = Object.freeze({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " });
  return String(value ?? "").replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos|nbsp));/giu, (entity, decimal, hexadecimal, name) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    return named[name.toLowerCase()] || entity;
  });
}

function stripDelimiters(value) {
  let source = decodeHtmlEntities(value).trim();
  if (source.startsWith("$$") && source.endsWith("$$")) source = source.slice(2, -2);
  else if (source.startsWith("$") && source.endsWith("$")) source = source.slice(1, -1);
  else if (source.startsWith("\\(") && source.endsWith("\\)")) source = source.slice(2, -2);
  else if (source.startsWith("\\[") && source.endsWith("\\]")) source = source.slice(2, -2);
  return source.trim();
}

function superscriptNumber(value) {
  const characters = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return [...String(value || "")].map((character) => characters[character] || character).join("");
}

function superscriptText(value) {
  return [...String(value || "")].map((character) => ASCII_TO_SUPERSCRIPT[character] || character).join("");
}

export function repairCrawlerFormulaSource(value) {
  let normalized = repairMalformedFormulaText(stripDelimiters(value))
    .replaceAll("\u00a0", " ")
    .replace(/\(\s*₀\s+(?=A\b)/gu, "(ε₀ ")
    .replace(/4k₀(?=\s*A\b)/gu, "4kε₀")
    .replace(/4₀(?=\s*A\b)/gu, "4ε₀")
    .replace(/k₀(?=\s*A\b)/gu, "kε₀")
    .replace(/\b(\d)\s+(\d)\s*[−-]\s*(\d+)\b/gu, (_, first, second, exponent) => `${first}${second}⁻${superscriptNumber(exponent)}`)
    .replace(/\b([A-Za-z])\s+([₀₁₂₃₄₅₆₇₈₉])\b/gu, "$1$2")
    .replace(/\s+/gu, " ")
    .trim();

  const verifiedCapacitorRepairs = Object.freeze([
    ["\\frac{4_{0} A}{d}", "\\frac{4\\varepsilon_0 A}{d}"],
    ["\\frac{k_{0} A}{3d/4}", "\\frac{k\\varepsilon_0 A}{3d/4}"],
    ["\\frac{4k_{0} A}{3d}", "\\frac{4k\\varepsilon_0 A}{3d}"],
    ["\\frac{d}{4_{0} A}", "\\frac{d}{4\\varepsilon_0 A}"],
    ["\\frac{3d}{4k_{0} A}", "\\frac{3d}{4k\\varepsilon_0 A}"],
  ]);
  for (const [corrupt, repaired] of verifiedCapacitorRepairs) {
    normalized = normalized
      .replaceAll(corrupt, repaired)
      .replaceAll(corrupt.replace("_", "\\_"), repaired);
  }
  normalized = normalized
    .replace(/\b(\d*k|\d+)\s*\\?_\s*\{?\s*0\s*\}?(?=\s*A\b)/gu, "$1\\varepsilon_0")
    .replace(/\\frac\s*\{\s*4\s*\\?_\s*\{?\s*0\s*\}?\s*A\s*\}\s*\{\s*d\s*\}/gu, "\\frac{4\\varepsilon_0 A}{d}")
    .replace(/\\frac\s*\{\s*k\s*\\?_\s*\{?\s*0\s*\}?\s*A\s*\}\s*\{\s*3d\s*\/\s*4\s*\}/gu, "\\frac{k\\varepsilon_0 A}{3d/4}")
    .replace(/\\frac\s*\{\s*4k\s*\\?_\s*\{?\s*0\s*\}?\s*A\s*\}\s*\{\s*3d\s*\}/gu, "\\frac{4k\\varepsilon_0 A}{3d}")
    .replace(/\\frac\s*\{\s*d\s*\}\s*\{\s*4\s*\\?_\s*\{?\s*0\s*\}?\s*A\s*\}/gu, "\\frac{d}{4\\varepsilon_0 A}")
    .replace(/\\frac\s*\{\s*3d\s*\}\s*\{\s*4k\s*\\?_\s*\{?\s*0\s*\}?\s*A\s*\}/gu, "\\frac{3d}{4k\\varepsilon_0 A}")
    .replace(/\\varepsilon\s+_\{?0\}?/gu, "\\varepsilon_0")
    .replace(/\\epsilon\s+_\{?0\}?/gu, "\\epsilon_0");

  const fingerprint = normalized
    .replace(/\\(?:dfrac|tfrac)/gu, "\\frac")
    .replace(/\\(?:quad|qquad)\b|\\[,;:!]/gu, "")
    .replace(/_\{([^{}]+)\}/gu, "_$1")
    .replace(/\s+/gu, "");
  const canonicalDielectricFingerprint = CANONICAL_EQUATION_SOURCES.dielectricSlabRegionCapacitances
    .replace(/_\{([^{}]+)\}/gu, "_$1")
    .replace(/\\(?:quad|qquad)\b|\\[,;:!]/gu, "")
    .replace(/\s+/gu, "");
  if (fingerprint === canonicalDielectricFingerprint) {
    return CANONICAL_EQUATION_SOURCES.dielectricSlabRegionCapacitances;
  }

  if (/^V_equatorial\s*=\s*(?:\\frac\{1\}\{4\\pi\s+_\{0\}\}\\frac\{p\s+90\^\}\{r\^\{2\}\}|\(1\)\/\(4π₀\)\(p\s+90\^\)\/\(r²\))\s*=\s*0$/u.test(normalized)) {
    return "V_{\\text{equatorial}} = \\frac{1}{4\\pi\\varepsilon_0}\\frac{p\\cos 90^\\circ}{r^2} = 0";
  }
  return normalized;
}

export function repairMalformedFormulaText(value) {
  return String(value ?? "")
    .replaceAll("Rₒne", "Rₒₙₑ")
    .replaceAll("Rₗine", "Rₗᵢₙₑ")
    .replace(/8\\pi\s*\\?_\s*\{?\s*0\s*\}?/gu, "8\\pi\\varepsilon_0")
    .replaceAll("8π₀", "8πε₀")
    .replace(/\b(\d*k|\d+)₀(?=\s*A\b)/gu, "$1ε₀")
    .replace(/\b(\d+)\^\(\s*([+-]?\d+)\s*\)/gu, (_, base, exponent) => `${base}${superscriptText(exponent)}`);
}

function unicodeScriptsToTex(value) {
  return String(value)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿⁱ]+/gu, (script) => `^{${[...script].map((character) => SUPERSCRIPT_TO_ASCII[character] || character).join("")}}`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉₊₋₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+/gu, (script) => `_{${[...script].map((character) => SUBSCRIPT_TO_ASCII[character] || character).join("")}}`);
}

function plainToTexish(value) {
  return unicodeScriptsToTex(String(value))
    .replaceAll("½", "\\frac{1}{2}")
    .replaceAll("¼", "\\frac{1}{4}")
    .replaceAll("¾", "\\frac{3}{4}")
    .replace(/\(([^()]{1,30})\)\s*\/\s*\(([^()]{1,30})\)/gu, "\\frac{$1}{$2}")
    .replace(/\(([-+]?\d+(?:\.\d+)?)\s*\/\s*([-+]?\d+(?:\.\d+)?)\)/gu, "\\frac{$1}{$2}")
    .replaceAll("π", "\\pi ")
    .replaceAll("ε", "\\varepsilon ")
    .replaceAll("μ", "\\mu ")
    .replaceAll("Φ", "\\Phi ")
    .replaceAll("φ", "\\phi ")
    .replaceAll("Σ", "\\sum ")
    .replaceAll("∮", "\\oint ")
    .replaceAll("∫", "\\int ")
    .replaceAll("×", "\\times ")
    .replaceAll("·", "\\cdot ")
    .replaceAll("->", "\\rightarrow ")
    .replaceAll("←", "\\leftarrow ")
    .replaceAll("−", "-");
}

function node(type, properties = {}) {
  return { type, ...properties };
}

function splitTopLevelCommas(value) {
  const output = [];
  let part = "";
  let braceDepth = 0;
  let environmentDepth = 0;
  const source = String(value || "");
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (character === "\\") {
      const environmentMatch = source.slice(index).match(/^\\(begin|end)\s*\{([^{}]+)\}/u);
      if (environmentMatch) {
        environmentDepth += environmentMatch[1] === "begin" ? 1 : -1;
        part += environmentMatch[0];
        index += environmentMatch[0].length;
        continue;
      }
      const commandMatch = source.slice(index).match(/^\\([A-Za-z]+|.)/u);
      const commandSource = commandMatch?.[0] || "\\";
      part += commandSource;
      index += commandSource.length;
      continue;
    }
    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (character === "," && braceDepth === 0 && environmentDepth === 0) {
      output.push(part.trim());
      part = "";
      index += 1;
      continue;
    }
    part += character;
    index += 1;
  }
  output.push(part.trim());
  return output;
}

// Reads an array/alignedat column specification such as `cc|c` or `|c|c|c|`.
// The alignment letters map onto MathML columnalign; each `|` becomes a rule
// between the surrounding columns, which is what makes an augmented matrix
// readable as an augmented matrix.
function parseColumnSpecification(value) {
  const alignments = [];
  const separators = [];
  let pending = 0;
  const source = String(value ?? "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "|") {
      pending += 1;
      continue;
    }
    if (character === "@" || character === "p" || character === "m" || character === "b") {
      // Skip the width/material group these take, e.g. @{\quad} or p{2cm}.
      if (source[index + 1] === "{") {
        let depth = 1;
        let cursor = index + 2;
        while (cursor < source.length && depth > 0) {
          if (source[cursor] === "{") depth += 1;
          else if (source[cursor] === "}") depth -= 1;
          cursor += 1;
        }
        index = cursor - 1;
        if (character !== "@") {
          separators[alignments.length] = pending > 0;
          alignments.push("left");
          pending = 0;
        }
        continue;
      }
    }
    if (!"lcr".includes(character)) continue;
    separators[alignments.length] = pending > 0;
    alignments.push(character === "l" ? "left" : character === "r" ? "right" : "center");
    pending = 0;
  }
  separators[alignments.length] = pending > 0;
  return { alignments, separators };
}

// `rules`, when supplied, collects the row boundaries carrying a horizontal
// rule: 0 sits above the first row, n below the last. Truth tables and
// augmented matrices lose their meaning without them.
function splitTableSource(value, { splitCommas = false, rules = null } = {}) {
  const rows = [[]];
  const completedRows = () => rows.filter((row) => row.some(Boolean)).length;
  let cell = "";
  let braceDepth = 0;
  let environmentDepth = 0;
  const pushCell = () => {
    rows.at(-1).push(cell.trim());
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (rows.at(-1).some(Boolean)) rows.push([]);
    else rows[rows.length - 1] = [];
  };
  const source = String(value || "");
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (character === "\\") {
      if (source[index + 1] === "\\" && braceDepth === 0 && environmentDepth === 0) {
        pushRow();
        index += 2;
        while (/\s/u.test(source[index] || "")) index += 1;
        if (source[index] === "[") {
          const end = source.indexOf("]", index + 1);
          if (end >= 0) index = end + 1;
        }
        continue;
      }
      const commandMatch = source.slice(index).match(/^\\([A-Za-z]+|.)/u);
      const command = commandMatch?.[1] || "";
      const commandSource = commandMatch?.[0] || "\\";
      if (["newline", "cr"].includes(command) && braceDepth === 0 && environmentDepth === 0) {
        pushRow();
        index += commandSource.length;
        continue;
      }
      if (["hline", "toprule", "midrule", "bottomrule"].includes(command) && braceDepth === 0 && environmentDepth === 0) {
        if (rules && !cell.trim()) rules.push(completedRows());
        index += commandSource.length;
        continue;
      }
      const environmentMatch = source.slice(index).match(/^\\(begin|end)\s*\{([^{}]+)\}/u);
      if (environmentMatch) {
        environmentDepth += environmentMatch[1] === "begin" ? 1 : -1;
        cell += environmentMatch[0];
        index += environmentMatch[0].length;
        continue;
      }
      cell += commandSource;
      index += commandSource.length;
      continue;
    }
    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (character === "&" && braceDepth === 0 && environmentDepth === 0) {
      pushCell();
      index += 1;
      continue;
    }
    cell += character;
    index += 1;
  }
  pushCell();
  if (rows.length > 1 && rows.at(-1).every((entry) => !entry)) rows.pop();

  return rows.filter((row) => row.some(Boolean)).map((row) => {
    if (!splitCommas || row.length !== 1) return row;
    const commaCells = splitTopLevelCommas(row[0]);
    return commaCells.length > 1 ? commaCells : row;
  });
}

class TexParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
    this.errors = [];
  }

  parse(stop = null) {
    const children = [];
    let closed = false;
    while (this.index < this.source.length) {
      if (stop && this.source[this.index] === stop) {
        this.index += 1;
        closed = true;
        break;
      }
      if (!stop && this.source[this.index] === "}") {
        this.errors.push(`unexpectedClosingDelimiter:${this.source[this.index]}`);
        this.index += 1;
        continue;
      }
      if (/\s/u.test(this.source[this.index])) {
        this.index += 1;
        continue;
      }
      const next = this.parseAtom();
      if (next) children.push(this.withScripts(next));
    }
    if (stop && !closed) this.errors.push(`unmatchedOpeningDelimiter:${stop === "}" ? "{" : "["}`);
    return node("sequence", { children });
  }

  readCommand() {
    this.index += 1;
    if (this.index >= this.source.length) return "";
    if (!/[A-Za-z]/u.test(this.source[this.index])) return this.source[this.index++];
    const start = this.index;
    while (/[A-Za-z]/u.test(this.source[this.index] || "")) this.index += 1;
    return this.source.slice(start, this.index);
  }

  readGroup(label = "argument") {
    while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
    if (this.source[this.index] === "{") {
      this.index += 1;
      const group = this.parse("}");
      if (!group.children.length) this.errors.push(`empty${label[0].toUpperCase()}${label.slice(1)}`);
      return group;
    }
    if (this.index >= this.source.length) {
      this.errors.push(`missing${label[0].toUpperCase()}${label.slice(1)}`);
      return node("sequence", { children: [] });
    }
    // TeX takes exactly one token for an unbraced macro argument. The ordinary
    // atom reader intentionally coalesces digits, so handle single digit/letter
    // arguments here (for example, “\\frac12” means one half, not 12 over the
    // following symbol).
    const character = this.source[this.index];
    let atom;
    if (/\d/u.test(character)) {
      this.index += 1;
      atom = node("number", { value: character });
    } else if (/[A-Za-z]/u.test(character)) {
      this.index += 1;
      atom = node("identifier", { value: character, spoken: character });
    } else {
      atom = this.parseAtom();
    }
    if (!atom) this.errors.push(`missing${label[0].toUpperCase()}${label.slice(1)}`);
    return node("sequence", { children: atom ? [atom] : [] });
  }

  readOptionalGroup() {
    while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
    if (this.source[this.index] !== "[") return null;
    this.index += 1;
    return this.parse("]");
  }

  readTextGroup() {
    while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
    if (this.source[this.index] !== "{") return plainFromNode(this.readGroup());
    this.index += 1;
    const start = this.index;
    let depth = 1;
    while (this.index < this.source.length && depth > 0) {
      const character = this.source[this.index++];
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
    }
    if (depth > 0) this.errors.push("unmatchedOpeningDelimiter:{");
    const end = depth === 0 ? this.index - 1 : this.index;
    return this.source.slice(start, end)
      .replace(/\\(?:text|mathrm|textrm|operatorname)\s*\{([^{}]*)\}/gu, "$1")
      .replace(/\\(?:quad|qquad|enspace|thinspace)\b|\\[ ,;:!]/gu, " ")
      .replace(/\\[ ,;:!]/gu, " ")
      .replace(/\\([A-Za-z]+)\b/gu, (full, command) => SYMBOLS[command]?.[0] || OPERATORS[command]?.[0] || full)
      .replace(/\s*([·×])\s*/gu, "$1")
      .replace(/\s+/gu, " ")
      .trim();
  }

  readRawGroup(label = "argument") {
    while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
    if (this.source[this.index] !== "{") {
      this.errors.push(`missing${label[0].toUpperCase()}${label.slice(1)}`);
      return "";
    }
    this.index += 1;
    const start = this.index;
    let depth = 1;
    while (this.index < this.source.length && depth > 0) {
      const character = this.source[this.index++];
      if (character === "\\") {
        if (this.index < this.source.length && !/[A-Za-z]/u.test(this.source[this.index])) this.index += 1;
        continue;
      }
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
    }
    if (depth > 0) this.errors.push("unmatchedOpeningDelimiter:{");
    const end = depth === 0 ? this.index - 1 : this.index;
    return this.source.slice(start, end);
  }

  readEnvironmentBody(environment) {
    const start = this.index;
    const environmentPattern = /\\(begin|end)\s*\{([^{}]+)\}/gu;
    environmentPattern.lastIndex = start;
    let depth = 1;
    let match;
    while ((match = environmentPattern.exec(this.source))) {
      if (match[2].trim() !== environment) continue;
      depth += match[1] === "begin" ? 1 : -1;
      if (depth === 0) {
        this.index = environmentPattern.lastIndex;
        return this.source.slice(start, match.index);
      }
    }
    this.index = this.source.length;
    this.errors.push(`unclosedEnvironment:${environment}`);
    return this.source.slice(start);
  }

  parseEnvironment() {
    const environment = this.readRawGroup("environmentName").trim();
    if (!environment) return node("sequence", { children: [] });
    let body = this.readEnvironmentBody(environment);
    const configuration = TABLE_ENVIRONMENTS[environment];
    if (!configuration) {
      const parser = new TexParser(body);
      const parsed = parser.parse();
      this.errors.push(...parser.errors.map((error) => `${environment}:${error}`));
      return parsed;
    }

    let columnLayout = null;
    if (configuration.columnSpecification) {
      const specificationParser = new TexParser(body);
      const specification = specificationParser.readRawGroup("columnSpecification");
      if (!specificationParser.errors.length) {
        body = body.slice(specificationParser.index);
        columnLayout = parseColumnSpecification(specification);
      }
    }

    const rules = [];
    const rawRows = splitTableSource(body, {
      splitCommas: ["matrix", "smallmatrix", "bmatrix", "Bmatrix", "pmatrix", "vmatrix", "Vmatrix"].includes(environment),
      rules,
    });
    const rows = rawRows.map((rawRow, rowIndex) => rawRow.map((rawCell, columnIndex) => {
      const parser = new TexParser(rawCell);
      const parsed = parser.parse();
      this.errors.push(...parser.errors.map((error) => `${environment}[${rowIndex + 1},${columnIndex + 1}]:${error}`));
      return parsed;
    }));
    return node("matrix", { environment, rows, ...configuration, columnLayout, rules });
  }

  parseAtom() {
    const character = this.source[this.index];
    if (character == null) return null;
    if (character === "^" || character === "_") {
      let presubscript = null;
      let presuperscript = null;
      while (this.source[this.index] === "^" || this.source[this.index] === "_") {
        const marker = this.source[this.index++];
        const script = this.readGroup();
        if (marker === "^") presuperscript = script;
        else presubscript = script;
        while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
      }
      const base = this.parseAtom();
      return node("prescript", { base, presubscript, presuperscript });
    }
    if (character === "{") {
      this.index += 1;
      const group = this.parse("}");
      group.explicitGroup = true;
      return group;
    }
    if (character === "\\") {
      const command = this.readCommand();
      if (command === "begin") return this.parseEnvironment();
      if (command === "end") {
        const environment = this.readRawGroup("environmentName").trim();
        this.errors.push(`unexpectedEndEnvironment:${environment || "unknown"}`);
        return node("sequence", { children: [] });
      }
      if (["frac", "dfrac", "tfrac"].includes(command)) {
        return node("fraction", {
          numerator: this.readGroup("fractionNumerator"),
          denominator: this.readGroup("fractionDenominator"),
        });
      }
      if (["binom", "dbinom"].includes(command)) {
        return node("binomial", {
          numerator: this.readGroup("binomialNumerator"),
          denominator: this.readGroup("binomialDenominator"),
        });
      }
      if (command === "boxed") return this.readGroup();
      if (command === "ce") {
        const chemistry = this.readRawGroup("chemicalFormula")
          .replace(/\s*\^\s*$/u, " \\uparrow")
          .replace(/\s*_\s*$/u, " \\downarrow");
        const parser = new TexParser(chemistry);
        const base = parser.parse();
        this.errors.push(...parser.errors.map((error) => `ce:${error}`));
        return node("roman", { base });
      }
      if (command === "sqrt") {
        const index = this.readOptionalGroup();
        return node("root", { index, radicand: this.readGroup() });
      }
      if (ACCENT_COMMANDS[command]) {
        return node("accent", { accent: command, mark: ACCENT_COMMANDS[command], base: this.readGroup() });
      }
      if (["overset", "stackrel", "underset"].includes(command)) {
        return node("overunder", {
          position: command === "underset" ? "under" : "over",
          annotation: this.readGroup("annotation"),
          base: this.readGroup("annotatedBase"),
        });
      }
      if (["overbrace", "underbrace"].includes(command)) {
        return node("brace", { position: command === "underbrace" ? "under" : "over", base: this.readGroup() });
      }
      if (["xrightarrow", "xRightarrow", "xrightleftharpoons"].includes(command)) {
        const below = this.readOptionalGroup();
        const above = this.readGroup("arrowLabel");
        const arrow = command === "xRightarrow" ? "⇒" : command === "xrightleftharpoons" ? "⇌" : "→";
        return node("extensibleArrow", { arrow, above, below });
      }
      if (["cancel", "smash", "mathrel", "mathbin"].includes(command)) {
        const base = this.readGroup();
        return command === "cancel" ? node("cancel", { base }) : base;
      }
      if (command === "phantom") return node("phantom", { base: this.readGroup() });
      if (command === "hspace") {
        this.readRawGroup("horizontalSpace");
        return node("space", { width: "1em" });
      }
      if (["tag", "pmod", "bmod", "mod"].includes(command)) {
        const argument = command === "tag" || command === "pmod" ? this.readGroup() : null;
        if (command === "tag") return node("text", { value: `(${plainFromNode(argument)})`, word: true });
        const value = argument ? plainFromNode(argument) : "mod";
        return node("text", { value: argument ? `(mod ${value})` : "mod", word: true });
      }
      if (command === "bond") {
        const bond = this.readRawGroup("bond").trim();
        const value = bond.includes("...") ? "⋯" : bond.includes("#") ? "≡" : bond.includes("=") ? "=" : "−";
        return node("operator", { value, spoken: "bond" });
      }
      if (["not", "centernot"].includes(command)) {
        const base = this.parseAtom();
        const negated = Object.freeze({
          "=": "≠", "≡": "≢", "∈": "∉", "∣": "∤", "∥": "∦", "⊆": "⊈", "⊂": "⊄", "∼": "≁", "≅": "≇", "→": "↛", "⇒": "⇏",
        })[base?.value];
        if (negated) return node("operator", { value: negated, spoken: `not ${base.spoken || base.value}` });
        return node("negated", { base });
      }
      if (command === "substack") {
        const body = this.readRawGroup("substack");
        const rows = splitTableSource(body).map((row) => row.map((rawCell) => {
          const parser = new TexParser(rawCell);
          const parsed = parser.parse();
          this.errors.push(...parser.errors.map((error) => `substack:${error}`));
          return parsed;
        }));
        return node("matrix", { environment: "substack", rows, leftDelimiter: "", rightDelimiter: "", spokenKind: "stack" });
      }
      if (command === "text") {
        const value = this.readTextGroup();
        const semanticOperator = OPERATORS[value.toLocaleLowerCase("en-IN")];
        if (semanticOperator && ["angle", "triangle"].includes(value.toLocaleLowerCase("en-IN"))) {
          return node("operator", { value: semanticOperator[0], spoken: semanticOperator[1] });
        }
        return node("text", { value, word: true });
      }
      if (TEXT_STYLE_COMMANDS[command]) {
        return node("styled", {
          variant: TEXT_STYLE_COMMANDS[command],
          base: node("text", { value: this.readTextGroup(), word: true }),
        });
      }
      if (["mathrm", "textrm", "operatorname"].includes(command)) return node("roman", { base: this.readGroup() });
      if (STYLE_COMMANDS[command]) return node("styled", { variant: STYLE_COMMANDS[command], base: this.readGroup() });
      if (SYMBOLS[command]) return node("identifier", { value: SYMBOLS[command][0], spoken: SYMBOLS[command][1] });
      if (OPERATORS[command]) return node("operator", { value: OPERATORS[command][0], spoken: OPERATORS[command][1] });
      if (FUNCTION_COMMANDS.has(command)) return node("function", { value: command });
      if (command === "choose") return node("operator", { value: "C", spoken: "choose" });
      if (command === "atop") return node("separator", { value: ";" });
      if (SPACING_COMMANDS.has(command)) {
        const width = command === "qquad" ? "2em" : command === "quad" ? "1em" : ".28em";
        return node("space", { width });
      }
      if (IGNORED_COMMANDS.has(command)) {
        if (!DELIMITER_SIZING_COMMANDS.has(command)) return this.parseAtom();
        // \left. and \right. denote an omitted delimiter.
        while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
        if (this.source[this.index] === ".") {
          this.index += 1;
          return node("sequence", { children: [] });
        }
        const delimiter = this.parseAtom();
        if (delimiter && ["operator", "separator"].includes(delimiter.type) && FENCE_DELIMITERS.has(delimiter.value)) {
          return { ...delimiter, type: "operator", fence: true };
        }
        return delimiter;
      }
      if (command === "\\" || command === "newline" || command === "") return node("separator", { value: ";" });
      if (["{", "}"].includes(command)) return node("operator", { value: command, spoken: command });
      if (["%", "#", "&", "_", "|"].includes(command)) {
        const spoken = { "%": "percent", "#": "number sign", "&": "and", "_": "underscore", "|": "vertical bar" }[command];
        return node(command === "_" ? "text" : "operator", { value: command, spoken });
      }
      this.errors.push(`unknownCommand:${command || "backslash"}`);
      return node("text", { value: command ? `\\${command}` : "\\", unknown: true });
    }
    if (/\d/u.test(character)) {
      const start = this.index;
      while (/[\d.,]/u.test(this.source[this.index] || "")) this.index += 1;
      return node("number", { value: this.source.slice(start, this.index) });
    }
    if (/[A-Za-z]/u.test(character)) {
      const start = this.index;
      while (/[A-Za-z]/u.test(this.source[this.index] || "")) this.index += 1;
      const value = this.source.slice(start, this.index);
      const nextCharacter = this.source[this.index] || "";
      const precededByWhitespace = /\s/u.test(this.source[start - 1] || "");
      const followedByExplicitSpace = /^\\(?:[ ,;:!]|quad\b|qquad\b)/u.test(this.source.slice(this.index));
      const followedByWordBoundary = /[\s,;:.!?()'"\-]/u.test(nextCharacter);
      const looksLikeSymbolSequence = /^(?:[A-Z][a-z]?)+$/u.test(value);
      const continuedIdentifierRun = /[A-Za-z]/u.test(this.source[start - 1] || "");
      const separatedWord = value.length > 1
        && !looksLikeSymbolSequence
        && !continuedIdentifierRun
        && !/[\d_^]/u.test(nextCharacter)
        && (followedByWordBoundary || followedByExplicitSpace || (precededByWhitespace && !nextCharacter));
      if (separatedWord) return node("text", { value, word: true });
      this.index = start + 1;
      return node("identifier", { value: this.source[start], spoken: this.source[start] });
    }
    const unicodeSymbol = Object.values(SYMBOLS).find(([symbol]) => symbol === character);
    if (unicodeSymbol) {
      this.index += 1;
      return node("identifier", { value: unicodeSymbol[0], spoken: unicodeSymbol[1] });
    }
    const unicodeOperator = Object.values(OPERATORS).find(([operator]) => operator === character);
    if (unicodeOperator) {
      this.index += 1;
      return node("operator", { value: unicodeOperator[0], spoken: unicodeOperator[1] });
    }
    this.index += 1;
    const operatorSpoken = {
      "=": "equals", "+": "plus", "-": "minus", "−": "minus", "/": "divided by",
      "*": "times", "·": "times", "×": "times", "<": "less than", ">": "greater than",
      "±": "plus or minus", "≈": "approximately equal to", "∝": "is proportional to",
    }[character];
    if (operatorSpoken) return node("operator", { value: character === "-" ? "−" : character, spoken: operatorSpoken });
    if ([";", ",", ":"].includes(character)) return node("separator", { value: character });
    if (["(", ")", "[", "]", "|", "°"].includes(character)) return node("operator", { value: character, spoken: character === "|" ? "absolute value" : character });
    return node("text", { value: character });
  }

  withScripts(base) {
    let subscript = null;
    let superscript = null;
    while (true) {
      while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
      const marker = this.source[this.index];
      if (marker !== "_" && marker !== "^") break;
      this.index += 1;
      const script = this.readGroup();
      if (marker === "_") subscript = script;
      else superscript = script;
    }
    if (subscript && superscript) return node("subsup", { base, subscript, superscript });
    if (subscript) return node("subscript", { base, subscript });
    if (superscript) return node("superscript", { base, superscript });
    return base;
  }
}

function compactScript(nodeValue, mapping) {
  const text = plainFromNode(nodeValue).replaceAll("−", "-").replace(/\s+/gu, "");
  const converted = [...text].map((character) => mapping[character]).join("");
  return converted.length === [...text].length ? converted : null;
}

function appendPlain(parts, value, kind = "atom") {
  if (!value) return;
  const previous = parts.at(-1) || "";
  if (kind === "operator") {
    parts.push(` ${value} `);
  } else if (kind === "separator") {
    parts.push(`${value} `);
  } else if (kind === "unit" && /[\d⁰¹²³⁴⁵⁶⁷⁸⁹)]$/u.test(previous.trimEnd())) {
    parts.push(` ${value}`);
  } else {
    parts.push(value);
  }
}

function plainFromNode(value) {
  if (!value) return "";
  if (value.type === "sequence") {
    const parts = [];
    for (const child of value.children) {
      if (child.type === "operator" && ["∠", "△"].includes(child.value)) appendPlain(parts, plainFromNode(child));
      else if (child.type === "operator" && !["(", ")", "[", "]", "|", "°"].includes(child.value)) appendPlain(parts, plainFromNode(child), "operator");
      else if (child.type === "separator") appendPlain(parts, plainFromNode(child), "separator");
      else if (child.type === "roman") appendPlain(parts, plainFromNode(child), "unit");
      else if (child.type === "function") parts.push(`${parts.length ? " " : ""}${plainFromNode(child)} `);
      else if (child.type === "text" && child.word) parts.push(`${parts.length ? " " : ""}${plainFromNode(child)} `);
      else appendPlain(parts, plainFromNode(child));
    }
    return parts.join("").replace(/\s+/gu, " ").replace(/\s+([,;:)\]])/gu, "$1").replace(/([(\[])[ ]+/gu, "$1").trim();
  }
  if (["number", "identifier", "function", "text", "operator", "separator"].includes(value.type)) return String(value.value || "");
  if (value.type === "matrix") {
    const body = value.rows.map((row) => row.map((cell) => plainFromNode(cell).replace(/^−\s+/u, "−")).join(", ")).join("; ");
    return `${value.leftDelimiter || ""}${body}${value.rightDelimiter || ""}`;
  }
  if (["roman", "styled", "phantom", "cancel", "negated"].includes(value.type)) return plainFromNode(value.base);
  if (value.type === "fraction") {
    const compoundSequence = (part) => part?.type === "sequence" && part.children.length > 1;
    const fractionPart = (part, forceGrouping = false) => {
      const text = plainFromNode(part).replace(/\s*\/\s*/gu, "/");
      return forceGrouping || /\/|\s[+−=]\s/u.test(text) ? `(${text})` : text;
    };
    const groupProductDenominator = compoundSequence(value.numerator) && compoundSequence(value.denominator);
    return `(${fractionPart(value.numerator)}/${fractionPart(value.denominator, groupProductDenominator)})`;
  }
  if (value.type === "binomial") return `(${plainFromNode(value.numerator)} choose ${plainFromNode(value.denominator)})`;
  if (value.type === "root") return value.index
    ? `root(${plainFromNode(value.index)}, ${plainFromNode(value.radicand)})`
    : `√(${plainFromNode(value.radicand)})`;
  if (value.type === "accent" || value.type === "brace") return plainFromNode(value.base);
  if (value.type === "overunder") return `${plainFromNode(value.base)} ${plainFromNode(value.annotation)}`.trim();
  if (value.type === "extensibleArrow") {
    const label = [plainFromNode(value.below), plainFromNode(value.above)].filter(Boolean).join(", ");
    return `${value.arrow}${label ? `(${label})` : ""}`;
  }
  if (value.type === "space") return " ";
  if (value.type === "prescript") {
    const superscript = value.presuperscript
      ? compactScript(value.presuperscript, ASCII_TO_SUPERSCRIPT) || `^(${plainFromNode(value.presuperscript)})`
      : "";
    const subscript = value.presubscript
      ? compactScript(value.presubscript, ASCII_TO_SUBSCRIPT) || `_(${plainFromNode(value.presubscript)})`
      : "";
    return `${superscript}${subscript}${plainFromNode(value.base)}`;
  }
  if (value.type === "subscript") {
    const script = compactScript(value.subscript, ASCII_TO_SUBSCRIPT);
    return `${plainFromNode(value.base)}${script || `₍${plainFromNode(value.subscript)}₎`}`;
  }
  if (value.type === "superscript") {
    const plainScript = plainFromNode(value.superscript);
    if (plainScript === "°") return `${plainFromNode(value.base)}°`;
    const script = compactScript(value.superscript, ASCII_TO_SUPERSCRIPT);
    return `${plainFromNode(value.base)}${script || `^(${plainFromNode(value.superscript)})`}`;
  }
  if (value.type === "subsup") {
    return plainFromNode(node("superscript", {
      base: node("subscript", { base: value.base, subscript: value.subscript }),
      superscript: value.superscript,
    }));
  }
  return "";
}

function numberSpoken(value) {
  const units = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const integer = (number) => {
    if (number < 20) return units[number];
    if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${units[number % 10]}` : ""}`;
    if (number < 1_000) return `${units[Math.floor(number / 100)]} hundred${number % 100 ? ` ${integer(number % 100)}` : ""}`;
    if (number < 10_000) return `${units[Math.floor(number / 1_000)]} thousand${number % 1_000 ? ` ${integer(number % 1_000)}` : ""}`;
    return String(number).split("").map((character) => units[Number(character)] || character).join(" ");
  };
  const source = String(value).replaceAll(",", "");
  if (/^\d+$/u.test(source)) return integer(Number(source));
  if (/^\d+\.\d+$/u.test(source)) {
    const [whole, fraction] = source.split(".");
    return `${integer(Number(whole))} point ${[...fraction].map((digit) => units[Number(digit)]).join(" ")}`;
  }
  return source;
}

function spokenFromNode(value) {
  if (!value) return "";
  if (value.type === "sequence") return value.children.map(spokenFromNode).filter(Boolean).join(" ").replace(/\s+/gu, " ").trim();
  if (value.type === "number") return numberSpoken(value.value);
  if (value.type === "identifier") return value.spoken || [...value.value].join(" ");
  if (value.type === "function") return value.value;
  if (value.type === "operator") return value.spoken || value.value;
  if (value.type === "separator") return value.value === ";" ? "then" : value.value;
  if (value.type === "text") return String(value.value || "").trim();
  if (value.type === "matrix") {
    const rowCount = value.rows.length;
    const columnCount = Math.max(0, ...value.rows.map((row) => row.length));
    const dimensions = rowCount && columnCount ? `${numberSpoken(rowCount)} by ${numberSpoken(columnCount)} ` : "";
    const rows = value.rows.map((row, index) => `row ${numberSpoken(index + 1)}: ${row.map(spokenFromNode).join(", ")}`).join("; ");
    return `${dimensions}${value.spokenKind || "matrix"}${rows ? `; ${rows}` : ""}`;
  }
  if (value.type === "roman") {
    const plain = plainFromNode(value.base);
    return UNIT_SPOKEN[plain] || spokenFromNode(value.base);
  }
  if (value.type === "styled" || value.type === "phantom" || value.type === "cancel" || value.type === "negated") {
    return `${value.type === "negated" ? "not " : ""}${spokenFromNode(value.base)}`.trim();
  }
  if (value.type === "fraction") {
    const numerator = plainFromNode(value.numerator);
    const denominator = plainFromNode(value.denominator);
    if (numerator === "1" && denominator === "2") return "one half";
    if (numerator === "1" && denominator === "4") return "one quarter";
    if (numerator === "3" && denominator === "4") return "three quarters";
    return `${spokenFromNode(value.numerator)} over ${spokenFromNode(value.denominator)}`;
  }
  if (value.type === "binomial") return `${spokenFromNode(value.numerator)} choose ${spokenFromNode(value.denominator)}`;
  if (value.type === "root") return value.index
    ? `${spokenFromNode(value.index)} root of ${spokenFromNode(value.radicand)}`
    : `square root of ${spokenFromNode(value.radicand)}`;
  if (value.type === "accent") return `${["vec", "overrightarrow"].includes(value.accent) ? "vector" : value.accent} ${spokenFromNode(value.base)}`;
  if (value.type === "brace") return spokenFromNode(value.base);
  if (value.type === "overunder") return `${spokenFromNode(value.base)} annotated ${spokenFromNode(value.annotation)}`;
  if (value.type === "extensibleArrow") {
    const label = [spokenFromNode(value.below), spokenFromNode(value.above)].filter(Boolean).join(" and ");
    return `${value.arrow === "⇒" ? "implies" : value.arrow === "⇌" ? "is in equilibrium with" : "to"}${label ? ` ${label}` : ""}`;
  }
  if (value.type === "space") return "";
  if (value.type === "prescript") {
    const base = spokenFromNode(value.base);
    const superscript = value.presuperscript ? `superscript ${spokenFromNode(value.presuperscript)}` : "";
    const subscript = value.presubscript ? `subscript ${spokenFromNode(value.presubscript)}` : "";
    return [superscript, subscript, base].filter(Boolean).join(" ");
  }
  if (value.type === "subscript") return `${spokenFromNode(value.base)} sub ${spokenFromNode(value.subscript)}`;
  if (value.type === "superscript") {
    const exponent = plainFromNode(value.superscript).replaceAll("−", "-");
    if (exponent === "°") return `${spokenFromNode(value.base)} degrees`;
    if (exponent === "2") return `${spokenFromNode(value.base)} squared`;
    if (exponent === "3") return `${spokenFromNode(value.base)} cubed`;
    const exponentSpoken = exponent.startsWith("-")
      ? `negative ${numberSpoken(exponent.slice(1))}`
      : spokenFromNode(value.superscript);
    return `${spokenFromNode(value.base)} to the power of ${exponentSpoken}`;
  }
  if (value.type === "subsup") return `${spokenFromNode(value.base)} sub ${spokenFromNode(value.subscript)} to the power of ${spokenFromNode(value.superscript)}`;
  return "";
}

function mathmlFromNode(value) {
  if (!value) return "<mrow></mrow>";
  if (value.type === "sequence") return `<mrow>${value.children.map(mathmlFromNode).join("")}</mrow>`;
  if (value.type === "number") return `<mn>${escapeHtml(value.value)}</mn>`;
  if (value.type === "identifier" || value.type === "function") return `<mi>${escapeHtml(value.value)}</mi>`;
  if (value.type === "operator" || value.type === "separator") {
    const attributes = value.fence ? ' fence="true" stretchy="true"' : "";
    return `<mo${attributes}>${escapeHtml(value.value === "-" ? "−" : value.value)}</mo>`;
  }
  if (value.type === "text") return `<mtext>${escapeHtml(value.value)}</mtext>`;
  if (value.type === "matrix") {
    const rowCount = value.rows.length;
    const columnCount = value.rows.reduce((widest, row) => Math.max(widest, row.length), 0);
    const aligned = value.spokenKind === "aligned expression";
    // Every tabular environment needs cell gutters, not just the bracketed
    // ones: an array set solid is what makes a truth table unreadable.
    const tableClass = aligned ? "math-aligned-table" : "math-matrix-table";
    const attributes = [`class="${tableClass}"`];

    const specification = value.columnLayout;
    if (specification?.alignments.length) {
      const alignments = Array.from({ length: columnCount },
        (unused, column) => specification.alignments[column] || "center");
      if (alignments.some((alignment) => alignment !== "center")) {
        attributes.push(`columnalign="${alignments.join(" ")}"`);
      }
    } else if (aligned) {
      // \begin{aligned} alternates right- then left-aligned columns about the &.
      attributes.push(`columnalign="${Array.from({ length: columnCount },
        (unused, column) => (column % 2 === 0 ? "right" : "left")).join(" ")}"`);
    }

    const separators = specification?.separators || [];
    if (columnCount > 1 && separators.slice(1, columnCount).some(Boolean)) {
      attributes.push(`columnlines="${Array.from({ length: columnCount - 1 },
        (unused, gap) => (separators[gap + 1] ? "solid" : "none")).join(" ")}"`);
    }

    const rules = new Set(value.rules || []);
    if (rowCount > 1 && [...rules].some((boundary) => boundary > 0 && boundary < rowCount)) {
      attributes.push(`rowlines="${Array.from({ length: rowCount - 1 },
        (unused, gap) => (rules.has(gap + 1) ? "solid" : "none")).join(" ")}"`);
    }
    const framed = (rules.has(0) && rules.has(rowCount)) || (separators[0] && separators[columnCount]);
    if (framed) {
      attributes.push('frame="solid"');
      attributes[0] = `class="${tableClass} math-table-framed"`;
    }

    // MathML Core dropped columnlines/rowlines/frame, so the attributes above
    // only reach engines that still honour them. Chrome lays each mtd out as a
    // real box, so the same rules are carried a second time as classes that the
    // stylesheet turns into borders.
    const cellClass = (rowIndex, columnIndex) => {
      const classes = [];
      if (separators[columnIndex + 1] && columnIndex < columnCount - 1) classes.push("math-rule-right");
      if (rules.has(rowIndex + 1) && rowIndex < rowCount - 1) classes.push("math-rule-below");
      const alignment = specification?.alignments[columnIndex]
        || (aligned ? (columnIndex % 2 === 0 ? "right" : "left") : null);
      if (alignment && alignment !== "center") classes.push(`math-align-${alignment}`);
      return classes.length ? ` class="${classes.join(" ")}"` : "";
    };

    const table = `<mtable ${attributes.join(" ")}>${value.rows.map((row, rowIndex) => `<mtr>${row.map((cell, columnIndex) => `<mtd${cellClass(rowIndex, columnIndex)}>${mathmlFromNode(cell)}</mtd>`).join("")}</mtr>`).join("")}</mtable>`;
    const left = value.leftDelimiter ? `<mo fence="true" stretchy="true">${escapeHtml(value.leftDelimiter)}</mo>` : "";
    const right = value.rightDelimiter ? `<mo fence="true" stretchy="true">${escapeHtml(value.rightDelimiter)}</mo>` : "";
    return `<mrow>${left}${table}${right}</mrow>`;
  }
  if (value.type === "roman") return `<mstyle mathvariant="normal">${mathmlFromNode(value.base)}</mstyle>`;
  if (value.type === "styled") return `<mstyle mathvariant="${escapeHtml(value.variant)}">${mathmlFromNode(value.base)}</mstyle>`;
  if (value.type === "fraction") return `<mfrac>${mathmlFromNode(value.numerator)}${mathmlFromNode(value.denominator)}</mfrac>`;
  if (value.type === "binomial") {
    return `<mrow><mo fence="true">(</mo><mfrac linethickness="0">${mathmlFromNode(value.numerator)}${mathmlFromNode(value.denominator)}</mfrac><mo fence="true">)</mo></mrow>`;
  }
  if (value.type === "root") return value.index
    ? `<mroot>${mathmlFromNode(value.radicand)}${mathmlFromNode(value.index)}</mroot>`
    : `<msqrt>${mathmlFromNode(value.radicand)}</msqrt>`;
  if (value.type === "accent") {
    const position = ["underline", "underrightarrow", "underleftrightarrow"].includes(value.accent) ? "munder" : "mover";
    return `<${position} accent="true">${mathmlFromNode(value.base)}<mo>${escapeHtml(value.mark)}</mo></${position}>`;
  }
  if (value.type === "brace") {
    const element = value.position === "under" ? "munder" : "mover";
    const mark = value.position === "under" ? "⏟" : "⏞";
    return `<${element} accent="true">${mathmlFromNode(value.base)}<mo stretchy="true">${mark}</mo></${element}>`;
  }
  if (value.type === "overunder") {
    const element = value.position === "under" ? "munder" : "mover";
    return `<${element}>${mathmlFromNode(value.base)}${mathmlFromNode(value.annotation)}</${element}>`;
  }
  if (value.type === "extensibleArrow") {
    const base = `<mo stretchy="true">${escapeHtml(value.arrow)}</mo>`;
    if (value.above && value.below) return `<munderover>${base}${mathmlFromNode(value.below)}${mathmlFromNode(value.above)}</munderover>`;
    if (value.above) return `<mover>${base}${mathmlFromNode(value.above)}</mover>`;
    if (value.below) return `<munder>${base}${mathmlFromNode(value.below)}</munder>`;
    return base;
  }
  if (value.type === "phantom") return `<mphantom>${mathmlFromNode(value.base)}</mphantom>`;
  if (value.type === "cancel") return `<menclose notation="updiagonalstrike">${mathmlFromNode(value.base)}</menclose>`;
  if (value.type === "negated") return `<menclose notation="updiagonalstrike">${mathmlFromNode(value.base)}</menclose>`;
  if (value.type === "space") return `<mspace width="${escapeHtml(value.width || "1em")}"/>`;
  if (value.type === "prescript") {
    if (!value.base) {
      if (value.presuperscript) return `<msup><mrow></mrow>${mathmlFromNode(value.presuperscript)}</msup>`;
      return `<msub><mrow></mrow>${mathmlFromNode(value.presubscript)}</msub>`;
    }
    return `<mmultiscripts>${mathmlFromNode(value.base)}<mprescripts/>${value.presubscript ? mathmlFromNode(value.presubscript) : "<none/>"}${value.presuperscript ? mathmlFromNode(value.presuperscript) : "<none/>"}</mmultiscripts>`;
  }
  if (value.type === "subscript") return `<msub>${mathmlFromNode(value.base)}${mathmlFromNode(value.subscript)}</msub>`;
  if (value.type === "superscript") return `<msup>${mathmlFromNode(value.base)}${mathmlFromNode(value.superscript)}</msup>`;
  if (value.type === "subsup") return `<msubsup>${mathmlFromNode(value.base)}${mathmlFromNode(value.subscript)}${mathmlFromNode(value.superscript)}</msubsup>`;
  return `<mtext>${escapeHtml(plainFromNode(value))}</mtext>`;
}

function nodeIsEmpty(value) {
  if (!value) return true;
  if (value.type === "sequence") return value.children.every(nodeIsEmpty);
  if (value.type === "matrix") return !value.rows.length || value.rows.every((row) => !row.length || row.every(nodeIsEmpty));
  if (["subscript", "superscript", "subsup", "accent", "roman", "styled", "brace", "cancel", "negated"].includes(value.type)) return nodeIsEmpty(value.base);
  if (value.type === "prescript") return nodeIsEmpty(value.base);
  return false;
}

function structuralAstErrors(value, output = []) {
  if (!value) return output;
  if (value.type === "fraction") {
    if (nodeIsEmpty(value.numerator)) output.push("emptyFractionNumerator");
    if (nodeIsEmpty(value.denominator)) output.push("emptyFractionDenominator");
  }
  if (value.type === "prescript" && nodeIsEmpty(value.base)) output.push("scriptWithoutBase");
  if (["subscript", "superscript", "subsup"].includes(value.type) && nodeIsEmpty(value.base) && !value.base?.explicitGroup) output.push("scriptWithoutBase");
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") {
      if (Array.isArray(nested)) nested.forEach((child) => structuralAstErrors(child, output));
      else structuralAstErrors(nested, output);
    }
  }
  return output;
}

function visibleDelimiterErrors(source) {
  const errors = [];
  const stripped = String(source)
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/gu, "")
    .replace(/\\[{}]/gu, "")
    .replace(/\\(?:text|mathrm|textrm|operatorname)\s*\{[^{}]*\}/gu, "");
  const stack = [];
  const pairs = Object.freeze({ ")": "(", "]": "[" });
  for (const character of stripped) {
    if (["(", "["].includes(character)) stack.push(character);
    else if (pairs[character]) {
      if (stack.at(-1) === pairs[character]) stack.pop();
      else errors.push(`unmatchedClosingDelimiter:${character}`);
    }
  }
  for (const character of stack) errors.push(`unmatchedOpeningDelimiter:${character}`);
  return errors;
}

function parseFormula(source) {
  const normalized = stripDelimiters(source);
  const scriptsNormalized = unicodeScriptsToTex(normalized);
  const texish = plainToTexish(scriptsNormalized);
  const parser = new TexParser(texish);
  const ast = parser.parse();
  return { normalized: texish.trim(), ast, errors: [...parser.errors, ...structuralAstErrors(ast)] };
}

export function validateFormulaStructure(source) {
  const rawSource = stripDelimiters(source);
  const repaired = repairCrawlerFormulaSource(source);
  const parsed = parseFormula(repaired);
  const safetyNetErrors = [];
  safetyNetErrors.push(...invalidRenderedMathFound(rawSource));
  if (/(?:\{R\}|R)_\{o\}ne/u.test(parsed.normalized)) safetyNetErrors.push("splitSubscriptIdentifier:one");
  if (/(?:\{R\}|R)_\{l\}ine/u.test(parsed.normalized)) safetyNetErrors.push("splitSubscriptIdentifier:line");
  if (/\\left\s*(?:\\right|$)/u.test(parsed.normalized) || /\\right\s*(?:\\left|$)/u.test(parsed.normalized)) {
    safetyNetErrors.push("emptyLeftRightDelimiter");
  }
  if (/\b(?:undefined|NaN)\b|\[object Object\]/u.test(parsed.normalized)) safetyNetErrors.push("invalidRuntimeToken");
  if (/\\frac\s*\{\s*\{\s*\}\s*\^/u.test(parsed.normalized)) safetyNetErrors.push("emptyFractionBase");
  if (/=\s*(?:\\(?:quad|qquad|,|;|:|!)\s*)*$/u.test(parsed.normalized)) safetyNetErrors.push("emptyEquationRightHandSide");
  if (/(?:^|[=+\-])\s*[_^]\s*\{?[^=}]+\}?\s*[_^]/u.test(parsed.normalized) && !/(?:\\int|[\u222b\u222e])/u.test(parsed.normalized)) {
    safetyNetErrors.push("integralLimitsWithoutIntegral");
  }
  safetyNetErrors.push(...visibleDelimiterErrors(parsed.normalized));
  const errors = [...new Set([...parsed.errors, ...safetyNetErrors])];
  return Object.freeze({ complete: errors.length === 0, errors, normalized: parsed.normalized, ast: parsed.ast });
}

export function formulaRepresentations(source) {
  const repairedSource = repairCrawlerFormulaSource(source);
  const { normalized, ast } = parseFormula(repairedSource);
  const plainText = plainFromNode(ast).replaceAll("-", "−").replace(/\s+/gu, " ").trim();
  const repairedPlainText = repairMalformedFormulaText(plainText);
  if (repairedPlainText !== plainText) return formulaRepresentations(repairedPlainText);
  const spokenText = spokenFromNode(ast).replace(/\s+/gu, " ").trim();
  const mathml = `<math xmlns="http://www.w3.org/1998/Math/MathML" role="math" aria-label="${escapeHtml(spokenText)}">${mathmlFromNode(ast)}</math>`;
  return Object.freeze({ source: normalized, spokenText, plainText, mathml });
}

function scriptMarkers(value) {
  return String(value)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿⁱ]+/gu, (script) => `^(${[...script].map((character) => SUPERSCRIPT_TO_ASCII[character] || character).join("")})`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉₊₋₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+/gu, (script) => `_(${[...script].map((character) => SUBSCRIPT_TO_ASCII[character] || character).join("")})`);
}

export function semanticEquationTokens(value) {
  const normalized = scriptMarkers(decodeHtmlEntities(value))
    .normalize("NFC")
    .replaceAll("−", "-")
    .replaceAll("·", "×")
    .replace(/\s+/gu, " ");
  const raw = normalized.match(/[A-Za-z]+|[\p{L}\p{M}]+|\d+(?:\.\d+)?|[=+\-×÷∫∮∑∩∥∠△→←⇒⇐⇔⇌≈≤≥≠±√/()[\]<>|,;:^_]/gu) || [];
  return Object.freeze(raw.flatMap((token) => /^[\p{L}\p{M}]{2,}$/u.test(token)
    ? [...token.normalize("NFD")].filter((character) => /\p{L}/u.test(character))
    : [token]));
}

const SEMANTIC_OPERATOR_TOKENS = new Set([
  "=", "+", "-", "×", "÷", "/", "^", "_", "∫", "∮", "∑", "∩", "∥", "∠", "△",
  "→", "←", "⇒", "⇐", "⇔", "⇌", "≈", "≤", "≥", "≠", "±", "√", "<", ">", "|",
]);

function requiredSourceCommandTokens(source) {
  const tokens = [];
  for (const match of String(source || "").matchAll(/\\([A-Za-z]+|.)/gu)) {
    const command = match[1];
    if (SYMBOLS[command]) tokens.push(SYMBOLS[command][0]);
    else if (OPERATORS[command]) tokens.push(OPERATORS[command][0]);
    else if (["frac", "dfrac", "tfrac"].includes(command)) tokens.push("/");
    else if (["sqrt"].includes(command)) tokens.push("√");
  }
  return tokens;
}

function semanticRequirementTokens(tokens) {
  return [...new Set(tokens.filter((token) => SEMANTIC_OPERATOR_TOKENS.has(token) || /^[\p{L}\p{M}α-ωΑ-Ω√]+$/u.test(token)))];
}

function spokenToSemanticText(value) {
  let normalized = String(value || "")
    .replace(/\bcapital\s+delta\b/giu, "Δ")
    .replace(/\bcapital\s+phi\b/giu, "Φ")
    .replace(/\bclosed surface integral\b/giu, "∮")
    .replace(/\bto the power of\b|\bsquared\b|\bcubed\b/giu, "^")
    .replace(/\bsub(?:script)?\b/giu, "_")
    .replace(/\bequals\b/giu, "=")
    .replace(/\bplus\b/giu, "+")
    .replace(/\bminus\b|\bnegative\b/giu, "-")
    .replace(/\btimes\b/giu, "×")
    .replace(/\bover\b|\bdivided by\b|\bhalf\b|\bquarters?\b/giu, "/")
    .replace(/\babsolute value\b|\bdeterminant\b/giu, "|");
  const spokenSymbols = [...Object.values(SYMBOLS), ...Object.values(OPERATORS)]
    .sort((left, right) => right[1].length - left[1].length);
  for (const [symbol, spoken] of spokenSymbols) {
    const pattern = spoken.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
    normalized = normalized.replace(new RegExp(`\\b${pattern}\\b`, "giu"), symbol);
  }
  return normalized;
}

function mathmlToSemanticText(value) {
  return decodeHtmlEntities(String(value || "")
    .replace(/<mfrac\b[^>]*>/giu, " / ")
    .replace(/<msubsup\b[^>]*>/giu, " _ ^ ")
    .replace(/<msub\b[^>]*>/giu, " _ ")
    .replace(/<msup\b[^>]*>/giu, " ^ ")
    .replace(/<[^>]+>/gu, " "));
}

export function extractSemanticTokens(value, { representation = "source" } = {}) {
  if (representation === "spoken") return Object.freeze(semanticRequirementTokens(semanticEquationTokens(spokenToSemanticText(value))));
  if (representation === "mathml") return Object.freeze(semanticRequirementTokens(semanticEquationTokens(mathmlToSemanticText(value))));
  if (representation === "plain") return Object.freeze(semanticRequirementTokens(semanticEquationTokens(value)));
  const structure = validateFormulaStructure(value);
  const astPlain = plainFromNode(structure.ast);
  return Object.freeze(semanticRequirementTokens([
    ...semanticEquationTokens(astPlain),
    ...requiredSourceCommandTokens(structure.normalized),
  ]));
}

export function assertRepresentationPreservesTokens(value, requiredTokens, { representation = "plain" } = {}) {
  const actualTokens = extractSemanticTokens(value, { representation });
  const actual = new Set(actualTokens);
  const missingTokens = [...new Set(requiredTokens)].filter((token) => !actual.has(token));
  return Object.freeze({ complete: missingTokens.length === 0, requiredTokens: Object.freeze([...requiredTokens]), actualTokens, missingTokens: Object.freeze(missingTokens) });
}

export function compareSemanticEquationTokens(source, renderedPlainText) {
  const expected = formulaRepresentations(source);
  const expectedTokens = semanticEquationTokens(expected.plainText);
  const actualTokens = semanticEquationTokens(renderedPlainText);
  const complete = expectedTokens.length === actualTokens.length
    && expectedTokens.every((token, index) => token === actualTokens[index]);
  return Object.freeze({ complete, expectedTokens, actualTokens, expected });
}

function normalizeForComparison(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function hasSeparatedNumerals(value) {
  return /(?:^|[^\d])\d\s+\d(?=[⁻−-](?:\d|[⁰¹²³⁴⁵⁶⁷⁸⁹]))/u.test(String(value));
}

function hasDetachedUnits(value) {
  return /\b\d(?:[.,]\d+)?\s+(?:m\s+m|c\s+m|k\s+g|m\s+s|m\s+ol|H\s+z)\b/u.test(String(value));
}

export function validateFormulaRepresentations(record) {
  const expected = formulaRepresentations(record?.source);
  const rawPlain = String(record?.plainText ?? "");
  const actualPlain = normalizeForComparison(rawPlain);
  const actualSpoken = normalizeForComparison(record?.spokenText).toLocaleLowerCase("en-IN");
  const expectedPlain = normalizeForComparison(expected.plainText);
  const expectedSpoken = normalizeForComparison(expected.spokenText).toLocaleLowerCase("en-IN");
  const actualMathml = String(record?.mathml || "");
  const expectedMathml = normalizeForComparison(expected.mathml);
  const invalidRenderedMath = invalidRenderedMathFound(`${rawPlain}\n${record?.spokenText ?? ""}\n${actualMathml}`);
  const sourceHasFraction = /\\(?:dfrac|tfrac|frac)\b/u.test(expected.source);
  const sourceHasExponent = /\^|[⁰¹²³⁴⁵⁶⁷⁸⁹]/u.test(expected.source);
  const sourceHasMinus = /-|−|⁻/u.test(expected.source);
  const semanticTokens = compareSemanticEquationTokens(record?.source, rawPlain);
  const structure = validateFormulaStructure(record?.source);
  const requiredTokens = extractSemanticTokens(record?.source, { representation: "source" });
  const plainTokenCheck = assertRepresentationPreservesTokens(rawPlain, requiredTokens, { representation: "plain" });
  const spokenTokenCheck = assertRepresentationPreservesTokens(record?.spokenText, requiredTokens, { representation: "spoken" });
  const mathmlTokenCheck = assertRepresentationPreservesTokens(actualMathml, requiredTokens, { representation: "mathml" });
  const checks = Object.freeze({
    strictStructure: structure.complete,
    sourceDerivedPlain: actualPlain === expectedPlain,
    sourceDerivedSpoken: actualSpoken === expectedSpoken,
    sourceDerivedMathml: normalizeForComparison(actualMathml) === expectedMathml,
    semanticMathml: /<math\b/u.test(actualMathml) && /aria-label=/u.test(actualMathml)
      && !/<annotation\b/iu.test(actualMathml),
    numeralsStayJoined: !hasSeparatedNumerals(rawPlain),
    fractionOrderPreserved: !sourceHasFraction || (actualPlain === expectedPlain && /<mfrac>/u.test(actualMathml)),
    exponentPreserved: !sourceHasExponent || (actualPlain === expectedPlain && /<msup>|<msubsup>|<mmultiscripts>/u.test(actualMathml)),
    mathematicalMinusPreserved: !sourceHasMinus || (!actualPlain.includes("-") && actualPlain.includes("−")),
    unitsStayJoined: !hasDetachedUnits(rawPlain),
    latinIIsNotOne: actualPlain === expectedPlain,
    semanticTokensPreserved: semanticTokens.complete,
    plainSemanticTokensPreserved: plainTokenCheck.complete,
    spokenSemanticTokensPreserved: spokenTokenCheck.complete,
    mathmlSemanticTokensPreserved: mathmlTokenCheck.complete,
    renderedMathHasNoInvalidPatterns: invalidRenderedMath.length === 0,
    crawlerPlainContainsNoRawTex: !/(?:\$\$?|\\[A-Za-z]+\b)/u.test(rawPlain),
  });
  const missing = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
  return Object.freeze({
    complete: missing.length === 0,
    checks,
    missing,
    expected,
    structureErrors: structure.errors,
    requiredTokens,
    invalidRenderedMath,
    tokenFailures: Object.freeze({ plain: plainTokenCheck.missingTokens, spoken: spokenTokenCheck.missingTokens, mathml: mathmlTokenCheck.missingTokens }),
  });
}

function stringsIn(value, key = "", output = []) {
  if (typeof value === "string") {
    output.push({ key, value });
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) stringsIn(item, key, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) stringsIn(child, childKey, output);
  }
  return output;
}

function formulaSourcePattern() {
  return /\$\$(?<display>[\s\S]*?)\$\$|\$(?<inline>[^$]+?)\$|\\\((?<parenthesized>[\s\S]*?)\\\)|\\\[(?<bracketed>[\s\S]*?)\\\]|(?<bareEnvironment>\\begin\s*\{(?<environment>[bpvV]?matrix|smallmatrix|array|cases|aligned(?:at)?|align\*?|gathered|split)\}[\s\S]*?\\end\s*\{\k<environment>\})/gu;
}

function formulaSourceFromMatch(match) {
  return match?.groups?.display
    || match?.groups?.inline
    || match?.groups?.parenthesized
    || match?.groups?.bracketed
    || match?.groups?.bareEnvironment
    || "";
}

const BARE_TEX_SIGNAL_COMMANDS = new Set([
  ...Object.keys(SYMBOLS), ...Object.keys(OPERATORS), ...FUNCTION_COMMANDS,
  "frac", "dfrac", "tfrac", "binom", "dbinom", "sqrt", "boxed", "ce", "begin",
  ...Object.keys(ACCENT_COMMANDS), "overset", "underset", "stackrel", "overbrace", "underbrace",
  "xrightarrow", "xRightarrow", "xrightleftharpoons",
]);

function isBareTexFormula(value) {
  const source = String(value ?? "").trim();
  if (!source || source.length > 600 || source.includes("```") || source.includes("$") || /<\/?[A-Za-z][^>]*>/u.test(source)) return false;
  const commands = [...source.matchAll(/\\([A-Za-z]+|.)/gu)].map((match) => match[1]);
  if (!commands.some((command) => BARE_TEX_SIGNAL_COMMANDS.has(command))) return false;
  const formulaLikeStart = /^(?:\\|[([{]|[A-Za-z0-9](?:\s*[_^=+\-*/<>]|\s*\\))/u.test(source);
  const standaloneFormulaCommand = /^\\(?:boxed|frac|dfrac|tfrac|binom|dbinom|sqrt|ce|begin|text|mathrm|mathbf|mathbb|mathcal)\b/u.test(source);
  const mathematicalRelation = /[=<>+×÷−≠≤≥]|\\(?:sim|nsim|equiv|iff|vee|lor|wedge|land|in|notin|subset|subseteq|supset|supseteq|perp|parallel|nparallel|mid|nmid|to|rightarrow|Rightarrow|Longrightarrow|implies|propto|cong|ne|neq|le|leq|ge|geq)\b/u.test(source);
  if (!formulaLikeStart || (!standaloneFormulaCommand && !mathematicalRelation && commands.length < 2)) return false;
  return validateFormulaStructure(source).complete;
}

export function extractFormulaSources(value) {
  const sources = [];
  const seen = new Set();
  const add = (candidate) => {
    const source = stripDelimiters(candidate);
    const key = source.normalize("NFKC").replace(/\s+/gu, " ").trim();
    if (!key || key.length > 600 || seen.has(key)) return;
    if (!/(?:\\|=|[_^]|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]|[+×·÷∮∫Σ√])/u.test(key)) return;
    seen.add(key);
    sources.push(source);
  };
  for (const { key, value: text } of stringsIn(value)) {
    for (const match of text.matchAll(formulaSourcePattern())) add(formulaSourceFromMatch(match));
    for (const line of text.split(/\r?\n/gu)) if (isBareTexFormula(line)) add(line);
    if (/^(?:formula|formulaUsed|equation|equationUsed)$/iu.test(key) && !text.includes("$")) add(text);
    if (/^(?:answer|finalAnswer)$/u.test(key) && /^\s*\\(?:boxed|frac|sqrt|text|mathrm|left|begin)\b/u.test(text)) add(text);
  }
  return sources;
}

export function evaluateQuestionFormulaAccessibility(question, { includeRepresentations = true } = {}) {
  const sources = extractFormulaSources(question);
  const formulas = [];
  const failures = [];
  const missing = new Set();
  let complete = true;
  for (const source of sources) {
    const representation = formulaRepresentations(source);
    const result = validateFormulaRepresentations(representation);
    complete &&= result.complete;
    for (const check of result.missing) missing.add(check);
    if (!result.complete) failures.push({
      source: representation.source,
      plainText: representation.plainText,
      missing: result.missing,
      structureErrors: result.structureErrors,
      requiredTokens: result.requiredTokens,
      tokenFailures: result.tokenFailures,
    });
    if (includeRepresentations) formulas.push({ ...representation, complete: result.complete, checks: result.checks, missing: result.missing });
  }
  return Object.freeze({
    complete,
    formulaCount: sources.length,
    formulas,
    failures,
    missing: [...missing],
  });
}

const LEGACY_RENDERER_DROPPED_TOKENS = new Set(["ε", "∫", "∮", "Σ", "∞", "Ω", "∩", "∥", "∠", "△", "→", "←", "⇒", "⇐", "⇔"]);

function formulaLookupKey(value, { tolerateLegacyTokenLoss = false } = {}) {
  let repairedLegacyLabel = repairMalformedFormulaText(value)
    .replace(/(?:\{R\}|R)_\{o\}ne/gu, "Rₒₙₑ")
    .replace(/(?:\{R\}|R)_\{l\}ine/gu, "Rₗᵢₙₑ");
  if (tolerateLegacyTokenLoss) {
    repairedLegacyLabel = repairedLegacyLabel
      .replace(/\bangle\b|angle(?=[A-Z])/gu, "")
      .replace(/\^(?=\s*(?:$|[,+\-−=)]))/gu, "");
  }
  return semanticEquationTokens(repairedLegacyLabel)
    .filter((token) => !tolerateLegacyTokenLoss || (
      !LEGACY_RENDERER_DROPPED_TOKENS.has(token)
      && !["(", ")", "_"].includes(token)
    ))
    .join("\u001f");
}

export function buildCanonicalFormulaLookup(question) {
  const evaluation = evaluateQuestionFormulaAccessibility(question);
  const candidates = new Map();
  const ambiguous = new Set();
  for (const formula of evaluation.formulas) {
    if (!formula.complete) continue;
    const keys = [
      formulaLookupKey(formula.plainText),
      formulaLookupKey(formula.plainText, { tolerateLegacyTokenLoss: true }),
    ].filter(Boolean);
    for (const key of keys) {
      const existing = candidates.get(key);
      if (existing && existing.source !== formula.source) {
        candidates.delete(key);
        ambiguous.add(key);
      } else if (!ambiguous.has(key)) {
        candidates.set(key, formula);
      }
    }
  }
  return Object.freeze({
    complete: evaluation.complete,
    formulaCount: evaluation.formulaCount,
    candidates,
    ambiguous,
  });
}

export function canonicalFormulaForLegacyLabel(lookup, label) {
  if (!lookup?.complete) return null;
  const exact = formulaLookupKey(label);
  const tolerant = formulaLookupKey(label, { tolerateLegacyTokenLoss: true });
  const spokenNormalized = spokenToSemanticText(label);
  const spokenExact = formulaLookupKey(spokenNormalized);
  const spokenTolerant = formulaLookupKey(spokenNormalized, { tolerateLegacyTokenLoss: true });
  return lookup.candidates.get(exact)
    || lookup.candidates.get(tolerant)
    || lookup.candidates.get(spokenExact)
    || lookup.candidates.get(spokenTolerant)
    || null;
}

export function renderSemanticMath(record, { visiblePlain = false, extraClass = "" } = {}) {
  const representation = record?.mathml ? record : formulaRepresentations(record?.source ?? record);
  const classes = ["math", "math-semantic", visiblePlain ? "math-visible" : "math-fallback", extraClass].filter(Boolean).join(" ");
  return `<span class="${escapeHtml(classes)}">${representation.mathml}</span>`;
}

export function renderMarkdownEmphasisMarkup(value) {
  return String(value ?? "")
    // Protect explicitly escaped markers before interpreting emphasis. HTML
    // entities preserve the visible character without leaving a Markdown
    // delimiter that a later pass can consume.
    .replace(/\\\*/gu, "&#42;")
    .replace(/\\_/gu, "&#95;")
    .replace(/\*\*\*([^\n]+?)\*\*\*/gu, "<strong><em>$1</em></strong>")
    .replace(/___([^\n]+?)___/gu, "<strong><em>$1</em></strong>")
    // A closing pair cannot begin a three-star closer. This preserves nested
    // forms such as **bean – *Phaseolus vulgaris***.
    .replace(/\*\*(?!\*)([^\n]+?)\*\*(?!\*)/gu, "<strong>$1</strong>")
    .replace(/__(?!_)([^\n]+?)__(?!_)/gu, "<strong>$1</strong>")
    // Word-boundary guards keep multiplication and identifiers such as a*b*c
    // and seed_coat_type from being mistaken for emphasis.
    .replace(/(^|[^\\\p{L}\p{N}*])\*([^\s*\n](?:[^*\n]*?[^\s*\n])?)\*(?![\p{L}\p{N}*])/gu, "$1<em>$2</em>")
    .replace(/(^|[^\\\p{L}\p{N}_])_([^\s_\n](?:[^_\n]*?[^\s_\n])?)_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>");
}

export function renderMathText(value, { extraClass = "math-inline" } = {}) {
  const source = String(value ?? "");
  const trimmed = source.trim();
  if (isBareTexFormula(trimmed)) {
    const representation = formulaRepresentations(trimmed);
    if (validateFormulaRepresentations(representation).complete) {
      return renderSemanticMath(representation, { visiblePlain: true, extraClass });
    }
  }
  const renderUnmatched = (valueToRender) => valueToRender
    .split(/(\r?\n)/u)
    .map((line) => {
      if (/^\r?\n$/u.test(line) || !isBareTexFormula(line)) return escapeHtml(repairMalformedFormulaText(line));
      const leading = line.match(/^\s*/u)?.[0] || "";
      const trailing = line.match(/\s*$/u)?.[0] || "";
      const formula = line.slice(leading.length, line.length - trailing.length || undefined);
      return `${escapeHtml(leading)}${renderSemanticMath(formulaRepresentations(formula), { visiblePlain: true, extraClass })}${escapeHtml(trailing)}`;
    })
    .join("");
  const output = [];
  let cursor = 0;
  for (const match of source.matchAll(formulaSourcePattern())) {
    output.push(renderUnmatched(source.slice(cursor, match.index)));
    output.push(renderSemanticMath(
      formulaRepresentations(formulaSourceFromMatch(match)),
      { visiblePlain: true, extraClass },
    ));
    cursor = match.index + match[0].length;
  }
  output.push(renderUnmatched(source.slice(cursor)));
  return renderMarkdownEmphasisMarkup(output.join(""));
}

// An inline span carries both `math-visible` and `math-inline`, so the block
// scroller has to exclude it: an inline-block whose overflow is not `visible`
// takes its baseline from its bottom margin edge rather than from its last line
// box, which lifted every `a³`, `R` and `sin A` off the prose baseline and left
// the scrollbar gutter showing as a grey bar under the formula. Only a matrix
// is wide enough to need scrolling inline, and `vertical-align:middle` centres
// it on the x-height without consulting the box's own baseline.
//
// A bracket only grows to fit a matrix if the font offers a taller version of it
// to grow into: stretching is a lookup in the font's OpenType MATH table, not
// something the browser can draw for itself. The old stack asked for Cambria
// Math (Windows and Office only), then STIX Two Math (recent macOS only), then
// STIXGeneral, which has no MATH table at all — so Android, most Linux and older
// iOS landed on plain `serif` and drew one normal-size `(` centred on the middle
// row. The same gap flattened `√`, `∑`, `∫` and `|…|` everywhere else.
//
// `local()` comes first so Windows and macOS readers keep the font they already
// have and download nothing; only a device with neither fetches the subset. It
// is STIX Two Math because it is Times-based, so it matches the `serif` those
// devices were falling back to — the letterforms stay put and only the broken
// parts change. `serif` stays last: `<mtext>` carries Devanagari, which the
// subset does not. See comparison/after-assets/fonts/README.md.
export const SEMANTIC_MATH_STYLES = `<style id="studywudy-semantic-math-styles">
@font-face{font-family:"StudyWudy Math";src:local("Cambria Math"),local("CambriaMath"),local("STIX Two Math"),local("STIX Two Math Regular"),local("STIXTwoMath-Regular"),url("/fonts/stix-two-math-subset-v1.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}
.math-semantic{max-width:100%}.math-visible:not(.math-inline){display:block;overflow-x:auto;overflow-y:hidden}.math-inline{display:inline-block;overflow:visible;vertical-align:baseline}.math-inline:has(mtable){overflow-x:auto;overflow-y:hidden;vertical-align:middle}.math-semantic>math{font-family:"StudyWudy Math",Cambria Math,STIX Two Math,STIXGeneral,serif;font-size:1.04em}.math-visible>math{display:block math;max-width:max-content}.math-inline>math{display:inline math}.math-matrix-table>mtr>mtd{padding:.18em .42em}.math-aligned-table>mtr>mtd{padding:.14em .16em}.math-matrix-table,.math-aligned-table{math-style:normal}.math-matrix-table>mtr>mtd.math-rule-right,.math-aligned-table>mtr>mtd.math-rule-right{border-right:1px solid currentColor}.math-matrix-table>mtr>mtd.math-rule-below,.math-aligned-table>mtr>mtd.math-rule-below{border-bottom:1px solid currentColor}.math-table-framed{border:1px solid currentColor}.math-table-framed>mtr>mtd{padding:.22em .5em}mtd.math-align-left{text-align:left}mtd.math-align-right{text-align:right}.math-fallback{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
</style>`;
