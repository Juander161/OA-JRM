/* Order Approval · V1 sin API
   Lee los correos que un flujo de Power Automate guarda en una carpeta de OneDrive
   y deja las respuestas y clasificaciones como archivos para otro flujo. */
"use strict";
(() => {
  const MAIL_EXT = /\.(json|eml|html?|txt)$/i;
  const S = {root: null, mailDir: null, perm: "none", mode: "none", lastRefresh: null, auto: true, timer: null, cache: new Map(), counts: {}, filesMails: []};
  const fsSupported = "showDirectoryPicker" in window;

  const fileName = a => {
    const d = new Date(a.enviarEn), p = n => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}_${a.accion}_${a.bo || "sinBO"}_${a.idAccion}.json`;
  };
  const sub = async (dir, name, create) => { try { return await dir.getDirectoryHandle(name, {create}); } catch (e) { return null; } };
  const listFiles = async dir => { const out = []; if (!dir) return out; for await (const h of dir.values()) if (h.kind === "file") out.push(h); return out; };

  async function useRoot(A, handle) {
    S.root = handle; S.mode = "carpeta";
    S.mailDir = (await sub(handle, "Correos", false)) || handle;
    await OA.db.set("v1:dir", handle);
    await refresh(A);
  }
  async function connect(A) {
    if (!fsSupported) { OA.$("#v1files").click(); return; }
    try { const h = await window.showDirectoryPicker({id: "order-approval", mode: "readwrite"}); S.perm = "granted"; await useRoot(A, h); OA.toast("Carpeta conectada: " + h.name); }
    catch (e) { if (e.name !== "AbortError") OA.toast(e.message); }
  }
  async function reconnect(A) {
    if (!S.root) return connect(A);
    try { S.perm = await S.root.requestPermission({mode: "readwrite"}); if (S.perm === "granted") await useRoot(A, S.root); else A.render(); } catch (e) { OA.toast(e.message); }
  }

  async function readMails() {
    const files = await listFiles(S.mailDir), seen = new Set(), mails = [];
    for (const h of files) {
      if (!MAIL_EXT.test(h.name)) continue;
      const f = await h.getFile(), key = h.name + "|" + f.lastModified + "|" + f.size; seen.add(key);
      if (!S.cache.has(key)) S.cache.set(key, OA.mail.fromFile(h.name, await f.text(), f.lastModified));
      mails.push(...S.cache.get(key));
    }
    for (const k of S.cache.keys()) if (!seen.has(k)) S.cache.delete(k);
    S.counts.correos = mails.length;
    return mails;
  }
  async function syncActions(A) {
    const acc = await sub(S.root, "Acciones", true), proc = acc && await sub(acc, "Procesadas", true), err = acc && await sub(acc, "Errores", true);
    const where = new Map();
    for (const [dir, st] of [[acc, "cola"], [proc, "hecha"], [err, "error"]]) for (const h of await listFiles(dir)) if (/\.json$/i.test(h.name)) where.set(h.name, {st, h});
    S.counts.cola = [...where.values()].filter(x => x.st === "cola").length;
    S.counts.hechas = [...where.values()].filter(x => x.st === "hecha").length;
    const known = new Set(A.actions.map(a => a.archivo));
    for (const [name, {h}] of where) {
      if (known.has(name)) continue;
      try { const a = JSON.parse(await (await h.getFile()).text()); if (a && a.tipo === "OA-ACCION" && !A.actions.some(x => x.idAccion === a.idAccion)) { a.archivo = name; A.actions.push(a); } } catch (e) {}
    }
    for (const a of A.actions) {
      if (!a.archivo || a.estado === "cancelada") continue;
      const w = where.get(a.archivo);
      if (!w) { if (["pendiente","programada"].includes(a.estado) && a.escrita) a.estado = a.accion === "responder" ? "enviada" : "procesada"; continue; }
      a.escrita = true;
      a.estado = w.st === "hecha" ? (a.accion === "responder" ? "enviada" : "procesada") : w.st === "error" ? "error" : new Date(a.enviarEn) > new Date() ? "programada" : "pendiente";
    }
    A.actions.sort((a, b) => new Date(b.creado) - new Date(a.creado));
    A.saveActions();
  }
  async function refresh(A, quiet) {
    try {
      if (S.mode === "carpeta" && S.root) {
        S.perm = await S.root.queryPermission({mode: "readwrite"});
        if (S.perm !== "granted") { A.render(); return; }
        A.setMails(await readMails());
        await syncActions(A);
      } else if (S.mode === "archivos") A.setMails(S.filesMails);
      S.lastRefresh = new Date();
      A.render();
      if (!quiet) OA.toast(`${A.mails.length} correo${A.mails.length === 1 ? "" : "s"}`);
    } catch (e) { OA.toast(e.message || "No se pudo leer la carpeta"); }
  }
  async function loadFiles(A, files) {
    const mails = [];
    for (const f of files) {
      if (!MAIL_EXT.test(f.name)) continue;
      const rel = f.webkitRelativePath || "";
      if (rel && /\/Acciones\//i.test(rel)) continue;
      mails.push(...OA.mail.fromFile(f.name, await f.text(), f.lastModified));
    }
    if (!mails.length) { OA.toast("No se encontraron correos (.json, .eml, .html o .txt)"); return; }
    const byId = new Map([...S.filesMails, ...mails].map(m => [m.id, m]));
    S.filesMails = [...byId.values()]; S.mode = S.mode === "carpeta" ? "carpeta" : "archivos";
    await OA.db.set("v1:mails", S.filesMails.map(({parsed, decision, ...m}) => m));
    if (S.mode === "archivos") A.setMails(S.filesMails); else S.filesMails.forEach(m => A.addMail(m));
    S.lastRefresh = new Date(); A.render(); OA.toast(`${mails.length} correo${mails.length === 1 ? "" : "s"} cargados`);
  }
  async function loadExamples(A) {
    try {
      const [txt, oh] = await Promise.all([fetch("../ejemplos/correos.json").then(r => r.text()), fetch("../ejemplos/Material_OH_con_encabezado.csv").then(r => r.blob())]);
      const mails = JSON.parse(txt.replace(/\{D\+(\d+)\}/g, (_, n) => { const d = OA.today(); d.setDate(d.getDate() + +n); return OA.fmtOracleDate(d); }));
      const shift = Date.now() - Math.max(...mails.map(m => +new Date(m.receivedDateTime)));
      const list = mails.map((o, i) => { const m = OA.mail.fromObject({...o, receivedDateTime: new Date(+new Date(o.receivedDateTime) + shift).toISOString()}, `ejemplo-${i}.json`); return m; });
      if (!A.oh) await A.loadOH(new File([oh], "Material_OH_con_encabezado.csv"));
      S.filesMails = list; S.mode = S.mode === "carpeta" ? "carpeta" : "archivos";
      await OA.db.set("v1:mails", list.map(({parsed, decision, ...m}) => m));
      if (S.mode === "archivos") A.setMails(list); else list.forEach(m => A.addMail(m));
      A.render();
    } catch (e) { OA.toast("Los ejemplos solo cargan desde el sitio publicado"); }
  }

  const adapter = {
    id: "v1", label: "V1 · Sin API", sw: "../sw.js",
    async init(A) {
      const inp = document.createElement("input"); inp.type = "file"; inp.id = "v1files"; inp.multiple = true; inp.accept = ".json,.eml,.html,.htm,.txt"; inp.hidden = true;
      const dirInp = document.createElement("input"); dirInp.type = "file"; dirInp.id = "v1dir"; dirInp.webkitdirectory = true; dirInp.multiple = true; dirInp.hidden = true;
      document.body.append(inp, dirInp);
      [inp, dirInp].forEach(el => el.addEventListener("change", () => { if (el.files.length) loadFiles(A, [...el.files]); el.value = ""; }));
      const saved = await OA.db.get("v1:settings"); if (saved) S.auto = saved.auto !== false;
      const stored = await OA.db.get("v1:mails"); if (stored && stored.length) { S.filesMails = stored; S.mode = "archivos"; A.setMails(stored); }
      const h = await OA.db.get("v1:dir");
      if (h && h.queryPermission) {
        S.root = h; S.mode = "carpeta"; S.mailDir = (await sub(h, "Correos", false).catch(() => null)) || h;
        S.perm = await h.queryPermission({mode: "readwrite"}).catch(() => "prompt");
        if (S.perm === "granted") await refresh(A, true);
      }
      S.timer = setInterval(() => { if (S.auto && S.mode === "carpeta" && S.perm === "granted" && document.visibilityState === "visible") refresh(A, true); }, 60000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.mode === "carpeta" && S.perm === "granted") refresh(A, true); });
    },
    status() {
      if (S.mode === "carpeta" && S.perm === "granted") return {cls: "ok", text: `${S.root.name} · ${S.lastRefresh ? OA.fmtTime(S.lastRefresh) : ""}`};
      if (S.mode === "carpeta") return {cls: "warn", text: "Permiso de carpeta pendiente"};
      if (S.mode === "archivos") return {cls: "warn", text: "Archivos locales"};
      return {cls: "off", text: "Sin carpeta"};
    },
    commands() {
      const needPerm = S.mode === "carpeta" && S.perm !== "granted";
      return [
        {id: "v1-refresh", label: "Actualizar", icon: "refresh", disabled: S.mode === "none"},
        needPerm ? {id: "v1-reconnect", label: "Permitir acceso", icon: "plug", primary: true} : {id: "v1-connect", label: S.root ? "Cambiar carpeta" : "Conectar carpeta", icon: "folder", primary: S.mode === "none"},
        {id: "v1-files", label: "Abrir archivos", icon: "upload"}
      ];
    },
    async command(A, id) {
      if (id === "v1-refresh") return refresh(A);
      if (id === "v1-connect") return connect(A);
      if (id === "v1-reconnect") return reconnect(A);
      if (id === "v1-files") return OA.$("#v1files").click();
    },
    async action(A, act) {
      if (act === "v1-dirinput") OA.$("#v1dir").click();
      if (act === "v1-examples") loadExamples(A);
      if (act === "v1-forget") { await OA.db.del("v1:dir"); await OA.db.del("v1:mails"); S.root = null; S.mailDir = null; S.mode = "none"; S.perm = "none"; S.filesMails = []; A.setMails([]); A.render(); }
      if (act === "v1-auto") { S.auto = !S.auto; OA.db.set("v1:settings", {auto: S.auto}); A.render(); }
    },
    dropFiles(A, files) { loadFiles(A, files); },
    emptyText() { return S.mode === "carpeta" && S.perm !== "granted" ? "Permite el acceso a la carpeta" : "Conecta la carpeta de correos"; },
    async submitAction(A, action) {
      action.buzon = A.settings.buzon || "";
      action.archivo = fileName(action);
      action.estado = new Date(action.enviarEn) > new Date() ? "programada" : "pendiente";
      if (S.mode === "carpeta" && S.perm === "granted") {
        const acc = await sub(S.root, "Acciones", true);
        const fh = await acc.getFileHandle(action.archivo, {create: true}), w = await fh.createWritable();
        const {estado, escrita, archivo, ...payload} = action;
        await w.write(JSON.stringify(payload, null, 2)); await w.close();
        action.escrita = true;
      } else {
        const {estado, escrita, archivo, ...payload} = action;
        OA.download(action.archivo, JSON.stringify(payload, null, 2));
        OA.toast("Guarda el archivo en la carpeta Acciones");
      }
      return action;
    },
    async cancelAction(A, action) {
      if (S.mode === "carpeta" && S.perm === "granted") {
        const acc = await sub(S.root, "Acciones", false);
        try { await acc.removeEntry(action.archivo); return true; }
        catch (e) { await syncActions(A); A.render(); OA.toast("La acción ya fue procesada"); return false; }
      }
      return true;
    },
    views: [{
      id: "conexion", label: "Conexión", icon: "plug",
      render(v, A) {
        const row = (k, val) => `<div><span class="k">${k}</span><span class="v">${val}</span></div>`;
        v.innerHTML = `<div class="view-inner"><h2>Conexión</h2>
          <div class="card"><div class="ch"><h3>Carpeta</h3><span class="acts">
            ${fsSupported ? `<button class="btn primary sm" type="button" data-cmd="v1-connect">${OA.ICON("folder")}${S.root ? "Cambiar carpeta" : "Conectar carpeta"}</button>` : ""}
            <button class="btn sm" type="button" data-act="v1-dirinput">${OA.ICON("upload")}Abrir carpeta (solo lectura)</button>
            <button class="btn sm" type="button" data-act="v1-examples">Cargar ejemplos</button>
            ${S.mode !== "none" ? `<button class="btn sm danger" type="button" data-act="v1-forget">Desconectar</button>` : ""}</span></div>
            <div class="cb"><div class="kv">
              ${row("Modo", S.mode === "carpeta" ? "Carpeta conectada" : S.mode === "archivos" ? "Archivos locales" : "—")}
              ${row("Carpeta", S.root ? OA.esc(S.root.name) : "—")}
              ${row("Permiso", S.mode === "carpeta" ? (S.perm === "granted" ? "Lectura y escritura" : "Pendiente") : "—")}
              ${row("Correos", S.mode === "carpeta" && S.mailDir ? `${OA.esc(S.mailDir === S.root ? S.root.name : "Correos")} · ${S.counts.correos ?? 0}` : A.mails.length)}
              ${row("Acciones en cola", S.counts.cola ?? "—")}
              ${row("Procesadas", S.counts.hechas ?? "—")}
              ${row("Última lectura", S.lastRefresh ? OA.fmtFull(S.lastRefresh) : "—")}
            </div>
            <label class="chk"><input type="checkbox" data-act="v1-auto"${S.auto ? " checked" : ""} onclick="event.preventDefault()"> Actualizar cada minuto</label>
            </div></div>
          <div class="card"><div class="ch"><h3>Buzón</h3></div><div class="cb"><div class="fields">
            <div class="fld"><label for="set-buzon">Buzón compartido</label><input class="inp" id="set-buzon" type="email" value="${OA.esc(A.settings.buzon)}" placeholder="orderapproval@empresa.com"></div></div></div></div>
          <div class="card"><div class="ch"><h3>Estructura</h3></div><div class="cb"><div class="body-txt" style="border:0;padding:0">OrderApproval/
├── Correos/              ← Flujo OA-1
├── Acciones/             ← esta página
│   ├── Procesadas/       ← Flujo OA-2
│   └── Errores/          ← Flujo OA-2
└── Material OH.xlsx</div></div></div>
        </div>`;
        const b = OA.$("#set-buzon"); if (b) b.addEventListener("input", () => { A.settings.buzon = b.value.trim(); A.save("settings", A.settings); });
        const c = v.querySelector('[data-act="v1-auto"]'); if (c) c.parentElement.addEventListener("click", ev => { ev.preventDefault(); adapter.action(A, "v1-auto"); });
      }
    }]
  };
  OA.app.start(adapter);
})();
