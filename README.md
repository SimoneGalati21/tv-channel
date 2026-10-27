# TV Libera

App per vedere i canali italiani in chiaro dal browser della TV (Hisense VIDAA e simili).

Apri sul browser della TV: https://mirkomario.github.io/tv-channel/

Telecomando: frecce + OK per scegliere, su/giù o CH+/CH- per cambiare canale, numeri per andare al canale, OK tenuto premuto o tasto giallo per i preferiti, Indietro per tornare alla lista.

Solo flussi gratuiti e pubblici delle emittenti; alcuni funzionano solo dall'Italia.

## Canali Rai

Il relinker Rai concede il CORS solo a `www.raiplay.it`, quindi dal browser della TV i canali Rai non partono con hls.js. In `proxy/` c'è un Cloudflare Worker che inoltra la richiesta e aggiunge il CORS:

    cd proxy && npx wrangler deploy

Poi metti l'URL del Worker in `RAI_PROXY` in `index.html`. Rai blocca le connessioni dall'estero: se il Worker risponde 403, il nodo Cloudflare non è in Italia.

Test: `node proxy/worker.test.mjs` (usa la rete e serve un IP italiano).
