# Planetário — Sistema Solar

Projeto em Three.js + Vite para explorar o Sistema Solar em 3D. O foco original é um planetário educativo, mas o projeto também evoluiu para um modo de exploração com nave, câmeras e HUD.

## O que tem

- Sol, planetas e corpos menores em arquivos separados
- Luas organizadas por planeta
- Modo de exploração com nave 6DoF
- Supercruise para navegar grandes distâncias
- HUD, menu e apoio de navegação
- Texturas e modelos 3D para corpos celestes e asteroides

## Estrutura principal

- `src/main.js` — ponto de entrada da aplicação
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

## Visão do projeto

- Modo Planetário: observação, escalas e órbitas com foco educativo
- Modo Exploração: pilotagem divertida da nave pelo Sistema Solar

Quando realismo e diversão entrarem em conflito, o projeto prioriza a diversão no modo exploração.

## Observações

- A órbita e a apresentação dos corpos são organizadas para facilitar navegação e visualização
- A Terra é o único corpo com lua configurada no momento
- O menu segue a ordem do Sol para fora com os orbitadores registrados
