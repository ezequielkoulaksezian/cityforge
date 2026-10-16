# CityForge

Simulador de ciudades en 3D, hecho con three.js, que sigue las reglas del SimCity original (1989).

**Jugar:** https://cityforge-ashen.vercel.app

- Zonas residenciales, comerciales e industriales que crecen solas según energía, transporte, valor del suelo, contaminación, delito y demanda (válvulas RCI).
- Calles, puentes, vías de tren y tendido eléctrico, con los costos del manual de SimCity Classic.
- Policía, bomberos, estadio, puerto, aeropuerto y centrales de carbón y nuclear.
- Presupuesto anual sin déficit, impuestos y financiamiento de servicios.
- Incendios y desastres: inundación, tornado, terremoto, monstruo, accidente aéreo y fusión nuclear.
- Evaluación del alcalde, opinión pública y categorías de Aldea a Megalópolis.
- Mapas superpuestos (energía, contaminación, valor del suelo, delito, tráfico, densidad y coberturas), gráficos históricos, guardado automático y en espacios, y exportar e importar la ciudad.
- Interfaz en español e inglés, y una ciudad de ejemplo para ver todo en acción (`?demo`).

## Documentación

- [Diseño del juego](docs/DISENO_DEL_JUEGO.md): reglas, números, fuentes y arquitectura.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # pruebas de la simulación
npm run build    # compila a dist/
```

La simulación (`src/sim`) es TypeScript puro, sin gráficos ni DOM. El renderer (`src/render`) solo lee el estado y
redibuja cuando cambian sus contadores de revisión. La interfaz (`src/ui`) está hecha con React.

## Créditos

Las reglas se basan en el manual de SimCity Classic y en el análisis público de Micropolis, la versión de código
abierto del SimCity original. CityForge no usa código de Micropolis. SimCity es una marca de Electronic Arts; este
proyecto no está afiliado.

## Licencia

MIT
