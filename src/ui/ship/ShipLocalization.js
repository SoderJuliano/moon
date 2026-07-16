export const getLocale = () => {
  const lang = navigator.language || "en";
  return lang.startsWith("pt") ? "pt" : "en";
};

export const TRANSLATIONS = {
  pt: {
    menuTitle: "PAINEL DE EQUIPAMENTOS DA NAVE",
    shipName: "Astra Mk-I",
    sectionStats: "ATRIBUTOS DA NAVE",
    sectionSlots: "SLOTS DE EQUIPAMENTO",
    stats: {
      hull: "Integridade do Casco",
      shield: "Capacidade de Escudo",
      speed: "Velocidade Máxima",
      accel: "Aceleração",
      rotSpeed: "Velocidade de Rotação",
      scanRange: "Alcance do Escâner",
      cargo: "Capacidade de Carga",
      weapons: "Slots de Armas",
      energy: "Geração de Energia",
      heat: "Dissipação Térmica",
      mass: "Massa Total",
    },
    equip: {
      plasmaCannon: {
        name: "Canhão de Plasma",
        desc: "Armamento de energia padrão para patrulha e defesa leve.",
        lore: "Dispara projéteis de plasma superaquecido capazes de derreter blindagens metálicas de curto alcance.",
        stats: {
          dano: "Dano: ■■■■□□□□",
          alcance: "Alcance: ■■■■■□□□",
          energia: "Energia: ■■■■■■□□",
        }
      },
      shieldGen: {
        name: "Gerador de Escudo",
        desc: "Barreira eletromagnética defensiva contra impactos e radiação.",
        lore: "Projeta um envelope de plasma de baixa densidade ao redor do casco para desviar destroços e projéteis inimigos.",
        stats: {
          dano: "Dano: □□□□□□□□",
          defesa: "Defesa: ■■■■■■□□",
          energia: "Energia: ■■■■□□□□",
        }
      },
      scanner: {
        name: "Escâner Científico",
        desc: "Módulo sensorial de banda larga para análise de minerais e anomalias.",
        lore: "Essencial para exploração espacial profunda, detecta assinaturas térmicas, magnéticas e radiológicas em tempo real.",
        stats: {
          alcance: "Alcance: ■■■■■■■□",
          precisao: "Precisão: ■■■■■■□□",
          energia: "Energia: ■■■□□□□□",
        }
      },
      tractor: {
        name: "Raio Trator",
        desc: "Manipulador gravitacional de partículas para reboque de materiais.",
        lore: "Utiliza feixes de atração gravitacional focalizados para capturar e guiar destroços ou minerais até a área de carga.",
        stats: {
          forca: "Força: ■■■■■□□□",
          alcance: "Alcance: ■■■■□□□□",
          energia: "Energia: ■■■■■□□□",
        }
      },
      radar: {
        name: "Radar de Varredura",
        desc: "Sistema de detecção tática de longo alcance para corpos celestes e naves.",
        lore: "Mapeia o setor ativo permitindo a plotagem de rotas de navegação seguras mesmo sob fortes tempestades de radiação.",
        stats: {
          alcance: "Alcance: ■■■■■■■■",
          varredura: "Taxa: ■■■■■□□□",
          energia: "Energia: ■■□□□□□□",
        }
      },
      miningLaser: {
        name: "Laser de Mineração",
        desc: "Emissor térmico focado para fragmentação de asteroides.",
        lore: "Projetado para quebrar rochas ricas em metais, extraindo minerais valiosos diretamente na órbita.",
        stats: {
          dano: "Dano: ■■■■■■□□",
          alcance: "Alcance: ■■■□□□□□",
          energia: "Energia: ■■■■■■■□",
        }
      },
      cargoModule: {
        name: "Módulo de Carga",
        desc: "Compartimento pressurizado expansível para armazenamento de recursos.",
        lore: "Garante integridade estrutural e proteção radiológica para amostras científicas e minerais pesados.",
        stats: {
          capacidade: "Carga: ■■■■■■■■",
          peso: "Peso: ■■■■□□□□",
          energia: "Energia: □□□□□□□□",
        }
      },
      warpDrive: {
        name: "Motor de Dobra",
        desc: "Propulsor de distorção espaço-temporal para saltos interestelares.",
        lore: "Manipula a métrica do espaço ao redor da nave, diminuindo distâncias de viagem a frações de segundo.",
        stats: {
          velocidade: "Velocidade: ■■■■■■■■",
          alcance: "Alcance: ■■■■■■■■",
          energia: "Energia: ■■■■■■■■",
        }
      },
      thermalShield: {
        name: "Escudo Térmico",
        desc: "Placas refratárias reforçadas para aproximações solares.",
        lore: "Blindagem de carbono-carbono com refrigeração criogênica ativa para resistir às temperaturas extremas das coroas solares.",
        stats: {
          resistencia: "Calor: ■■■■■■■■",
          peso: "Peso: ■■■■■□□□",
          energia: "Energia: ■■□□□□□□",
        }
      },
      empCannon: {
        name: "Canhão PEM",
        desc: "Disparador de pulso eletromagnético para desativar eletrônicos.",
        lore: "Gera uma onda de choque de alta tensão que sobrecarrega escudos e sistemas de navegação inimigos sem destruir o alvo.",
        stats: {
          dano: "PEM: ■■■■■■■□",
          alcance: "Alcance: ■■■■■□□□",
          energia: "Energia: ■■■■■■□□",
        }
      },
    },
    locked: "BLOQUEADO",
    notEquipped: "Não Instalado",
    equipped: "Instalado",
    selectPrompt: "Selecione um slot de equipamento para visualizar suas especificações.",
    enTranslationLegend: "",
    emptySlot: "Slot de Expansão",
    emptyStatus: "Livre",
    emptySlotPrompt: "Este slot de expansão está disponível para novas tecnologias. Conclua missões pelo sistema solar para obter novos módulos.",
  },
  en: {
    menuTitle: "SHIP EQUIPMENT PANEL",
    shipName: "Astra Mk-I",
    sectionStats: "SHIP ATTRIBUTES",
    sectionSlots: "EQUIPMENT SLOTS",
    stats: {
      hull: "Hull Integrity",
      shield: "Shield Capacity",
      speed: "Maximum Speed",
      accel: "Acceleration",
      rotSpeed: "Rotation Speed",
      scanRange: "Scanner Range",
      cargo: "Cargo Capacity",
      weapons: "Weapon Slots",
      energy: "Energy Output",
      heat: "Heat Dissipation",
      mass: "Total Mass",
    },
    equip: {
      plasmaCannon: {
        name: "Plasma Cannon",
        desc: "Standard energy weapon for patrol and light defense.",
        lore: "Fires superheated plasma projectiles capable of melting metal armor at short range.",
        stats: {
          dano: "Damage: ■■■■□□□□",
          alcance: "Range: ■■■■■□□□",
          energia: "Energy: ■■■■■■□□",
        }
      },
      shieldGen: {
        name: "Shield Generator",
        desc: "Defensive electromagnetic barrier against impacts and radiation.",
        lore: "Projects a low-density plasma envelope around the hull to deflect debris and enemy projectiles.",
        stats: {
          dano: "Damage: □□□□□□□□",
          defesa: "Defense: ■■■■■■□□",
          energia: "Energy: ■■■■□□□□",
        }
      },
      scanner: {
        name: "Scientific Scanner",
        desc: "Broadband sensor module for mineral and anomaly analysis.",
        lore: "Essential for deep space exploration, detects thermal, magnetic, and radiological signatures in real time.",
        stats: {
          alcance: "Range: ■■■■■■■□",
          precisao: "Accuracy: ■■■■■■□□",
          energia: "Energy: ■■■□□□□□",
        }
      },
      tractor: {
        name: "Tractor Beam",
        desc: "Gravitational particle manipulator for towing materials.",
        lore: "Uses focused gravitational attraction beams to capture and guide debris or minerals to the cargo bay.",
        stats: {
          forca: "Force: ■■■■■□□□",
          alcance: "Range: ■■■■□□□□",
          energia: "Energy: ■■■■■□□□",
        }
      },
      radar: {
        name: "Sweep Radar",
        desc: "Long-range tactical detection system for celestial bodies and ships.",
        lore: "Maps the active sector allowing safe navigation routes even under heavy radiation storms.",
        stats: {
          alcance: "Range: ■■■■■■■■",
          varredura: "Rate: ■■■■■□□□",
          energia: "Energy: ■■□□□□□□",
        }
      },
      miningLaser: {
        name: "Mining Laser",
        desc: "Focused thermal emitter for asteroid fragmentation.",
        lore: "Designed to break metal-rich rocks, extracting valuable minerals directly in orbit.",
        stats: {
          dano: "Damage: ■■■■■■□□",
          alcance: "Range: ■■■□□□□□",
          energia: "Energy: ■■■■■■■□",
        }
      },
      cargoModule: {
        name: "Cargo Module",
        desc: "Expandable pressurized compartment for resource storage.",
        lore: "Ensures structural integrity and radiological protection for scientific samples and heavy minerals.",
        stats: {
          capacidade: "Cargo: ■■■■■■■■",
          peso: "Weight: ■■■■□□□□",
          energia: "Energy: □□□□□□□□",
        }
      },
      warpDrive: {
        name: "Warp Drive",
        desc: "Spatiotemporal distortion thruster for interstellar jumps.",
        lore: "Manipulates space metric around the ship, reducing travel distances to fractions of a second.",
        stats: {
          velocidade: "Speed: ■■■■■■■■",
          alcance: "Range: ■■■■■■■■",
          energia: "Energy: ■■■■■■■■",
        }
      },
      thermalShield: {
        name: "Thermal Shield",
        desc: "Reinforced refractory plates for solar approaches.",
        lore: "Carbon-carbon shielding with active cryogenic cooling to withstand the extreme temperatures of solar crowns.",
        stats: {
          resistencia: "Heat: ■■■■■■■■",
          peso: "Weight: ■■■■■□□□",
          energia: "Energy: ■■□□□□□□",
        }
      },
      empCannon: {
        name: "EMP Cannon",
        desc: "Electromagnetic pulse trigger to disable electronics.",
        lore: "Generates a high-voltage shockwave that overloads enemy shields and navigation systems without destroying the target.",
        stats: {
          dano: "EMP: ■■■■■■■□",
          alcance: "Range: ■■■■■□□□",
          energia: "Energy: ■■■■■■□□",
        }
      },
    },
    locked: "LOCKED",
    notEquipped: "Not Installed",
    equipped: "Installed",
    selectPrompt: "Select an equipment slot to view its specifications.",
    enTranslationLegend: "English Translation:",
    emptySlot: "Expansion Slot",
    emptyStatus: "Empty",
    emptySlotPrompt: "This expansion slot is available for new technologies. Complete missions across the solar system to obtain new modules.",
  }
};

export const t = (key, category = null) => {
  const locale = getLocale();
  if (category) {
    return TRANSLATIONS[locale][category]?.[key] || TRANSLATIONS["pt"][category]?.[key] || key;
  }
  return TRANSLATIONS[locale][key] || TRANSLATIONS["pt"][key] || key;
};
