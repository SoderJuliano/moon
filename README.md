# Planetário — Sistema Solar

Projeto em Three.js + Vite para explorar o Sistema Solar em 3D. O foco original é um planetário educativo, mas o projeto também evoluiu para um modo de exploração com nave, câmeras e HUD.

## O que tem

- Sol, planetas e corpos menores em arquivos separados
- Luas organizadas por planeta
- Modo de exploração com nave 6DoF
- Supercruise para navegar grandes distâncias
- HUD, menu e apoio de navegação
- Texturas e modelos 3D para corpos celestes e asteroides

## Modos

O aplicativo abre num menu inicial (a Via Láctea girando; clique no marcador
"Solar System") com duas experiências construídas sobre a mesma engine:

- **Exploration** — o planetário interativo original (escalas, órbitas, câmera
  de observação). Conceitualmente congelado.
- **Game** — jogo de exploração espacial: nasce pilotando a nave perto da
  Terra e toda a navegação acontece voando. É onde as novas mecânicas entram.

Atalho de desenvolvimento: `?mode=exploration` ou `?mode=game` pula o menu.

## Estrutura principal

- `src/main.js` — bootstrap: menu inicial → modo escolhido
- `src/app/` — menu inicial, os dois modos e a construção compartilhada do mundo (`world.js`)
- `src/bodies/` — definição dos corpos celestes
- `src/core/` — cena, escalas, texturas e utilitários centrais
- `src/systems/` — sistema de asteroides e debug
- `src/ui/` — câmera, HUD, menu, áudio e controle da nave
- `public/` — modelos e texturas estáticas

## Stack

- JavaScript ES Modules
- Three.js
- Vite

## Scripts

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Android (gerar o APK)

O jogo é empacotado com **Capacitor** (embute o `dist/` num WebView nativo).
O script `scripts/build-apk.sh` é autossuficiente: se faltar JDK 17–24 ou o
Android SDK, ele baixa os dois para `./.tooling/` (sem `sudo`, só neste projeto).
A primeira execução baixa ~700MB de ferramentas; as seguintes levam ~2 min.

```bash
npm run apk           # gera moon-debug.apk na raiz (instalar/testar)
npm run apk:release   # gera moon-release.apk + moon-release.aab (Play Store)
```

Instalar no celular:

```bash
adb install -r moon-debug.apk    # ou copie o arquivo e abra nele (fontes desconhecidas)
```

### Assets pesados fora do APK

Os 4 modelos gigantes (`brokenstarship`, `starship`, `combatstarship`,
`destrocosDaNave` — ~320MB juntos) **não entram no pacote**: o script os remove
do `dist/` antes de empacotar e o app os baixa do Google Drive na primeira
execução (`src/game/remoteAssets.js`, com barra de progresso e cache local em
`Directory.Data`). Isso derruba o APK de ~277MB para ~34MB — abaixo do limite de
~200MB da Play Store. Na versão web nada muda (os arquivos seguem em `public/`).

Se um modelo for re-enviado ao Drive, o `driveId` muda — atualize a tabela
`REMOTE_ASSETS` em `src/game/remoteAssets.js` (e só lá).

### Release / Play Store

Antes de `npm run apk:release`, crie a chave de assinatura e o
`android/keystore.properties` (o script assina o `.aab` se ele existir; sem ele,
o release sai sem assinatura). A cada envio, incremente `versionCode` em
`android/app/build.gradle`.

## Visão do projeto

- Modo Planetário: observação, escalas e órbitas com foco educativo
- Modo Exploração: pilotagem divertida da nave pelo Sistema Solar

Quando realismo e diversão entrarem em conflito, o projeto prioriza a diversão no modo exploração.

## Observações

- A órbita e a apresentação dos corpos são organizadas para facilitar navegação e visualização
- A Terra é o único corpo com lua configurada no momento
- O menu segue a ordem do Sol para fora com os orbitadores registrados
