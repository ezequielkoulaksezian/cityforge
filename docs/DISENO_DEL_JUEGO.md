# CityForge: documento de diseño del juego

CityForge es un simulador de ciudades en 3D, hecho con three.js, que sigue las reglas del **SimCity original (1989)**.
Las reglas salen del manual oficial de *SimCity Classic* y del análisis del código fuente liberado como
**Micropolis** (GPL). CityForge no usa código de Micropolis: reimplementa las mecánicas documentadas (las mecánicas de
juego no tienen derechos de autor) con código propio bajo licencia MIT.

## Fuentes

| Fuente | Qué aporta |
|---|---|
| [Manual de SimCity Classic](https://www.freegameempire.com/games/SimCity-Classic/manual) | Costos, mantenimiento, impuestos, requisitos de crecimiento, desastres, categorías de ciudad, evaluación |
| [SimCity Reverse Diagrams, Chaim Gingold (2016)](https://smalltalkzoo.computerhistory.org/users/Dan/uploads/SimCityReverseDiagrams.pdf) | Estructura de la simulación: mapas de valor del suelo, delito y contaminación, válvulas RCI, censo |
| [micropolisJS](https://www.graememcc.co.uk/micropolisJS/) y [Micropolis (Java)](https://github.com/dheid/micropolis) | Comportamiento de referencia del juego original |
| [Guías de SimCity (SNES)](https://gamefaqs.gamespot.com/snes/588657-simcity/faqs/20252) | Estrategias, efectos de la contaminación y requisitos de estadio, puerto y aeropuerto |
| [Hallucinating Splines FAQ](https://hallucinatingsplines.com/faq) | Rangos de las válvulas RCI y fórmula del valor del suelo en Micropolis |

Donde el manual no da números (umbrales de delito, valor del suelo, densidades), CityForge define valores propios.
Todos están en este documento y en `src/sim/constants.ts`, que es la única fuente de verdad del código.

---

## 1. Mapa

- Grilla de **128 × 128 casillas**. Cada casilla tiene terreno y, opcionalmente, una estructura.
- **Terreno**: tierra, agua o bosque. El mapa se genera con una semilla: un río serpenteante, a veces costa en un borde,
  lagos y bosques con ruido fractal (value noise de varias octavas).
- Se puede generar un mapa nuevo con otra semilla antes de empezar.

## 2. Herramientas y costos (manual oficial)

| Herramienta | Tamaño | Costo | Notas |
|---|---|---|---|
| Topadora | 1×1 | $1 por casilla | Sobre un edificio lo demuele completo |
| Calle | 1×1 | $10 · puente sobre agua $50 | Se arrastra en línea recta |
| Vía de tren | 1×1 | $20 · túnel bajo agua $100 | No contamina ni genera tráfico |
| Tendido eléctrico | 1×1 | $5 · sobre agua $25 | Puede cruzar calles y vías |
| Parque | 1×1 | $10 | Sube el valor del suelo y baja la contaminación |
| Zona residencial (R) | 3×3 | $100 | |
| Zona comercial (C) | 3×3 | $100 | |
| Zona industrial (I) | 3×3 | $100 | |
| Estación de policía | 3×3 | $500 | |
| Estación de bomberos | 3×3 | $500 | |
| Estadio | 4×4 | $3.000 | |
| Central de carbón | 4×4 | $3.000 | Abastece unas 50 zonas; contamina |
| Central nuclear | 4×4 | $5.000 | Abastece unas 150 zonas; riesgo de fusión |
| Puerto | 4×4 | $5.000 | Debe tocar el agua |
| Aeropuerto | 6×6 | $10.000 | |

Además hay una herramienta de **consulta** (gratis), que muestra la información de una casilla.

## 3. Dificultad

| | Fácil | Media | Difícil |
|---|---|---|---|
| Fondos iniciales | $20.000 | $10.000 | $5.000 |
| Multiplicador de recaudación | 1,4 | 1,2 | 0,8 |
| Multiplicador de mantenimiento | 0,7 | 1,0 | 1,2 |
| Frecuencia de desastres | baja | media | alta |

La dificultad se elige al crear la ciudad y no se puede cambiar después (manual).

## 4. Tiempo

- El calendario avanza por **meses**. A velocidad normal un mes dura 1,5 s; lenta 4 s; rápida 0,5 s; también se puede pausar.
- **Cada mes**: energía, tráfico, contaminación, valor del suelo, delito, cobertura de servicios, crecimiento de zonas,
  demanda RCI, incendios y desastres.
- **Cada enero**: presupuesto anual (cobro de impuestos y pago de servicios), evaluación de la ciudad y guardado automático.

## 5. Energía

- Las zonas solo se desarrollan con energía (manual). La energía sale de las centrales y se transmite por casillas
  conductoras: tendido eléctrico, zonas, edificios y cruces de calle o vía con tendido.
- **Capacidad**: carbón = 50 unidades, nuclear = 150. Consumo: cada zona de 3×3 o edificio de servicio = 1 unidad,
  estadio = 2, puerto = 2, aeropuerto = 3.
- Se calcula por red conectada (recorrido en anchura desde las centrales). Si el consumo supera la capacidad, quedan sin
  energía las zonas más lejanas: es un **apagón**, y aparece el aviso "Se necesita más energía".
- Una zona desarrollada sin energía decae hasta quedar baldía (manual).

## 6. Transporte y tráfico

- Una zona necesita **acceso a transporte**: una calle o vía pegada a su perímetro (manual: sin acceso no se desarrolla
  del todo).
- **Viajes**: cada zona desarrollada intenta llegar por la red de transporte a un destino que la complemente, igual que
  en SimCity:
  - Residencial → comercial o industrial (trabajo y compras).
  - Comercial → residencial (clientes).
  - Industrial → residencial (trabajadores).
- La búsqueda es en anchura por calles y vías, con un máximo de **40 casillas**. Si no encuentra destino, la zona tiene
  "problemas de transporte" y decae.
- Cada viaje exitoso suma tráfico en las casillas de **calle** del camino, proporcional a la población de la zona. Las
  vías de tren llevan viajes sin generar tráfico ni contaminación (manual).
- La densidad de tráfico (0–255) se suaviza mes a mes. Las calles con densidad alta se muestran con autos y generan
  contaminación.
- Para mantener el rendimiento, cada mes recalcula los viajes de un cuarto de las zonas, por turnos.

## 7. Mapas de la simulación

Todos los mapas usan valores de 0 a 255, uno por casilla.

### Contaminación
- Fuentes: industria (según su nivel), central de carbón (alta), aeropuerto y puerto (media), tráfico denso e incendios.
- Se difunde con un desenfoque de radio 2. Parques, bosques y agua la reducen.

### Valor del suelo
- Base según la distancia al **centro de la ciudad** (centro de masa de la población): más cerca vale más.
- Más: cerca de agua, bosques y parques.
- Menos: contaminación y delito.
- Se limita a 1–250. Sobre el agua no hay valor.

### Delito
- Sube con la densidad de población y baja con el valor del suelo.
- La **cobertura policial** lo reduce. Cada comisaría cubre un radio de 16 casillas, escalado por el financiamiento del
  presupuesto.

### Cobertura de bomberos
- Radio de 16 casillas por estación, escalado por el financiamiento. Reduce la probabilidad de incendio y apaga los
  incendios cercanos.

### Densidad de población
- Población por casilla, suavizada. Alimenta el delito y el centro de la ciudad.

## 8. Zonas y crecimiento

Cada zona de 3×3 tiene un **nivel de densidad**, que se ve como edificios más grandes o más altos:

| Nivel | Residencial (habitantes) | Comercial (empleos) | Industrial (empleos) |
|---|---|---|---|
| 0 | 0 (baldío) | 0 | 0 |
| 1 | 40 | 20 | 40 |
| 2 | 120 | 60 | 100 |
| 3 | 280 | 130 | 180 |
| 4 | 520 | 220 | 280 |
| 5 | 860 (torres) | 340 (rascacielos) | — |

Cada mes, para cada zona:

1. Sin energía: si tiene nivel > 0, baja de nivel con un 40% de probabilidad.
2. Sin acceso a transporte o sin destino de viaje: baja de nivel con un 25% de probabilidad.
3. Se calcula un **puntaje** de crecimiento:
   - **R** = válvula R / 20 + (valor del suelo − 60) / 3 − contaminación / 3 − delito / 4 − tráfico / 8
   - **C** = válvula C / 15 + (valor del suelo − 40) / 4 − delito / 4 + bono por densidad de población cercana
   - **I** = válvula I / 15 − delito / 8 (a la industria no le importa la contaminación)
4. Con puntaje > umbral aleatorio (0–60) sube un nivel. Con puntaje < −(umbral aleatorio) baja un nivel.
5. Para pasar del nivel 3 hace falta valor del suelo ≥ 80 (R) o ≥ 60 (C). Así, las torres solo aparecen en terrenos
   valiosos.

## 9. Demanda RCI (válvulas)

Como en Micropolis, la demanda son tres "válvulas": R entre −2.000 y 2.000, y C e I entre −1.500 y 1.500. Se ven
como barras en la interfaz.

- **Fuerza laboral** = habitantes × 0,5. **Empleos** = empleos comerciales + industriales.
- **R** sube cuando hay más empleos que trabajadores: (empleos − fuerza laboral) / max(fuerza laboral, 50) × 2.000,
  más un impulso inicial mientras la ciudad tiene menos de 500 habitantes.
- **C** sigue al mercado interno (manual): objetivo = habitantes × 0,2; (objetivo − empleos C) / max(objetivo, 20) × 1.500.
- **I** sigue al mercado externo (manual): objetivo = 200 + habitantes × 0,3 + crecimiento externo con los años.
- **Impuestos**: cada punto por encima de 7% resta 150 a cada válvula, y cada punto por debajo suma 100 (manual: 5–7% es
  óptimo para crecer rápido, 9% mantiene la ciudad estable).
- **Límites por edificios especiales** (como en SimCity):
  - Con más de 15.000 habitantes y sin **estadio**, la demanda R no puede ser positiva: "Los residentes piden un estadio".
  - Con más de 3.000 empleos industriales y sin **puerto**, la demanda I no puede ser positiva.
  - Con más de 3.000 empleos comerciales y sin **aeropuerto**, la demanda C no puede ser positiva.
- Las válvulas se suavizan: 30% del valor nuevo y 70% del anterior.

## 10. Presupuesto e impuestos

- Impuesto entre **0% y 20%**; por defecto 7%.
- **Recaudación anual** = (habitantes + empleos × 0,6) × (0,5 + valor del suelo promedio / 200) × impuesto × 2,2 ×
  multiplicador de dificultad. Refleja la fórmula del manual: población × valor del suelo × tasa × constante.
- **Gastos pedidos** (manual): policía $100 y bomberos $100 por estación; transporte $1 por calle, $4 por puente, $4 por
  vía y $10 por túnel. Todo se multiplica por el factor de mantenimiento de la dificultad.
- El financiamiento de policía, bomberos y transporte va de 0% a 100% del pedido (no puede superar el 100%).
- **Efectos del financiamiento**:
  - Policía y bomberos: la cobertura se escala por el porcentaje.
  - Transporte: con menos de 100%, cada mes se deterioran algunas calles al azar (menos de 75%: rápido; manual).
- **No se permite el déficit** (manual): si la caja no alcanza, el financiamiento se reduce automáticamente y se avisa.
- Con la caja en $0 no se puede construir.

## 11. Incendios y desastres

- **Incendios**: cada mes pueden empezar en un edificio al azar; la probabilidad baja con la cobertura de bomberos. El
  fuego se propaga a casillas vecinas inflamables y se apaga solo después de unos meses, o antes si hay bomberos cerca. Lo
  quemado queda en escombros.
- **Desastres** (manual), que se pueden activar desde el menú o desactivar los aleatorios en opciones:
  - **Incendio**: empieza un fuego grande.
  - **Inundación**: el agua avanza sobre la tierra cercana durante unos meses y después baja; destruye lo que cubre.
  - **Tornado**: se desplaza al azar unos segundos y destruye lo que toca.
  - **Terremoto**: escombros e incendios en un área grande.
  - **Monstruo**: aparece cuando la contaminación es muy alta (o desde el menú), camina hacia las zonas contaminadas y
    destruye a su paso.
  - **Accidente aéreo**: necesita un aeropuerto; provoca incendios cerca.
  - **Fusión nuclear**: solo con central nuclear; muy rara; deja una zona radiactiva inhabitable.
- La frecuencia depende de la dificultad.

## 12. Evaluación y opinión pública

- **Puntaje de la ciudad** de 0 a 1.000; empieza en 500 y se recalcula cada año (manual: los factores principales son
  delito, contaminación, costo de vivienda, impuestos, tráfico, desempleo, protección contra incendios, zonas sin
  energía y crecimiento).
- **Problemas**: el porcentaje de ciudadanos que nombra cada problema sale de su gravedad. Un problema es menor si lo
  nombra el 10% o menos (manual).
- **Aprobación**: porcentaje de ciudadanos que dicen que el alcalde hace un buen trabajo; sale del puntaje. Con menos de
  55% el alcalde está en riesgo (manual).
- **Categoría de ciudad** (manual): Aldea 0–1.999 · Pueblo 2.000–9.999 · Ciudad 10.000–49.999 · Capital 50.000–99.999 ·
  Metrópolis 100.000–499.999 · Megalópolis 500.000 o más. Cada ascenso muestra un mensaje.

## 13. Mensajes y asesores

Avisos que no se repiten seguido: falta energía, apagón, zonas sin calles, mucha contaminación, mucho delito, tráfico
congestionado, se necesita estadio, puerto o aeropuerto, fondos bajos, presupuesto, ascenso de categoría y desastres.
Cada aviso se puede clickear para ir al lugar.

## 14. Interfaz

- **Barra superior**: nombre de la ciudad, fecha, fondos, población, categoría, demanda RCI y velocidad.
- **Barra de herramientas**: todas las herramientas con ícono, costo y atajo de teclado.
- **Ventanas**: presupuesto, evaluación, gráficos históricos (población, empleos, dinero, delito, contaminación),
  mapas superpuestos, desastres, opciones, ayuda, y guardar o cargar.
- **Mapas superpuestos** sobre la ciudad 3D: energía, contaminación, valor del suelo, delito, tráfico, densidad de
  población, cobertura de policía y de bomberos.
- **Idiomas**: español e inglés, según el navegador, con selector.

## 15. Gráficos 3D (three.js)

- Cámara **ortográfica isométrica**: se mueve arrastrando, con flechas o WASD; zoom con la rueda; rotación de 90° con Q/E.
- **Terreno**: una malla instanciada por casilla con color por instancia (variaciones de pasto, agua, tierra). El agua
  queda más baja y tiene un brillo animado.
- **Calles y vías**: piezas por conexión (recta, curva, T, cruce, final), cada una en su propia malla instanciada.
- **Tendido eléctrico**: postes instanciados y cables como segmentos de línea.
- **Edificios procedurales** según tipo y nivel, armados con piezas instanciadas (cajas, techos a dos aguas,
  cilindros): casas con techo, edificios de departamentos y torres (R); locales y torres de vidrio (C); galpones,
  tanques y chimeneas (I). Los edificios de servicio tienen modelos propios: comisaría, bomberos, estadio con cancha,
  central de carbón con chimeneas, central nuclear con torres de enfriamiento, puerto con grúas y contenedores, y
  aeropuerto con pista, terminal y torre.
- Árboles instanciados, humo en la industria, llamas en los incendios, autos en calles con tráfico, tornado y monstruo
  animados.
- **Vista previa** de construcción: la huella se pinta verde si se puede construir y roja si no, con el costo.
- Sombras opcionales (se desactivan en opciones para equipos lentos).

## 16. Guardado

- Guardado automático cada enero en el navegador (localStorage).
- Tres espacios de guardado, más exportar e importar la ciudad como archivo JSON.

---

# Arquitectura técnica

```
src/
  sim/            simulación pura en TypeScript, sin three.js ni DOM
    constants.ts  todos los números de este documento
    types.ts      tipos de casillas, zonas y estado
    world.ts      grilla, estructuras y colocación/demolición (reglas de construcción)
    terrain.ts    generación del mapa con semilla
    power.ts      redes eléctricas y capacidad
    traffic.ts    viajes por la red de transporte
    maps.ts       contaminación, valor del suelo, delito, coberturas y densidad
    zones.ts      crecimiento y decaimiento de zonas
    demand.ts     válvulas RCI
    budget.ts     impuestos y presupuesto anual
    disasters.ts  incendios y desastres
    evaluation.ts puntaje, opinión y categoría
    simulation.ts el bucle mensual que orquesta todo
    save.ts       serialización
  render/         three.js
    scene.ts      escena, cámara, luces y controles
    terrain.ts    malla del terreno y del agua
    networks.ts   calles, vías y tendido
    buildings.ts  generación procedural de edificios
    effects.ts    humo, fuego, autos, tornado y monstruo
    overlay.ts    mapas superpuestos (DataTexture)
    cursor.ts     vista previa de herramientas y selección
  ui/             interfaz React sobre el canvas
  i18n.ts         textos en español e inglés
```

- La simulación no depende del dibujo: el renderer lee el estado y se actualiza cuando la simulación marca cambios
  (`dirty`), así que el juego se puede probar sin gráficos.
- **Stack**: Vite, TypeScript, three.js (sin envoltorios) y React para la interfaz. Sitio estático en Vercel.
- **Pruebas**: pruebas de la simulación con Vitest (energía, crecimiento, presupuesto y guardado).
