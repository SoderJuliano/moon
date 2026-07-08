// Event bus do jogo — o desacoplador central da progressão.
//
// Sistemas EMITEM fatos ("body:visited", "milestone", "stat"…) sem saber quem
// escuta; o AchievementSystem/estatísticas ASSINAM sem conhecer os emissores.
// Adicionar uma descoberta nova = registrar um item no catálogo e emitir um
// evento de onde ela acontece — zero `if` espalhado pelo código.
//
// Zero dependências de propósito: qualquer módulo (sistemas, UI, modos) pode
// importar sem criar ciclos.

const listeners = new Map(); // type -> Set<fn>

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type)?.delete(fn); // desinscrição
}

export function emit(type, payload) {
  const set = listeners.get(type);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (e) {
      console.error(`[events] listener de "${type}" falhou:`, e);
    }
  }
}
