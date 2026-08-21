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
  Delta: ["Δ", "capital delta"], epsilon: ["ε", "epsilon"], varepsilon: ["ε", "epsilon"],
  theta: ["θ", "theta"], lambda: ["λ", "lambda"], mu: ["μ", "mu"], pi: ["π", "pi"],
  rho: ["ρ", "rho"], sigma: ["σ", "sigma"], Sigma: ["Σ", "sum"], phi: ["φ", "phi"],
  Phi: ["Φ", "capital phi"], omega: ["ω", "omega"], Omega: ["Ω", "ohm"],
  infty: ["∞", "infinity"], degree: ["°", "degrees"], circ: ["°", "degrees"],
});
const OPERATORS = Object.freeze({
  times: ["×", "times"], cdot: ["·", "times"], pm: ["±", "plus or minus"],
  mp: ["∓", "minus or plus"], le: ["≤", "less than or equal to"], leq: ["≤", "less than or equal to"],
  ge: ["≥", "greater than or equal to"], geq: ["≥", "greater than or equal to"],
  neq: ["≠", "not equal to"], approx: ["≈", "approximately equal to"],
  sum: ["Σ", "sum"], int: ["∫", "integral"], oint: ["∮", "closed surface integral"],
  to: ["→", "to"], rightarrow: ["→", "to"], leftarrow: ["←", "from"],
  rightleftharpoons: ["⇌", "is in equilibrium with"],
});
const IGNORED_COMMANDS = new Set(["left", "right", "big", "Big", "bigg", "Bigg", "displaystyle", "textstyle"]);
const SPACING_COMMANDS = new Set([",", ";", ":", "!", "quad", "qquad", " "]);
const ROMAN_COMMANDS = new Set(["mathrm", "textrm", "operatorname"]);
const FUNCTION_COMMANDS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "min", "max"]);
const UNIT_SPOKEN = Object.freeze({
  mm: "millimetres", cm: "centimetres", km: "kilometres", m: "metres", s: "seconds",
  ms: "milliseconds", kg: "kilograms", g: "grams", mol: "moles", Hz: "hertz", V: "volts",
  A: "amperes", C: "coulombs", F: "farads", J: "joules", W: "watts", N: "newtons", Pa: "pascals",
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

class TexParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  parse(stop = null) {
    const children = [];
    while (this.index < this.source.length) {
      if (stop && this.source[this.index] === stop) {
        this.index += 1;
        break;
      }
      if (/\s/u.test(this.source[this.index])) {
        this.index += 1;
        continue;
      }
      const next = this.parseAtom();
      if (next) children.push(this.withScripts(next));
    }
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

  readGroup() {
    while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
    if (this.source[this.index] === "{") {
      this.index += 1;
      return this.parse("}");
    }
    const atom = this.parseAtom();
    return node("sequence", { children: atom ? [atom] : [] });
  }

  readOptionalGroup() {
    while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
    if (this.source[this.index] !== "[") return null;
    this.index += 1;
    return this.parse("]");
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
      return this.parse("}");
    }
    if (character === "\\") {
      const command = this.readCommand();
      if (["frac", "dfrac", "tfrac"].includes(command)) {
        return node("fraction", { numerator: this.readGroup(), denominator: this.readGroup() });
      }
      if (command === "boxed") return this.readGroup();
      if (command === "ce") return node("roman", { base: this.readGroup() });
      if (command === "sqrt") {
        const index = this.readOptionalGroup();
        return node("root", { index, radicand: this.readGroup() });
      }
      if (["vec", "hat", "bar", "overline"].includes(command)) {
        return node("accent", { accent: command, base: this.readGroup() });
      }
      if (command === "text") {
        const group = this.readGroup();
        return node("text", { value: plainFromNode(group) });
      }
      if (ROMAN_COMMANDS.has(command)) return node("roman", { base: this.readGroup() });
      if (SYMBOLS[command]) return node("identifier", { value: SYMBOLS[command][0], spoken: SYMBOLS[command][1] });
      if (OPERATORS[command]) return node("operator", { value: OPERATORS[command][0], spoken: OPERATORS[command][1] });
      if (FUNCTION_COMMANDS.has(command)) return node("function", { value: command });
      if (IGNORED_COMMANDS.has(command) || SPACING_COMMANDS.has(command)) return this.parseAtom();
      if (command === "\\" || command === "newline") return node("separator", { value: ";" });
      return node("text", { value: command, unknown: true });
    }
    if (/\d/u.test(character)) {
      const start = this.index;
      while (/[\d.,]/u.test(this.source[this.index] || "")) this.index += 1;
      return node("number", { value: this.source.slice(start, this.index) });
    }
    if (/[A-Za-z]/u.test(character)) {
      this.index += 1;
      return node("identifier", { value: character, spoken: character });
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
      if (child.type === "operator" && !["(", ")", "[", "]", "|", "°"].includes(child.value)) appendPlain(parts, plainFromNode(child), "operator");
      else if (child.type === "separator") appendPlain(parts, plainFromNode(child), "separator");
      else if (child.type === "roman") appendPlain(parts, plainFromNode(child), "unit");
      else appendPlain(parts, plainFromNode(child));
    }
    return parts.join("").replace(/\s+/gu, " ").replace(/\s+([,;:)\]])/gu, "$1").replace(/([(\[])[ ]+/gu, "$1").trim();
  }
  if (["number", "identifier", "function", "text", "operator", "separator"].includes(value.type)) return String(value.value || "");
  if (value.type === "roman") return plainFromNode(value.base);
  if (value.type === "fraction") return `(${plainFromNode(value.numerator)}/${plainFromNode(value.denominator)})`;
  if (value.type === "root") return value.index
    ? `root(${plainFromNode(value.index)}, ${plainFromNode(value.radicand)})`
    : `√(${plainFromNode(value.radicand)})`;
  if (value.type === "accent") return plainFromNode(value.base);
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
  const words = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
    "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten", "100": "one hundred",
  };
  return words[value] || String(value).split("").map((character) => words[character] || character).join(" ");
}

