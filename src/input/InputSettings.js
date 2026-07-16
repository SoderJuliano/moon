// Configurações de entrada (deadzone, sensibilidade, eixo Y, vibração).
//
// Ainda NÃO existe tela de configuração — este módulo é a fundação: os valores
// são persistidos em localStorage e qualquer tela futura só precisa chamar
// set()/get(). O remapeamento de botões também entra aqui quando existir
// (campo `remap`, hoje sempre vazio = mapeamento padrão).

const STORAGE_KEY = "moon.input.settings";

const DEFAULTS = {
  deadzone: 0.16, // zona morta radial dos analógicos (0..1)
  sensitivity: 1.0, // multiplicador dos eixos de voo
  invertY: false, // inverte o pitch do analógico esquerdo
  vibration: true, // força-feedback (quando o jogo passar a usar)
  remap: {}, // futuro: { acaoId: buttonIndex } sobrepondo o padrão
};

let settings = null;

function load() {
  if (settings) return settings;
  settings = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch {
    /* localStorage indisponível (iframe restrito etc.): usa defaults */
  }
  return settings;
}

export function getSetting(key) {
  return load()[key];
}

export function setSetting(key, value) {
  const s = load();
  s[key] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* sem persistência, mas vale pra sessão */
  }
}

export function getAllSettings() {
  return { ...load() };
}
