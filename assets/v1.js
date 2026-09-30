/* Order Approval · V1 sin API
   Lee los correos que un flujo de Power Automate guarda en una carpeta de OneDrive,
   compara los correos sencillos contra el Material OH y registra el resultado en
   OrderApproval/Resultados/Resultados_OrderApproval.xlsx.
   No responde correos ni los marca en Outlook. */
"use strict";
(() => {
  const MAIL_EXT = /\.(json|eml|html?|txt)$/i;
  const REG_JSON = "registro.json";
  const S = {root: null, mailDir: null, perm: "none", mode: "none", lastRefresh: null, auto: true, timer: null, cache: new Map(), counts: {}, filesMails: []};
  const fsSupported = "showDirectoryPicker" in window;

  OA.LABEL.naranja = "Complejo";

  const sub = async (dir, name, create) => { try { return await dir.getDirectoryHandle(name, {create}); } catch (e) { return null; } };
  const listFiles = async dir => { const out = []; if (!dir) return out; for await (const h of dir.values()) if (h.kind === "file") out.push(h); return out; };
  const canWrite = () => S.mode === "carpeta" && S.root && S.perm === "granted";
  const writeFile = async (dir, name, data) => { const fh = await dir.getFileHandle(name, {create: true}), w = await fh.createWritable(); await w.write(data); await w.close(); };

  /* Registro: registro.json (fuente) + Resultados_OrderApproval.xlsx (se regenera completo) */
  async function loadRegistro(A) {
    const dir = await sub(S.root, "Resultados", false); if (!dir) return;
    try { const f = await (await dir.getFileHandle(REG_JSON)).getFile(); A.mergeRegistro(JSON.parse(await f.text())); } catch (e) {}
  }

  async function useRoot(A, handle) {
    S.root = handle; S.mode = "carpeta";
    S.mailDir = (await sub(handle, "Correos", false)) || handle;
    await OA.db.set("v1:dir", handle);
    await loadRegistro(A);
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
  async function refresh(A, quiet) {
    try {
      if (S.mode === "carpeta" && S.root) {
        S.perm = await S.root.queryPermission({mode: "readwrite"});
        if (S.perm !== "granted") { A.render(); return; }
        A.setMails(await readMails());
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
      if (rel && /\/(Acciones|Resultados)\//i.test(rel)) continue;
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
      // Los ejemplos se marcan para que nunca entren al registro real
      const list = mails.map((o, i) => Object.assign(OA.mail.fromObject({...o, receivedDateTime: new Date(+new Date(o.receivedDateTime) + shift).toISOString()}, `ejemplo-${i}.json`), {ejemplo: true}));
      if (!A.oh) await A.loadOH(new File([oh], "Material_OH_con_encabezado.csv"));
      S.filesMails = list; S.mode = S.mode === "carpeta" ? "carpeta" : "archivos";
      await OA.db.set("v1:mails", list.map(({parsed, decision, ...m}) => m));
      if (S.mode === "archivos") A.setMails(list); else list.forEach(m => A.addMail(m));
      A.render();
      OA.toast("Ejemplos cargados (no se registran en el Excel)");
    } catch (e) { OA.toast("Los ejemplos solo cargan desde el sitio publicado"); }
  }

  const adapter = {
    id: "v1", label: "V1 · Sin API", sw: "../sw.js",
    features: {respuestas: false, clasificar: false, registro: true},
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
        if (S.perm === "granted") { await loadRegistro(A); await refresh(A, true); }
      }
      S.timer = setInterval(() => { if (S.auto && S.mode === "carpeta" && S.perm === "granted" && document.visibilityState === "visible") refresh(A, true); }, 60000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.mode === "carpeta" && S.perm === "granted") refresh(A, true); });
    },
    /* Con la carpeta conectada solo se registra cuando hay permiso de escritura, para no perder el Excel */
    canRegister() { return S.mode === "archivos" || canWrite(); },
    async saveRegistro(A) {
      if (!canWrite()) return {ok: true, msg: `Registro guardado en este navegador (${A.registro.length}). Usa "Descargar copia" para obtener el Excel.`};
      const dir = await sub(S.root, "Resultados", true);
      if (!dir) return {ok: false, msg: "No se pudo crear la carpeta Resultados en OrderApproval."};
      await writeFile(dir, REG_JSON, JSON.stringify(A.registro));
      try { await writeFile(dir, OA.reg.fileName, OA.reg.toXlsx(A.registro)); }
      catch (e) { return {ok: false, msg: `No se pudo actualizar ${OA.reg.fileName}. Si está abierto en Excel, ciérralo y presiona "Guardar Excel". Los datos no se pierden.`}; }
      return {ok: true, msg: `Excel actualizado: ${A.registro.length} correo${A.registro.length === 1 ? "" : "s"} · ${OA.fmtTime(new Date().toISOString())}`};
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
              ${row("Registrados en Excel", A.registro.length)}
              ${row("Última lectura", S.lastRefresh ? OA.fmtFull(S.lastRefresh) : "—")}
            </div>
            <label class="chk"><input type="checkbox" data-act="v1-auto"${S.auto ? " checked" : ""} onclick="event.preventDefault()"> Actualizar cada minuto</label>
            </div></div>
          <div class="card"><div class="ch"><h3>Estructura</h3></div><div class="cb"><div class="body-txt" style="border:0;padding:0">OrderApproval/
├── Correos/                          ← Flujo OA-1
└── Resultados/                       ← esta página
    ├── Resultados_OrderApproval.xlsx
    └── registro.json</div></div></div>
        </div>`;
        const c = v.querySelector('[data-act="v1-auto"]'); if (c) c.parentElement.addEventListener("click", ev => { ev.preventDefault(); adapter.action(A, "v1-auto"); });
      }
    }]
  };
  OA.app.start(adapter);
})();
