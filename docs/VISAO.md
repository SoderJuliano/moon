# Visão do Projeto

> Documento de norte. Quando houver dúvida de design, decidir a favor desta visão.

## Origem

Começou como um **planetário** do Sistema Solar — visualização realista de
escalas, órbitas e corpos celestes, com objetivo educativo. Durante o
desenvolvimento, o filho do autor pediu "uma nave para explorar o cenário", e a
ideia evoluiu. Hoje o projeto caminha para **duas experiências dentro do mesmo
universo**.

## Os dois modos

### 1. Modo Planetário (observação)
Foco em aprendizado e contemplação: planetas, órbitas, escalas, datas. Aqui o
realismo importa. É o objetivo original e continua valendo.

### 2. Modo Exploração (gameplay)
Foco em **pilotar uma nave de forma extremamente prazerosa** pelo Sistema Solar.

Os dois modos **compartilham o universo, mas não as mesmas regras**.

## Diretriz central do Modo Exploração

**Quando realismo físico conflitar com diversão, escolher a diversão.**

Não é uma simulação da NASA. A referência de pilotagem são jogos, não ciência:

- Elite Dangerous · Everspace · Freelancer · Chorus · No Man's Sky · Descent

Está liberado (e encorajado) usar: aproximações, velocidades artificiais, escalas
diferentes entre modos, aceleração não realista, ajustes de câmera, FOV dinâmico,
partículas, efeitos visuais e qualquer técnica comum de jogos para melhorar o
*game feel*.

Pilares do voo: liberdade total 6DoF, inércia, controles previsíveis, movimento
sempre baseado na orientação atual da nave, sem limitação implícita a um plano.

## Sobre a meta de "tablet ~4 GB RAM"

Era uma **diretriz de arquitetura**, não um teto absoluto. A intenção: engine
eficiente, que carregue só o necessário, reutilize recursos e libere da memória o
que não está mais visível/em uso (LOD, dispose, lazy-load).

**Não** significa sacrificar tudo por essa restrição. Se uma solução deixa o
projeto significativamente melhor, mais limpo ou mais divertido, pode usar um
pouco mais de memória/CPU. Preferir arquitetura sólida e experiência excelente a
otimização prematura.

## Postura de engenharia esperada

Pensar como arquiteto de engine e de gameplay. Propor melhorias de arquitetura
quando elas tornarem o projeto mais consistente a longo prazo — não ficar preso
apenas à instrução literal.

---

## Estado atual da engine de voo (referência rápida)

- Toda a navegação vive em `src/ui/shipFlight.js` (classe `ShipFlight`).
- Orientação = um único quaternion (`this.ship.quaternion`); pitch/yaw/roll nos
  eixos locais via `rotateX/Y/Z` (quaternion, sem gimbal lock, sem auto-nível).
- Velocidade: modelo "arcade com inércia" — escalar de empuxo define o módulo, e
  a direção da velocidade persegue o `forward` atual (`velAlign`). Virar muda a
  rota de verdade, com leve drift.
- Câmera: chase cam que copia o quaternion da nave (slerp) — rola junto, sem up
  global, sem `lookAt`.
- **Supercruise** (Shift+W): teto de velocidade escala com a distância ao corpo
  mais próximo; longe = muito rápido, perto = freia sozinho (torna viável chegar
  ao Sol/planetas distantes sem atravessá-los). FOV dinâmico reforça o rush.
- `main.js` ordem do loop: `ship.update` → `rig.update` (no-op durante o voo) →
  `controls.update` (travado enquanto a nave está ativa).
