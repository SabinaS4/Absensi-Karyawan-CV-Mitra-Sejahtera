"use strict";
/* ============ Util ============ */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const TZ = "Asia/Jakarta";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const fTime = iso => iso ? new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(".", ":") : "–";
const fDate = d => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fLong = d => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fMonth = m => new Date(m + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" });
const dur = (a, b) => { if (!a || !b) return "–"; const m = Math.round((new Date(b) - new Date(a)) / 60000); return Math.floor(m / 60) + "j " + (m % 60) + "m"; };
const monthRange = m => { const [y, mo] = m.split("-").map(Number); return [m + "-01", m + "-" + String(new Date(y, mo, 0).getDate()).padStart(2, "0")]; };
const weekdays = (a, b) => { let n = 0; for (let d = new Date(a + "T00:00:00"), e = new Date(b + "T00:00:00"); d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++; return n; };
const LABEL = { hadir:"Hadir", terlambat:"Terlambat", izin:"Izin", sakit:"Sakit", cuti:"Cuti", alfa:"Alfa", belum:"Belum absen", menunggu:"Menunggu", disetujui:"Disetujui", ditolak:"Ditolak", nonaktif:"Nonaktif" };
const badge = s => `<span class="b b-${esc(s)}">${esc(LABEL[s] || s)}</span>`;
const empty = t => `<div class="empty">${t}</div>`;
function toast(msg, err) {
  const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
}
const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };

/* ============ Init ============ */
const cfg = window.APP_CONFIG || {};
const ready = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("PROJECT_ID") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith("ISI_");
const S = { user: null, emp: null, view: "dashboard", timer: null, month: today().slice(0, 7), filterEmp: "", filterLv: "menunggu", employees: [] };
let sb;

const ADMIN_VIEWS = [["dashboard","Dashboard"],["riwayat","Riwayat absensi"],["izin","Izin & cuti"],["rekap","Rekap bulanan"],["karyawan","Data karyawan"]];
const EMP_VIEWS = [["dashboard","Beranda"],["riwayat","Riwayat saya"],["izin","Izin & cuti"]];

(async function boot() {
  if (!ready) {
    $("#root").innerHTML = `<div style="max-width:560px;margin:12vh auto;padding:0 1.2rem"><h1>Konfigurasi belum diisi</h1><p>Buka file <code>config.js</code>, isi <code>SUPABASE_URL</code> dan <code>SUPABASE_ANON_KEY</code> dari Supabase (Project Settings → API), lalu deploy ulang.</p></div>`;
    return;
  }
  sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const { data } = await sb.auth.getSession();
  if (data.session) await enter(data.session.user); else showLogin();
})();

async function enter(user) {
  S.user = user;
  const r = await sb.from("employees").select("*").ilike("email", user.email).eq("aktif", true).maybeSingle();
  if (r.error || !r.data) {
    await sb.auth.signOut();
    showLogin("Akun ini belum terdaftar sebagai karyawan aktif. Hubungi admin HRD.");
    return;
  }
  S.emp = r.data; S.view = "dashboard"; await loadAvatars([S.emp.foto_profil]); shell(); render();
}

/* ============ Login ============ */
function showLogin(error) {
  clearInterval(S.timer);
  $("#root").innerHTML = `
  <div class="login">
    <section class="login-art">
      <div class="brand"><span class="mark" aria-hidden="true"></span><span>CV Mitra Sejahtera</span></div>
      <div><h1>Absen tepat waktu, rekap tanpa kertas.</h1><p>Catat kehadiran, ajukan izin, dan pantau rekap bulanan dari satu halaman.</p></div>
      <p style="margin:0;font-size:.85rem">Jam kerja 08:00 – 17:00 WIB · batas masuk 08:15</p>
    </section>
    <section class="login-form">
      <form id="lf" novalidate>
        <h2>Masuk</h2><p class="muted" style="margin:0 0 1.4rem">Pakai email kantor yang didaftarkan HRD.</p>
        ${error ? `<div class="alert" role="alert" style="margin-bottom:1rem">${esc(error)}</div>` : ""}
        <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="username" required></div>
        <div class="field"><label for="pw">Kata sandi</label><input id="pw" type="password" autocomplete="current-password" required></div>
        <button class="btn" style="width:100%" id="lb">Masuk</button>
      </form>
    </section>
  </div>`;
  $("#lf").onsubmit = async e => {
    e.preventDefault();
    const b = $("#lb"); b.disabled = true; b.textContent = "Memeriksa…";
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value });
    if (error) return showLogin("Email atau kata sandi salah. Periksa lagi lalu coba masuk kembali.");
    enter(data.user);
  };
}

