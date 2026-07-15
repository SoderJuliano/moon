// i18n — internacionalização do Moon. Duas línguas: pt (Brasil/Portugal) e en
// (resto do mundo). A língua é escolhida pelo APARELHO/navegador, com override
// manual (menu) e por URL (?lang=en) pra teste.
//
// Prioridade de detecção: ?lang= (teste) > escolha salva > idioma do aparelho.
//   • navigator.languages / navigator.language começando com "pt" → pt
//     (cobre pt-BR e pt-PT); qualquer outro → en.
//
// Uso: import { t } from "../core/i18n.js"; t("menu.play"), t("hud.dist", { n: 12 }).
// Chaves sem tradução caem no pt e, por fim, na própria chave (nunca quebra a UI).

import { pt } from "./locales/pt.js";
import { en } from "./locales/en.js";

const DICTS = { pt, en };
const SUPPORTED = ["pt", "en"];
const STORAGE_KEY = "moon.lang";

function detect() {
  // 1) override de teste por URL (?lang=en) — vence tudo, pra você testar no navegador
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q && SUPPORTED.includes(q)) return q;
  } catch {}
  // 2) escolha manual salva (troca de idioma no menu)
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {}
  // 3) idioma do aparelho: Brasil e Portugal (pt-*) → pt; resto → en
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
    for (const l of langs) if (l && l.toLowerCase().startsWith("pt")) return "pt";
  } catch {}
  return "en";
}

let _lang = detect();

export function getLang() {
  return _lang;
}

// troca de idioma em runtime (menu). Persiste a escolha. Recarregar aplica em
// toda a UI já renderizada (mais simples e sem risco que re-renderizar tudo).
export function setLang(l, { reload = false } = {}) {
  if (!SUPPORTED.includes(l) || l === _lang) return;
  _lang = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {}
  if (reload) location.reload();
}

export const SUPPORTED_LANGS = SUPPORTED;

export function hasLangKey(key) {
  return (DICTS[_lang] && DICTS[_lang][key] !== undefined) || (DICTS.pt && DICTS.pt[key] !== undefined);
}

// traduz uma chave. vars: { n: 12 } substitui {n} no texto.
export function t(key, vars) {
  let s = DICTS[_lang]?.[key];
  if (s == null) s = DICTS.pt[key]; // fallback pra pt
  if (s == null) s = key; // último recurso: a própria chave (nunca some da tela)
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
  return s;
}
