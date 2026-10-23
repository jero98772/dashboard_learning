# Learning Quest

Log what you learn on a topic × format grid. Every entry is saved to `data/learning-log.csv`.

## Run

    npm install
    npm run dev

Open the address Vite prints (http://localhost:5173). The API runs on port 3001.

## Where the data lives

`data/learning-log.csv` with columns `id,date,time,topic,format,minutes,title,sample,created`.
Open it in Excel or Sheets, or edit it by hand: the page reloads it every 5 seconds.
Set `CSV_FILE=/path/to/file.csv` to keep the file somewhere else.

## Add it to an existing React project

1. Copy `src/App.jsx`, `src/csvStore.js`, `src/styles.css` and `server.js` into your project.
2. `npm i d3-array d3-scale d3-format d3-time-format concurrently`
3. Import the app where you want it, or keep the `createRoot` line at the bottom of `App.jsx`.
4. Proxy `/api` to `http://localhost:3001` in your dev server config (see `vite.config.js`).
5. Add `"dev": "concurrently -k \"node server.js\" \"vite\""` to your scripts, and set `"type": "module"` or rename `server.js` to `server.mjs`.
6. Load the Inter, IBM Plex Mono and Space Grotesk fonts, as in `index.html`.
# dashboard_learning