/* ============ Shell & navigasi ============ */
const isAdmin = () => S.emp.role === "admin";
function shell() {
  const items = isAdmin() ? ADMIN_VIEWS : EMP_VIEWS;
  $("#root").innerHTML = `
  <div class="app">
    <aside class="side">
      <div class="brand"><span class="mark" aria-hidden="true"></span><div>Mitra Sejahtera<small>Absensi karyawan</small></div></div>
      <nav class="nav" aria-label="Menu utama">${items.map(([k, t]) => `<button data-v="${k}">${t}</button>`).join("")}</nav>
      <div class="me"><div class="me-id"><button type="button" class="av-btn" id="chav" title="Ganti foto profil" aria-label="Ganti foto profil">${avatar(S.emp.nama, S.emp.foto_profil, 42)}</button><div><b>${esc(S.emp.nama)}</b><span>${esc(S.emp.jabatan)}</span></div></div><button class="btn ghost sm" id="lo">Keluar</button><input type="file" id="avf" accept="image/*" hidden></div>
    </aside>
    <main id="view" tabindex="-1"></main>
  </div>`;
  document.querySelectorAll(".nav button").forEach(b => b.onclick = () => { S.view = b.dataset.v; render(); });
  $("#lo").onclick = async () => { await sb.auth.signOut(); S.emp = null; showLogin(); };
  $("#chav").onclick = () => $("#avf").click();
  $("#avf").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const path = await uploadAvatar(S.emp.id, f);
      const r = await sb.rpc("set_my_foto_profil", { p_foto: path }); if (r.error) throw new Error(r.error.message);
      const old = S.emp.foto_profil; S.emp.foto_profil = path;
      if (old) sb.storage.from("profil-foto").remove([old]);
      await loadAvatars([path]); shell(); render(); toast("Foto profil diperbarui.");
    } catch (err) { toast(err.message, true); }
  };
}
async function render() {
  clearInterval(S.timer);
  document.querySelectorAll(".nav button").forEach(b => { if (b.dataset.v === S.view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const v = $("#view"); v.innerHTML = `<p class="muted">Memuat data…</p>`;
  try { await VIEWS[S.view](v); }
  catch (e) { v.innerHTML = `<div class="alert" role="alert">Data gagal dimuat: ${esc(e.message)}. Periksa koneksi internet lalu muat ulang halaman.</div>`; }
}
async function loadEmployees() {
  S.employees = must(await sb.from("employees").select("*").order("nip"));
  return S.employees;
}

/* ============ Dashboard ============ */
async function dashboard(v) {
  const t = today(), mStart = t.slice(0, 8) + "01";
  const [rec, month] = await Promise.all([
    sb.from("attendance").select("*").eq("employee_id", S.emp.id).eq("tanggal", t).maybeSingle().then(must),
    sb.from("attendance").select("*").eq("employee_id", S.emp.id).gte("tanggal", mStart).lte("tanggal", t).order("tanggal", { ascending: false }).then(must),
  ]);
  const cnt = s => month.filter(x => x.status === s).length;
  const away = rec && ["izin", "sakit", "cuti", "alfa"].includes(rec.status) && !rec.jam_masuk;
  const hasIn = rec && rec.jam_masuk, hasOut = rec && rec.jam_keluar;
  let line = "Belum ada absensi hari ini.";
  if (away) line = `Hari ini tercatat ${LABEL[rec.status].toLowerCase()}${rec.keterangan ? " — " + esc(rec.keterangan) : ""}.`;
  else if (hasIn) line = `Masuk ${fTime(rec.jam_masuk)} ${hasOut ? `· Pulang ${fTime(rec.jam_keluar)} · Durasi ${dur(rec.jam_masuk, rec.jam_keluar)}` : "· Belum absen pulang"} ${badge(rec.status)}`;

  let html = `
  <div class="head"><div class="hello">${avatar(S.emp.nama, S.emp.foto_profil, 56)}<div><h1>Halo, ${esc(S.emp.nama.split(" ")[0])}</h1><p>${esc(S.emp.jabatan)} · ${esc(S.emp.departemen)}</p></div></div></div>
  <section class="clock" aria-label="Absensi hari ini">
    <div>
      <div class="time" id="clk" aria-live="off">--:--:--</div>
      <div class="date">${fLong(t)} · WIB</div>
      <div class="bar" role="progressbar" aria-label="Progres jam kerja" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="pb"><i id="pbi" style="width:0"></i></div>
      <div class="bar-l"><span>08:00</span><span>17:00</span></div>
      <div class="today">${line}</div>
    </div>
    <div class="acts">
      <button class="btn sun" id="bin" ${hasIn || away ? "disabled" : ""}>Absen masuk</button>
      <button class="btn ghost" id="bout" ${!hasIn || hasOut || away ? "disabled" : ""}>Absen pulang</button>
    </div>
  </section>
  <div class="strip">
    <div><strong>${cnt("hadir")}</strong><span>Hadir bulan ini</span></div>
    <div><strong>${cnt("terlambat")}</strong><span>Terlambat</span></div>
    <div><strong>${cnt("izin") + cnt("sakit") + cnt("cuti")}</strong><span>Izin, sakit, cuti</span></div>
    <div><strong>${cnt("alfa")}</strong><span>Alfa</span></div>
  </div>`;

  if (isAdmin()) {
    const [emps, todayAtt, pending] = await Promise.all([
      loadEmployees(),
      sb.from("attendance").select("*").eq("tanggal", t).then(must),
      sb.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "menunggu").then(r => r.count || 0),
    ]);
    const active = emps.filter(e => e.aktif), map = Object.fromEntries(todayAtt.map(a => [a.employee_id, a]));
    await loadAvatars(active.map(e => e.foto_profil));
    const c = s => active.filter(e => map[e.id]?.status === s).length;
    const weekend = [0, 6].includes(new Date(t + "T00:00:00").getDay());
    html += `
    <h2 style="margin:1.6rem 0 .8rem">Kehadiran seluruh karyawan hari ini</h2>
    <div class="strip">
      <div><strong>${active.length}</strong><span>Karyawan aktif</span></div>
      <div><strong>${c("hadir")}</strong><span>Tepat waktu</span></div>
      <div><strong>${c("terlambat")}</strong><span>Terlambat</span></div>
      <div><strong>${c("izin") + c("sakit") + c("cuti")}</strong><span>Izin, sakit, cuti</span></div>
      <div><strong>${weekend ? "–" : active.filter(e => !map[e.id]).length}</strong><span>Belum absen</span></div>
    </div>
    ${pending ? `<div class="panel" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;background:var(--sun-soft);border-color:#f0d59a"><span><b>${pending}</b> pengajuan izin atau cuti menunggu keputusan kamu.</span><button class="btn sm" id="goLv">Tinjau pengajuan</button></div>` : ""}
    <div class="panel"><div class="tw"><table>
      <thead><tr><th>NIP</th><th>Nama</th><th>Departemen</th><th>Masuk</th><th>Pulang</th><th>Status</th><th>Foto</th></tr></thead>
      <tbody>${active.map(e => { const a = map[e.id]; return `<tr><td>${esc(e.nip)}</td><td><span class="who">${avatar(e.nama, e.foto_profil, 28)}<b>${esc(e.nama)}</b></span></td><td>${esc(e.departemen)}</td><td>${fTime(a?.jam_masuk)}</td><td>${fTime(a?.jam_keluar)}</td><td>${badge(a ? a.status : "belum")}</td><td>${a ? fotoBtns(a, e.nama) : "–"}</td></tr>`; }).join("")}</tbody>
    </table></div></div>`;
  } else {
    html += `<div class="panel"><h2>Absensi terakhir</h2>${attTable(month.slice(0, 7), false)}</div>`;
  }
  v.innerHTML = html;
  $("#bin").onclick = () => act("check_in", "Absen masuk tercatat.", "masuk");
  $("#bout").onclick = () => act("check_out", "Absen pulang tercatat.", "pulang");
  if ($("#goLv")) $("#goLv").onclick = () => { S.view = "izin"; S.filterLv = "menunggu"; render(); };
  const tick = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const el = $("#clk"); if (!el) return clearInterval(S.timer);
    el.textContent = `${p.hour}:${p.minute}:${p.second}`;
    const pct = Math.max(0, Math.min(100, ((+p.hour * 60 + +p.minute) - 480) / 540 * 100));
    $("#pbi").style.width = pct + "%"; $("#pb").setAttribute("aria-valuenow", Math.round(pct));
  };
  tick(); S.timer = setInterval(tick, 1000);
}
async function act(fn, ok, jenis) {
  const blob = await takePhoto(jenis === "masuk" ? "Foto absen masuk" : "Foto absen pulang");
  if (!blob) return;
  document.querySelectorAll(".acts .btn").forEach(b => b.disabled = true);
  const path = `${S.emp.id}/${today()}-${jenis}-${Date.now()}.jpg`;
  const up = await sb.storage.from("absensi-foto").upload(path, blob, { contentType: "image/jpeg" });
  if (up.error) { toast("Foto gagal diunggah: " + up.error.message, true); return render(); }
  const { error } = await sb.rpc(fn, { p_foto: path });
  if (error) toast(error.message, true); else toast(ok);
  render();
}

/* ============ Kamera & foto ============ */
function takePhoto(title) {
  return new Promise(resolve => {
    const d = $("#dlg"); let stream = null, blob = null, done = false, mode = "shoot";
    const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    const finish = v => { if (done) return; done = true; d.onclose = null; stop(); if (d.open) d.close(); resolve(v); };
    d.innerHTML = `<h2>${esc(title)}</h2>
      <div class="cam"><video id="cv" playsinline muted autoplay></video><img id="ci" alt="Hasil foto" hidden></div>
      <p class="muted" id="cm" style="margin:.6rem 0 0;font-size:.88rem" role="status">Menyalakan kamera…</p>
      <div class="dlg-act"><button type="button" class="btn ghost" id="cx">Batal</button><button type="button" class="btn ghost" id="cr" hidden>Ulangi</button><button type="button" class="btn sun" id="cs" disabled>Ambil foto</button></div>`;
    d.onclose = () => finish(null);
    d.showModal();
    const v = $("#cv"), img = $("#ci"), msg = $("#cm"), btn = $("#cs"), redo = $("#cr");
    const start = async () => {
      btn.disabled = true; msg.textContent = "Menyalakan kamera…";
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        v.srcObject = stream; await v.play();
        mode = "shoot"; btn.textContent = "Ambil foto"; btn.disabled = false;
        msg.textContent = "Pastikan wajah terlihat jelas, lalu ambil foto.";
      } catch (e) {
        mode = "retry"; btn.textContent = "Coba lagi"; btn.disabled = false;
        msg.textContent = "Kamera tidak bisa diakses. Izinkan akses kamera pada browser (ikon gembok di address bar), lalu klik Coba lagi.";
      }
    };
    btn.onclick = () => {
      if (mode === "retry") return start();
      if (mode === "send") return finish(blob);
      const w = v.videoWidth, h = v.videoHeight; if (!w) return;
      const sc = Math.min(1, 640 / w), c = document.createElement("canvas");
      c.width = Math.round(w * sc); c.height = Math.round(h * sc);
      const x = c.getContext("2d"); x.drawImage(v, 0, 0, c.width, c.height);
      const stamp = new Date().toLocaleString("id-ID", { timeZone: TZ, dateStyle: "medium", timeStyle: "medium" }) + " WIB · " + S.emp.nama;
      x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(0, c.height - 26, c.width, 26);
      x.fillStyle = "#fff"; x.font = "14px sans-serif"; x.fillText(stamp, 8, c.height - 8);
      c.toBlob(b => {
        if (!b) return toast("Foto gagal diambil, coba lagi.", true);
        blob = b; img.src = URL.createObjectURL(b); img.hidden = false; v.hidden = true; stop();
        redo.hidden = false; btn.textContent = "Kirim absen"; mode = "send";
        msg.textContent = "Periksa hasil foto. Kalau kurang jelas, klik Ulangi.";
      }, "image/jpeg", 0.72);
    };
    redo.onclick = () => { blob = null; img.hidden = true; v.hidden = false; redo.hidden = true; start(); };
    $("#cx").onclick = () => finish(null);
    start();
  });
}
const fotoBtns = (a, nama) => [["foto_masuk", "Masuk"], ["foto_keluar", "Pulang"]].filter(([k]) => a[k])
  .map(([k, l]) => `<button class="btn ghost sm" data-foto="${esc(a[k])}" data-cap="Foto ${l.toLowerCase()} · ${esc(nama)} · ${fDate(a.tanggal)}">${l}</button>`).join(" ") || "–";
async function showFoto(path, cap) {
  const d = $("#dlg"); d.onclose = null;
  d.innerHTML = `<h2>${esc(cap)}</h2><p class="muted" id="fp">Memuat foto…</p><div class="dlg-act"><button type="button" class="btn ghost" id="cx">Tutup</button></div>`;
  d.showModal(); $("#cx").onclick = () => d.close();
  const { data, error } = await sb.storage.from("absensi-foto").createSignedUrl(path, 600);
  const p = $("#fp"); if (!p) return;
  if (error) p.textContent = "Foto tidak bisa dimuat. Coba buka kembali.";
  else p.outerHTML = `<div class="cam"><img src="${esc(data.signedUrl)}" alt="${esc(cap)}"></div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-foto]"); if (b) showFoto(b.dataset.foto, b.dataset.cap); });

/* ============ Foto profil ============ */
const AV = {};
async function loadAvatars(paths) {
  const need = [...new Set(paths.filter(p => p && !AV[p]))];
  if (!need.length) return;
  const { data } = await sb.storage.from("profil-foto").createSignedUrls(need, 3600);
  (data || []).forEach(x => { if (x.signedUrl && x.path) AV[x.path] = x.signedUrl; });
}
const initials = n => String(n).split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
const avatar = (nama, path, size = 36) => {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .4)}px`;
  return AV[path] ? `<img class="av" style="${st}" src="${esc(AV[path])}" alt="Foto ${esc(nama)}">` : `<span class="av" style="${st}" aria-hidden="true">${esc(initials(nama))}</span>`;
};
function prepareAvatar(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const n = Math.min(im.width, im.height), c = document.createElement("canvas"); c.width = c.height = 400;
      c.getContext("2d").drawImage(im, (im.width - n) / 2, (im.height - n) / 2, n, n, 0, 0, 400, 400);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error("Foto gagal diproses")), "image/jpeg", 0.85);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("File yang dipilih bukan gambar yang valid")); };
    im.src = url;
  });
}
async function uploadAvatar(empId, file) {
  const blob = await prepareAvatar(file);
  const path = `${empId}/profil-${Date.now()}.jpg`;
  const up = await sb.storage.from("profil-foto").upload(path, blob, { contentType: "image/jpeg" });
  if (up.error) throw new Error("Foto gagal diunggah: " + up.error.message);
  return path;
}

/* ============ Tabel absensi ============ */
function attTable(rows, withName) {
  if (!rows.length) return empty("Belum ada data absensi pada periode ini.");
  return `<div class="tw"><table><thead><tr><th>Tanggal</th>${withName ? "<th>Nama</th>" : ""}<th>Masuk</th><th>Pulang</th><th>Durasi</th><th>Status</th><th>Foto</th><th>Keterangan</th></tr></thead><tbody>
  ${rows.map(a => `<tr><td>${fDate(a.tanggal)}</td>${withName ? `<td><b>${esc(a.employees?.nama)}</b></td>` : ""}<td>${fTime(a.jam_masuk)}</td><td>${fTime(a.jam_keluar)}</td><td>${dur(a.jam_masuk, a.jam_keluar)}</td><td>${badge(a.status)}</td><td>${fotoBtns(a, a.employees?.nama || S.emp.nama)}</td><td>${esc(a.keterangan || "")}</td></tr>`).join("")}
  </tbody></table></div>`;
}

/* ============ Riwayat ============ */
async function riwayat(v) {
  const [a, b] = monthRange(S.month);
  let emps = [];
  if (isAdmin()) emps = await loadEmployees();
  let q = sb.from("attendance").select("*, employees(nama,nip)").gte("tanggal", a).lte("tanggal", b).order("tanggal", { ascending: false }).limit(2000);
  if (isAdmin()) { if (S.filterEmp) q = q.eq("employee_id", S.filterEmp); } else q = q.eq("employee_id", S.emp.id);
  const rows = must(await q);
  v.innerHTML = `
  <div class="head"><div><h1>${isAdmin() ? "Riwayat absensi" : "Riwayat saya"}</h1><p>${fMonth(S.month)} · ${rows.length} catatan</p></div></div>
  <div class="panel">
    <div class="toolbar">
      <div><label for="fm">Bulan</label><input type="month" id="fm" value="${S.month}"></div>
      ${isAdmin() ? `<div><label for="fe">Karyawan</label><select id="fe"><option value="">Semua karyawan</option>${emps.map(e => `<option value="${e.id}" ${S.filterEmp === e.id ? "selected" : ""}>${esc(e.nama)}</option>`).join("")}</select></div>` : ""}
    </div>
    ${attTable(rows, isAdmin())}
  </div>`;
  $("#fm").onchange = e => { if (e.target.value) { S.month = e.target.value; render(); } };
  if ($("#fe")) $("#fe").onchange = e => { S.filterEmp = e.target.value; render(); };
}

/* ============ Izin & cuti ============ */
async function izin(v) {
  let q = sb.from("leave_requests").select("*, employees(nama,nip)").order("created_at", { ascending: false }).limit(300);
  if (isAdmin()) { if (S.filterLv) q = q.eq("status", S.filterLv); } else q = q.eq("employee_id", S.emp.id);
  const rows = must(await q);
  const range = r => r.tanggal_mulai === r.tanggal_selesai ? fDate(r.tanggal_mulai) : `${fDate(r.tanggal_mulai)} – ${fDate(r.tanggal_selesai)}`;
  const t = today();
  let html = `<div class="head"><div><h1>Izin & cuti</h1><p>${isAdmin() ? "Setujui atau tolak pengajuan karyawan." : "Ajukan izin, sakit, atau cuti dan pantau statusnya."}</p></div></div>`;
  if (!isAdmin()) html += `
  <div class="panel"><h2>Ajukan baru</h2>
    <form id="lvf"><div class="grid2">
      <div class="field"><label for="lj">Jenis</label><select id="lj"><option value="izin">Izin</option><option value="sakit">Sakit</option><option value="cuti">Cuti</option></select></div>
      <div></div>
      <div class="field"><label for="l1">Tanggal mulai</label><input type="date" id="l1" value="${t}" min="${t}" required></div>
      <div class="field"><label for="l2">Tanggal selesai</label><input type="date" id="l2" value="${t}" min="${t}" required></div>
    </div>
    <div class="field"><label for="la">Alasan</label><textarea id="la" rows="2" required maxlength="300"></textarea></div>
    <button class="btn">Kirim pengajuan</button></form>
  </div>`;
  html += `<div class="panel">`;
  if (isAdmin()) html += `<div class="toolbar"><div><label for="fl">Status</label><select id="fl">${["menunggu", "disetujui", "ditolak", ""].map(s => `<option value="${s}" ${S.filterLv === s ? "selected" : ""}>${s ? LABEL[s] : "Semua"}</option>`).join("")}</select></div></div>`;
  html += rows.length ? `<div class="tw"><table><thead><tr>${isAdmin() ? "<th>Karyawan</th>" : ""}<th>Jenis</th><th>Tanggal</th><th>Alasan</th><th>Status</th>${isAdmin() ? "<th>Keputusan</th>" : ""}</tr></thead><tbody>
    ${rows.map(r => `<tr>${isAdmin() ? `<td><b>${esc(r.employees?.nama)}</b></td>` : ""}<td>${badge(r.jenis)}</td><td>${range(r)}</td><td>${esc(r.alasan)}</td><td>${badge(r.status)}</td>
      ${isAdmin() ? `<td>${r.status === "menunggu" ? `<div class="row-actions"><button class="btn sm" data-d="disetujui" data-id="${r.id}">Setujui</button><button class="btn ghost sm" data-d="ditolak" data-id="${r.id}">Tolak</button></div>` : "–"}</td>` : ""}</tr>`).join("")}
    </tbody></table></div>` : empty(isAdmin() ? "Tidak ada pengajuan dengan status ini." : "Kamu belum pernah mengajukan izin atau cuti.");
  v.innerHTML = html + `</div>`;

  if ($("#lvf")) $("#lvf").onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.from("leave_requests").insert({ employee_id: S.emp.id, jenis: $("#lj").value, tanggal_mulai: $("#l1").value, tanggal_selesai: $("#l2").value, alasan: $("#la").value.trim() });
    if (error) return toast(error.message.includes("check") ? "Tanggal selesai tidak boleh sebelum tanggal mulai." : error.message, true);
    toast("Pengajuan terkirim, menunggu persetujuan HRD."); render();
  };
  if ($("#fl")) $("#fl").onchange = e => { S.filterLv = e.target.value; render(); };
  v.querySelectorAll("[data-d]").forEach(b => b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.from("leave_requests").update({ status: b.dataset.d }).eq("id", b.dataset.id);
    if (error) return toast(error.message, true);
    toast(b.dataset.d === "disetujui" ? "Pengajuan disetujui, absensi diperbarui." : "Pengajuan ditolak."); render();
  });
}

/* ============ Rekap bulanan (admin) ============ */
async function rekap(v) {
  const [a, b] = monthRange(S.month), t = today();
  const [emps, att] = await Promise.all([loadEmployees(), sb.from("attendance").select("employee_id,status").gte("tanggal", a).lte("tanggal", b).limit(5000).then(must)]);
  const hk = weekdays(a, b < t ? b : t < a ? a : t);
  const data = emps.filter(e => e.aktif).map(e => {
    const m = att.filter(x => x.employee_id === e.id), c = s => m.filter(x => x.status === s).length;
    const hadir = c("hadir"), tel = c("terlambat");
    return { nip: e.nip, nama: e.nama, dept: e.departemen, hadir, tel, izin: c("izin"), sakit: c("sakit"), cuti: c("cuti"), alfa: c("alfa"), pct: hk ? Math.round((hadir + tel) / hk * 100) : 0 };
  });
  v.innerHTML = `
  <div class="head"><div><h1>Rekap bulanan</h1><p>${fMonth(S.month)} · ${hk} hari kerja berjalan</p></div><button class="btn ghost" id="csv">Unduh CSV</button></div>
  <div class="panel">
    <div class="toolbar"><div><label for="fm">Bulan</label><input type="month" id="fm" value="${S.month}"></div></div>
    <div class="tw"><table><thead><tr><th>NIP</th><th>Nama</th><th>Departemen</th><th class="num">Hadir</th><th class="num">Terlambat</th><th class="num">Izin</th><th class="num">Sakit</th><th class="num">Cuti</th><th class="num">Alfa</th><th class="num">Kehadiran</th></tr></thead><tbody>
    ${data.map(d => `<tr><td>${esc(d.nip)}</td><td><b>${esc(d.nama)}</b></td><td>${esc(d.dept)}</td><td class="num">${d.hadir}</td><td class="num">${d.tel}</td><td class="num">${d.izin}</td><td class="num">${d.sakit}</td><td class="num">${d.cuti}</td><td class="num">${d.alfa}</td><td class="num"><b>${d.pct}%</b></td></tr>`).join("")}
    </tbody></table></div>
    <p class="muted" style="margin:.8rem 0 0;font-size:.85rem">Kehadiran = (hadir + terlambat) ÷ hari kerja Senin–Jumat. Hari libur nasional belum dikecualikan.</p>
  </div>`;
  $("#fm").onchange = e => { if (e.target.value) { S.month = e.target.value; render(); } };
  $("#csv").onclick = () => {
    const head = ["NIP", "Nama", "Departemen", "Hadir", "Terlambat", "Izin", "Sakit", "Cuti", "Alfa", "Kehadiran (%)"];
    const csv = [head, ...data.map(d => [d.nip, d.nama, d.dept, d.hadir, d.tel, d.izin, d.sakit, d.cuti, d.alfa, d.pct])].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); l.download = `rekap-absensi-${S.month}.csv`; l.click();
  };
}

/* ============ Data karyawan (admin) ============ */
async function karyawan(v) {
  const emps = await loadEmployees();
  await loadAvatars(emps.map(e => e.foto_profil));
  v.innerHTML = `
  <div class="head"><div><h1>Data karyawan</h1><p>${emps.filter(e => e.aktif).length} aktif dari ${emps.length} karyawan</p></div><button class="btn" id="add">Tambah karyawan</button></div>
  <div class="panel"><div class="tw"><table><thead><tr><th>NIP</th><th>Nama</th><th>Email</th><th>Jabatan</th><th>Departemen</th><th>Peran</th><th>Status</th><th></th></tr></thead><tbody>
  ${emps.map(e => `<tr><td>${esc(e.nip)}</td><td><span class="who">${avatar(e.nama, e.foto_profil, 32)}<b>${esc(e.nama)}</b></span></td><td>${esc(e.email)}</td><td>${esc(e.jabatan)}</td><td>${esc(e.departemen)}</td><td>${e.role === "admin" ? "Admin HRD" : "Karyawan"}</td><td>${badge(e.aktif ? "hadir" : "nonaktif").replace(LABEL.hadir, e.aktif ? "Aktif" : "Nonaktif")}</td><td><button class="btn ghost sm" data-e="${e.id}">Ubah</button></td></tr>`).join("")}
  </tbody></table></div>
  <p class="muted" style="margin:.8rem 0 0;font-size:.85rem">Agar karyawan baru bisa masuk, buat akun login dengan email yang sama di Supabase → Authentication → Users.</p></div>`;
  $("#add").onclick = () => empForm();
  v.querySelectorAll("[data-e]").forEach(b => b.onclick = () => empForm(emps.find(e => e.id === b.dataset.e)));
}
function empForm(e = {}) {
  const d = $("#dlg"), isNew = !e.id;
  d.innerHTML = `<h2>${isNew ? "Tambah karyawan" : "Ubah data karyawan"}</h2>
  <form id="ef"><div class="field avfield"><span id="avprev">${avatar(e.nama || "Baru", e.foto_profil, 64)}</span><div><label for="f0">Foto profil</label><input id="f0" type="file" accept="image/*"></div></div><div class="grid2">
    <div class="field"><label for="f1">NIP</label><input id="f1" required value="${esc(e.nip)}"></div>
    <div class="field"><label for="f2">Nama lengkap</label><input id="f2" required value="${esc(e.nama)}"></div>
    <div class="field"><label for="f3">Email kantor</label><input id="f3" type="email" required value="${esc(e.email)}"></div>
    <div class="field"><label for="f4">No. HP</label><input id="f4" value="${esc(e.no_hp)}"></div>
    <div class="field"><label for="f5">Jabatan</label><input id="f5" required value="${esc(e.jabatan)}"></div>
    <div class="field"><label for="f6">Departemen</label><input id="f6" required value="${esc(e.departemen)}"></div>
    <div class="field"><label for="f7">Peran</label><select id="f7"><option value="karyawan" ${e.role !== "admin" ? "selected" : ""}>Karyawan</option><option value="admin" ${e.role === "admin" ? "selected" : ""}>Admin HRD</option></select></div>
    <div class="field"><label for="f8">Tanggal masuk</label><input id="f8" type="date" required value="${e.tanggal_masuk || today()}"></div>
  </div>
  <div class="field checkline"><input id="f9" type="checkbox" ${e.aktif !== false ? "checked" : ""}><label for="f9">Karyawan aktif</label></div>
  <div class="dlg-act"><button type="button" class="btn ghost" id="cx">Batal</button><button class="btn">Simpan perubahan</button></div></form>`;
  d.showModal(); $("#cx").onclick = () => d.close();
  $("#f0").onchange = ev => { const f = ev.target.files[0]; if (f) $("#avprev").innerHTML = `<img class="av" style="width:64px;height:64px;font-size:26px" src="${URL.createObjectURL(f)}" alt="Pratinjau foto">`; };
  $("#ef").onsubmit = async ev => {
    ev.preventDefault();
    const row = { nip: $("#f1").value.trim(), nama: $("#f2").value.trim(), email: $("#f3").value.trim().toLowerCase(), no_hp: $("#f4").value.trim() || null, jabatan: $("#f5").value.trim(), departemen: $("#f6").value.trim(), role: $("#f7").value, tanggal_masuk: $("#f8").value, aktif: $("#f9").checked };
    if (e.id === S.emp.id && (row.role !== "admin" || !row.aktif)) return toast("Kamu tidak bisa menonaktifkan atau menurunkan peran akunmu sendiri.", true);
    const res = isNew ? await sb.from("employees").insert(row).select().single() : await sb.from("employees").update(row).eq("id", e.id).select().single();
    if (res.error) return toast(res.error.code === "23505" ? "NIP atau email sudah dipakai karyawan lain." : res.error.message, true);
    const file = $("#f0").files[0];
    if (file) {
      try {
        const path = await uploadAvatar(res.data.id, file);
        const u = await sb.from("employees").update({ foto_profil: path }).eq("id", res.data.id);
        if (u.error) throw new Error(u.error.message);
        if (e.foto_profil) sb.storage.from("profil-foto").remove([e.foto_profil]);
        if (res.data.id === S.emp.id) { S.emp.foto_profil = path; await loadAvatars([path]); shell(); }
      } catch (err) { d.close(); render(); return toast("Data tersimpan, tetapi foto profil gagal: " + err.message, true); }
    }
    d.close(); toast("Data karyawan disimpan."); render();
  };
}

const VIEWS = { dashboard, riwayat, izin, rekap, karyawan };
