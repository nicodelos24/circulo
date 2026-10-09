# Círculo

**Convierte tu celular en un instrumento.** Una PWA modular con teclado
cromático de círculos, bend hacia el sostenido y el bemol, vibrato por
movimiento del dedo (o balanceando el teléfono), rack de efectos,
arpegio y looper. Todo el audio ocurre dentro de un AudioWorklet, así que
suena con latencia de instrumento y no de página web.

Se toca **de lado**, como un mástil de guitarra: pantalla contra el pecho,
una mano detrás y los dedos sobre los círculos.

## Puesta en marcha

```bash
npm install
npm run dev        # servidor de desarrollo (imprime la URL LAN para el celular)
npm run build      # bundle de producción en dist/
npm run preview    # sirve dist/ para probar la PWA como se instala
npm test           # 93 pruebas: DSP, gestos, layout, rack y app completa
npm run check      # typecheck + pruebas
npm run icons      # regenera los iconos PNG de la PWA
```

Para tocarlo desde el celular, `npm run dev` imprime una URL tipo
`http://192.168.x.x:5173`. Los dos tienen que estar en la misma red Wi-Fi.
Al abrirla, usa *Añadir a pantalla de inicio* para tener el icono, pantalla
completa yorientation horizontal forzada: ahí sí funciona sin red.

## Publicar en GitHub Pages

El sitio que se publica es **`dist/`**, no el código fuente: `index.html` a
pelado apunta a `/src/index.ts`, que en un repo servido tal cual da 404 y la
app se ve en blanco.

El repo trae `.github/workflows/deploy.yml`, que compila (con `npm run check`
antes) y sube `dist/` a Pages. Para activarlo:

1. Sube estos cambios a `main`.
2. En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. La primera acción tarda un par de minutos; a partir de ahí, cada `push`
   a `main` publica el sitio.

Si prefieres hacerlo a mano: `npm run build`, copia **el contenido** de
`dist/` a una rama `gh-pages` (o a `docs/`) y apúnta Pages a esa carpeta.

Mientras tanto, si la página se queda en blanco, el propio `index.html`
muestra un panel con el motivo: archivo no encontrado, navegador sin Web
Audio o error de arranque. No hace falta abrir la consola para saber qué pasó.

## Cómo se toca

### Guitarra: celular de lado (modo por defecto)

Las doce notas de cada octava se reparten en un arco. Los extremos (notas
graves y agudas) quedan abajo, al alcance del pulgar, y las notas del centro
se elevan: es la misma curva que un mástil, donde el pulgar alcanza cómodo
la parte alta del arco.

- Las **naturales** son círculos grandes; los **sostenidos y bemoles**, más
  chicos, se apoyan arriba entre dos naturales, como las teclas negras de un
  piano. Las 12 notas de la octava están siempre disponibles.
- **Toca** un círculo para oír la nota. La fuerza sale de la presión del
  dedo o de lo cerca del centro que lo pegas.
- **Arrastra hacia arriba** y la nota se estira hacia el sostenido;
  **hacia abajo**, hacia el bemol. El arco que se enciende alrededor del
  círculo marca hacia dónde vas y cuántos cents llevas. El bend vuelve
  solo al centro si quietas el dedo, como una barra de vibrato.
- **Mueve el dedo en vaivén** mientras lo mantienes pulsado: eso es
  vibrato. La amplitud y la velocidad las mide la propia trajectory del
  dedo, y se dibuja una onda bajo el círculo.
- **Mueve el teléfono** y también hay vibrato (así se toca una guitarra de
  verdad: balanceando el mástil).
- **Arrastra entre círculos** para hacer glissando sin cortar el sonido.
- **Varios dedos a la vez**: polifonía real de hasta 16 voces.

### Fila

Las doce notas en fila, como una armónica cromática. El diseño más compacto
para tocarlo con un dedo o para llevarlo en el bolsillo.

### Cuadrícula

Las notas en rejilla, para quien prefiera pensar en piano.

## Controles

| Acción | Gesto |
| --- | --- |
| Subir / bajar octava | botones `+` / `−`, flechas `↑` `↓`, teclas `X` / `Z` |
| Cambiar diseño | segmentado *Guitarra / Fila / Cuadrícula* |
| Sustain (pedal) | botón *Sustain* o barra espaciadora |
| Arpegio | botón *Arp* (cambia de ▲ a ▼ a ⇅ a ? a *Acorde*) |
| Grabar / detener loop | botón *Loop*; *Limpiar* borra la frase |
| Rack de efectos | botón *Rack* o tecla `Tab` |
| Ajustes | botón *⋯* o tecla `R` |
| Tocar con teclado | `A W S E D F T G Y H U J K O L P ; '` (tipo tracker) |
| Octava del teclado | teclas `1` `2` `3` `4` |
| Tocar más fuerte con teclado | `Shift` |

## Rack modular

El botón *Rack* abre la cadena de efectos. Cada módulo se puede saltar
(*ACTIVO / SALTADO*), restablecer (↺) y ajustar con perillas táctiles:
arrastra verticalmente, usa la rueda del mouse, las flechas del teclado o
doble toque para volver al valor por defecto.

```
Voz → Saturación → Coro → Fase → Tremolo → Eco → Sala → Compresor → Master
```

