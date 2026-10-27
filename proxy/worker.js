// Cloudflare Worker: inoltra al relinker Rai e aggiunge il CORS che Rai concede solo a www.raiplay.it.
// Accetta solo la query del relinker, così non è un proxy aperto.
var RELINKER = 'https://mediapolis.rai.it/relinker/relinkerServlet.htm';
// col user-agent di default di un server il relinker risponde 403
var UA = 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36';

export default {
  async fetch(request) {
    var cors = { 'Access-Control-Allow-Origin': '*' };
    var search = new URL(request.url).search;
    if (!/^\?(.+&)?cont=[\w-]+(&|$)/.test(search)) return new Response('cont mancante', { status: 400, headers: cors });

    var r = await fetch(RELINKER + search, { redirect: 'manual', headers: { 'User-Agent': UA } });
    var location = r.headers.get('Location');
    if (r.status >= 300 && r.status < 400 && location) {
      return new Response(null, { status: 302, headers: { 'Access-Control-Allow-Origin': '*', 'Location': location } });
    }
    // 403 = geoblocco o UA rifiutato: lo giro al player così mostra l'errore
    return new Response(r.body, { status: r.status, headers: cors });
  }
};
