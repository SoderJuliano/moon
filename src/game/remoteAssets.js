// Assets remotos (só no app Android): os modelos GIGANTES ficam FORA do APK
// e são baixados do Google Drive do projeto na primeira execução, com cache
// permanente no armazenamento do app. Isso derruba o APK de ~277MB pra ~30MB
// (limite da Play Store: ~200MB no módulo base do AAB).
//
// Como funciona:
//  - Na WEB nada muda: os arquivos continuam em public/models e o resolvedor
//    devolve o próprio caminho na hora.
//  - No ANDROID (Capacitor), o `build-apk.sh` exclui estes arquivos do pacote.
//    Ao entrar no jogo, `startBackgroundInstall()` baixa os que faltam em
//    sequência (banner discreto de progresso no canto — o jogo já é jogável,
//    nada disso é necessário perto da Terra). Cada modelo é gravado uma vez em
//    Directory.Data e nas próximas execuções resolve na hora, sem rede.
//  - Os carregadores pedem a URL via `resolveAssetUrl(path)`: se o download
//    daquele arquivo ainda não terminou, a promise espera por ele (a ordem da
//    fila segue a ordem da história: cruzador → bosses → destroços).
//
// A pasta pública do Drive espelha src/assets/ (decisão do usuário). Se um
// arquivo for re-enviado pro Drive, o id muda — atualizar aqui e em nada mais.
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

export const REMOTE_ASSETS = [
  // ordem = prioridade de download (1ª missão primeiro)
  { path: "models/brokenstarship.glb",  driveId: "1TEEXKVVjUKosOzPTV_wQvXE5pxVc-c9X", label: "Cruzador",   bytes: 47093668 },
  { path: "models/starship.glb",        driveId: "1WFWcQxhFbw4ew6-wThhbWcvCeAKQNAXo", label: "Eclipse",    bytes: 92159484 },
  { path: "models/combatstarship.glb",  driveId: "189WO40RYmA_NhIT0y7oz9K7dzMFhGP4q", label: "Vórtice",    bytes: 89546856 },
  { path: "models/destrocosDaNave.glb", driveId: "1jSD8XR2euecBsYW0a4csgvFg6s3JQNbU", label: "Destroços",  bytes: 91874664 },
];

// URL de download direto do Drive; confirm=t pula o interstitial de arquivos
// grandes ("não foi possível verificar vírus") — validado com os 88MB reais.
const driveUrl = (id) =>
  `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

const native = Capacitor.isNativePlatform();
const resolved = new Map(); // path -> URL utilizável pelo GLTFLoader
const waiters = new Map(); // path -> [resolve...] de quem pediu antes de baixar

/** URL final de um asset. Na web resolve na hora; no Android espera o download
 *  daquele arquivo terminar (se já está no cache, resolve imediato). */
export function resolveAssetUrl(path) {
  if (!native) return Promise.resolve(path);
  if (resolved.has(path)) return Promise.resolve(resolved.get(path));
  if (!REMOTE_ASSETS.some((a) => a.path === path)) return Promise.resolve(path);
  return new Promise((res) => {
    if (!waiters.has(path)) waiters.set(path, []);
    waiters.get(path).push(res);
  });
}

function markResolved(path, url) {
  resolved.set(path, url);
  for (const res of waiters.get(path) || []) res(url);
  waiters.delete(path);
}

const localPath = (a) => `remote/${a.path}`; // dentro de Directory.Data

async function cachedUri(a) {
  try {
    const st = await Filesystem.stat({ path: localPath(a), directory: Directory.Data });
    // tamanho tem que bater — download interrompido não vale como cache
    if (Number(st.size) === a.bytes) {
      return Capacitor.convertFileSrc(st.uri);
    }
  } catch {
    /* não existe ainda */
  }
  return null;
}

/** Baixa em sequência tudo que falta, com banner de progresso. Chamar uma vez
 *  na entrada do modo jogo. Na web é no-op. Tolerante a rede: falhou, espera
 *  e tenta de novo — os pedidos dos carregadores ficam aguardando. */
export async function startBackgroundInstall() {
  if (!native) return;

  // o que já está no cache resolve já (execuções seguintes: tudo cai aqui)
  const pending = [];
  for (const a of REMOTE_ASSETS) {
    const uri = await cachedUri(a);
    if (uri) markResolved(a.path, uri);
    else pending.push(a);
  }
  if (pending.length === 0) return;

  const ui = makeBanner();
  let fileProgress = 0;
  const listener = await Filesystem.addListener("progress", (p) => {
    if (p.contentLength > 0) fileProgress = p.bytes / p.contentLength;
    ui.update(fileProgress);
  });

  for (let i = 0; i < pending.length; i++) {
    const a = pending[i];
    ui.setFile(a.label, i + 1, pending.length);
    // tenta até conseguir — sem rede o jogo segue e os loaders esperam
    for (;;) {
      try {
        fileProgress = 0;
        await Filesystem.downloadFile({
          url: driveUrl(a.driveId),
          path: localPath(a),
          directory: Directory.Data,
          recursive: true,
          progress: true,
        });
        const uri = await cachedUri(a);
        if (!uri) throw new Error("tamanho não confere (download truncado)");
        markResolved(a.path, uri);
        break;
      } catch (err) {
        console.warn(`[remoteAssets] falha baixando ${a.path}, tentando de novo em 8s`, err);
        ui.setError();
        await new Promise((r) => setTimeout(r, 8000));
      }
    }
  }

  listener.remove();
  ui.done();
}

// --- Banner discreto de progresso (canto inferior esquerdo) -----------------
function makeBanner() {
  const el = document.createElement("div");
  el.className = "content-install";
  el.innerHTML = `
    <div class="ci-title">Instalando conteúdo adicional…</div>
    <div class="ci-file"></div>
    <div class="ci-bar"><div class="ci-fill"></div></div>
  `;
  document.body.appendChild(el);
  const file = el.querySelector(".ci-file");
  const fill = el.querySelector(".ci-fill");
  return {
    setFile(label, n, total) {
      file.textContent = `${label} (${n}/${total})`;
      fill.style.width = "0%";
      el.classList.remove("ci-error");
    },
    update(frac) {
      fill.style.width = `${Math.round(frac * 100)}%`;
    },
    setError() {
      el.classList.add("ci-error");
      file.textContent += " — sem conexão, tentando de novo…";
    },
    done() {
      el.classList.add("ci-done");
      el.querySelector(".ci-title").textContent = "Conteúdo instalado ✓";
      setTimeout(() => el.remove(), 4000);
    },
  };
}