La **Voz** es el instrumento base: forma de onda, desfase, sub, ruido,
filtro con envolvente, ADSR y suavizado del bend.

## Presets

`Cristal`, `Latón`, `Bruma`, `Pulso`, `Temblor` y `Orbital`. Cada preset fija
el timbre de la voz y qué módulos están saltados. Todo lo que tocas (preset,
ajustes de ergonomía, perillas) se guarda solo en el teléfono.

## Arquitectura

El proyecto está partido en capas que no se mezclan: la interfaz no sabe
nada del DSP y el DSP no sabe nada del DOM.

```
src/
├── audio/
│   ├── engine.ts            AudioContext, arranque diferido, mensajes
│   ├── patch.ts             definición del rack: módulos y parámetros
│   ├── protocol.ts          contrato de mensajes con el worklet
│   └── worklet/             TODO el DSP (se empaqueta aparte)
│       ├── index.ts         registra el AudioWorkletProcessor
│       ├── synth.ts         voces → cadena de efectos → master
│       ├── dsp/             osciladores, envolvente, filtro, líneas de retardo
│       └── dsp/effects/     drive, coro, fase, tremolo, sala, dinámica
├── core/                    store observable, eventos, matemáticas, háptica
├── music/                   teoría: notas, escalas, cuantización
├── input/                   puntero, teclado, sensores, arpegio, looper
├── state/                   presets y rehidratación del estado guardado
├── ui/                      layout, gestos, canvas, HUD, rack, perillas
└── main.ts                  controlador que une todo
```

Cuatro decisiones que explican el resto:

1. **Un solo nodo de audio.** Voces, efectos y master viven dentro del
   worklet. Encadenarlos con nodos de Web Audio añadiría latencia y más
   superficie donde fallar; aquí el hilo de audio no comparte nada con el
   hilo de la interfaz.
2. **El DSP se empaqueta aparte** (`public/worklet/synth-processor.js`, un
   archivo autónomo). Algunos navegadores móviles no resuelven imports
   dentro del scope del worklet, así que `npm run build` lo compila con
   esbuild antes de empaquetar la app.
3. **El tablero es un canvas, no una lista de botones.** Con 24 a 48
   círculos, el glow y los arcos de bend, dibujar a 60 fps en canvas es más
   barato y más estable en móvil que mantener muchos nodos en el DOM.
4. **Los gestos son una máquina de estados pura** (`ui/gestures.ts`), con
   el reloj inyectado. Por eso el bend, el vibrato y el glissando se pueden
   probar sin navegador.

### Ergonomía del tablero

El cálculo del layout es una función pura (`ui/layout.ts`) y está sujeto a
invariantes que se comprueban en `layout.test.ts` para tamaños reales de
teléfono: ningún círculo se solapa con otro, todo cabe dentro de la banda
libre entre el HUD superior e inferior, y el conjunto queda centrado en esa
banda. El radio y el paso horizontal se resuelven juntos (dependen uno del
otro) y el alto se ajusta en un último pase para que las tres o cuatro octavas
que elijas quepan siempre.

### Detalles de audio que importan

- **PolyBLEP** en sierra y pulso: sin alias de hardware en los agudos.
- **Tabla de seno** y aproximación racional de `tanh` para los LFOs y la
  saturación: en el bucle de audio cada `Math.sin` por muestra y por voz
  se nota en un celular.
- El **bend no se cuantiza**: el dedo manda la entonación y el ajuste sólo
  sugiere la nota de destino de la escala (se puede desactivar).
- El **pitch se resuelve en los extremos del bloque** e interpola: cero
  `pow` por muestra.
- El filtro es un **SVF con saturación en el lazo**: nunca entra en
  realimentación positiva, por abierto que esté el corte.

## Rendimiento

El objetivo es 60 fps de dibujo y audio sin drops con 8 dedos sonando.
Medido en el CI de este repo (Node, sin aceleración) renderizar un segundo
de audio con 8 voces y la cadena completa cuesta ~2 s de CPU; en hardware
real es entre 20 y 30 veces más rápido, con margen de sobra para un
teléfono de gama media. Si aun así vieras drops:

- Baja *Octavas* a 1 en los ajustes (menos círculos que pintar).
- Apaga módulos del rack que no uses (el bypass es real, no cosmético).
- Cierra el *Loop* cuando no lo estés escuchando.

## Compatibilidad

- Chrome, Edge, Safari y Firefox en Android y escritorio (Web Audio +
  AudioWorklet + Pointer Events).
- En iOS el vibrato por balanceo requiere el permiso de sensores: se pide
  en el primer toque y la app sigue funcionando sin él.
- Sin conexión: el service worker cachea el shell y el worklet.

## Pruebas

```bash
npm test
```

- `src/audio/worklet/synth.test.ts`: DSP real (alturas, bend, vibrato,
  saturación de voces, estabilidad con todos los módulos).
- `src/audio/worklet-bundle.test.ts`: ejecuta el archivo **empaquetado** que
  se sirve al navegador, dentro de un scope de AudioWorklet simulado.
- `src/ui/gestures.test.ts`, `layout.test.ts`: bend, vibrato, glissando,
  multitáctil y colisiones de círculos.
- `src/app.test.ts`: la app entera en jsdom, desde el toque hasta los
  mensajes que llegan al worklet.
