const cfg = window.HEALTHOS_CONFIG || {};
const hasConfig = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("PASTE_") && cfg.SUPABASE_KEY && !cfg.SUPABASE_KEY.includes("PASTE_");
const sb = hasConfig ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;

let currentUser = null, profile = null, currentPage = "home", onboardStep = 1, pendingPhone = "", reportCache = [], medicationCache = [], supplementCache = [], vitalCache = [];

const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove("hidden");
const hide = id => $(id).classList.add("hidden");
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2800)}
function setScreen(name){["landing","auth","onboarding","app"].forEach(x=>hide(x));show(name)}

function requireConfig(){ if(!sb){toast("First connect HealthOS to Supabase using js/config.js."); return false} return true; }
function escapeHtml(v){return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function fmtDate(v){if(!v)return "—";return new Date(v).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});}
function initials(name){return (name||"Y").split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase();}

async function init(){
  document.addEventListener("click", handleClick);
  document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.nav)));
  if(!sb){setScreen("landing"); return}
  const {data:{session}}=await sb.auth.getSession();
  if(session){currentUser=session.user; await afterAuth();}
  sb.auth.onAuthStateChange(async (event, session)=>{ if(session){currentUser=session.user; await afterAuth()} else {currentUser=null; profile=null; setScreen("landing")} });
}
async function afterAuth(){
  await loadProfile();
  if(!profile){setScreen("onboarding"); onboardStep=1; renderOnboarding();} else {setScreen("app"); await loadAll(); renderApp();}
}
function handleClick(e){
  const a=e.target.closest("[data-action]");
  if(!a)return;
  const action=a.dataset.action;
  if(action==="open-auth")setScreen("auth");
  if(action==="show-landing")setScreen("landing");
  if(action==="google")googleLogin();
  if(action==="send-otp")sendOtp();
  if(action==="verify-otp")verifyOtp();
  if(action==="resend-otp")sendOtp();
  if(action==="onboard-next")nextOnboard();
  if(action==="onboard-back"){onboardStep=Math.max(1,onboardStep-1);renderOnboarding()}
  if(action==="finish-onboarding")finishOnboarding();
  if(action==="logout")logout();
  if(action==="close-modal")closeModal();
  if(action==="new-med")openMedicationModal();
  if(action==="new-supp")openSupplementModal();
  if(action==="new-vital")openVitalModal();
  if(action==="new-report")openReportModal();
  if(action==="save-med")saveMedication();
  if(action==="save-supp")saveSupplement();
  if(action==="save-vital")saveVital();
  if(action==="save-report")saveReport();
  if(action==="edit-profile")openProfileModal();
  if(action==="save-profile")saveProfile();
  if(action==="download-report")downloadReport(a.dataset.id);
  if(action==="delete-med")deleteMedication(a.dataset.id);
  if(action==="delete-supp")deleteSupplement(a.dataset.id);
  if(action==="delete-vital")deleteVital(a.dataset.id);
  if(action==="delete-report")deleteReport(a.dataset.id);
}
async function googleLogin(){
  if(!requireConfig())return;
  const {error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+location.pathname}});
  if(error)toast(error.message);
}
function fullPhone(){return $("countryCode").value+$("phone").value.replace(/\D/g,"");}
async function sendOtp(){
  if(!requireConfig())return;
  const p=fullPhone();
  if(p.replace(/\D/g,"").length<10){toast("Enter a valid mobile number.");return}
  const {error}=await sb.auth.signInWithOtp({phone:p});
  if(error){toast(error.message);return}
  pendingPhone=p; show("otpBox"); toast("OTP sent. Check your phone.");
}
async function verifyOtp(){
  if(!requireConfig())return;
  const token=$("otp").value.trim();
  if(token.length!==6){toast("Enter the 6-digit OTP.");return}
  const {data,error}=await sb.auth.verifyOtp({phone:pendingPhone,token,type:"sms"});
  if(error){toast(error.message);return}
  currentUser=data.user; await afterAuth();
}
async function loadProfile(){
  if(!currentUser)return;
  const {data,error}=await sb.from("profiles").select("*").eq("id",currentUser.id).maybeSingle();
  if(error){console.error(error);toast(error.message);return}
  profile=data;
}
function collectProfile(){
  return {
    id:currentUser.id,
    full_name:$("p_name").value.trim(),
    dob:$("p_dob").value||null,
    sex:$("p_sex").value||null,
    blood_group:$("p_blood").value||null,
    height_cm:parseFloat($("p_height").value)||null,
    weight_kg:parseFloat($("p_weight").value)||null,
    conditions:$("p_conditions").value.trim()||null,
    allergies:$("p_allergies").value.trim()||null,
    surgeries:$("p_surgeries").value.trim()||null,
    family_history:$("p_family").value.trim()||null,
    updated_at:new Date().toISOString()
  }
}
function nextOnboard(){
  if(onboardStep===1 && !$("p_name").value.trim()){toast("Please enter your name.");return}
  onboardStep=Math.min(3,onboardStep+1);renderOnboarding();
}
function renderOnboarding(){
  [1,2,3].forEach(n=>n===onboardStep?show("onboardStep"+n):hide("onboardStep"+n));
  $("stepLabel").textContent=`${onboardStep} of 3`; $("progressBar").style.width=(onboardStep/3*100)+"%";
}
async function finishOnboarding(){
  if(!requireConfig())return;
  const data=collectProfile();
  const {error}=await sb.from("profiles").upsert(data);
  if(error){toast(error.message);return}
  profile=data; setScreen("app"); await loadAll(); renderApp(); toast("Welcome to HealthOS.");
}
async function loadAll(){
  const uid=currentUser.id;
  const [m,s,v,r]=await Promise.all([
    sb.from("medications").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
    sb.from("supplements").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
    sb.from("vitals").select("*").eq("user_id",uid).order("recorded_at",{ascending:false}),
    sb.from("reports").select("*").eq("user_id",uid).order("report_date",{ascending:false})
  ]);
  medicationCache=m.data||[]; supplementCache=s.data||[]; vitalCache=v.data||[]; reportCache=r.data||[];
}
function navigate(page){currentPage=page;document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===page));renderApp();}
function renderApp(){
  setScreen("app");
  $("sideName").textContent=profile?.full_name||currentUser?.user_metadata?.full_name||"You";
  $("sidePhone").textContent=currentUser?.phone||currentUser?.email||"Account";
  $("avatar").textContent=initials(profile?.full_name||"You");
  const views={home:renderHome,reports:renderReports,medications:renderMedications,supplements:renderSupplements,vitals:renderVitals,trends:renderTrends,timeline:renderTimeline,ask:renderAsk,profile:renderProfile};
  $("page").innerHTML=views[currentPage]();
}
function pageHead(title,sub,buttonText,action){return `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div>${buttonText?`<button class="btn btn-primary" data-action="${action}">+ ${buttonText}</button>`:""}</div>`}
function renderHome(){
  const meds=medicationCache.filter(x=>x.status==="active").length, reps=reportCache.length, vit=vitalCache.length;
  return pageHead(`Good to see you, ${escapeHtml((profile?.full_name||"there").split(" ")[0])}.`,"Your health information at a glance.","Add record","new-vital")+
  `<div class="cards">
    <div class="card metric"><div class="label">Weight</div><div class="value">${profile?.weight_kg?escapeHtml(profile.weight_kg)+" kg":"—"}</div></div>
    <div class="card metric"><div class="label">Height</div><div class="value">${profile?.height_cm?escapeHtml(profile.height_cm)+" cm":"—"}</div></div>
    <div class="card metric"><div class="label">Active medicines</div><div class="value">${meds}</div></div>
    <div class="card metric"><div class="label">Reports</div><div class="value">${reps}</div></div>
  </div>
  <div class="section-grid">
    <div class="card"><div class="card-title"><h3>Recent vitals</h3><button class="link-btn" data-nav="vitals">View all</button></div>
      ${vitalCache.slice(0,5).map(v=>`<div class="list-item"><div><strong>${escapeHtml(v.type)}</strong><div class="sub">${fmtDate(v.recorded_at)}</div></div><span class="status">${escapeHtml(v.value)} ${escapeHtml(v.unit||"")}</span></div>`).join("")||`<div class="empty">No vitals yet. Add your first reading.</div>`}
    </div>
    <div class="card"><div class="card-title"><h3>Active medicines</h3><button class="link-btn" data-nav="medications">View all</button></div>
      ${medicationCache.filter(x=>x.status==="active").slice(0,5).map(m=>`<div class="list-item"><div><strong>${escapeHtml(m.name)}</strong><div class="sub">${escapeHtml(m.dosage||"")} · ${escapeHtml(m.frequency||"")}</div></div></div>`).join("")||`<div class="empty">No medicines added.</div>`}
    </div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-title"><h3>Recent reports</h3><button class="link-btn" data-nav="reports">View all</button></div>
    ${reportCache.slice(0,4).map(r=>`<div class="list-item"><div><strong>${escapeHtml(r.title)}</strong><div class="sub">${escapeHtml(r.report_type||"Report")} · ${fmtDate(r.report_date)}</div></div></div>`).join("")||`<div class="empty">No reports yet.</div>`}
  </div>`;
}
function renderMedications(){
  return pageHead("Medications","Keep a clear record of what you take.","Add medication","new-med")+
  `<div class="card">${medicationCache.length?`<div class="list">${medicationCache.map(m=>`<div class="list-item"><div><strong>${escapeHtml(m.name)}</strong><div class="sub">${escapeHtml(m.dosage||"No dosage")} · ${escapeHtml(m.frequency||"No frequency")} · ${escapeHtml(m.status||"active")}</div>${m.reason?`<div class="sub">${escapeHtml(m.reason)}</div>`:""}</div><div><span class="status">${escapeHtml(m.form||"medicine")}</span><button class="icon-btn" data-action="delete-med" data-id="${m.id}">Delete</button></div></div>`).join("")}</div>`:`<div class="empty">No medications yet.<br>Add a medicine to start your medication list.</div>`}</div>`;
}
function renderSupplements(){
  return pageHead("Supplements","Keep supplements separate from prescription and regular medicines.","Add supplement","new-supp")+
  `<div class="card">${supplementCache.length?`<div class="list">${supplementCache.map(s=>`<div class="list-item"><div><strong>${escapeHtml(s.name)}</strong><div class="sub">${escapeHtml(s.dosage||"")} · ${escapeHtml(s.frequency||"")}</div></div><button class="icon-btn" data-action="delete-supp" data-id="${s.id}">Delete</button></div>`).join("")}</div>`:`<div class="empty">No supplements added.</div>`}</div>`;
}
function renderVitals(){
  return pageHead("Vitals","Track readings over time without trying to interpret them.","Add reading","new-vital")+
  `<div class="card table-wrap"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>Value</th><th>Unit</th><th>Note</th><th></th></tr></thead><tbody>${vitalCache.map(v=>`<tr><td>${fmtDate(v.recorded_at)}</td><td>${escapeHtml(v.type)}</td><td>${escapeHtml(v.value)}</td><td>${escapeHtml(v.unit||"")}</td><td>${escapeHtml(v.note||"")}</td><td><button class="icon-btn" data-action="delete-vital" data-id="${v.id}">Delete</button></td></tr>`).join("")||`<tr><td colspan="6" class="empty">No readings yet.</td></tr>`}</tbody></table></div>`;
}
function renderReports(){
  return pageHead("Reports","Store report details and private files.","Add report","new-report")+
  `<div class="card"><div class="list">${reportCache.map(r=>`<div class="list-item"><div><strong>${escapeHtml(r.title)}</strong><div class="sub">${escapeHtml(r.report_type||"Report")} · ${fmtDate(r.report_date)}${r.provider?` · ${escapeHtml(r.provider)}`:""}</div></div><div>${r.file_path?`<button class="icon-btn" data-action="download-report" data-id="${r.id}">Open</button>`:""} <button class="icon-btn" data-action="delete-report" data-id="${r.id}">Delete</button></div></div>`).join("")||`<div class="empty">No reports yet.</div>`}</div></div>`;
}
function renderTrends(){
  const weight=vitalCache.filter(v=>v.type==="Weight").slice(0,12);
  return pageHead("Trends","A simple view of your recorded measurements.")+
  `<div class="section-grid"><div class="card"><div class="card-title"><h3>Weight readings</h3></div>${weight.length?`<div class="list">${weight.map(v=>`<div class="list-item"><div>${fmtDate(v.recorded_at)}</div><strong>${escapeHtml(v.value)} ${escapeHtml(v.unit||"kg")}</strong></div>`).join("")}</div>`:`<div class="empty">Add Weight readings in Vitals to see them here.</div>`}</div>
  <div class="card"><h3>Important note</h3><p class="muted">Trends in HealthOS are records, not medical interpretations. If a measurement concerns you, discuss it with a qualified healthcare professional.</p></div></div>`;
}
function renderTimeline(){
  const items=[
    ...medicationCache.map(x=>({date:x.created_at,title:x.name,sub:"Medication added"})),
    ...supplementCache.map(x=>({date:x.created_at,title:x.name,sub:"Supplement added"})),
    ...vitalCache.map(x=>({date:x.recorded_at,title:`${x.type}: ${x.value} ${x.unit||""}`,sub:"Vital recorded"})),
    ...reportCache.map(x=>({date:x.report_date,title:x.title,sub:"Report added"}))
  ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,30);
  return pageHead("Timeline","A chronological view of your health records.")+
  `<div class="card">${items.map(i=>`<div class="list-item"><div><strong>${escapeHtml(i.title)}</strong><div class="sub">${escapeHtml(i.sub)}</div></div><span class="sub">${fmtDate(i.date)}</span></div>`).join("")||`<div class="empty">Your timeline will appear as you add records.</div>`}</div>`;
}
function renderAsk(){
  return pageHead("Ask Health","Search your own records using plain language.")+
  `<div class="card"><h3>Ask your records</h3><p class="muted">This first version searches your saved records. It does not diagnose, predict conditions, or replace a clinician.</p>
  <div class="toolbar"><input id="askInput" placeholder="Try: show my recent reports"></div><button class="btn btn-primary" data-action="ask-search">Search records</button><div id="askResults" style="margin-top:18px"></div></div>`;
}
function renderProfile(){
  return pageHead("Profile & privacy","Review the personal information stored in your HealthOS account.","Edit profile","edit-profile")+
  `<div class="section-grid"><div class="card"><h3>Personal information</h3><div class="list">
  <div class="list-item"><div>Name</div><strong>${escapeHtml(profile?.full_name||"—")}</strong></div>
  <div class="list-item"><div>Date of birth</div><strong>${fmtDate(profile?.dob)}</strong></div>
  <div class="list-item"><div>Blood group</div><strong>${escapeHtml(profile?.blood_group||"—")}</strong></div>
  <div class="list-item"><div>Height</div><strong>${profile?.height_cm?escapeHtml(profile.height_cm)+" cm":"—"}</strong></div>
  <div class="list-item"><div>Weight</div><strong>${profile?.weight_kg?escapeHtml(profile.weight_kg)+" kg":"—"}</strong></div></div></div>
  <div class="card"><h3>Privacy</h3><p class="muted">Your database tables should have Row Level Security enabled. Never put a Supabase service-role key in the website.</p><p class="muted">For a public launch, add a privacy policy, account deletion/export, strong storage rules, and security review before collecting real medical records.</p></div></div>`;
}
function openModal(title,body){$("modal").innerHTML=`<div class="modal-card"><div class="modal-head"><h2>${title}</h2><button class="close" data-action="close-modal">×</button></div>${body}</div>`;show("modal")}
function closeModal(){hide("modal");$("modal").innerHTML=""}
function openMedicationModal(){openModal("Add medication",`<div class="form-grid">
<div><label>Medicine name</label><input id="m_name" placeholder="e.g. Medicine name"></div>
<div><label>Dosage</label><input id="m_dose" placeholder="e.g. 500 mg"></div>
<div><label>Form</label><select id="m_form"><option>Tablet</option><option>Capsule</option><option>Syrup</option><option>Injection</option><option>Cream</option><option>Other</option></select></div>
<div><label>Frequency</label><input id="m_freq" placeholder="e.g. Once daily"></div>
<div><label>Time</label><input id="m_time" type="time"></div>
<div><label>Status</label><select id="m_status"><option value="active">Active</option><option value="as needed">As needed</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="stopped">Stopped</option></select></div>
<div><label>Start date</label><input id="m_start" type="date"></div><div><label>End date</label><input id="m_end" type="date"></div>
<div><label>Reason</label><input id="m_reason" placeholder="Optional"></div><div><label>Prescribed by</label><input id="m_prescribed" placeholder="Optional"></div>
</div><label>Notes</label><textarea id="m_notes"></textarea><div class="form-actions"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-med">Save medication</button></div>`)}
async function saveMedication(){
  const name=$("m_name").value.trim();if(!name){toast("Medicine name is required.");return}
  const {error}=await sb.from("medications").insert({user_id:currentUser.id,name,dosage:$("m_dose").value.trim()||null,form:$("m_form").value,frequency:$("m_freq").value.trim()||null,time:$("m_time").value||null,status:$("m_status").value,start_date:$("m_start").value||null,end_date:$("m_end").value||null,reason:$("m_reason").value.trim()||null,prescribed_by:$("m_prescribed").value.trim()||null,notes:$("m_notes").value.trim()||null});
  if(error){toast(error.message);return}closeModal();await loadAll();renderApp();toast("Medication added.");
}
async function deleteMedication(id){if(!confirm("Delete this medication record?"))return;const {error}=await sb.from("medications").delete().eq("id",id);if(error)toast(error.message);else{await loadAll();renderApp();}}
function openSupplementModal(){openModal("Add supplement",`<label>Supplement name</label><input id="s_name" placeholder="e.g. Vitamin D"><div class="form-grid"><div><label>Dosage</label><input id="s_dose" placeholder="Optional"></div><div><label>Frequency</label><input id="s_freq" placeholder="e.g. Daily"></div><div><label>Start date</label><input id="s_start" type="date"></div><div><label>Status</label><select id="s_status"><option>Active</option><option>Paused</option><option>Completed</option><option>Stopped</option></select></div></div><label>Notes</label><textarea id="s_notes"></textarea><div class="form-actions"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-supp">Save supplement</button></div>`)}
async function saveSupplement(){const name=$("s_name").value.trim();if(!name){toast("Supplement name is required.");return}const {error}=await sb.from("supplements").insert({user_id:currentUser.id,name,dosage:$("s_dose").value.trim()||null,frequency:$("s_freq").value.trim()||null,start_date:$("s_start").value||null,status:$("s_status").value,notes:$("s_notes").value.trim()||null});if(error)toast(error.message);else{closeModal();await loadAll();renderApp();toast("Supplement added.")}}
async function deleteSupplement(id){if(!confirm("Delete this supplement?"))return;const {error}=await sb.from("supplements").delete().eq("id",id);if(error)toast(error.message);else{await loadAll();renderApp()}}
function openVitalModal(){openModal("Add vital reading",`<div class="form-grid"><div><label>Type</label><select id="v_type"><option>Weight</option><option>Heart rate</option><option>Blood pressure</option><option>SpO2</option><option>Temperature</option><option>Blood glucose</option><option>Other</option></select></div><div><label>Value</label><input id="v_value" placeholder="e.g. 72"></div><div><label>Unit</label><input id="v_unit" placeholder="e.g. bpm, kg, %"></div><div><label>Date & time</label><input id="v_date" type="datetime-local"></div></div><label>Note</label><textarea id="v_note" placeholder="Optional context"></textarea><div class="form-actions"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-vital">Save reading</button></div>`);$("v_date").value=new Date().toISOString().slice(0,16)}
async function saveVital(){const type=$("v_type").value,value=$("v_value").value.trim();if(!value){toast("Enter a value.");return}const {error}=await sb.from("vitals").insert({user_id:currentUser.id,type,value,unit:$("v_unit").value.trim()||null,recorded_at:new Date($("v_date").value).toISOString(),note:$("v_note").value.trim()||null});if(error)toast(error.message);else{closeModal();await loadAll();renderApp();toast("Vital saved.")}}
async function deleteVital(id){if(!confirm("Delete this reading?"))return;const {error}=await sb.from("vitals").delete().eq("id",id);if(error)toast(error.message);else{await loadAll();renderApp()}}
function openReportModal(){openModal("Add report",`<label>Report title</label><input id="r_title" placeholder="e.g. Blood test — October 2026"><div class="form-grid"><div><label>Report type</label><select id="r_type"><option>Lab report</option><option>Scan / imaging</option><option>Prescription</option><option>Discharge summary</option><option>Other</option></select></div><div><label>Date</label><input id="r_date" type="date"></div><div><label>Doctor / provider</label><input id="r_provider" placeholder="Optional"></div><div><label>File</label><input id="r_file" type="file" accept=".pdf,image/*"></div></div><label>Notes</label><textarea id="r_notes"></textarea><div class="form-actions"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-report">Save report</button></div>`);$("r_date").value=new Date().toISOString().slice(0,10)}
async function saveReport(){
  const title=$("r_title").value.trim();if(!title){toast("Report title is required.");return}
  const file=$("r_file").files[0];let filePath=null;
  if(file){
    if(file.size>10*1024*1024){toast("For this starter, keep files under 10 MB.");return}
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");filePath=`${currentUser.id}/${crypto.randomUUID()}-${safe}`;
    const {error:upErr}=await sb.storage.from("health-reports").upload(filePath,file,{upsert:false});
    if(upErr){toast(upErr.message);return}
  }
  const {error}=await sb.from("reports").insert({user_id:currentUser.id,title,report_type:$("r_type").value,report_date:$("r_date").value,provider:$("r_provider").value.trim()||null,notes:$("r_notes").value.trim()||null,file_path:filePath});
  if(error){if(filePath)await sb.storage.from("health-reports").remove([filePath]);toast(error.message);return}
  closeModal();await loadAll();renderApp();toast("Report saved.");
}
async function downloadReport(id){
  const r=reportCache.find(x=>x.id===id);if(!r?.file_path)return;
  const {data,error}=await sb.storage.from("health-reports").createSignedUrl(r.file_path,120);
  if(error){toast(error.message);return}window.open(data.signedUrl,"_blank");
}
async function deleteReport(id){
  const r=reportCache.find(x=>x.id===id);if(!confirm("Delete this report?"))return;
  if(r?.file_path)await sb.storage.from("health-reports").remove([r.file_path]);
  const {error}=await sb.from("reports").delete().eq("id",id);if(error)toast(error.message);else{await loadAll();renderApp()}
}
function openProfileModal(){openModal("Edit profile",`<div class="form-grid"><div><label>Name</label><input id="e_name" value="${escapeHtml(profile?.full_name||"")}"></div><div><label>Date of birth</label><input id="e_dob" type="date" value="${profile?.dob||""}"></div><div><label>Blood group</label><input id="e_blood" value="${escapeHtml(profile?.blood_group||"")}"></div><div><label>Height (cm)</label><input id="e_height" value="${profile?.height_cm||""}"></div><div><label>Weight (kg)</label><input id="e_weight" value="${profile?.weight_kg||""}"></div></div><label>Existing conditions</label><textarea id="e_conditions">${escapeHtml(profile?.conditions||"")}</textarea><label>Allergies</label><textarea id="e_allergies">${escapeHtml(profile?.allergies||"")}</textarea><label>Past surgeries / procedures</label><textarea id="e_surgeries">${escapeHtml(profile?.surgeries||"")}</textarea><label>Family health history</label><textarea id="e_family">${escapeHtml(profile?.family_history||"")}</textarea><div class="form-actions"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-profile">Save changes</button></div>`)}
async function saveProfile(){const data={id:currentUser.id,full_name:$("e_name").value.trim(),dob:$("e_dob").value||null,blood_group:$("e_blood").value.trim()||null,height_cm:parseFloat($("e_height").value)||null,weight_kg:parseFloat($("e_weight").value)||null,conditions:$("e_conditions").value.trim()||null,allergies:$("e_allergies").value.trim()||null,surgeries:$("e_surgeries").value.trim()||null,family_history:$("e_family").value.trim()||null,updated_at:new Date().toISOString()};const {error}=await sb.from("profiles").upsert(data);if(error)toast(error.message);else{profile={...profile,...data};closeModal();renderApp();toast("Profile updated.")}}
async function logout(){if(sb)await sb.auth.signOut();setScreen("landing")}
document.addEventListener("click",e=>{const n=e.target.closest("[data-nav]");if(n)navigate(n.dataset.nav);if(e.target.closest('[data-action="ask-search"]')){const q=($("askInput")?.value||"").toLowerCase();const results=[...reportCache.map(x=>({date:x.report_date,title:x.title,type:"Report"})),...vitalCache.map(x=>({date:x.recorded_at,title:`${x.type}: ${x.value} ${x.unit||""}`,type:"Vital"})),...medicationCache.map(x=>({date:x.created_at,title:x.name,type:"Medication"}))].filter(x=>(x.title+" "+x.type).toLowerCase().includes(q||"")).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,20);$("askResults").innerHTML=results.map(x=>`<div class="list-item"><div><strong>${escapeHtml(x.title)}</strong><div class="sub">${escapeHtml(x.type)}</div></div><span class="sub">${fmtDate(x.date)}</span></div>`).join("")||`<div class="empty">No matching records found.</div>`}})
init();
