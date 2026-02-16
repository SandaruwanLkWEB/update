function getToken() { return localStorage.getItem("token"); }
function setToken(t) { localStorage.setItem("token", t); }
function clearToken() { localStorage.removeItem("token"); }

// --- Theme (Light default + optional Dark) ---
function applyThemeFromStorage(){
  const saved = localStorage.getItem("theme") || "light";
  document.body.classList.toggle("dark", saved === "dark");
}

function toggleTheme(){
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  toast(isDark ? "🌙 Dark mode" : "☀️ Light mode");
}

document.addEventListener("DOMContentLoaded", applyThemeFromStorage);

function qs(id){ return document.getElementById(id); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

function ensureToast(){
  if (document.getElementById("toast")) return;
  const div = document.createElement("div");
  div.id = "toast";
  document.body.appendChild(div);
}
function toast(msg){
  ensureToast();
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>{ t.style.display="none"; }, 2600);
}

async function api(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const base = (API_BASE_URL || "").replace(/\/$/, "");
  let res, text, data;
  try{
    res = await fetch(`${base}${path}`, Object.assign({}, options, { headers }));
    text = await res.text();
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
  }catch(e){
    // Network / CORS / DNS issues
    throw new Error("ජාල/සම්බන්ධතා ගැටලුවක්. කරුණාකර නැවත උත්සාහ කරන්න.");
  }

  // Only logout on real auth errors
  if (res.status === 401){
    clearToken();
    location.href = "login.html";
    throw new Error("නැවත ඇතුල් වන්න.");
  }

  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

async function loadMe() { return api("/me"); }

async function guardRole(role){
  const me = await loadMe();
  if(!me.me || me.me.role !== role){ location.href="login.html"; return null; }
  return me.me;
}

function logout(){
  clearToken();
  location.href = "login.html";
}

// ---- Lookups (routes/subroutes) ----
let ROUTE_TREE = null;
async function loadRouteTree(force=false){
  // force=true => always refetch from server (ignore in-memory + localStorage cache)
  if(!force && ROUTE_TREE) return ROUTE_TREE;

  const CACHE_MS = 60 * 1000; // 1 minute (routes can change during the day)
  if(!force){
    try{
      const cached = localStorage.getItem("routesTree");
      if(cached){
        const obj = JSON.parse(cached);
        if(obj && obj.at && (Date.now() - obj.at) < CACHE_MS && obj.data){
          ROUTE_TREE = obj.data;
          return ROUTE_TREE;
        }
      }
    }catch(e){}
  }

  const d = await api("/lookup/routes-tree");
  ROUTE_TREE = { routes: d.routes || [], sub_routes: d.sub_routes || [] };
  try{
    localStorage.setItem("routesTree", JSON.stringify({ at: Date.now(), data: ROUTE_TREE }));
  }catch(e){}
  return ROUTE_TREE;
}

function invalidateRoutesTree(){
  ROUTE_TREE = null;
  try{ localStorage.removeItem("routesTree"); }catch(e){}
}

function subRoutesFor(route_id){
  if(!ROUTE_TREE) return [];
  return ROUTE_TREE.sub_routes.filter(s => String(s.route_id) === String(route_id));
}

function optionHTML(list, valueKey, labelKey, selectedValue, includeEmpty=true, emptyLabel="-- තෝරන්න --"){
  let html = includeEmpty ? `<option value="">${emptyLabel}</option>` : "";
  for(const x of list){
    const v = x[valueKey];
    const label = x[labelKey];
    const sel = String(v) === String(selectedValue) ? "selected" : "";
    html += `<option value="${v}" ${sel}>${label}</option>`;
  }
  return html;
}

function statusBadge(status){
  const map = {
    "DRAFT": ["කෙටුම්පත","warn"],
    "SUBMITTED": ["යොමු කර ඇත","warn"],
    "ADMIN_APPROVED": ["පරිපාලක අනුමත","ok"],  // FIXED: changed "good" to "ok"
    "TA_ASSIGNED_PENDING_HR": ["HR ඔවරයිඩ් අනුමැතිය බලාපොරොත්තු","warn"],
    "TA_ASSIGNED": ["වාහන අනුයුක්ත කර ඇත","ok"],  // FIXED: changed "good" to "ok"
    "TA_FIX_REQUIRED": ["TA විසින් සකස් කළ යුතුයි","warn"],
    "HR_FINAL_APPROVED": ["අවසාන අනුමත","ok"],  // FIXED: changed "good" to "ok"
    "REJECTED": ["ප්‍රතික්ෂේප","bad"]
  };
  const v = map[status] || [status, "badge"];
  return `<span class="badge ${v[1]}">${v[0]}</span>`;
}

function fmtDate(s){
  if(!s) return "";
  // Keep date stable (avoid timezone shifts)
  if(typeof s === "string"){
    if(s.includes("T")) return s.split("T")[0];
    if(s.includes(" ")) return s.split(" ")[0];
    return s;
  }
  return String(s);
}

// FIXED: Consolidated single fmtTime function with full functionality
function fmtTime(s){
  if(!s) return "";
  if(typeof s === "string"){
    // Simple HH:MM or HH:MM:SS format
    if(/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0,5);
    
    // ISO datetime -> local HH:MM
    if(s.includes("T")){
      const d = new Date(s);
      if(!isNaN(d)){
        const hh = String(d.getHours()).padStart(2,"0");
        const mm = String(d.getMinutes()).padStart(2,"0");
        return `${hh}:${mm}`;
      }
      // fallback: take time part
      const t = s.split("T")[1] || "";
      return t.replace("Z","").slice(0,5);
    }
    
    // "YYYY-MM-DD HH:MM:SS" format
    if(s.includes(" ")){
      const t = s.split(" ")[1] || "";
      return t.slice(0,5);
    }
    
    // Default: return first 5 chars if length >= 5
    if(s.length >= 5) return s.slice(0,5);
    return s;
  }
  return String(s);
}

function routeLabel(r){ 
  if(!r) return ''; 
  const no=(r.route_no||'').trim(); 
  const name=(r.route_name||'').trim(); 
  return (no&&name)?(`${no} - ${name}`):(name||no||''); 
}

// ---- Admin: HOD registration approvals ----
async function loadPendingHodRegs(){
  return api("/admin/hod-registrations");
}
async function approveHodReg(id){
  return api(`/admin/hod-registrations/${id}/approve`, { method:"POST" });
}
async function rejectHodReg(id){
  return api(`/admin/hod-registrations/${id}/reject`, { method:"POST" });
}

// ---- Admin: Bulk sub-routes (grams) ----
async function bulkUpsertSubs(routeId, lines){
  return api(`/admin/routes/${routeId}/subroutes/bulk`, { method:"POST", body: JSON.stringify({ lines }) });
}

// ---- PDF Download with Authentication ----
async function downloadPdfWithAuth(url, filename) {
  try {
    const token = getToken();
    
    if (!token) {
      toast("⚠️ Authentication required. Please login again.");
      setTimeout(() => location.href = "login.html", 1500);
      return;
    }

    toast("⏳ බාගත කරමින්... කරුණාකර රැඳී සිටින්න");

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/pdf'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Report download failed";
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorMessage;
      } catch (e) {
        if (errorText.includes("404")) {
          errorMessage = "Report not found. Make sure request is HR approved and vehicles assigned.";
        } else if (errorText.includes("400")) {
          errorMessage = "Invalid date or request not ready for reports.";
        } else if (errorText.includes("401")) {
          errorMessage = "Authentication failed. Please login again.";
        } else {
          errorMessage = `Error: ${response.status} - ${errorText.substring(0, 100)}`;
        }
      }
      
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    
    if (blob.size === 0) {
      throw new Error("Downloaded file is empty. Report may not have data.");
    }

    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = downloadUrl;
    a.download = filename;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    }, 100);

    toast("✅ බාගත කරන ලදී!");

  } catch (error) {
    console.error('PDF download error:', error);
    toast("❌ " + error.message);
  }
}
