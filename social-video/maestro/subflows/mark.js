// Signale un repère au serveur de record.sh (marks-server.mjs) : KIND, et
// pour une réponse le texte copié juste avant (copyTextFrom). Sans serveur
// (flow lancé à la main), on ignore : le tournage ne doit jamais casser.
try {
  const text = KIND === 'answer' ? maestro.copiedText || '' : '';
  http.post(`http://127.0.0.1:8765/mark?out=${encodeURIComponent(OUT)}&kind=${KIND}`, { body: text });
} catch (e) {
  console.log(`mark ${KIND} ignoré : ${e}`);
}
