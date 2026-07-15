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

App id: `com.moon.solarsystem`. A Play Store aceita **`.aab`** (Android App
Bundle), gerado por `npm run apk:release`.

#### 1. Uma vez só: conta e chave de assinatura

1. Crie a conta no [Google Play Console](https://play.google.com/console)
   (taxa única de US$ 25) e, dentro dela, **crie o app** `Moon` com o
   package `com.moon.solarsystem`.
2. Gere a chave de upload (JDK do sistema ou a de `.tooling/jdk-*/bin`):

   ```bash
   keytool -genkeypair -v -keystore android/moon-upload.keystore \
     -alias moon -keyalg RSA -keysize 2048 -validity 10000
   ```

3. Crie `android/keystore.properties` (o Gradle assina o release com ele):

   ```properties
   storeFile=moon-upload.keystore
   storePassword=SUA_SENHA_DO_STORE
   keyAlias=moon
   keyPassword=SUA_SENHA_DA_CHAVE
   ```

   > A chave (`*.keystore`) e o `keystore.properties` são **segredos** e já estão
   > no `.gitignore` — guarde-os fora do repo (perdê-los = não conseguir mais
   > atualizar o app). Ative o **Play App Signing** no Console: você envia
   > assinado com a chave de *upload* e o Google reassina com a de distribuição.

#### 2. A cada versão

1. Incremente `versionCode` (e, se quiser, `versionName`) em
   `android/app/build.gradle` — o Console recusa um `versionCode` repetido.
2. Gere o bundle assinado:

   ```bash
   npm run apk:release   # produz moon-release.aab (+ moon-release.apk) na raiz
   ```

#### 3. Enviar

- **Primeiro envio (manual):** no Console → *Testes internos* (ou *Produção*) →
  *Criar versão* → suba o `moon-release.aab`, preencha a ficha da loja (ícone,
  screenshots, descrição, política de privacidade) e envie pra revisão.
- **Envios seguintes (automatizável por API):** dá pra publicar via
  **Google Play Developer Publishing API** sem abrir o Console, com uma
  *service account*:
  1. No Console → *Configurações → Acesso via API*, vincule um projeto Google
     Cloud e crie uma **service account** com permissão de release; baixe o JSON
     (`play-service-account.json` — também no `.gitignore`).
  2. Use uma ferramenta que fala com a API. Duas opções comuns:
     - **[Gradle Play Publisher](https://github.com/Triple-T/gradle-play-publisher)**
       (plugin `com.github.triplet.play`): depois de configurado,
       `./gradlew publishReleaseBundle` sobe o `.aab` direto.
     - **[fastlane](https://docs.fastlane.tools/actions/supply/) `supply`**:
       `fastlane supply --aab moon-release.aab --track internal`.

  > **Importante:** o *primeiro* release de um app costuma exigir upload manual;
  > a API entra pras atualizações. E a publicação é feita **por você**, com as
  > **suas** credenciais — nenhuma parte disso roda a partir daqui.

## Visão do projeto

- Modo Planetário: observação, escalas e órbitas com foco educativo
- Modo Exploração: pilotagem divertida da nave pelo Sistema Solar

Quando realismo e diversão entrarem em conflito, o projeto prioriza a diversão no modo exploração.

## Observações

- A órbita e a apresentação dos corpos são organizadas para facilitar navegação e visualização
- A Terra é o único corpo com lua configurada no momento
- O menu segue a ordem do Sol para fora com os orbitadores registrados
