// Sincronização de save na nuvem via abra-api.top (usada como banco de dados).
//
// Cada jogador vira UMA "notificação": a KEY deriva do nome e o CONTENT é o
// JSON do save. Como o POST não devolve o id, depois de criar a gente faz um
// GET pra capturá-lo — e daí em diante usa PUT /edit (override por id) pra não
// acumular versões no banco. Sem senha (dev): o nome É a chave, então nomes
// iguais compartilham o mesmo save na nuvem.
//
// Tudo tolerante a falha de rede: qualquer erro retorna null/silencioso — o
// jogo continua rodando 100% no save local, a nuvem é só um espelho.

import { normalizeName } from "./players.js";

const BASE = "https://abra-api.top/notifications";
const KEY_PREFIX = "moon-planetario::"; // namespaced p/ não colidir com outros apps
const TITLE = "moon-save";

export function cloudKey(name) {
  return KEY_PREFIX + normalizeName(name).toLowerCase();
}

async function retrieve(name) {
  const res = await fetch(`${BASE}/retrieve?key=${encodeURIComponent(cloudKey(name))}`);
  if (!res.ok) return [];
  const arr = await res.json();
  return Array.isArray(arr) ? arr : [];
}

// entre várias versões, a mais recente (por dateUpdated, senão dateCreated)
function latest(arr) {
  let best = null;
  let bestT = -Infinity;
  for (const n of arr) {
    const t = Date.parse(n.dateUpdated || n.dateCreated || 0) || 0;
    if (t >= bestT) {
      bestT = t;
      best = n;
    }
  }
  return best;
}

// baixa o save do jogador: { save, id } ou null (não existe / erro / inválido)
export async function pullSave(name) {
  try {
    const n = latest(await retrieve(name));
    if (!n) return null;
    return { save: JSON.parse(n.content), id: n.id };
  } catch {
    return null;
  }
}

// envia o save. Override por id (conhecido ou recuperado); senão cria e busca o
// id novo. keepalive=true faz a requisição sobreviver ao fechamento da aba.
// Retorna o id atual (ou o conhecido) — o chamador persiste no registro.
export async function pushSave(name, text, knownId, keepalive = false) {
  const key = cloudKey(name);
  try {
    let id = knownId;
    if (!id) {
      const n = latest(await retrieve(name));
      id = n?.id || null;
    }
    if (id) {
      const res = await fetch(`${BASE}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        keepalive,
        body: JSON.stringify({ id, title: TITLE, key, content: text }),
      });
      if (res.ok) return id;
    }
    // cria (POST não devolve id) e recupera o id em seguida
    await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive,
      body: JSON.stringify({ title: TITLE, key, content: text }),
    });
    if (keepalive) return knownId || null; // sem tempo de re-GET no unload
    const n = latest(await retrieve(name));
    return n?.id || null;
  } catch {
    return knownId || null;
  }
}
