/* Order Approval · núcleo compartido (V1 sin API y V2 con Graph API) */
"use strict";
const OA = {};

/* ======================================================================
   Utilidades
   ====================================================================== */
OA.$ = (s, r = document) => r.querySelector(s);
OA.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
OA.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
OA.MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
OA.today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
OA.parseOracleDate = s => {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(String(s || "").trim()); if (!m) return null;
  const mi = OA.MONTHS.indexOf(m[2].toUpperCase()); if (mi < 0) return null;
  let y = +m[3]; if (y < 100) y += 2000; return new Date(y, mi, +m[1]);
};
OA.fmtOracleDate = d => String(d.getDate()).padStart(2,"0") + "-" + OA.MONTHS[d.getMonth()] + "-" + String(d.getFullYear()).slice(-2);
OA.daysUntil = d => d ? Math.round((d - OA.today()) / 86400000) : null;
OA.fmtTime = iso => {
  const d = new Date(iso); if (isNaN(d)) return "";
  const t = OA.today(), dd = new Date(d); dd.setHours(0,0,0,0);
  if (+dd === +t) return d.toLocaleTimeString("es-MX", {hour:"2-digit", minute:"2-digit"});
  if (t - dd < 6 * 86400000) return d.toLocaleDateString("es-MX", {weekday:"short"}) + " " + d.toLocaleTimeString("es-MX", {hour:"2-digit", minute:"2-digit"});
  return d.toLocaleDateString("es-MX", {day:"2-digit", month:"2-digit", year:"numeric"});
};
OA.fmtFull = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("es-MX", {weekday:"short", day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit"}); };
OA.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
OA.normItem = s => String(s ?? "").trim().replace(/\.0+$/, "").replace(/[\s\-_.\/]/g, "").replace(/^0+(?=\d)/, "").toUpperCase();
OA.num = v => { if (typeof v === "number") return v; const n = parseFloat(String(v ?? "").replace(/[,\s]/g, "")); return isNaN(n) ? null : n; };
OA.toast = msg => {
  let t = OA.$("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role","status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(OA.toast._t); OA.toast._t = setTimeout(() => t.hidden = true, 2600);
};
OA.initials = s => String(s || "?").replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, " ").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
OA.avatarColor = s => { const p = ["#8764B8","#038387","#CA5010","#4F6BED","#986F0B","#0078D4","#C239B3","#498205","#E3008C","#5C2E91"]; let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return p[h % p.length]; };
OA.htmlToText = html => {
  if (!/<[a-z!\/][\s\S]*>/i.test(html)) return html;
  const prepped = String(html).replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d|\/table)\b[^>]*>/gi, m => m + "\n").replace(/<\/t[dh]>/gi, " ");
  const doc = new DOMParser().parseFromString(prepped, "text/html");
  doc.querySelectorAll("style,script,head").forEach(n => n.remove());
  return (doc.body ? doc.body.textContent : "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
};
OA.download = (name, text, type = "application/json") => {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

/* ======================================================================
   Almacenamiento local (IndexedDB)
   ====================================================================== */
OA.db = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open("order-approval", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction("kv", mode); const q = fn(t.objectStore("kv")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  return {
    get: k => tx("readonly", s => s.get(k)).catch(() => undefined),
    set: (k, v) => tx("readwrite", s => s.put(v, k)).catch(() => undefined),
    del: k => tx("readwrite", s => s.delete(k)).catch(() => undefined)
  };
})();

/* ======================================================================
   Lectura de correos guardados por Power Automate (.json · .eml · .html · .txt)
   ====================================================================== */
OA.mail = {};
OA.mail.pick = (o, keys) => { for (const k of keys) { if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; } return undefined; };
OA.mail.addr = v => {
  if (!v) return {name:"", address:""};
  if (Array.isArray(v)) return OA.mail.addr(v[0]);
  if (typeof v === "object") { const e = v.emailAddress || v.EmailAddress || v; return {name: e.name || e.Name || "", address: e.address || e.Address || ""}; }
  const s = String(v), m = /^\s*"?([^"<]*)"?\s*<([^>]+)>/.exec(s);
  return m ? {name: m[1].trim(), address: m[2].trim()} : {name: s.includes("@") ? "" : s, address: s.includes("@") ? s.trim() : ""};
};
OA.mail.fromObject = (o, fileName) => {
  const P = keys => OA.mail.pick(o, keys);
  let body = P(["body","Body","cuerpo","Cuerpo","bodyText","BodyText","bodyPreview","BodyPreview"]);
  if (body && typeof body === "object") body = body.content || body.Content || "";
  const from = OA.mail.addr(P(["from","From","de","De","sender","Sender"]));
  from.name = P(["fromName","FromName","senderName","nombreRemitente","remitente"]) || from.name;
  const received = P(["receivedDateTime","DateTimeReceived","received","recibido","Recibido","fecha","Fecha","date","Date"]);
  return OA.mail.normalize({
    id: P(["id","Id","messageId","MessageId","idCorreo","IdCorreo"]) || fileName,
    internetMessageId: P(["internetMessageId","InternetMessageId"]) || "",
    conversationId: P(["conversationId","ConversationId"]) || "",
    subject: P(["subject","Subject","asunto","Asunto"]) || "",
    fromName: from.name, fromAddress: from.address,
    to: (P(["toRecipients","To","to","para"]) || ""),
    received: received ? new Date(received).toISOString() : new Date().toISOString(),
    body: String(body || ""),
    hasAttachments: !!P(["hasAttachments","HasAttachment","HasAttachments","adjuntos","Adjuntos"]),
    fileName
  });
};
OA.mail.normalize = m => {
  m.bodyText = OA.htmlToText(m.body || "");
  if (!m.fromName) m.fromName = m.fromAddress ? m.fromAddress.split("@")[0] : "Remitente desconocido";
  if (typeof m.to !== "string") m.to = (Array.isArray(m.to) ? m.to : [m.to]).map(x => OA.mail.addr(x).address).filter(Boolean).join("; ");
  if (isNaN(new Date(m.received))) m.received = new Date().toISOString();
  return m;
};
OA.mail.decodeWords = s => String(s || "").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
  try {
    let bytes;
    if (enc.toUpperCase() === "B") bytes = Uint8Array.from(atob(txt), c => c.charCodeAt(0));
    else bytes = OA.mail.qpBytes(txt.replace(/_/g, " "));
    return new TextDecoder(cs).decode(bytes);
  } catch (e) { return txt; }
}).replace(/\?=\s+=\?/g, "");
OA.mail.qpBytes = s => {
  s = s.replace(/=\r?\n/g, ""); const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else out.push(s.charCodeAt(i) & 255);
  }
  return new Uint8Array(out);
};
OA.mail.parseEml = (raw, fileName) => {
  const split = t => { const i = t.search(/\r?\n\r?\n/); return i < 0 ? [t, ""] : [t.slice(0, i), t.slice(i).replace(/^\r?\n\r?\n/, "")]; };
  const headers = h => { const o = {}; h.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/).forEach(l => { const i = l.indexOf(":"); if (i > 0) o[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }); return o; };
  const param = (v, k) => { const m = new RegExp(k + '\\s*=\\s*"?([^";]+)"?', "i").exec(v || ""); return m ? m[1] : ""; };
  let text = "", html = "", attach = false;
  const walk = (hTxt, body) => {
    const h = headers(hTxt), ct = h["content-type"] || "text/plain", disp = h["content-disposition"] || "";
    if (/^multipart\//i.test(ct)) {
      const b = param(ct, "boundary"); if (!b) return;
      body.split("--" + b).slice(1).forEach(part => { if (/^--/.test(part)) return; const [ph, pb] = split(part.replace(/^\r?\n/, "")); walk(ph, pb); });
      return;
    }
    if (/attachment/i.test(disp) || (param(disp, "filename") && !/inline/i.test(disp))) { attach = true; return; }
    if (!/^text\/(plain|html)/i.test(ct)) return;
    const enc = (h["content-transfer-encoding"] || "").toLowerCase(), cs = param(ct, "charset") || "utf-8";
    let bytes;
    if (enc === "base64") { try { bytes = Uint8Array.from(atob(body.replace(/\s+/g, "")), c => c.charCodeAt(0)); } catch (e) { bytes = new TextEncoder().encode(body); } }
    else if (enc === "quoted-printable") bytes = OA.mail.qpBytes(body);
    else bytes = Uint8Array.from(body, c => c.charCodeAt(0) & 255);
    let dec; try { dec = new TextDecoder(cs).decode(bytes); } catch (e) { dec = new TextDecoder().decode(bytes); }
    if (/html/i.test(ct)) html = html || dec; else text = text || dec;
  };
  const [hTxt, body] = split(raw); const h = headers(hTxt); walk(hTxt, body);
  const from = OA.mail.addr(OA.mail.decodeWords(h["from"]));
  return OA.mail.normalize({
    id: (h["message-id"] || fileName).replace(/[<>]/g, ""), internetMessageId: (h["message-id"] || "").replace(/[<>]/g, ""), conversationId: "",
    subject: OA.mail.decodeWords(h["subject"] || ""), fromName: from.name, fromAddress: from.address, to: OA.mail.decodeWords(h["to"] || ""),
    received: h["date"] ? new Date(h["date"]).toISOString() : new Date().toISOString(),
    body: text || html, hasAttachments: attach, fileName
  });
};
OA.mail.parseLoose = (txt, fileName) => {
  const subj = /^\s*(?:Subject|Asunto)\s*:\s*(.+)$/im.exec(txt), from = /^\s*(?:From|De)\s*:\s*(.+)$/im.exec(txt), date = /^\s*(?:Date|Sent|Enviado|Fecha)\s*:\s*(.+)$/im.exec(txt);
  const f = OA.mail.addr(from ? from[1] : "");
  return OA.mail.normalize({
    id: fileName, subject: subj ? subj[1].trim() : fileName.replace(/\.[^.]+$/, ""), fromName: f.name, fromAddress: f.address, to: "",
    received: date && !isNaN(new Date(date[1])) ? new Date(date[1]).toISOString() : new Date().toISOString(),
    body: txt, hasAttachments: /\[image\d*\.(png|jpg|gif)\]|adjunto|attachment/i.test(txt), fileName
  });
};
/* Devuelve una lista de correos a partir del contenido de un archivo */
OA.mail.fromFile = (name, text, lastModified) => {
  const ext = (name.split(".").pop() || "").toLowerCase(), t = String(text).replace(/^﻿/, "");
  try {
    if (ext === "json" || /^\s*[\[{]/.test(t)) {
      const j = JSON.parse(t);
      const arr = Array.isArray(j) ? j : Array.isArray(j.value) ? j.value : Array.isArray(j.correos) ? j.correos : [j];
      return arr.map((o, i) => OA.mail.fromObject(o, arr.length > 1 ? `${name}#${i}` : name));
    }
    if (ext === "eml" || /^(Received|Return-Path|MIME-Version|Message-ID|From):/im.test(t.slice(0, 2000))) return [OA.mail.parseEml(t, name)];
    const m = OA.mail.parseLoose(t, name); if (lastModified && !/^\s*(Date|Sent|Fecha|Enviado)\s*:/im.test(t)) m.received = new Date(lastModified).toISOString();
    return [m];
  } catch (e) { return []; }
};

/* ======================================================================
   Extracción de datos del correo
   ====================================================================== */
OA.parseEmail = m => {
  const subject = String(m.subject || ""), body = String(m.bodyText || "");
  const flat = body.replace(/\s+/g, " ");
  const r = {bo:null, rdd:null, eventDate:null, customer:null, rep:null, items:[], reasons:[], tipo:1};
  const bo = /BO#\s*:?\s*(\d{5,12})/i.exec(subject) || /BO#\s*:?\s*(\d{5,12})/i.exec(flat);
  r.bo = bo ? bo[1] : null;
  const rdd = /RDD\s*:?\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i.exec(subject); r.rdd = rdd ? rdd[1].toUpperCase() : null;
  const ev = /Event\s*Date\s*:?\s*(N\/A|\d{1,2}-[A-Za-z]{3}-\d{2,4})/i.exec(subject); r.eventDate = ev ? ev[1].toUpperCase() : null;
  const cr = /Event\s*Date\s*:?\s*[^,]*,\s*(.+?),\s*Rep\s+(.+?)\s*,\s*BO#/i.exec(subject);
  if (cr) { r.customer = cr[1].trim(); r.rep = cr[2].trim(); }
  const itemRe = /Item\s*[#:]?\s*\[?\s*([A-Za-z0-9\-]{5,20})\s*\]?\s*,?\s*Qty\s*[#:]?\s*\[?\s*(\d+(?:\.\d+)?)\s*\]?\s*(?:,?\s*Description\s*:?\s*\[([^\]]*)\]?)?/gi;
  let x; while ((x = itemRe.exec(flat))) r.items.push({item: x[1], qty: +x[2], desc: (x[3] || "").trim()});
  // Señales de correo complejo
  if (/^\s*(\[?ext\]?\s*:?\s*)?(re|rv|fw|fwd)\s*:/i.test(subject) || /\b(RE|RV|FW|FWD):/i.test(subject)) r.reasons.push("Hilo de respuesta o reenvío (RE:/FW:)");
  if (/thread::/i.test(subject)) r.reasons.push("Identificador de hilo en el asunto");
  if (m.hasAttachments) r.reasons.push("Trae archivos adjuntos");
  if (!r.items.length) r.reasons.push("Sin líneas Item / Qty");
  const narrative = body.split(/\n/).filter(l => l.trim() && !/Item\s*\[?\s*[A-Za-z0-9]/i.test(l))
    .filter(l => /\?|\b(please|can you|could you|urgent|emergency|asap|update|change|cancel|split|substitut|replace|instead|por favor|favor de|urgente|cambio|cancelar|sustitu)/i.test(l));
  if (r.items.length && narrative.length) r.reasons.push("Texto libre con solicitudes o preguntas");
  r.tipo = r.reasons.length ? 2 : 1;
  return r;
};

/* ======================================================================
   Material OH · lectura de Excel (.xlsx) y CSV sin librerías
   ====================================================================== */
OA.xlsx = {};
OA.xlsx.unzip = async buf => {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("El archivo no es un Excel .xlsx válido.");
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const files = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = {method, csize, lo}; p += 46 + nl + xl + cl;
  }
  return async name => {
    const f = files[name]; if (!f) return null;
    const start = f.lo + 30 + dv.getUint16(f.lo + 26, true) + dv.getUint16(f.lo + 28, true), data = u8.subarray(start, start + f.csize);
    if (f.method === 0) return dec.decode(data);
    if (typeof DecompressionStream === "undefined") throw new Error("Este navegador no abre .xlsx. Guarda el archivo como CSV.");
    return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  };
};
OA.xlsx.read = async buf => {
  const get = await OA.xlsx.unzip(buf), xml = s => new DOMParser().parseFromString(s || "<x/>", "application/xml");
  const tags = (n, t) => Array.from(n.getElementsByTagNameNS("*", t));
  const wb = xml(await get("xl/workbook.xml")), rels = xml(await get("xl/_rels/workbook.xml.rels"));
  const relMap = Object.fromEntries(tags(rels, "Relationship").map(r => [r.getAttribute("Id"), r.getAttribute("Target")]));
  const ssTxt = await get("xl/sharedStrings.xml");
  const shared = ssTxt ? tags(xml(ssTxt), "si").map(si => tags(si, "t").filter(t => !t.closest || !t.parentNode || t.parentNode.localName !== "rPh").map(t => t.textContent).join("")) : [];
  const sheets = [];
  for (const s of tags(wb, "sheet")) {
    const rid = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let target = relMap[rid] || ""; target = target.replace(/^\//, ""); if (target && !target.startsWith("xl/")) target = "xl/" + target;
    const txt = target ? await get(target) : null; if (!txt) continue;
    const rows = [];
    for (const row of tags(xml(txt), "row")) {
      const out = []; let lastCol = 0;
      for (const c of tags(row, "c")) {
        const ref = c.getAttribute("r") || "", letters = (/^[A-Z]+/.exec(ref) || [""])[0];
        let col = 0; for (const ch of letters) col = col * 26 + ch.charCodeAt(0) - 64; if (!col) col = lastCol + 1; lastCol = col;
        const type = c.getAttribute("t"), v = tags(c, "v")[0]?.textContent ?? "";
        out[col - 1] = type === "s" ? (shared[+v] ?? "") : type === "inlineStr" ? tags(c, "t").map(t => t.textContent).join("") : v;
      }
      const ri = +row.getAttribute("r"); const arr = Array.from(out, v => v ?? "");
      if (ri && ri - 1 > rows.length) while (rows.length < ri - 1) rows.push([]);
      rows.push(arr);
    }
    sheets.push({name: s.getAttribute("name") || `Hoja ${sheets.length + 1}`, rows});
  }
  if (!sheets.length) throw new Error("El libro no tiene hojas legibles.");
  return sheets;
};
OA.csv = text => {
  text = String(text).replace(/^﻿/, "");
  const first = text.split(/\r?\n/).find(l => l.trim()) || "";
  const delim = [",", ";", "\t", "|"].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && cur === "") q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, "")); rows.push(row); }
  return rows;
};
/* ======================================================================
   Material OH · encabezados, columnas, índice y búsquedas
   ====================================================================== */
