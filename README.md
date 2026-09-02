# Proietta

Laboratorio interattivo per insegnare e comprendere le proiezioni ortogonali.

**Sito pubblico:** <https://gabberthomson.github.io/proiezioni-ortogonali/>

## Funzioni

- solidi tridimensionali ruotabili;
- proiezioni wireframe su piano frontale, laterale e orizzontale;
- spigoli nascosti tratteggiati;
- facce colorate in base alle viste ortogonali alle quali contribuiscono;
- strisce proporzionali per le facce visibili da più piani;
- modalità “Visualizza come compito” con linee di costruzione e ribaltamento a 90°;
- importazione locale di file STL ASCII e binari;
- orientamento, centratura e ridimensionamento automatici degli STL.

I file STL vengono elaborati esclusivamente nel browser e non vengono caricati su un server.

## Sviluppo

Richiede Node.js 22 o successivo.

```bash
npm install
npm run dev
```

Build statica per GitHub Pages:

```bash
npm run build:pages
```

Il risultato viene generato nella cartella `pages-dist`.

## Tecnologie

React, TypeScript, SVG, Vite, Vinext e Tailwind CSS.

## Licenza

Al momento il progetto non include una licenza open source. Il codice è consultabile pubblicamente, ma tutti i diritti restano riservati all’autore.