function spokenFromNode(value) {
  if (!value) return "";
  if (value.type === "sequence") return value.children.map(spokenFromNode).filter(Boolean).join(" ").replace(/\s+/gu, " ").trim();
  if (value.type === "number") return numberSpoken(value.value);
  if (value.type === "identifier") return value.spoken || [...value.value].join(" ");
  if (value.type === "function") return value.value;
  if (value.type === "operator") return value.spoken || value.value;
  if (value.type === "separator") return value.value === ";" ? "then" : value.value;
  if (value.type === "text") return [...String(value.value || "")].join(" ");
  if (value.type === "roman") {
    const plain = plainFromNode(value.base);
    return UNIT_SPOKEN[plain] || spokenFromNode(value.base);
  }
  if (value.type === "fraction") {
    const numerator = plainFromNode(value.numerator);
    const denominator = plainFromNode(value.denominator);
    if (numerator === "1" && denominator === "2") return "one half";
    if (numerator === "1" && denominator === "4") return "one quarter";
    if (numerator === "3" && denominator === "4") return "three quarters";
    return `${spokenFromNode(value.numerator)} over ${spokenFromNode(value.denominator)}`;
  }
  if (value.type === "root") return value.index
    ? `${spokenFromNode(value.index)} root of ${spokenFromNode(value.radicand)}`
    : `square root of ${spokenFromNode(value.radicand)}`;
  if (value.type === "accent") return `${value.accent === "vec" ? "vector" : value.accent} ${spokenFromNode(value.base)}`;
  if (value.type === "prescript") {
    const base = spokenFromNode(value.base);
    const superscript = value.presuperscript ? `superscript ${spokenFromNode(value.presuperscript)}` : "";
    const subscript = value.presubscript ? `subscript ${spokenFromNode(value.presubscript)}` : "";
    return [superscript, subscript, base].filter(Boolean).join(" ");
  }
  if (value.type === "subscript") return `${spokenFromNode(value.base)} sub ${spokenFromNode(value.subscript)}`;
  if (value.type === "superscript") {
    const exponent = plainFromNode(value.superscript).replaceAll("−", "-");
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
  if (value.type === "operator" || value.type === "separator") return `<mo>${escapeHtml(value.value === "-" ? "−" : value.value)}</mo>`;
  if (value.type === "text") return `<mtext>${escapeHtml(value.value)}</mtext>`;
  if (value.type === "roman") return `<mstyle mathvariant="normal">${mathmlFromNode(value.base)}</mstyle>`;
  if (value.type === "fraction") return `<mfrac>${mathmlFromNode(value.numerator)}${mathmlFromNode(value.denominator)}</mfrac>`;
  if (value.type === "root") return value.index
    ? `<mroot>${mathmlFromNode(value.radicand)}${mathmlFromNode(value.index)}</mroot>`
    : `<msqrt>${mathmlFromNode(value.radicand)}</msqrt>`;
  if (value.type === "accent") {
    const mark = value.accent === "vec" ? "→" : value.accent === "hat" ? "^" : "¯";
    return `<mover accent="true">${mathmlFromNode(value.base)}<mo>${mark}</mo></mover>`;
  }
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

function parseFormula(source) {
  const normalized = stripDelimiters(source);
  const scriptsNormalized = unicodeScriptsToTex(normalized);
  const texish = plainToTexish(scriptsNormalized);
  return { normalized: texish.trim(), ast: new TexParser(texish).parse() };
}

export function formulaRepresentations(source) {
  const { normalized, ast } = parseFormula(source);
  const plainText = plainFromNode(ast).replaceAll("-", "−").replace(/\s+/gu, " ").trim();
  const spokenText = spokenFromNode(ast).replace(/\s+/gu, " ").trim();
  const mathml = `<math xmlns="http://www.w3.org/1998/Math/MathML" aria-label="${escapeHtml(spokenText)}"><semantics>${mathmlFromNode(ast)}<annotation encoding="application/x-tex">${escapeHtml(normalized)}</annotation><annotation encoding="text/plain">${escapeHtml(plainText)}</annotation></semantics></math>`;
  return Object.freeze({ source: normalized, spokenText, plainText, mathml });
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
  const sourceHasFraction = /\\(?:dfrac|tfrac|frac)\b/u.test(expected.source);
  const sourceHasExponent = /\^|[⁰¹²³⁴⁵⁶⁷⁸⁹]/u.test(expected.source);
  const sourceHasMinus = /-|−|⁻/u.test(expected.source);
  const checks = Object.freeze({
    sourceDerivedPlain: actualPlain === expectedPlain,
    sourceDerivedSpoken: actualSpoken === expectedSpoken,
    semanticMathml: /<math\b/u.test(actualMathml) && /<semantics>/u.test(actualMathml)
      && actualMathml.includes('encoding="application/x-tex"') && actualMathml.includes('encoding="text/plain"'),
    numeralsStayJoined: !hasSeparatedNumerals(rawPlain),
    fractionOrderPreserved: !sourceHasFraction || (actualPlain === expectedPlain && /<mfrac>/u.test(actualMathml)),
    exponentPreserved: !sourceHasExponent || (actualPlain === expectedPlain && /<msup>|<msubsup>|<mmultiscripts>/u.test(actualMathml)),
    mathematicalMinusPreserved: !sourceHasMinus || (!actualPlain.includes("-") && actualPlain.includes("−")),
    unitsStayJoined: !hasDetachedUnits(rawPlain),
    latinIIsNotOne: actualPlain === expectedPlain,
  });
  const missing = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
  return Object.freeze({ complete: missing.length === 0, checks, missing, expected });
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
    const delimiterPattern = /\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/gu;
    for (const match of text.matchAll(delimiterPattern)) add(match[1] || match[2] || match[3] || match[4]);
    if (/^(?:formula|formulaUsed|equation|equationUsed)$/iu.test(key) && !text.includes("$")) add(text);
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
    if (!result.complete) failures.push({ source: representation.source, plainText: representation.plainText, missing: result.missing });
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

export function renderSemanticMath(record, { visiblePlain = false, extraClass = "" } = {}) {
  const representation = record?.mathml ? record : formulaRepresentations(record?.source ?? record);
  const classes = ["math", "math-semantic", visiblePlain ? "math-visible" : "math-fallback", extraClass].filter(Boolean).join(" ");
  return `<span class="${escapeHtml(classes)}" data-math-source="${escapeHtml(representation.source)}" data-math-spoken="${escapeHtml(representation.spokenText)}" data-math-plain="${escapeHtml(representation.plainText)}"><span class="math-plain-text" aria-hidden="true">${escapeHtml(representation.plainText)}</span><span class="math-semantic-only" data-nosnippet="">${representation.mathml}</span></span>`;
}

export const SEMANTIC_MATH_STYLES = `<style id="studywudy-semantic-math-styles">
.math-semantic-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.math-fallback{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.math-visible{display:block}.math-visible>.math-plain-text{display:block}.math-visible>.math-semantic-only{position:absolute!important}.katex[data-nosnippet]{user-select:text}
</style>`;