OA.oh = {};
OA.oh.RX = {
  item1: /^\s*(item|item\s*(#|no\.?|num\.?|number|code)|part(\s*(#|no\.?|number))?|sku|art[ií]culo|n[uú]mero\s*de\s*art[ií]culo|material|segment1|inventory\s*item)\s*$/i,
  item2: /item|art[ií]culo|part|sku|material/i,
  qty1: /on.?hand|onhand|\boh\b|disponible|available|existencia|stock/i,
  qty2: /qty|cantidad|quantity|total|primary/i,
  desc: /desc/i,
  loc: /subinv|ubicaci|locator|location|almac|warehouse|bodega/i,
  loc2: /\borg/i,
  any: /item|art[ií]culo|part|sku|material|n[uú]mero|on.?hand|qty|cantidad|disponible|existencia|desc|stock|ubicaci|subinv|locator|uom|unidad/i
};
OA.oh.isItemLike = v => /^[A-Za-z]{0,3}\d{5,14}$/.test(OA.normItem(v));
OA.oh.load = async file => {
  let sheets;
  if (/\.(xlsx|xlsm)$/i.test(file.name)) sheets = await OA.xlsx.read(await file.arrayBuffer());
  else if (/\.(csv|txt|tsv)$/i.test(file.name)) sheets = [{name: file.name, rows: OA.csv(await file.text())}];
  else if (/\.xls$/i.test(file.name)) throw new Error("Los .xls antiguos no se pueden leer. Abre el archivo en Excel y guárdalo como .xlsx o CSV.");
  else throw new Error("Formato no soportado. Usa .xlsx o .csv.");
  const best = sheets.reduce((b, s, i) => s.rows.length > sheets[b].rows.length ? i : b, 0);
  const st = {fileName: file.name, loadedAt: new Date().toISOString(), sheets, sheet: best, header: "auto", map: null, sum: true, startRow: null};
  OA.oh.analyze(st, true);
  return st;
};
OA.oh.rows = st => (st.sheets[st.sheet] || {rows: []}).rows;
OA.oh.analyze = (st, resetMap) => {
  const rows = OA.oh.rows(st);
  const filled = r => (r || []).filter(c => String(c).trim() !== "").length;
  let first = rows.findIndex(r => filled(r) >= 2); if (first < 0) first = 0;
  const r0 = rows[first] || [], r1 = rows[first + 1] || [];
  const numCount = r => r.filter(c => OA.num(c) !== null && String(c).trim() !== "").length;
  const detected = r0.some(c => OA.oh.RX.any.test(String(c)) && OA.num(c) === null) || (numCount(r0) === 0 && numCount(r1) > 0);
  st.detectedHeader = detected;
  st.hasHeader = st.header === "auto" ? detected : st.header === "si";
  st.headerRow = first;
  st.dataStart = st.startRow != null ? Math.max(0, st.startRow - 1) : first + (st.hasHeader ? 1 : 0);
  const width = Math.max(0, ...rows.slice(first, first + 200).map(r => r.length));
  if (resetMap || !st.map || [st.map.item, st.map.qty].some(v => v >= width)) st.map = OA.oh.guess(st, width);
  return st;
};
OA.oh.columns = st => {
  const rows = OA.oh.rows(st), width = Math.max(0, ...rows.slice(st.headerRow, st.headerRow + 200).map(r => r.length));
  const letter = i => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  return Array.from({length: width}, (_, i) => ({i, letter: letter(i), name: st.hasHeader ? String((rows[st.headerRow] || [])[i] ?? "").trim() : ""}));
};
OA.oh.guess = (st, width) => {
  const rows = OA.oh.rows(st), sample = rows.slice(st.dataStart, st.dataStart + 300).filter(r => r.some(c => String(c).trim()));
  const head = st.hasHeader ? (rows[st.headerRow] || []).map(c => String(c)) : [];
  const stats = Array.from({length: width}, (_, j) => {
    const vals = sample.map(r => r[j]).filter(v => String(v ?? "").trim() !== "");
    const n = vals.length || 1;
    return {j, item: vals.filter(OA.oh.isItemLike).length / n, num: vals.filter(v => OA.num(v) !== null).length / n,
      small: vals.filter(v => { const x = OA.num(v); return x !== null && Math.abs(x) < 1e6; }).length / n,
      len: vals.reduce((a, v) => a + String(v).length, 0) / n, filled: vals.length / (sample.length || 1)};
  });
  const byHead = (...rx) => { for (const r of rx) { const i = head.findIndex(h => r.test(h)); if (i >= 0) return i; } return -1; };
  let item = byHead(OA.oh.RX.item1, OA.oh.RX.item2);
  if (item < 0 || stats[item]?.item < .3) { const c = [...stats].sort((a, b) => b.item - a.item)[0]; if (c && c.item >= .3) item = c.j; else if (item < 0) item = 0; }
  let qty = byHead(OA.oh.RX.qty1, OA.oh.RX.qty2); if (qty === item) qty = -1;
  if (qty < 0 || stats[qty]?.num < .5) {
    const c = stats.filter(s => s.j !== item && s.num >= .6 && s.small >= .6 && s.item < .5).sort((a, b) => b.filled - a.filled || b.j - a.j)[0];
    qty = c ? c.j : (item === 0 ? 1 : 0);
  }
  let desc = byHead(OA.oh.RX.desc);
  if (desc < 0) { const c = stats.filter(s => s.j !== item && s.j !== qty && s.num < .3).sort((a, b) => b.len - a.len)[0]; desc = c && c.len > 8 ? c.j : -1; }
  let loc = byHead(OA.oh.RX.loc, OA.oh.RX.loc2); if ([item, qty, desc].includes(loc)) loc = -1;
  return {item, qty, desc, loc};
};
OA.oh.build = st => {
  const rows = OA.oh.rows(st), idx = new Map(), {item, qty, desc, loc} = st.map;
  let used = 0;
  for (let i = st.dataStart; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const raw = String(r[item] ?? "").trim(); if (!raw) continue;
    const key = OA.normItem(raw); if (!key) continue;
    const q = OA.num(r[qty]);
    let e = idx.get(key);
    if (!e) { e = {key, item: raw.replace(/\.0+$/, ""), desc: "", qty: 0, rows: [], locs: new Set(), hasQty: false}; idx.set(key, e); }
    else if (!st.sum && e.hasQty) { e.rows.push(i); continue; }
    if (q !== null) { e.qty += q; e.hasQty = true; }
    if (desc >= 0 && !e.desc && r[desc]) e.desc = String(r[desc]);
    if (loc >= 0 && r[loc]) e.locs.add(String(r[loc]));
    e.rows.push(i); used++;
  }
  st.index = idx; st.used = used;
  return st;
};
OA.oh.lookup = (st, item) => st && st.index ? st.index.get(OA.normItem(item)) : undefined;
OA.oh.fold = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
OA.oh.search = (st, query, mode) => {
  const q = String(query || "").trim(); if (!st || !st.index || !q) return null;
  const all = [...st.index.values()], LIMIT = 500;
  if (mode === "lista") {
    const keys = [...new Set(q.split(/[\s,;|]+/).map(s => s.trim()).filter(Boolean))];
    return {type: "agg", rows: keys.map(k => { const e = OA.oh.lookup(st, k); return e ? {...e, found: true} : {item: k, desc: "", qty: null, rows: [], locs: new Set(), found: false}; })};
  }
  if (mode === "fila") {
    const f = OA.oh.fold(q), rows = OA.oh.rows(st), out = [];
    for (let i = st.dataStart; i < rows.length && out.length < LIMIT; i++) if (rows[i] && rows[i].some(c => OA.oh.fold(c).includes(f))) out.push(i);
    return {type: "raw", rows: out, total: out.length};
  }
  let res;
  if (mode === "articulo") { const k = OA.normItem(q), exact = st.index.get(k); res = exact ? [exact] : all.filter(e => e.key.startsWith(k)); }
  else if (mode === "contiene") { const k = OA.normItem(q); res = all.filter(e => e.key.includes(k)); }
  else { const words = OA.oh.fold(q).split(/\s+/).filter(Boolean); res = all.filter(e => { const d = OA.oh.fold(e.desc); return words.every(w => d.includes(w)); }); }
  return {type: "agg", rows: res.slice(0, LIMIT).map(e => ({...e, found: true})), total: res.length};
};
OA.oh.serialize = st => st ? {fileName: st.fileName, loadedAt: st.loadedAt, sheets: st.sheets, sheet: st.sheet, header: st.header, map: st.map, sum: st.sum, startRow: st.startRow} : null;
OA.oh.restore = o => { if (!o || !o.sheets) return null; const st = {...o}; OA.oh.analyze(st, false); OA.oh.build(st); return st; };

/* ======================================================================
   Comparación contra Material OH
   ====================================================================== */
OA.LABEL = {verde: "Aprobar", rojo: "Shortage", naranja: "Revisión", gris: "Sin validar"};
OA.decide = (mail, p, oh) => {
  const days = OA.daysUntil(OA.parseOracleDate(p.rdd));
  const d = {estado: "gris", titulo: OA.LABEL.gris, motivo: "", critico: false, lineas: [], faltantes: [], days};
  const agg = new Map();
  p.items.forEach(it => { const k = OA.normItem(it.item), e = agg.get(k); if (e) e.qty += it.qty; else agg.set(k, {...it}); });
  d.lineas = [...agg.values()].map(it => {
    const e = oh ? OA.oh.lookup(oh, it.item) : undefined;
    const available = e && e.hasQty ? e.qty : (e ? 0 : null);
    const st = !oh ? "sin" : !e ? "nf" : available >= it.qty ? "ok" : "short";
    return {...it, desc: it.desc || (e && e.desc) || "", available, diff: available === null ? null : available - it.qty, st};
  });
  d.faltantes = d.lineas.filter(l => l.st === "short" || l.st === "nf");
  if (!p.bo) { d.estado = "rojo"; d.titulo = "Sin BO#"; d.motivo = "No se encontró BO# en el asunto."; return d; }
  if (p.tipo === 2) { d.estado = "naranja"; d.titulo = OA.LABEL.naranja; d.motivo = p.reasons.join(" · "); return d; }
  if (!oh) { d.estado = "gris"; d.motivo = "Material OH no cargado."; return d; }
  if (d.faltantes.length) {
    d.estado = "rojo"; d.titulo = OA.LABEL.rojo;
    d.critico = days !== null && days <= 7;
    const s = d.faltantes.filter(l => l.st === "short").length, n = d.faltantes.filter(l => l.st === "nf").length;
    d.motivo = [s ? `${s} artículo${s > 1 ? "s" : ""} sin existencia suficiente` : "", n ? `${n} artículo${n > 1 ? "s" : ""} no está${n > 1 ? "n" : ""} en el Material OH` : ""].filter(Boolean).join(" · ");
    return d;
  }
  d.estado = "verde"; d.titulo = OA.LABEL.verde; d.motivo = "Existencia suficiente en todos los artículos."; return d;
};

/* ======================================================================
   Respuestas rápidas
   ====================================================================== */
OA.VARS = ["BO","RDD","EVENTO","CLIENTE","REP","ASUNTO","REMITENTE","ARTICULOS","FALTANTES","MOTIVO","FECHA","FIRMA"];
OA.DEFAULT_TEMPLATES = [
  {id: "t-aprobada", nombre: "Aprobada", para: "verde", asunto: "RE: {ASUNTO}",
   cuerpo: "Hello,\n\nBO# {BO} has been reviewed. All requested items are available on hand and the order will be released to meet RDD {RDD}.\n\n{ARTICULOS}\n\nRegards,\n{FIRMA}"},
  {id: "t-shortage", nombre: "Shortage", para: "rojo", asunto: "RE: {ASUNTO}",
   cuerpo: "Hello,\n\nWe reviewed BO# {BO} (RDD {RDD}). The following items do not have enough on-hand inventory:\n\n{FALTANTES}\n\nPlease let us know if we should hold the order, ship partial, or substitute the items.\n\nRegards,\n{FIRMA}"},
  {id: "t-info", nombre: "Falta información", para: "rojo", asunto: "RE: {ASUNTO}",
   cuerpo: "Hello,\n\nWe could not process this request: {MOTIVO}. Please resend it with the BO# in the subject and one Item / Qty line per product in the body.\n\nRegards,\n{FIRMA}"},
  {id: "t-revision", nombre: "En revisión", para: "naranja", asunto: "RE: {ASUNTO}",
   cuerpo: "Hello,\n\nWe received your message about BO# {BO}. It is under review and we will follow up by {FECHA}.\n\nRegards,\n{FIRMA}"}
];
OA.fill = (tpl, mail, firma) => {
  const p = mail.parsed, d = mail.decision;
  const fmtLine = l => `- ${l.item}  Qty ${l.qty}${l.available === null ? "" : `  (OH ${l.available})`}${l.desc ? `  ${l.desc}` : ""}`;
  const next = new Date(); next.setDate(next.getDate() + (next.getDay() === 5 ? 3 : next.getDay() === 6 ? 2 : 1));
  const v = {BO: p.bo || "N/A", RDD: p.rdd || "N/A", EVENTO: p.eventDate || "N/A", CLIENTE: p.customer || "", REP: p.rep || "",
    ASUNTO: mail.subject, REMITENTE: mail.fromName, ARTICULOS: d.lineas.map(fmtLine).join("\n"),
    FALTANTES: d.faltantes.map(l => `- ${l.item}  requested ${l.qty}, on hand ${l.available ?? 0}${l.st === "nf" ? " (not found)" : ""}${l.desc ? `  ${l.desc}` : ""}`).join("\n") || "-",
    MOTIVO: d.motivo || "", FECHA: OA.fmtOracleDate(next), FIRMA: firma || "Order Approval Team"};
  const rep = s => String(s || "").replace(/\{(\w+)\}/g, (m, k) => v[k.toUpperCase()] !== undefined ? v[k.toUpperCase()] : m);
  return {asunto: rep(tpl.asunto).replace(/^(RE:\s*)+(RE:\s*)/i, "RE: "), cuerpo: rep(tpl.cuerpo)};
};
OA.textToHtml = t => "<div style=\"font-family:Calibri,Arial,sans-serif;font-size:11pt\">" + OA.esc(t).split(/\n{2,}/).map(par => "<p>" + par.replace(/\n/g, "<br>") + "</p>").join("") + "</div>";

/* ======================================================================
   Acciones (lo que ejecutan los flujos de Power Automate o la simulación)
   ====================================================================== */
OA.FOLDERS = {verde: "OA Aprobar", rojo: "OA Shortage", naranja: "OA Revision", gris: "OA Sin validar"};
OA.FLAGS = {verde: "complete", rojo: "flagged", naranja: "flagged", gris: "notFlagged"};
OA.CATS = {verde: "OA Verde", rojo: "OA Rojo", naranja: "OA Naranja", gris: "OA Gris"};
OA.makeAction = (kind, mail, extra = {}) => ({
  tipo: "OA-ACCION", version: 1, idAccion: OA.uid(), accion: kind,
  idCorreo: mail.id, internetMessageId: mail.internetMessageId || "", conversationId: mail.conversationId || "",
  bo: mail.parsed.bo || "", asuntoOriginal: mail.subject, remitente: mail.fromAddress || "",
  resultado: mail.decision.estado, bandera: OA.FLAGS[mail.decision.estado], carpetaDestino: OA.FOLDERS[mail.decision.estado], categoria: OA.CATS[mail.decision.estado],
  para: "", cc: "", asunto: "", cuerpoTexto: "", cuerpoHtml: "",
  enviarEn: new Date().toISOString(), creado: new Date().toISOString(), estado: "pendiente", ...extra
});
/* ======================================================================
   Interfaz tipo cliente de correo
   ====================================================================== */
OA.ICON = (() => {
  const p = {
    inbox: "M2 3h12l1 6v4H1V9zm1.2 1L2.4 8.5H5.5l1 1.5h3l1-1.5h3.1L12.8 4z",
    verde: "M3 1h1.5v14H3zM5.5 2h8l-2 3.5 2 3.5h-8z", rojo: "M3 1h1.5v14H3zM5.5 2h8l-2 3.5 2 3.5h-8z", naranja: "M3 1h1.5v14H3zM5.5 2h8l-2 3.5 2 3.5h-8z", gris: "M3 1h1.5v14H3zM5.5 2h8l-2 3.5 2 3.5h-8z",
    clock: "M8 1a7 7 0 110 14A7 7 0 018 1zm0 1.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM7.3 4h1.4v3.7l2.6 1.5-.7 1.2-3.3-1.9z",
    send: "M1 2l14 6-14 6 2-6zm2.6 5.3h5.6v1.4H3.6L2.8 11.4 11.6 8 2.8 4.6z",
    box: "M8 1l7 3.5v7L8 15l-7-3.5v-7zm0 1.6L3.2 5 8 7.4 12.8 5zM2.5 6.2v4.4l4.8 2.4V8.6zm11 0L8.7 8.6V13l4.8-2.4z",
    tpl: "M2 2h12v12H2zm1.5 1.5v9h9v-9zM5 5h6v1.4H5zm0 2.6h6V9H5zm0 2.6h4v1.4H5z",
    refresh: "M13.6 3.2V7H9.8l1.5-1.5A4.5 4.5 0 103.5 8H2a6 6 0 0110.3-4.1zM2.4 12.8V9h3.8l-1.5 1.5A4.5 4.5 0 0012.5 8H14a6 6 0 01-10.3 4.1z",
    folder: "M1 3h5l1.5 1.5H15V13H1zm1.5 3v5.5h11V6z",
    upload: "M7.3 2h1.4v7.2l2.5-2.5 1 1L8 11.9 3.8 7.7l1-1 2.5 2.5zM2 12.5h12V14H2z",
    reply: "M6.5 3v2.6C11 6 14 8.6 15 13c-1.6-2.3-4.3-3.4-8.5-3.4V12L1 7.5z",
    check: "M6.2 11.4L2.6 7.8l1-1 2.6 2.6 6.2-6.2 1 1z",
    tag: "M1 1h6.5L15 8.5 8.5 15 1 7.5zm3 2a1 1 0 100 2 1 1 0 000-2z",
    back: "M10.6 2l1 1-5 5 5 5-1 1-6-6z",
    search: "M6.5 1a5.5 5.5 0 014.4 8.8l4 4-1 1.1-4-4A5.5 5.5 0 116.5 1zm0 1.5a4 4 0 100 8 4 4 0 000-8z",
    plug: "M5 1h1.4v3h3.2V1H11v3h1.5v3.5A4.5 4.5 0 018.7 12v3H7.3v-3a4.5 4.5 0 01-3.8-4.5V4H5z",
    api: "M4.5 3L1 8l3.5 5 1.1-.8L2.7 8l2.9-4.2zm7 0l-1.1.8L13.3 8l-2.9 4.2 1.1.8L15 8zM9.2 2L5.4 14h1.4L10.6 2z",
    play: "M4 2l10 6-10 6z", pause: "M3 2h3.5v12H3zm6.5 0H13v12H9.5z",
    attach: "M10.5 3.5v7a2.5 2.5 0 01-5 0V3a1.5 1.5 0 013 0v6.5a.5.5 0 01-1 0V4H6.3v5.5a1.7 1.7 0 003.4 0V3a2.7 2.7 0 00-5.4 0v7.5a3.7 3.7 0 007.4 0v-7z",
    mail: "M1 3h14v10H1zm1.5 1.8v6.7h11V4.8L8 9.1zM3.3 4.5L8 7.8l4.7-3.3z",
    trash: "M5.5 1h5l.5 1.5H14V4H2V2.5h3zM3 5h10l-.8 10H3.8zm2.3 1.5l.4 7h1.2l-.2-7zm4.2 0l-.2 7h1.2l.4-7z",
    plus: "M7.3 2h1.4v5.3H14v1.4H8.7V14H7.3V8.7H2V7.3h5.3z",
    logo: "M2 3h12a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1zm.5 1.8v6.7h11V4.8L8 8.7zm1-.3L8 7.3l4.5-2.8zM10 9.2l1.2 1.2 2.6-2.6.8.8-3.4 3.4-2-2z"
  };
  return (name, cls = "") => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true"><path d="${p[name] || p.mail}"/></svg>`;
})();
OA.FLAG = estado => `<svg class="flag ${estado || ""}" viewBox="0 0 16 16" aria-hidden="true"><path d="${estado === "verde" ? "M6.2 11.4L2.6 7.8l1-1 2.6 2.6 6.2-6.2 1 1z" : "M3 1h1.5v14H3zM5.5 2h8l-2 3.5 2 3.5h-8z"}"/></svg>`;

const A = OA.app = {
  ver: "v1", adapter: null, mails: [], read: {}, actions: [], templates: [], settings: {firma: "", buzon: ""}, oh: null,
  folder: "inbox", selected: null, filter: "todos", q: "", comp: null, ohUI: {mode: "articulo", q: ""}, tplSel: null, _save: {},

  async start(adapter) {
    A.adapter = adapter; A.ver = adapter.id;
    document.body.innerHTML = `
      <div class="app">
        <header class="appbar">
          <div class="brand">${OA.ICON("logo")}<span class="name">Order Approval</span><span class="ver">${OA.esc(adapter.label)}</span></div>
          <label class="search">${OA.ICON("search")}<input id="q" type="search" autocomplete="off" placeholder="Buscar BO#, artículo, cliente o asunto" aria-label="Buscar"></label>
          <div class="status" id="status"></div>
        </header>
        <div class="cmdbar" id="cmdbar"></div>
        <div class="main" id="main">
          <nav class="nav" id="nav" aria-label="Carpetas"></nav>
          <section class="list" id="list" aria-label="Mensajes"></section>
          <section class="read" id="read" aria-label="Lectura"></section>
          <section class="view" id="view" hidden></section>
        </div>
      </div>
      <input type="file" id="ohFile" accept=".xlsx,.xlsm,.csv,.txt,.tsv,.xls" hidden>
      <div id="toast" class="toast" role="status" hidden></div>`;
    const [read, actions, templates, settings, oh] = await Promise.all([OA.db.get(`read:${A.ver}`), OA.db.get(`actions:${A.ver}`), OA.db.get("templates"), OA.db.get("settings"), OA.db.get(`oh:${A.ver}`)]);
    A.read = read || {}; A.actions = actions || []; A.templates = templates && templates.length ? templates : structuredClone(OA.DEFAULT_TEMPLATES);
    A.settings = {...A.settings, ...(settings || {})};
    try { A.oh = OA.oh.restore(oh); } catch (e) { A.oh = null; }
    A.bind();
    await adapter.init(A);
    A.render();
    if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register(adapter.sw || "../sw.js").catch(() => {});
  },

  /* ---------- datos ---------- */
  setMails(list) {
    const byId = new Map();
    list.forEach(m => { if (m && m.id) byId.set(m.id, m); });
    A.mails = [...byId.values()].sort((a, b) => new Date(b.received) - new Date(a.received));
    A.mails.forEach(A.enrich);
    if (A.selected && !byId.has(A.selected)) A.selected = null;
  },
  addMail(m) { A.enrich(m); A.mails = [m, ...A.mails.filter(x => x.id !== m.id)].sort((a, b) => new Date(b.received) - new Date(a.received)); },
  enrich(m) { m.parsed = OA.parseEmail(m); m.decision = OA.decide(m, m.parsed, A.oh); return m; },
  reclassify() { A.mails.forEach(m => m.decision = OA.decide(m, m.parsed, A.oh)); },
  save(key, value, delay = 250) { clearTimeout(A._save[key]); A._save[key] = setTimeout(() => OA.db.set(key, value), delay); },
  saveActions() { A.save(`actions:${A.ver}`, A.actions); },
  mail(id) { return A.mails.find(m => m.id === id); },
  actionsFor(id) { return A.actions.filter(a => a.idCorreo === id); },
  visibleMails() {
    const q = OA.oh.fold(A.q.trim());
    return A.mails.filter(m => {
      if (["verde","rojo","naranja","gris"].includes(A.folder) && m.decision.estado !== A.folder) return false;
      if (A.filter === "noleidos" && A.read[m.id]) return false;
      if (A.filter === "sinrespuesta" && A.actionsFor(m.id).some(a => a.accion === "responder" && a.estado !== "cancelada")) return false;
      if (!q) return true;
      return [m.subject, m.fromName, m.fromAddress, m.parsed.bo, m.parsed.customer, m.bodyText.slice(0, 4000), ...m.parsed.items.map(i => i.item)].some(s => OA.oh.fold(s).includes(q));
    });
  },

  /* ---------- acciones ---------- */
  async submit(action) {
    try {
      const done = await A.adapter.submitAction(A, action);
      A.actions.unshift(done || action); A.saveActions(); A.render();
      return true;
    } catch (e) { OA.toast(e.message || "No se pudo crear la acción"); return false; }
  },
  async cancel(idAccion) {
    const a = A.actions.find(x => x.idAccion === idAccion); if (!a) return;
    const ok = await A.adapter.cancelAction(A, a).catch(e => { OA.toast(e.message); return false; });
    if (ok) { a.estado = "cancelada"; A.saveActions(); A.render(); OA.toast("Acción cancelada"); }
  },
  classifyAll() {
    const pend = A.mails.filter(m => m.decision.estado !== "gris" && !A.actionsFor(m.id).some(a => a.accion === "clasificar" && a.estado !== "cancelada" && a.resultado === m.decision.estado));
    if (!pend.length) { OA.toast("Todo está clasificado"); return; }
    (async () => { for (const m of pend) { const a = OA.makeAction("clasificar", m); const done = await A.adapter.submitAction(A, a).catch(e => { OA.toast(e.message); return null; }); if (!done) break; A.actions.unshift(done); } A.saveActions(); A.render(); OA.toast(`${pend.length} correo${pend.length > 1 ? "s" : ""} enviados a clasificar`); })();
  },

  /* ---------- render ---------- */
  render() { A.renderStatus(); A.renderCmd(); A.renderNav(); const isView = !["inbox","verde","rojo","naranja","gris"].includes(A.folder); OA.$("#list").hidden = isView; OA.$("#read").hidden = isView; OA.$("#view").hidden = !isView; if (isView) A.renderView(); else { A.renderList(); A.renderRead(); } },
  renderStatus() { const s = A.adapter.status(A); OA.$("#status").innerHTML = `<span class="dot ${s.cls}"></span><span class="txt">${OA.esc(s.text)}</span>`; },
  renderCmd() {
    const cmds = [...A.adapter.commands(A), "|",
      {id: "oh-load", label: A.oh ? "Material OH" : "Cargar Material OH", icon: "box", primary: !A.oh},
      {id: "classify-all", label: "Clasificar en Outlook", icon: "tag", disabled: !A.mails.length}];
    OA.$("#cmdbar").innerHTML = cmds.map(c => c === "|" ? `<span class="sep"></span>` : `<button class="cmd${c.primary ? " primary" : ""}" data-cmd="${c.id}" type="button"${c.disabled ? " disabled" : ""}>${OA.ICON(c.icon)}<span>${OA.esc(c.label)}</span></button>`).join("");
  },
  renderNav() {
    const unread = f => A.mails.filter(m => !A.read[m.id] && (f === "inbox" || m.decision.estado === f)).length;
    const total = f => A.mails.filter(m => m.decision.estado === f).length;
    const prog = A.actions.filter(a => ["pendiente","programada"].includes(a.estado)).length, sent = A.actions.filter(a => ["enviada","procesada"].includes(a.estado)).length;
    const color = {verde: "var(--verde)", rojo: "var(--rojo)", naranja: "var(--naranja)", gris: "var(--gris)"};
    const f = (id, label, icon, n, nz) => `<button class="fold" type="button" data-folder="${id}" aria-current="${A.folder === id}">${icon}<span>${label}</span><span class="n${n ? "" : " z"}">${n || nz || ""}</span></button>`;
    OA.$("#nav").innerHTML = `
      <div class="grp">Order Approval</div>
      ${f("inbox", "Bandeja de entrada", OA.ICON("inbox"), unread("inbox"))}
      ${["verde","rojo","naranja","gris"].map(e => f(e, OA.LABEL[e], `<span class="sq" style="background:${color[e]}"></span>`, unread(e), total(e))).join("")}
      <div class="grp">Respuestas</div>
      ${f("programadas", "Programadas", OA.ICON("clock"), prog)}
      ${f("enviadas", "Enviadas", OA.ICON("send"), 0, sent)}
      <div class="grp">Herramientas</div>
      ${f("oh", "Material OH", OA.ICON("box"), 0, A.oh ? "✓" : "")}
      ${f("plantillas", "Respuestas rápidas", OA.ICON("tpl"), 0, A.templates.length)}
      ${A.adapter.views.map(v => f(v.id, v.label, OA.ICON(v.icon), 0, v.badge ? v.badge(A) : "")).join("")}`;
  },
  renderList() {
    const list = A.visibleMails(), title = A.folder === "inbox" ? "Bandeja de entrada" : OA.LABEL[A.folder];
    const groups = []; let last = "";
    list.forEach(m => {
      const d = new Date(m.received), dd = new Date(d); dd.setHours(0,0,0,0); const diff = Math.round((OA.today() - dd) / 86400000);
      const g = diff === 0 ? "Hoy" : diff === 1 ? "Ayer" : diff < 7 ? "Esta semana" : d.toLocaleDateString("es-MX", {month: "long", year: "numeric"});
      if (g !== last) { groups.push(`<div class="day">${g}</div>`); last = g; }
      groups.push(A.rowHtml(m));
    });
    OA.$("#list").innerHTML = `
      <header><h2>${OA.esc(title)}</h2><span class="muted" style="font-size:12.5px">${list.length}</span></header>
      <div class="pills" role="group" aria-label="Filtro">
        ${[["todos","Todos"],["noleidos","No leídos"],["sinrespuesta","Sin respuesta"]].map(([k, l]) => `<button class="pill-f" type="button" data-filter="${k}" aria-pressed="${A.filter === k}">${l}</button>`).join("")}
      </div>
      <div class="items" role="listbox" aria-label="Correos">${groups.join("") || `<div class="empty">${A.mails.length ? "Sin resultados" : A.adapter.emptyText(A)}</div>`}</div>`;
  },
  rowHtml(m) {
    const d = m.decision, p = m.parsed, unread = !A.read[m.id];
    const acts = A.actionsFor(m.id).filter(a => a.estado !== "cancelada");
    const reply = acts.find(a => a.accion === "responder"), cls = acts.find(a => a.accion === "clasificar");
    const prev = d.estado === "verde" ? `BO# ${p.bo} · ${d.lineas.length} artículo${d.lineas.length === 1 ? "" : "s"} · RDD ${p.rdd || "—"}` : `${p.bo ? `BO# ${p.bo} · ` : ""}${d.motivo}`;
    let tags = `<span class="cat ${d.estado}">${OA.esc(d.titulo)}</span>`;
    if (d.critico) tags += `<span class="cat rojo plain">Crítica</span>`;
    if (reply) tags += `<span class="cat azul plain">${["enviada","procesada"].includes(reply.estado) ? "Respondida" : new Date(reply.enviarEn) > new Date() ? "Programada " + OA.fmtTime(reply.enviarEn) : "En cola"}</span>`;
    if (cls && ["enviada","procesada"].includes(cls.estado)) tags += `<span class="cat gris plain">En Outlook</span>`;
    return `<div class="mi${unread ? " unread" : ""}" role="option" tabindex="0" data-id="${OA.esc(m.id)}" aria-selected="${A.selected === m.id}">
      <div class="av" style="background:${OA.avatarColor(m.fromName)}">${OA.esc(OA.initials(m.fromName))}</div>
      <div style="min-width:0"><div class="l1"><span class="from">${OA.esc(m.fromName)}</span><span class="time">${OA.fmtTime(m.received)}</span></div>
        <div class="subj">${OA.esc(m.subject || "(sin asunto)")}</div><div class="prev">${OA.esc(prev)}</div><div class="tags">${tags}</div></div>
      <div class="icons">${OA.FLAG(d.estado)}${m.hasAttachments ? OA.ICON("attach", "clip") : ""}</div></div>`;
  },
  renderRead() {
    const m = A.mail(A.selected), main = OA.$("#main");
    main.classList.toggle("reading", !!m);
    if (!m) { OA.$("#read").innerHTML = `<div class="empty" style="padding-top:80px">${OA.ICON("mail", "flag")}<br>Selecciona un correo</div>`; return; }
    const p = m.parsed, d = m.decision, days = d.days;
    const acts = A.actionsFor(m.id);
    const rows = d.lineas.map(l => `<tr class="${l.st === "short" || l.st === "nf" ? "hl" : ""}"><td class="mono">${OA.esc(l.item)}</td><td>${OA.esc(l.desc || "—")}</td><td class="num">${l.qty}</td><td class="num">${l.available === null ? "—" : l.available}</td><td class="num${l.diff !== null && l.diff < 0 ? " neg" : ""}">${l.diff === null ? "—" : (l.diff > 0 ? "+" : "") + l.diff}</td><td>${{ok: `<span class="cat verde">Disponible</span>`, short: `<span class="cat rojo">Faltan ${-l.diff}</span>`, nf: `<span class="cat rojo">No está en OH</span>`, sin: `<span class="cat gris">Sin OH</span>`}[l.st]}</td></tr>`).join("");
    const estadoTxt = a => ({pendiente: "En cola", programada: "Programada", enviada: "Enviada", procesada: "Aplicada", cancelada: "Cancelada", error: "Error"})[a.estado] || a.estado;
    OA.$("#read").innerHTML = `<div class="read-inner">
      <div class="acts"><button class="btn back" type="button" data-act="back">${OA.ICON("back")}Volver</button></div>
      <h1>${OA.esc(m.subject || "(sin asunto)")}</h1>
      <div class="hdr">
        <div class="av" style="background:${OA.avatarColor(m.fromName)}">${OA.esc(OA.initials(m.fromName))}</div>
        <div style="min-width:0"><div class="who">${OA.esc(m.fromName)} <span class="muted" style="font-weight:400">${m.fromAddress ? "&lt;" + OA.esc(m.fromAddress) + "&gt;" : ""}</span></div>
          <div class="meta">${m.to ? "Para: " + OA.esc(m.to) + " · " : ""}${OA.fmtFull(m.received)}</div></div>
        <div style="display:flex;gap:8px;align-items:center">${m.hasAttachments ? OA.ICON("attach", "clip") : ""}${OA.FLAG(d.estado)}</div>
      </div>
      <div class="acts">
        <button class="btn primary" type="button" data-act="reply">${OA.ICON("reply")}Responder rápido</button>
        <button class="btn" type="button" data-act="schedule">${OA.ICON("clock")}Programar respuesta</button>
        <button class="btn" type="button" data-act="classify">${OA.ICON("tag")}Clasificar en Outlook</button>
        <button class="btn" type="button" data-act="unread">${OA.ICON("mail")}${A.read[m.id] ? "Marcar como no leído" : "Marcar como leído"}</button>
      </div>
      ${A.comp && A.comp.mailId === m.id ? A.composerHtml(m) : ""}
      <div class="verdict ${d.estado}"><div class="bar"></div><div class="in">
        <div class="top"><span class="big">${OA.esc(d.titulo)}</span>${d.critico ? `<span class="cat rojo">Crítica · RDD en ${days} día${days === 1 ? "" : "s"}</span>` : ""}<span class="muted" style="font-size:13px">${OA.esc(d.motivo)}</span></div>
        <div class="kv">
          <div><span class="k">BO#</span><span class="v">${OA.esc(p.bo || "—")}</span></div>
          <div><span class="k">RDD</span><span class="v">${OA.esc(p.rdd || "—")}${days !== null ? ` · ${days < 0 ? `vencida ${-days} d` : `${days} d`}` : ""}</span></div>
          <div><span class="k">Event Date</span><span class="v">${OA.esc(p.eventDate || "—")}</span></div>
          <div><span class="k">Cliente</span><span class="v">${OA.esc(p.customer || "—")}</span></div>
          <div><span class="k">Rep</span><span class="v">${OA.esc(p.rep || "—")}</span></div>
          <div><span class="k">Tipo</span><span class="v">${p.tipo === 1 ? "Estándar" : "Complejo"}</span></div>
          <div><span class="k">Material OH</span><span class="v">${A.oh ? OA.esc(A.oh.fileName) : "—"}</span></div>
        </div>
        ${p.tipo === 2 && p.reasons.length ? `<ul class="reasons">${p.reasons.map(r => `<li>${OA.esc(r)}</li>`).join("")}</ul>` : ""}
      </div></div>
      ${d.lineas.length ? `<div class="tw"><table><thead><tr><th>Artículo</th><th>Descripción</th><th class="num">Pide</th><th class="num">OH</th><th class="num">Diferencia</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
      ${acts.length ? `<div class="tw"><table><thead><tr><th>Acción</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>${acts.map(a => `<tr><td>${a.accion === "responder" ? "Respuesta · " + OA.esc(a.asunto) : "Clasificación · " + OA.esc(a.categoria)}</td><td class="mono">${OA.fmtFull(a.enviarEn)}</td><td><span class="cat ${a.estado === "cancelada" || a.estado === "error" ? "gris" : ["enviada","procesada"].includes(a.estado) ? "verde" : "azul"}">${estadoTxt(a)}</span></td><td>${["pendiente","programada"].includes(a.estado) ? `<button class="btn sm danger" type="button" data-cancel="${a.idAccion}">Cancelar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <details class="orig"${d.lineas.length ? "" : " open"}><summary>Correo original</summary><div class="body-txt">${OA.esc(m.bodyText || "(sin contenido)")}</div></details>
    </div>`;
  },
  /* ---------- redactor ---------- */
  openComposer(m, schedule) {
    const tpl = A.templates.find(t => t.para === m.decision.estado && (m.parsed.bo || t.id !== "t-shortage")) || A.templates.find(t => !m.parsed.bo && t.id === "t-info") || A.templates[0];
    const pick = !m.parsed.bo ? (A.templates.find(t => t.id === "t-info") || tpl) : tpl;
    const f = pick ? OA.fill(pick, m, A.settings.firma) : {asunto: "RE: " + m.subject, cuerpo: ""};
    const when = new Date(Date.now() + 3600e3); when.setMinutes(0, 0, 0);
    const local = new Date(when - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    A.comp = {mailId: m.id, tplId: pick ? pick.id : "", para: m.fromAddress, asunto: f.asunto, cuerpo: f.cuerpo, when: local, schedule: !!schedule};
    A.renderRead();
    const el = OA.$(".composer textarea"); if (el) el.focus();
  },
  composerHtml(m) {
    const c = A.comp;
    return `<div class="composer" id="composer">
      <div class="row"><label for="c-tpl">Plantilla</label><select id="c-tpl">${A.templates.map(t => `<option value="${t.id}"${t.id === c.tplId ? " selected" : ""}>${OA.esc(t.nombre)}</option>`).join("")}</select></div>
      <div class="row"><label for="c-para">Para</label><input id="c-para" type="email" value="${OA.esc(c.para)}" autocomplete="off"></div>
      <div class="row"><label for="c-asunto">Asunto</label><input id="c-asunto" type="text" value="${OA.esc(c.asunto)}"></div>
      <textarea id="c-cuerpo" aria-label="Mensaje">${OA.esc(c.cuerpo)}</textarea>
      <div class="foot">
        <button class="btn primary" type="button" data-act="send-now">${OA.ICON("send")}Enviar</button>
        <span class="sep"></span>
        <input id="c-when" type="datetime-local" value="${c.when}" aria-label="Fecha y hora de envío">
        <button class="btn" type="button" data-act="send-later">${OA.ICON("clock")}Programar</button>
        <span class="grow"></span>
        <button class="btn" type="button" data-act="discard">${OA.ICON("trash")}Descartar</button>
      </div></div>`;
  },
  async sendComposer(later) {
    const m = A.mail(A.comp.mailId); if (!m) return;
    const para = OA.$("#c-para").value.trim(), asunto = OA.$("#c-asunto").value.trim(), cuerpo = OA.$("#c-cuerpo").value;
    if (!/^[^@\s]+@[^@\s]+$/.test(para.split(/[;,]/)[0].trim())) { OA.toast("Escribe un destinatario válido"); OA.$("#c-para").focus(); return; }
    if (!cuerpo.trim()) { OA.toast("El mensaje está vacío"); return; }
    let enviarEn = new Date();
    if (later) { enviarEn = new Date(OA.$("#c-when").value); if (isNaN(enviarEn) || enviarEn <= new Date()) { OA.toast("Elige una fecha y hora futura"); return; } }
    const a = OA.makeAction("responder", m, {para, asunto, cuerpoTexto: cuerpo, cuerpoHtml: OA.textToHtml(cuerpo), enviarEn: enviarEn.toISOString()});
    if (await A.submit(a)) { A.comp = null; A.renderRead(); OA.toast(later ? `Respuesta programada para ${OA.fmtFull(a.enviarEn)}` : "Respuesta enviada a la cola"); }
  },

  /* ---------- vistas completas ---------- */
  renderView() {
    const v = OA.$("#view"); OA.$("#main").classList.remove("reading");
    if (A.folder === "oh") return A.viewOH(v);
    if (A.folder === "plantillas") return A.viewTemplates(v);
    if (A.folder === "programadas" || A.folder === "enviadas") return A.viewActions(v);
    const ext = A.adapter.views.find(x => x.id === A.folder); if (ext) ext.render(v, A);
  },
  viewActions(v) {
    const done = A.folder === "enviadas";
    const list = A.actions.filter(a => done ? ["enviada","procesada","cancelada","error"].includes(a.estado) : ["pendiente","programada"].includes(a.estado))
      .sort((a, b) => done ? new Date(b.enviarEn) - new Date(a.enviarEn) : new Date(a.enviarEn) - new Date(b.enviarEn));
    const st = a => `<span class="cat ${a.estado === "cancelada" || a.estado === "error" ? "gris" : ["enviada","procesada"].includes(a.estado) ? "verde" : "azul"}">${({pendiente: "En cola", programada: "Programada", enviada: "Enviada", procesada: "Aplicada", cancelada: "Cancelada", error: "Error"})[a.estado]}</span>`;
    v.innerHTML = `<div class="view-inner"><h2>${done ? "Enviadas" : "Programadas"}</h2>
      ${list.length ? `<div class="tw"><table><thead><tr><th>${done ? "Fecha" : "Enviar"}</th><th>BO#</th><th>Acción</th><th>Para / Destino</th><th>Asunto</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map(a => `<tr><td class="mono">${OA.fmtFull(a.enviarEn)}</td><td class="mono">${OA.esc(a.bo || "—")}</td><td>${a.accion === "responder" ? "Respuesta" : "Clasificación"}</td>
        <td>${a.accion === "responder" ? OA.esc(a.para) : `<span class="cat ${a.resultado}">${OA.esc(a.categoria)}</span>`}</td><td>${OA.esc(a.accion === "responder" ? a.asunto : a.asuntoOriginal)}</td><td>${st(a)}</td>
        <td style="white-space:nowrap">${A.mail(a.idCorreo) ? `<button class="btn sm" type="button" data-open="${OA.esc(a.idCorreo)}">Abrir</button> ` : ""}${done ? "" : `<button class="btn sm danger" type="button" data-cancel="${a.idAccion}">Cancelar</button>`}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">${done ? "Sin envíos" : "Sin respuestas programadas"}</div>`}</div>`;
  },
  viewOH(v) {
    const st = A.oh, u = A.ohUI;
    if (!st) {
      v.innerHTML = `<div class="view-inner"><h2>Material OH</h2><div class="drop" id="drop"><span>Arrastra aquí el archivo Material OH (.xlsx o .csv)</span><button class="btn primary" type="button" data-cmd="oh-load">${OA.ICON("upload")}Cargar archivo</button></div></div>`;
      return;
    }
    const cols = OA.oh.columns(st), rows = OA.oh.rows(st), m = st.map;
    const colName = c => c.name ? `${c.letter} · ${c.name}` : `Columna ${c.letter}`;
    const opt = (k, allowNone) => `<select class="inp" id="map-${k}" data-map="${k}">${allowNone ? `<option value="-1"${m[k] < 0 ? " selected" : ""}>—</option>` : ""}${cols.map(c => `<option value="${c.i}"${m[k] === c.i ? " selected" : ""}>${OA.esc(colName(c))}</option>`).join("")}</select>`;
    const tagOf = i => ({[m.item]: "ART", [m.qty]: "OH", [m.desc]: "DESC", [m.loc]: "UBI"})[i];
    const prevRows = rows.slice(st.dataStart, st.dataStart + 8);
    const preview = `<div class="tw"><table><thead><tr><th class="num">#</th>${cols.map(c => `<th><span class="colhead">${tagOf(c.i) ? `<span class="tag">${tagOf(c.i)}</span>` : ""}${OA.esc(colName(c))}</span></th>`).join("")}</tr></thead><tbody>
      ${prevRows.map((r, k) => `<tr><td class="num">${st.dataStart + k + 1}</td>${cols.map(c => `<td${c.i === m.qty ? ' class="num"' : ""}>${OA.esc(r[c.i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    const res = OA.oh.search(st, u.q, u.mode);
    let results = "";
    if (res && res.type === "agg") {
      results = res.rows.length ? `<div class="tw"><table><thead><tr><th>Artículo</th><th>Descripción</th><th class="num">OH</th><th class="num">Filas</th><th>Ubicaciones</th></tr></thead><tbody>
        ${res.rows.map(e => `<tr${e.found ? "" : ' class="hl"'}><td class="mono">${OA.esc(e.item)}</td><td>${e.found ? OA.esc(e.desc || "—") : `<span class="cat rojo">No encontrado</span>`}</td><td class="num">${e.found ? (e.hasQty ? e.qty : "—") : "—"}</td><td class="num">${e.rows.length}</td><td>${OA.esc([...(e.locs || [])].slice(0, 6).join(", "))}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="empty">Sin resultados</div>`;
      if (res.total > res.rows.length) results = `<span class="muted" style="font-size:12.5px">${res.rows.length} de ${res.total}</span>` + results;
    } else if (res && res.type === "raw") {
      results = res.rows.length ? `<div class="tw"><table><thead><tr><th class="num">#</th>${cols.map(c => `<th>${OA.esc(colName(c))}</th>`).join("")}</tr></thead><tbody>
        ${res.rows.map(i => `<tr><td class="num">${i + 1}</td>${cols.map(c => `<td>${OA.esc(rows[i][c.i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<div class="empty">Sin resultados</div>`;
    }
    v.innerHTML = `<div class="view-inner">
      <h2>Material OH</h2>
      <div class="card"><div class="ch"><h3>${OA.esc(st.fileName)}</h3><span class="acts"><button class="btn sm" type="button" data-cmd="oh-load">${OA.ICON("upload")}Reemplazar</button><button class="btn sm danger" type="button" data-act="oh-clear">${OA.ICON("trash")}Quitar</button></span></div>
        <div class="cb"><div class="stats"><span>Cargado <b>${OA.fmtFull(st.loadedAt)}</b></span><span>Filas <b>${Math.max(0, rows.length - st.dataStart)}</b></span><span>Artículos <b>${st.index.size}</b></span><span>Encabezado <b>${st.hasHeader ? "Sí" : "No"}</b>${st.header === "auto" ? " (detectado)" : ""}</span></div></div></div>
      <div class="card"><div class="ch"><h3>Lectura del archivo</h3>
          <span class="seg" role="group" aria-label="Encabezado">${[["auto","Automático"],["si","Con encabezado"],["no","Sin encabezado"]].map(([k, l]) => `<button type="button" data-header="${k}" aria-pressed="${st.header === k}">${l}</button>`).join("")}</span></div>
        <div class="cb">
          <div class="fields">
            ${st.sheets.length > 1 ? `<div class="fld"><label for="oh-sheet">Hoja</label><select class="inp" id="oh-sheet">${st.sheets.map((s, i) => `<option value="${i}"${i === st.sheet ? " selected" : ""}>${OA.esc(s.name)} (${s.rows.length})</option>`).join("")}</select></div>` : ""}
            <div class="fld"><label for="map-item">Artículo</label>${opt("item")}</div>
            <div class="fld"><label for="map-qty">Cantidad OH</label>${opt("qty")}</div>
            <div class="fld"><label for="map-desc">Descripción</label>${opt("desc", true)}</div>
            <div class="fld"><label for="map-loc">Ubicación</label>${opt("loc", true)}</div>
            <div class="fld"><label for="oh-start">Primera fila de datos</label><input class="inp" id="oh-start" type="number" min="1" value="${st.dataStart + 1}"></div>
          </div>
          <label class="chk"><input type="checkbox" id="oh-sum"${st.sum ? " checked" : ""}> Sumar filas del mismo artículo</label>
          ${preview}
        </div></div>
      <div class="card"><div class="ch"><h3>Buscar</h3>
          <span class="seg" role="group" aria-label="Tipo de búsqueda">${[["articulo","Artículo"],["contiene","Contiene"],["descripcion","Descripción"],["lista","Lista"],["fila","Toda la fila"]].map(([k, l]) => `<button type="button" data-ohmode="${k}" aria-pressed="${u.mode === k}">${l}</button>`).join("")}</span></div>
        <div class="cb">
          ${u.mode === "lista" ? `<textarea class="inp" id="oh-q" placeholder="1012010774&#10;2000178214, 2000179048">${OA.esc(u.q)}</textarea>` : `<input class="inp" id="oh-q" type="search" value="${OA.esc(u.q)}" placeholder="${{articulo: "1012010774", contiene: "0107", descripcion: "gown garnet", fila: "Texto en cualquier columna"}[u.mode]}">`}
          <div id="oh-res">${results}</div>
        </div></div>
    </div>`;
  },
  ohChanged(remap) {
    OA.oh.analyze(A.oh, remap); OA.oh.build(A.oh); A.reclassify();
    OA.db.set(`oh:${A.ver}`, OA.oh.serialize(A.oh)); A.render();
  },
  async loadOH(file) {
    try {
      OA.toast("Leyendo " + file.name + "…");
      const st = await OA.oh.load(file); OA.oh.build(st);
      if (!st.index.size) throw new Error("No se encontraron artículos. Revisa las columnas en Material OH.");
      A.oh = st; A.reclassify(); await OA.db.set(`oh:${A.ver}`, OA.oh.serialize(st));
      OA.toast(`Material OH cargado: ${st.index.size} artículos`); A.render();
    } catch (e) { OA.toast(e.message || "No se pudo leer el archivo"); }
  },
  viewTemplates(v) {
    if (!A.tplSel || !A.templates.find(t => t.id === A.tplSel)) A.tplSel = A.templates[0] && A.templates[0].id;
    const t = A.templates.find(x => x.id === A.tplSel);
    v.innerHTML = `<div class="view-inner"><h2>Respuestas rápidas</h2>
      <div class="fields"><div class="fld"><label for="set-firma">Firma</label><input class="inp" id="set-firma" value="${OA.esc(A.settings.firma)}" placeholder="Order Approval Team"></div></div>
      <div class="tpl"><div class="tl">${A.templates.map(x => `<button type="button" data-tpl="${x.id}" aria-current="${x.id === A.tplSel}">${x.para && OA.LABEL[x.para] ? `<span class="sq" style="width:10px;height:10px;border-radius:2px;background:var(--${x.para})"></span>` : ""}${OA.esc(x.nombre)}</button>`).join("")}
          <div style="padding:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="tpl-new">${OA.ICON("plus")}Nueva</button><button class="btn sm" type="button" data-act="tpl-reset">Restablecer</button></div></div>
        ${t ? `<div class="te">
          <div class="fields"><div class="fld"><label for="tpl-nombre">Nombre</label><input class="inp" id="tpl-nombre" data-tf="nombre" value="${OA.esc(t.nombre)}"></div>
            <div class="fld"><label for="tpl-para">Sugerir para</label><select class="inp" id="tpl-para" data-tf="para"><option value="">—</option>${Object.entries(OA.LABEL).map(([k, l]) => `<option value="${k}"${t.para === k ? " selected" : ""}>${l}</option>`).join("")}</select></div></div>
          <div class="fld"><label for="tpl-asunto">Asunto</label><input class="inp" id="tpl-asunto" data-tf="asunto" value="${OA.esc(t.asunto)}"></div>
          <div class="fld"><label for="tpl-cuerpo">Mensaje</label><textarea class="inp" id="tpl-cuerpo" data-tf="cuerpo" style="min-height:220px">${OA.esc(t.cuerpo)}</textarea></div>
          <div class="vars">${OA.VARS.map(k => `<button type="button" data-var="${k}">{${k}}</button>`).join("")}</div>
          <div><button class="btn sm danger" type="button" data-act="tpl-del">${OA.ICON("trash")}Eliminar</button></div>
        </div>` : ""}</div></div>`;
  },

  /* ---------- eventos ---------- */
  bind() {
    const go = folder => { A.folder = folder; A.comp = null; if (!["inbox","verde","rojo","naranja","gris"].includes(folder)) A.selected = null; A.render(); };
    const open = id => { A.selected = id; if (A.comp && A.comp.mailId !== id) A.comp = null; A.read[id] = true; A.save(`read:${A.ver}`, A.read); A.renderNav(); A.renderList(); A.renderRead(); OA.$("#read").scrollTop = 0; };
    document.addEventListener("click", async e => {
      const t = e.target.closest("button,[data-id],[data-open]"); if (!t) return;
      const ds = t.dataset;
      if (ds.folder) return go(ds.folder);
      if (ds.filter) { A.filter = ds.filter; return A.renderList(); }
      if (ds.id && t.classList.contains("mi")) return open(ds.id);
      if (ds.open) { A.folder = "inbox"; A.filter = "todos"; A.render(); return open(ds.open); }
      if (ds.cancel) return A.cancel(ds.cancel);
      if (ds.cmd) {
        if (ds.cmd === "oh-load") return OA.$("#ohFile").click();
        if (ds.cmd === "classify-all") return A.classifyAll();
        return A.adapter.command(A, ds.cmd);
      }
      if (ds.header && A.oh) { A.oh.header = ds.header; A.oh.startRow = null; return A.ohChanged(true); }
      if (ds.ohmode) { A.ohUI.mode = ds.ohmode; A.render(); const q = OA.$("#oh-q"); if (q) q.focus(); return; }
      if (ds.tpl) { A.tplSel = ds.tpl; return A.render(); }
      if (ds.var) { const ta = OA.$("#tpl-cuerpo"); if (!ta) return; const s = ta.selectionStart, txt = `{${ds.var}}`; ta.setRangeText(txt, s, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input", {bubbles: true})); ta.focus(); return; }
      const m = A.mail(A.selected);
      switch (ds.act) {
        case "back": A.selected = null; A.comp = null; A.renderList(); A.renderRead(); break;
        case "reply": if (m) A.openComposer(m, false); break;
        case "schedule": if (m) { A.openComposer(m, true); const w = OA.$("#c-when"); if (w) w.focus(); } break;
        case "discard": A.comp = null; A.renderRead(); break;
        case "send-now": A.sendComposer(false); break;
        case "send-later": A.sendComposer(true); break;
        case "classify": if (m) { if (m.decision.estado === "gris") { OA.toast("Carga el Material OH para clasificar"); break; } const a = OA.makeAction("clasificar", m); if (await A.submit(a)) OA.toast(`Clasificación enviada: ${a.categoria}`); } break;
        case "unread": if (m) { A.read[m.id] = !A.read[m.id]; A.save(`read:${A.ver}`, A.read); A.renderNav(); A.renderList(); A.renderRead(); } break;
        case "oh-clear": A.oh = null; await OA.db.del(`oh:${A.ver}`); A.reclassify(); A.render(); OA.toast("Material OH quitado"); break;
        case "tpl-new": { const n = {id: "t-" + OA.uid(), nombre: "Nueva respuesta", para: "", asunto: "RE: {ASUNTO}", cuerpo: "Hello,\n\n\n\nRegards,\n{FIRMA}"}; A.templates.push(n); A.tplSel = n.id; OA.db.set("templates", A.templates); A.render(); break; }
        case "tpl-del": if (A.templates.length > 1) { A.templates = A.templates.filter(x => x.id !== A.tplSel); A.tplSel = null; OA.db.set("templates", A.templates); A.render(); } break;
        case "tpl-reset": A.templates = structuredClone(OA.DEFAULT_TEMPLATES); A.tplSel = null; OA.db.set("templates", A.templates); A.render(); OA.toast("Plantillas restablecidas"); break;
        default: if (ds.act && A.adapter.action) A.adapter.action(A, ds.act, t);
      }
    });
    document.addEventListener("keydown", e => {
      const row = e.target.closest && e.target.closest(".mi");
      if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(row.dataset.id); }
      if (row && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); const sib = e.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling; const next = sib && (sib.classList.contains("mi") ? sib : (e.key === "ArrowDown" ? sib.nextElementSibling : sib.previousElementSibling)); if (next && next.classList.contains("mi")) next.focus(); }
    });
    let qT;
    document.addEventListener("input", e => {
      const el = e.target;
      if (el.id === "q") { clearTimeout(qT); qT = setTimeout(() => { A.q = el.value; if (!["inbox","verde","rojo","naranja","gris"].includes(A.folder)) A.folder = "inbox"; A.render(); OA.$("#q").focus(); }, 180); return; }
      if (el.id === "oh-q") { A.ohUI.q = el.value; clearTimeout(qT); qT = setTimeout(() => { const pos = el.selectionStart; A.render(); const n = OA.$("#oh-q"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } }, 200); return; }
      if (el.id === "set-firma") { A.settings.firma = el.value; A.save("settings", A.settings); return; }
      if (el.dataset.tf) { const t = A.templates.find(x => x.id === A.tplSel); if (t) { t[el.dataset.tf] = el.value; A.save("templates", A.templates); if (el.dataset.tf === "nombre") { const b = OA.$(`[data-tpl="${A.tplSel}"]`); if (b) b.lastChild.textContent = el.value; } } return; }
      if (A.comp && ["c-para","c-asunto","c-cuerpo","c-when"].includes(el.id)) A.comp[el.id.slice(2)] = el.value;
    });
    document.addEventListener("change", e => {
      const el = e.target;
      if (el.id === "ohFile") { const f = el.files[0]; if (f) A.loadOH(f); el.value = ""; return; }
      if (el.id === "oh-sheet") { A.oh.sheet = +el.value; A.oh.startRow = null; A.oh.header = "auto"; return A.ohChanged(true); }
      if (el.dataset.map) { A.oh.map[el.dataset.map] = +el.value; OA.oh.build(A.oh); A.reclassify(); OA.db.set(`oh:${A.ver}`, OA.oh.serialize(A.oh)); return A.render(); }
      if (el.id === "oh-start") { const n = parseInt(el.value, 10); A.oh.startRow = n > 0 ? n : null; return A.ohChanged(false); }
      if (el.id === "oh-sum") { A.oh.sum = el.checked; OA.oh.build(A.oh); A.reclassify(); OA.db.set(`oh:${A.ver}`, OA.oh.serialize(A.oh)); return A.render(); }
      if (el.dataset.tf === "para") { A.render(); return; }
      if (el.id === "c-tpl" && A.comp) {
        const m = A.mail(A.comp.mailId), t = A.templates.find(x => x.id === el.value); if (!m || !t) return;
        const f = OA.fill(t, m, A.settings.firma); Object.assign(A.comp, {tplId: t.id, asunto: f.asunto, cuerpo: f.cuerpo});
        OA.$("#c-asunto").value = f.asunto; OA.$("#c-cuerpo").value = f.cuerpo;
      }
    });
    ["dragover","dragenter"].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } }));
    ["dragleave","drop"].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); if (ev === "drop" && e.dataTransfer.files[0]) A.loadOH(e.dataTransfer.files[0]); } }));
    window.addEventListener("dragover", e => e.preventDefault());
    window.addEventListener("drop", e => {
      e.preventDefault();
      const files = e.dataTransfer ? [...e.dataTransfer.files] : []; if (!files.length || (e.target.closest && e.target.closest("#drop"))) return;
      const oh = files.find(f => /\.(xlsx|xlsm|xls|csv|tsv)$/i.test(f.name)), rest = files.filter(f => f !== oh);
      if (oh) A.loadOH(oh);
      if (rest.length && A.adapter.dropFiles) A.adapter.dropFiles(A, rest);
    });
  }
};
