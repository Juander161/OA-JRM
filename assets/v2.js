/* Order Approval · V2 con Microsoft Graph API (simulación) */
"use strict";
(() => {
  const MAILBOX = "dc-mmex-orderapproval@empresa.com";
  const OH_CSV = `Item,Description,Subinventory,On Hand
1012010774,PRODUCT PACKAGE: GRADUATION REGALIA SET,FG-MTY,85
1012010774,PRODUCT PACKAGE: GRADUATION REGALIA SET,FG-TIJ,35
2000178214,CAP: BDG.STANDARD.HARD.POLYESTER.GARNET.ELASTIC,FG-MTY,0
2000179048,GOWN: BDG.GRADUATE.POLYESTER.GARNET.5'04",FG-MTY,65
2000181530,TASSEL: STANDARD.GARNET/GOLD.2026 CHARM,FG-MTY,300
2000190112,STOLE: L-33.SATIN.WHITE.PLAIN,FG-TIJ,4
2000175560,GOWN: BDG.GRADUATE.POLYESTER.NAVY.5'09",FG-MTY,38
2000183377,HOOD: MASTERS.VELVET.EDUCATION.LIGHT BLUE,FG-MTY,12
2000186004,DIPLOMA COVER: PADDED.NAVY.GOLD FOIL,FG-TIJ,90
2000171229,CAP: BDG.STANDARD.HARD.POLYESTER.NAVY.ELASTIC,FG-MTY,150`;
  const DESC = Object.fromEntries(OH_CSV.split("\n").slice(1).map(l => { const c = l.split(","); return [c[0], c[1]]; }));
  const CUST = [["NORTHRIDGE GRAD SUPPLY LLC", "Northridge Grad Supply", "orders@northridge-grad.example"], ["CAMPUS REGALIA CO", "Campus Regalia Co.", "sales@campusregalia.example"],
    ["SUNBELT CAP AND GOWN", "Sunbelt Cap & Gown", "rep@sunbeltcap.example"], ["LAKESIDE ACADEMY STORE", "Lakeside Academy Store", "store@lakeside.example"],
    ["RIVERBEND UNIVERSITY SHOP", "Riverbend University Shop", "shop@riverbend.example"], ["MAPLE LEAF GRAD CANADA", "Maple Leaf Grad Canada", "cs@mapleleafgrad.example"],
    ["PIONEER GRADUATION SVCS", "Pioneer Graduation Svcs", "ops@pioneergrad.example"]];
  const S = {log: [], auto: false, timer: null, tick: null, rules: {clasificar: true, mover: false, responderShortage: false, acuse: false}, seq: 1};

  const addDays = n => { const d = OA.today(); d.setDate(d.getDate() + n); return d; };
  const line = (id, q) => `Item [${id}] Qty [${q}] Description [${DESC[id]}]`;
  const subj = (rdd, ev, c, bo) => `PRDF: RDD ${OA.fmtOracleDate(addDays(rdd))}, Event Date ${ev == null ? "N/A" : OA.fmtOracleDate(addDays(ev))}, ${c}, Rep ${c}${bo ? `, BO# ${bo}` : ""}`;
  const gid = () => "AAMkAGI2" + Math.random().toString(36).slice(2, 10).toUpperCase() + "AAA=";
  const mk = (ci, minsAgo, subject, body, att) => OA.mail.normalize({id: gid(), internetMessageId: `<${OA.uid()}@mail.example>`, conversationId: "AAQkA" + OA.uid(),
    subject, fromName: CUST[ci][1], fromAddress: CUST[ci][2], to: MAILBOX, received: new Date(Date.now() - minsAgo * 60000).toISOString(), body, hasAttachments: !!att});
  const seed = () => [
    mk(0, 190, subj(21, 60, CUST[0][0], "93938905"), [line("1012010774", 1), line("2000181530", 25), line("2000186004", 25)].join("\n")),
    mk(1, 170, subj(14, 45, CUST[1][0], "93941277"), [line("2000178214", 30), line("2000179048", 30)].join("\n")),
    mk(5, 150, `RE: [Ext] RE: FW: ${subj(9, null, CUST[5][0], "95474485")} [ thread::2KMSFv68Qx ]`, "Is there another way we can send stoles L-33 satin white plain to reach the event date? Please update item number in oracle before to release.\n\n-----Original Message-----\n" + line("2000190112", 40)),
    mk(2, 120, subj(5, 30, CUST[2][0], "93950012"), [line("2000190112", 20), line("2000181530", 20)].join("\n")),
    mk(3, 95, subj(18, 50, CUST[3][0], "93952630"), [line("2000175560", 20), line("2000171229", 20)].join("\n")),
    mk(6, 60, subj(25, 70, CUST[6][0], null), [line("2000179048", 10), line("2000171229", 10)].join("\n")),
    mk(0, 35, `FW: ${subj(12, 40, CUST[0][0], "93939114")}`, "Please see the attached screenshot, the quantities do not match what the school ordered.\n" + line("2000183377", 8), true),
    mk(4, 12, subj(30, 75, CUST[4][0], "93958841"), [line("2000183377", 6), line("2000171229", 6), line("2000186004", 6)].join("\n"))
  ];
  const random = () => {
    const ids = Object.keys(DESC), ci = Math.floor(Math.random() * CUST.length), bo = String(93960000 + Math.floor(Math.random() * 39999));
    const lines = ids.sort(() => Math.random() - .5).slice(0, 1 + Math.floor(Math.random() * 3)).map(id => line(id, Math.random() < .25 ? 40 + Math.floor(Math.random() * 60) : 1 + Math.floor(Math.random() * 15)));
    if (Math.random() < .25) return mk(ci, 0, `RE: [Ext] ${subj(4 + Math.floor(Math.random() * 20), null, CUST[ci][0], bo)}`, "Can we split this order and ship the available items first? Please advise.\n\n" + lines.join("\n"), Math.random() < .5);
    return mk(ci, 0, subj(3 + Math.floor(Math.random() * 30), 30 + Math.floor(Math.random() * 40), CUST[ci][0], bo), lines.join("\n"));
  };

  const log = (method, url, body, status = method === "POST" && /reply|send/.test(url) ? 202 : method === "DELETE" ? 204 : 200) => {
    S.log.unshift({t: new Date().toISOString(), method, url, body: body ? JSON.stringify(body, null, 2) : "", status});
    if (S.log.length > 300) S.log.length = 300;
    OA.db.set("v2:log", S.log);
  };
  const persist = A => OA.db.set("v2:mails", A.mails.map(({parsed, decision, ...m}) => m));
  const U = `/v1.0/users/${MAILBOX}`;

  function classify(A, m, auto) {
    const d = m.decision; if (d.estado === "gris") return null;
    const a = OA.makeAction("clasificar", m, {origen: auto ? "regla" : "manual"});
    log("PATCH", `${U}/messages/${m.id}`, {categories: [a.categoria], flag: {flagStatus: a.bandera}});
    if (S.rules.mover) log("POST", `${U}/messages/${m.id}/move`, {destinationId: a.carpetaDestino});
    a.estado = "procesada";
    return a;
  }
  function autoReply(A, m, tplId) {
    const t = A.templates.find(x => x.id === tplId); if (!t || !m.fromAddress) return null;
    const f = OA.fill(t, m, A.settings.firma);
    const a = OA.makeAction("responder", m, {para: m.fromAddress, asunto: f.asunto, cuerpoTexto: f.cuerpo, cuerpoHtml: OA.textToHtml(f.cuerpo), origen: "regla"});
    log("POST", `${U}/messages/${m.id}/reply`, {message: {toRecipients: [{emailAddress: {address: a.para}}]}, comment: a.cuerpoTexto.slice(0, 160) + "…"});
    a.estado = "enviada";
    return a;
  }
  function arrive(A, m) {
    log("POST", "/api/notificaciones  ← webhook de Graph", {value: [{changeType: "created", resource: `Users/${MAILBOX}/Messages/${m.id}`}]}, 202);
    log("GET", `${U}/messages/${m.id}?$select=subject,from,receivedDateTime,body,hasAttachments`);
    A.addMail(m);
    const out = [];
    if (S.rules.clasificar) { const c = classify(A, m, true); if (c) out.push(c); }
    if (S.rules.responderShortage && m.decision.estado === "rojo" && m.parsed.bo) { const r = autoReply(A, m, "t-shortage"); if (r) out.push(r); }
    if (S.rules.acuse && m.decision.estado === "naranja") { const r = autoReply(A, m, "t-revision"); if (r) out.push(r); }
    A.actions.unshift(...out); A.saveActions(); persist(A);
  }
  function processDue(A) {
    let changed = false;
    for (const a of A.actions) if (a.estado === "programada" && new Date(a.enviarEn) <= new Date()) {
      log("POST", `${U}/messages/${a.borrador}/send`); a.estado = "enviada"; changed = true;
    }
    if (changed) { A.saveActions(); A.render(); OA.toast("Respuesta programada enviada"); }
  }

  const adapter = {
    id: "v2", label: "V2 · Graph API · Simulación", sw: "../sw.js",
    async init(A) {
      const [log0, rules, mails] = await Promise.all([OA.db.get("v2:log"), OA.db.get("v2:rules"), OA.db.get("v2:mails")]);
      S.log = log0 || []; if (rules) S.rules = {...S.rules, ...rules.rules}; S.auto = !!(rules && rules.auto);
      if (!A.oh) await A.loadOH(new File([OH_CSV], "Material OH (simulado).csv"));
      if (mails && mails.length) A.setMails(mails);
      else {
        log("POST", "/v1.0/subscriptions", {changeType: "created", resource: `users/${MAILBOX}/mailFolders('inbox')/messages`, notificationUrl: "https://…/api/notificaciones", expirationDateTime: new Date(Date.now() + 2 * 86400e3).toISOString()}, 201);
        log("GET", `${U}/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc`);
        seed().reverse().forEach(m => arrive(A, m));
      }
      S.tick = setInterval(() => processDue(A), 5000);
      if (S.auto) this.startAuto(A);
    },
    startAuto(A) { clearInterval(S.timer); S.timer = setInterval(() => { arrive(A, random()); A.render(); }, 25000); },
    status() { return {cls: "ok", text: `Graph API · ${MAILBOX}`}; },
    commands() {
      return [
        {id: "v2-new", label: "Simular correo nuevo", icon: "mail", primary: true},
        {id: "v2-auto", label: S.auto ? "Pausar llegada" : "Llegada automática", icon: S.auto ? "pause" : "play"},
        {id: "v2-reset", label: "Reiniciar", icon: "refresh"}
      ];
    },
    async command(A, id) {
      if (id === "v2-new") { const m = random(); arrive(A, m); A.render(); OA.toast("Nuevo correo: " + (m.subject.match(/BO#\s*\d+/) || ["sin BO#"])[0]); }
      if (id === "v2-auto") { S.auto = !S.auto; if (S.auto) this.startAuto(A); else clearInterval(S.timer); OA.db.set("v2:rules", {rules: S.rules, auto: S.auto}); A.render(); }
      if (id === "v2-reset") { clearInterval(S.timer); S.auto = false; S.log = []; A.actions = []; A.read = {}; A.selected = null; A.comp = null; await Promise.all([OA.db.del("v2:mails"), OA.db.del("v2:log"), OA.db.del("actions:v2"), OA.db.del("read:v2")]); A.mails = []; await this.init(A); A.render(); }
    },
    action(A, act) {
      if (act.startsWith("rule-")) { const k = act.slice(5); S.rules[k] = !S.rules[k]; OA.db.set("v2:rules", {rules: S.rules, auto: S.auto}); A.render(); }
    },
    emptyText() { return "Sin correos"; },
    async submitAction(A, a) {
      const m = A.mail(a.idCorreo);
      if (a.accion === "clasificar") { const c = classify(A, m, false); return c || a; }
      if (new Date(a.enviarEn) > new Date(Date.now() + 5000)) {
        a.borrador = gid();
        log("POST", `${U}/messages/${a.idCorreo}/createReply`, null, 201);
        log("PATCH", `${U}/messages/${a.borrador}`, {toRecipients: [{emailAddress: {address: a.para}}], subject: a.asunto, body: {contentType: "HTML", content: "…"}, singleValueExtendedProperties: [{id: "SystemTime 0x3FEF", value: a.enviarEn}]});
        log("POST", `${U}/messages/${a.borrador}/send`, null, 202);
        a.estado = "programada";
      } else {
        log("POST", `${U}/messages/${a.idCorreo}/reply`, {message: {toRecipients: [{emailAddress: {address: a.para}}], subject: a.asunto}, comment: a.cuerpoTexto.slice(0, 160) + (a.cuerpoTexto.length > 160 ? "…" : "")});
        a.estado = "enviada";
      }
      return a;
    },
    async cancelAction(A, a) {
      if (a.estado !== "programada") return false;
      log("DELETE", `/v1.0/users/${MAILBOX}/mailFolders/outbox/messages/${a.borrador}`);
      return true;
    },
    views: [
      {id: "registro", label: "Registro API", icon: "api", badge: () => S.log.length || "",
        render(v) {
          v.innerHTML = `<div class="view-inner"><h2>Registro API</h2><div class="card"><ul class="log">
            ${S.log.map(l => `<li><time class="muted">${new Date(l.t).toLocaleTimeString("es-MX")}</time><span class="m ${l.method}">${l.method} ${l.status}</span><span>${OA.esc(l.url)}${l.body ? `<pre>${OA.esc(l.body)}</pre>` : ""}</span></li>`).join("") || `<li class="empty">Sin llamadas</li>`}
          </ul></div></div>`;
        }},
      {id: "reglas", label: "Automatización", icon: "tag",
        render(v) {
          const r = (k, l) => `<label class="chk"><input type="checkbox" data-rule="${k}"${S.rules[k] ? " checked" : ""}> ${l}</label>`;
          v.innerHTML = `<div class="view-inner"><h2>Automatización</h2><div class="card"><div class="ch"><h3>Al llegar un correo</h3></div><div class="cb">
            ${r("clasificar", "Categoría y bandera en Outlook")}
            ${r("mover", "Mover a carpeta OA Aprobar / OA Shortage / OA Revision")}
            ${r("responderShortage", "Responder con la plantilla Shortage")}
            ${r("acuse", "Responder con la plantilla En revisión a los complejos")}
          </div></div>
          <div class="card"><div class="ch"><h3>Buzón</h3></div><div class="cb"><div class="kv"><div><span class="k">Buzón</span><span class="v">${MAILBOX}</span></div><div><span class="k">Suscripción</span><span class="v">created · inbox</span></div><div><span class="k">Permisos</span><span class="v">Mail.ReadWrite · Mail.Send</span></div></div></div></div></div>`;
          v.querySelectorAll("[data-rule]").forEach(el => el.addEventListener("change", () => adapter.action(OA.app, "rule-" + el.dataset.rule)));
        }}
    ]
  };
  OA.app.start(adapter);
})();
