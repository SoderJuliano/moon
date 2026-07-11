#!/usr/bin/env bash
# ==============================================================================
# Moon — compositor Android
#
# Empacota o jogo (Vite + Capacitor) num APK pronto pra instalar no Android.
#
#   ./scripts/build-apk.sh            → APK de DEBUG (instala direto no celular)
#   ./scripts/build-apk.sh --release  → APK + AAB de RELEASE (pra Play Store;
#                                       assina se existir android/keystore.properties)
#
# O script é autossuficiente: se a máquina não tiver JDK compatível (17–24) ou
# Android SDK, ele baixa os dois para ./.tooling/ (sem sudo, só neste projeto).
# Primeira execução baixa ~700MB de ferramentas; as seguintes são rápidas.
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLING="$ROOT/.tooling"
MODE="debug"
[ "${1:-}" = "--release" ] && MODE="release"

log() { printf '\n\033[1;36m[moon]\033[0m %s\n' "$*"; }

# --- 1) JDK 17–24 (o Gradle/AGP do projeto não roda em Java 25+) -------------
find_jdk() {
  local cand
  for cand in "${JAVA_HOME:-}" "$TOOLING"/jdk-* /usr/lib/jvm/java-21-* /usr/lib/jvm/java-17-* /usr/lib/jvm/*; do
    [ -x "$cand/bin/java" ] || continue
    local v
    v=$("$cand/bin/java" -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+).*/\1/')
    if [ "$v" -ge 17 ] && [ "$v" -le 24 ]; then echo "$cand"; return 0; fi
  done
  return 1
}
if JDK="$(find_jdk)"; then
  log "JDK encontrado: $JDK"
else
  log "Nenhum JDK 17–24 na máquina — baixando Temurin JDK 21 pra $TOOLING (uma vez só)…"
  mkdir -p "$TOOLING"
  curl -fL --retry 3 -o "$TOOLING/jdk21.tar.gz" \
    "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
  tar -xzf "$TOOLING/jdk21.tar.gz" -C "$TOOLING" && rm "$TOOLING/jdk21.tar.gz"
  JDK="$(find_jdk)" || { echo "ERRO: JDK baixado mas não localizado"; exit 1; }
  log "JDK 21 instalado em: $JDK"
fi
export JAVA_HOME="$JDK"
export PATH="$JAVA_HOME/bin:$PATH"

# --- 2) Android SDK (platform 36 + build-tools, do variables.gradle) ---------
SDK=""
for cand in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Android/Sdk" "$TOOLING/android-sdk"; do
  [ -d "$cand/platforms" ] || [ -d "$cand/cmdline-tools" ] || continue
  SDK="$cand"; break
done
if [ -z "$SDK" ]; then
  SDK="$TOOLING/android-sdk"
  log "Android SDK não encontrado — baixando command-line tools pra $SDK (uma vez só)…"
  mkdir -p "$SDK/cmdline-tools"
  curl -fL --retry 3 -o "$TOOLING/cmdtools.zip" \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  unzip -q -o "$TOOLING/cmdtools.zip" -d "$SDK/cmdline-tools"
  mv -f "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm "$TOOLING/cmdtools.zip"
fi
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
[ -x "$SDKMANAGER" ] || SDKMANAGER="$(ls "$SDK"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1)"
if [ ! -d "$SDK/platforms/android-36" ] || [ ! -d "$SDK/build-tools" ]; then
  log "Instalando pacotes do SDK (platform-tools, android-36, build-tools)…"
  yes | "$SDKMANAGER" --sdk_root="$SDK" --licenses > /dev/null || true
  "$SDKMANAGER" --sdk_root="$SDK" "platform-tools" "platforms;android-36" "build-tools;36.0.0" > /dev/null
fi
export ANDROID_HOME="$SDK"
echo "sdk.dir=$SDK" > "$ROOT/android/local.properties"
log "Android SDK: $SDK"

# --- 3) Build do jogo (Vite) + sync pro projeto Android ----------------------
cd "$ROOT"
[ -d node_modules ] || { log "Instalando dependências npm…"; npm install; }
log "Buildando o jogo (vite build)…"
npm run build
log "Sincronizando dist/ → android/ (capacitor)…"
npx cap sync android

# --- 4) Gradle: gerar o APK (e AAB no release) --------------------------------
cd "$ROOT/android"
if [ "$MODE" = "release" ]; then
  if [ ! -f keystore.properties ]; then
    log "AVISO: android/keystore.properties não existe — o release sai SEM assinatura."
    log "       Veja o README (seção Android) pra criar a chave da Play Store."
  fi
  log "Gerando APK + AAB de release (primeira vez demora — o Gradle baixa a si mesmo)…"
  ./gradlew assembleRelease bundleRelease
  cp -f app/build/outputs/apk/release/app-release*.apk "$ROOT/moon-release.apk"
  cp -f app/build/outputs/bundle/release/app-release.aab "$ROOT/moon-release.aab"
  log "PRONTO ✅  → moon-release.apk (instalar) e moon-release.aab (subir na Play Store)"
else
  log "Gerando APK de debug (primeira vez demora — o Gradle baixa a si mesmo)…"
  ./gradlew assembleDebug
  cp -f app/build/outputs/apk/debug/app-debug.apk "$ROOT/moon-debug.apk"
  log "PRONTO ✅  → moon-debug.apk na raiz do projeto"
  log "Instalar no celular: adb install -r moon-debug.apk  (ou copie o arquivo e abra nele)"
fi
