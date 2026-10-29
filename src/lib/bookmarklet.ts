// Robot CA+ « 2 clics » : un favori (bookmarklet) généré par dossier.
// Tourne dans le navigateur de l'utilisateur, sur sa page fournisseur déjà connectée :
// ni les cookies ni les mots de passe ne sortent du navigateur (règle projet).

export function buildBookmarklet(token: string, robotUrl: string, origin: string): string {
  const cfg = JSON.stringify({
    token,
    robotUrl,
    api: origin.replace(/\/$/, "") + "/api/public/collector",
  });
  const code = "(function(){var C=" + cfg + ";var T=C.token,U=C.robotUrl,A=C.api;\n" + BODY + "\n})()";
  return "javascript:" + encodeURIComponent(code);
}

const BODY = `if(!document.body){alert("🤖 Recharge la page puis clique CA+");return}
var v=document.createElement("div");
v.style.cssText="position:fixed;top:12px;right:12px;z-index:2147483647;background:#15803d;color:#fff;padding:12px 16px;border-radius:10px;font:600 14px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.35)";
document.body.appendChild(v);
var say=function(m){v.textContent=m},end=function(){setTimeout(function(){v.remove()},6000)};
try{
if(location.origin!==new URL(U).origin){window.open(U,"_blank");v.remove();alert("🤖 Page du fournisseur ouverte : clique encore sur le favori CA+");return}
say("🔍 Factures…");
fetch(A,{headers:{Authorization:"Bearer "+T}}).then(function(r){return r.json()}).then(function(cfg){
var S=cfg.sources||[];
var src=S.filter(function(x){return x.url&&location.href.indexOf(x.url.split("?")[0])===0})[0]||S[0];
if(!src){say("⚠️ Aucune source robot configurée");end();return}
var links=[].slice.call(document.querySelectorAll("a")).filter(function(a){return /invoice|factur|relev|statement|\\.pdf/i.test((a.textContent||"")+" "+a.href)});
if(!links.length){say("❌ Aucun lien facture visible");end();return}
say("⬇️ "+links.length+"…");
var ok=0,msgs=[];
var envois=links.slice(0,10).map(function(a){return fetch(a.href,{credentials:"include"}).then(function(r){return r.blob()}).then(function(b){
var m=/pdf/i.test(b.type)?"application/pdf":/png/i.test(b.type)?"image/png":/jpe?g/i.test(b.type)?"image/jpeg":/octet-stream/i.test(b.type)?"application/pdf":null;
if(!m)return null;
return new Promise(function(res){var F=new FileReader();F.onload=function(){res(String(F.result))};F.onerror=function(){res(null)};F.readAsDataURL(b)});
}).then(function(d){
if(!d)return null;
var head=d.slice(5,60);
var mime=head.indexOf("application/pdf")===0?"application/pdf":head.indexOf("image/png")===0?"image/png":head.indexOf("image/jpeg")===0?"image/jpeg":null;
if(!mime)return null;
var ext=mime==="application/pdf"?".pdf":mime==="image/png"?".png":".jpg";
var name=((a.textContent||"facture").trim().replace(/[^\\w.-]+/g,"_").slice(0,60)||"facture")+ext;
return fetch(A,{method:"POST",headers:{Authorization:"Bearer "+T,"Content-Type":"application/json"},body:JSON.stringify({sourceId:src.id,fileName:name,mime:mime,base64:d.split(",")[1]||""})}).then(function(r){return r.json()}).then(function(j){if(j&&j.attached)ok++;if(j&&j.message)msgs.push(j.message)}).catch(function(){});
}).catch(function(){})});
Promise.all(envois).then(function(){
if(ok){say("✅ "+ok+" envoyée(s) à CA+");end()}
else if(msgs.length){say("⚠️ "+msgs[0]);end()}
else{say("⚠️ Rien envoyé — vérifie que les factures sont des PDF");end()}
});
});
}catch(e){say("⚠️ Erreur : réessaie sur la page des factures");end()}`;
