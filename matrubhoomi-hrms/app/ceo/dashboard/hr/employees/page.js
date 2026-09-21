"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import CEO_DashboardLayout from "@/components/CEO_DashboardLayout";
import {
    Users, Search, ChevronLeft, ChevronRight, X, RefreshCw,
    User, Briefcase, MapPin, FileText, CreditCard, Shield,
    Clock, ChevronDown, ChevronUp, UserCheck, UserX,
    Mail, Phone, Fingerprint, AlertCircle, TrendingDown,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const PER = 25;

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fullName = (e) => [e?.title, e?.firstName, e?.middleName, e?.lastName].filter(Boolean).join(" ").trim() || e?.name || "—";

function getPhotoUrl(emp) {
    const url = emp?.profilePhoto?.url || emp?.profilePhoto || emp?.basicInfo?.profilePhoto?.url;
    if (url && typeof url === "string" && url.trim()) {
        if (url.includes("cloudinary.com") && url.includes("/upload/")) {
            const parts = url.split("/upload/");
            if (parts.length === 2) return `${parts[0]}/upload/w_120,h_120,c_fill,g_face,q_auto,f_auto/${parts[1]}`;
        }
        return url;
    }
    return null;
}

function Avatar({ emp, size = "md" }) {
    const [imgError, setImgError] = useState(false);
    const url = getPhotoUrl(emp);
    const name = fullName(emp);
    const initials = [emp?.firstName, emp?.lastName].filter(Boolean).map(s => s[0].toUpperCase()).join("") || (name[0]?.toUpperCase() || "?");
    const sizeMap = { sm: "w-8 h-8 text-[10px]", md: "w-10 h-10 text-xs", lg: "w-16 h-16 text-lg", xl: "w-20 h-20 text-2xl" };
    const colors = ["bg-violet-400","bg-blue-400","bg-emerald-400","bg-amber-400","bg-rose-400","bg-teal-400","bg-indigo-400","bg-pink-400"];
    const colorIdx = name.split("").reduce((a,c)=>a+c.charCodeAt(0),0)%colors.length;
    if (url && !imgError) return (
        <div className={`${sizeMap[size]} rounded-full overflow-hidden flex-shrink-0`} style={{background:"var(--ck-panel-2)",boxShadow:"0 0 0 1px var(--ck-line)"}}>
            <img src={url} alt={name} className="w-full h-full object-cover" onError={()=>setImgError(true)}/>
        </div>
    );
    return <div className={`${sizeMap[size]} rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold ${colors[colorIdx]}`}>{initials}</div>;
}

function Section({ icon: Icon, title, children, defaultOpen=true }) {
    const [open, setOpen] = useState(defaultOpen);
    const valid = (Array.isArray(children)?children:[children]).filter(Boolean);
    if (!valid.length) return null;
    return (
        <div className="ck-panel overflow-hidden">
            <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-4 py-2.5 transition-colors text-left" style={{background:"var(--ck-panel-2)"}}>
                <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" style={{color:"var(--ck-accent)"}}/>
                    <span className="ck-label">{title}</span>
                </div>
                {open?<ChevronUp className="w-3.5 h-3.5" style={{color:"var(--ck-ink-3)"}}/>:<ChevronDown className="w-3.5 h-3.5" style={{color:"var(--ck-ink-3)"}}/>}
            </button>
            {open && <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">{children}</div>}
        </div>
    );
}

function Field({ label, value, wide }) {
    if (!value||value==="—"||value===""||value===null||value===undefined||value===false) return null;
    if (value===true) return null;
    return (
        <div className={wide?"col-span-2":""}>
            <p className="ck-label">{label}</p>
            <p className="text-xs font-medium mt-0.5 break-words leading-relaxed">{value}</p>
        </div>
    );
}

// ── SOP & Compliance Section ──────────────────────────────────────────────────
function SopComplianceSection({ empId }) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [err,     setErr]     = useState("");

    useEffect(() => {
        if (!empId) return;
        fetch(`${API}/api/ceo/hr/employees/${empId}/sop-points`, { credentials: "include" })
            .then(r => r.json())
            .then(d => { if (d.success) setData(d); else setErr(d.message || "Failed"); })
            .catch(e => setErr(e.message))
            .finally(() => setLoading(false));
    }, [empId]);

    if (loading) return (
        <div className="col-span-2 py-6 text-center text-xs" style={{color:"var(--ck-ink-3)"}}>Loading compliance data…</div>
    );
    if (err) return (
        <div className="col-span-2 flex items-center gap-2 p-3 rounded-lg text-xs" style={{background:"var(--ck-danger-wash)",border:"1px solid var(--ck-danger)",color:"var(--ck-danger)"}}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0"/>{err}
        </div>
    );
    if (!data) return null;

    const { sopPoints=[], totalDeducted=0, totalCredited=0, netPoints=0 } = data;
    const allBleaches = sopPoints.flatMap(yp => (yp.bleaches||[]).map(b=>({...b,year:yp.year})));

    return (
        <>
            {/* Summary cards */}
            <div className="col-span-2 grid grid-cols-3 gap-2 mb-1">
                <div className="ck-panel px-3 py-2.5 text-center">
                    <p className="ck-label mb-1">Total Deducted</p>
                    <p className="text-base font-bold ck-mono" style={{color:"var(--ck-danger)"}}>{totalDeducted.toFixed(1)} pts</p>
                </div>
                <div className="ck-panel px-3 py-2.5 text-center">
                    <p className="ck-label mb-1">Credits Earned</p>
                    <p className="text-base font-bold ck-mono" style={{color:"var(--ck-accent)"}}>{totalCredited.toFixed(1)} pts</p>
                </div>
                <div className="ck-panel px-3 py-2.5 text-center" style={{background:netPoints>0?"var(--ck-danger-wash)":"var(--ck-wash)"}}>
                    <p className="ck-label mb-1">Net Points</p>
                    <p className="text-base font-bold ck-mono" style={{color:netPoints>0?"var(--ck-danger)":"var(--ck-accent)"}}>{netPoints.toFixed(1)} pts</p>
                </div>
            </div>

            {/* History */}
            <div className="col-span-2">
                {allBleaches.length === 0 ? (
                    <div className="py-6 text-center border border-dashed rounded-lg" style={{borderColor:"var(--ck-line)"}}>
                        <p className="text-xs" style={{color:"var(--ck-ink-3)"}}>No compliance records found</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {sopPoints.map(yp => {
                            const bleaches = [...(yp.bleaches||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
                            if (!bleaches.length) return null;
                            // Group by date
                            const byDate = {};
                            bleaches.forEach(b => { const d=b.date||"?"; if(!byDate[d])byDate[d]=[]; byDate[d].push(b); });
                            return (
                                <div key={yp.year}>
                                    <p className="ck-label mb-1.5">{yp.year}</p>
                                    {Object.entries(byDate).sort(([a],[b])=>b.localeCompare(a)).map(([date,items])=>(
                                        <div key={date} className="mb-2 border rounded-lg overflow-hidden" style={{borderColor:"var(--ck-line)"}}>
                                            <div className="flex items-center justify-between px-3 py-1.5" style={{background:"var(--ck-panel-2)",borderBottom:"1px solid var(--ck-line)"}}>
                                                <span className="text-[11px] font-semibold ck-mono">{date}</span>
                                                <span className="text-[10px] font-bold ck-mono" style={{color:"var(--ck-danger)"}}>
                                                    -{items.filter(b=>!b.isCredit&&b.recheck?.status!=="confirmed").reduce((s,b)=>s+Number(b.points),0).toFixed(1)} pts
                                                </span>
                                            </div>
                                            {items.map((b,i)=>{
                                                const rs = b.recheck?.status||"none";
                                                const removed = rs==="confirmed";
                                                return (
                                                    <div key={i} className="flex items-start gap-2.5 px-3 py-2 border-b last:border-0" style={{borderColor:"var(--ck-line)",background:b.isCredit?"var(--ck-wash)":undefined}}>
                                                        <span className="text-sm mt-0.5 flex-shrink-0">{b.isCredit?"🟢":removed?"✅":"❌"}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-semibold">{b.sopName}</p>
                                                            {b.folderName&&b.folderName!=="Uncategorized"&&<p className="text-[10px]" style={{color:"var(--ck-ink-3)"}}>📁 {b.folderName}</p>}
                                                            {b.description&&<p className="text-[10px] mt-0.5 line-clamp-2" style={{color:"var(--ck-ink-3)"}}>{b.description}</p>}
                                                            <p className="text-[10px] mt-0.5" style={{color:"var(--ck-ink-3)"}}>By {b.cutByName} · {b.cutByRole}</p>
                                                            {rs==="pending"&&<span className="ck-chip is-warn mt-1">⏳ Recheck Pending</span>}
                                                            {rs==="confirmed"&&<span className="ck-chip is-ok mt-1">✅ Deduction Removed</span>}
                                                            {rs==="rejected"&&<span className="ck-chip is-danger mt-1">❌ Recheck Denied</span>}
                                                            {b.isCredit&&<span className="ck-chip is-ok mt-1">🎯 Goal Credit</span>}
                                                        </div>
                                                        <span className={`ck-chip ck-mono flex-shrink-0 mt-0.5 ${b.isCredit?"is-ok":removed?"line-through":"is-danger"}`}>
                                                            {b.isCredit?"+":""}{b.points} pts
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}

// ── Profile Drawer ────────────────────────────────────────────────────────────
function ProfileDrawer({ emp, fullData, loading, onClose }) {
    const [activeTab, setActiveTab] = useState("profile");
    const e = fullData || emp;
    const name = fullName(e);

    const TABS = [
        { key: "profile", label: "Profile" },
        { key: "sop",     label: "SOP & Compliance" },
    ];

    return (
        <>
            <div className="fixed inset-0 z-50" style={{background:"rgba(2,5,10,.7)",backdropFilter:"blur(6px)"}} onClick={onClose}/>
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] flex flex-col overflow-hidden animate-slide-in" style={{background:"var(--ck-solid)",borderLeft:"1px solid var(--ck-line)",boxShadow:"var(--ck-shadow)"}}>

                {/* Header */}
                <div className="flex items-start gap-4 px-6 py-5 flex-shrink-0" style={{background:"var(--ck-panel-2)",borderBottom:"1px solid var(--ck-line)"}}>
                    {loading
                        ? <div className="w-16 h-16 rounded-full animate-pulse flex-shrink-0" style={{background:"var(--ck-panel-2)"}}/>
                        : <Avatar emp={e} size="lg"/>
                    }
                    <div className="flex-1 min-w-0">
                        {loading
                            ? <><div className="h-5 rounded animate-pulse w-40 mb-2" style={{background:"var(--ck-panel-2)"}}/><div className="h-3 rounded animate-pulse w-56" style={{background:"var(--ck-panel-2)"}}/></>
                            : <>
                                <h2 className="text-lg font-bold truncate" style={{letterSpacing:".04em"}}>{name}</h2>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap" style={{color:"var(--ck-ink-3)"}}>
                                    <span className="text-sm">{e?.designation||e?.jobTitle||"—"}</span>
                                    <span>·</span>
                                    <span className="text-sm">{e?.department||"—"}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <span className={`ck-chip ${e?.isActive!==false?"is-ok":"is-danger"}`}>
                                        {e?.isActive!==false?"Active":"Inactive"}
                                    </span>
                                    {e?.employmentType&&<span className="ck-chip is-info capitalize">{e.employmentType.replace("_"," ")}</span>}
                                    {e?.isDirector&&<span className="ck-chip is-warn">Director</span>}
                                </div>
                            </>
                        }
                    </div>
                    <button onClick={onClose} className="ck-icon-btn flex-shrink-0">
                        <X className="w-4 h-4"/>
                    </button>
                </div>

                {/* Quick info bar */}
                {!loading && e && (
                    <div className="flex items-center flex-shrink-0" style={{borderBottom:"1px solid var(--ck-line)"}}>
                        {e.biometricId&&<div className="flex items-center gap-1.5 px-4 py-2.5"><Fingerprint className="w-3.5 h-3.5" style={{color:"var(--ck-ink-3)"}}/><span className="text-xs ck-mono font-semibold">{e.biometricId}</span></div>}
                        {e.email&&<div className="flex items-center gap-1.5 px-4 py-2.5 flex-1 min-w-0"><Mail className="w-3.5 h-3.5 flex-shrink-0" style={{color:"var(--ck-ink-3)"}}/><span className="text-xs truncate" style={{color:"var(--ck-ink-2)"}}>{e.email}</span></div>}
                        {e.phone&&<div className="flex items-center gap-1.5 px-4 py-2.5"><Phone className="w-3.5 h-3.5" style={{color:"var(--ck-ink-3)"}}/><span className="text-xs ck-mono" style={{color:"var(--ck-ink-2)"}}>{e.phone}</span></div>}
                    </div>
                )}

                {/* Tabs */}
                <div className="ck-tabs flex-shrink-0 px-4">
                    {TABS.map(t=>(
                        <button key={t.key} onClick={()=>setActiveTab(t.key)}
                            className={`ck-tab ${activeTab===t.key?"is-on":""}`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5" style={{scrollbarWidth:"none"}}>
                    {activeTab === "profile" ? (
                        loading ? (
                            <div className="space-y-3">{[...Array(5)].map((_,i)=><div key={i} className="h-16 rounded-xl animate-pulse" style={{background:"var(--ck-panel-2)"}}/>)}</div>
                        ) : (
                            <>
                                <Section icon={User} title="Personal Info">
                                    <Field label="Date of Birth" value={fmtDate(e?.dateOfBirth)}/>
                                    <Field label="Gender" value={e?.gender}/>
                                    <Field label="Blood Group" value={e?.bloodGroup}/>
                                    <Field label="Marital Status" value={e?.maritalStatus}/>
                                    <Field label="Nationality" value={e?.nationality}/>
                                    <Field label="Religion" value={e?.religion}/>
                                    <Field label="Place of Birth" value={e?.placeOfBirth}/>
                                    <Field label="Alt. Phone" value={e?.alternatePhone}/>
                                    <Field label="Personal Email" value={e?.personalEmail}/>
                                    <Field label="Father's Name" value={[e?.fatherFirstName,e?.fatherLastName].filter(Boolean).join(" ")||null}/>
                                    <Field label="Mother's Name" value={[e?.motherFirstName,e?.motherLastName].filter(Boolean).join(" ")||null}/>
                                    {e?.maritalStatus==="married"&&<Field label="Spouse" value={e?.spouseName}/>}
                                    <Field label="Phys. Challenged" value={e?.isPhysicallyChallenged?"Yes":null}/>
                                    <Field label="International" value={e?.isInternational?"Yes":null}/>
                                </Section>
                                <Section icon={Briefcase} title="Work Info">
                                    <Field label="Biometric ID" value={e?.biometricId}/>
                                    <Field label="Identity ID" value={e?.identityId}/>
                                    <Field label="Designation" value={e?.designation}/>
                                    <Field label="Job Title" value={e?.jobTitle}/>
                                    <Field label="Department" value={e?.department}/>
                                    <Field label="Employment Type" value={e?.employmentType?.replace("_"," ")}/>
                                    <Field label="Work Location" value={e?.workLocation}/>
                                    <Field label="Shift" value={e?.shift}/>
                                    <Field label="Date of Joining" value={fmtDate(e?.dateOfJoining)}/>
                                    <Field label="Confirmation Date" value={fmtDate(e?.confirmationDate)}/>
                                    <Field label="Probation" value={e?.probationPeriod?`${e.probationPeriod} months`:null}/>
                                    <Field label="Primary Manager" value={e?.primaryManager?.managerName}/>
                                    <Field label="Secondary Manager" value={e?.secondaryManager?.managerName}/>
                                </Section>
                                {(e?.address?.current?.city||e?.address?.permanent?.city)&&(
                                    <Section icon={MapPin} title="Address" defaultOpen={false}>
                                        {e?.address?.current?.city&&<><div className="col-span-2 ck-label mt-1">Current Address</div><Field label="City" value={e.address.current.city}/><Field label="State" value={e.address.current.state}/><Field label="Pincode" value={e.address.current.pincode}/><Field label="Ownership" value={e.address.current.ownershipType}/></>}
                                        {e?.address?.permanent?.city&&<><div className="col-span-2 ck-label mt-1">Permanent Address</div><Field label="City" value={e.address.permanent.city}/><Field label="State" value={e.address.permanent.state}/><Field label="Pincode" value={e.address.permanent.pincode}/></>}
                                    </Section>
                                )}
                                <Section icon={FileText} title="Documents" defaultOpen={false}>
                                    <Field label="Aadhar Number" value={e?.documents?.aadharNumber}/>
                                    <Field label="PAN Number" value={e?.documents?.panNumber}/>
                                    <Field label="PF Number" value={e?.documents?.pfNumber}/>
                                    <Field label="ESI Number" value={e?.documents?.esiNumber}/>
                                    <Field label="UAN Number" value={e?.documents?.uanNumber}/>
                                </Section>
                                {e?.bankDetails?.bankName&&(
                                    <Section icon={CreditCard} title="Bank Details" defaultOpen={false}>
                                        <Field label="Bank" value={e.bankDetails.bankName}/>
                                        <Field label="Account Type" value={e.bankDetails.accountType}/>
                                        <Field label="Branch" value={e.bankDetails.branchName}/>
                                        <Field label="IFSC" value={e.bankDetails.ifscCode}/>
                                    </Section>
                                )}
                                <Section icon={Clock} title="System Info" defaultOpen={false}>
                                    <Field label="Created" value={fmtDate(e?.createdAt)}/>
                                    <Field label="Last Updated" value={fmtDate(e?.updatedAt)}/>
                                </Section>
                            </>
                        )
                    ) : (
                        /* SOP & Compliance tab */
                        <div className="ck-panel overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2.5" style={{background:"var(--ck-panel-2)",borderBottom:"1px solid var(--ck-line)"}}>
                                <TrendingDown className="w-3.5 h-3.5" style={{color:"var(--ck-accent)"}}/>
                                <span className="ck-label">SOP & Compliance</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
                                {!loading && e?._id && <SopComplianceSection empId={e._id}/>}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-5 py-3" style={{borderTop:"1px solid var(--ck-line)",background:"var(--ck-panel-2)"}}>
                    <p className="text-[11px] text-center" style={{color:"var(--ck-ink-3)"}}>View only · Salary data excluded · To edit, use the HR portal</p>
                </div>
            </div>
            <style jsx>{`
                @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
                .animate-slide-in { animation: slideIn 0.22s cubic-bezier(0.22,1,0.36,1); }
            `}</style>
        </>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CEOHRPage() {
    const [employees,   setEmployees]   = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [pagination,  setPagination]  = useState({ total:0,page:1,pages:1 });
    const [search,      setSearch]      = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [deptFilter,  setDeptFilter]  = useState("all");
    const [statusFilter,setStatusFilter]= useState("active");
    const [page,        setPage]        = useState(1);
    const [drawer,      setDrawer]      = useState(null);
    const [error,       setError]       = useState(null);

    useEffect(()=>{ const t=setTimeout(()=>{setDebouncedSearch(search);setPage(1);},350); return()=>clearTimeout(t); },[search]);

    useEffect(()=>{
        fetch(`${API}/api/ceo/hr/departments`,{credentials:"include"})
            .then(r=>r.json()).then(d=>{if(d.success)setDepartments(d.data||[])}).catch(()=>{});
    },[]);

    const fetchEmployees = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const qs = new URLSearchParams({ page, limit:PER, search:debouncedSearch, status:statusFilter, ...(deptFilter!=="all"&&{department:deptFilter}) });
            const res = await fetch(`${API}/api/ceo/hr/employees?${qs}`,{credentials:"include"});
            const data = await res.json();
            if (data.success){setEmployees(data.data||[]);setPagination(data.pagination||{});}
            else setError(data.message||"Failed to load");
        } catch(e){setError("Network error — "+e.message);}
        setLoading(false);
    },[page,debouncedSearch,deptFilter,statusFilter]);

    useEffect(()=>{fetchEmployees();},[fetchEmployees]);

    const openDrawer = async (emp) => {
        setDrawer({emp,fullData:null,loading:true});
        try {
            const res = await fetch(`${API}/api/ceo/hr/employees/${emp._id}`,{credentials:"include"});
            const d = await res.json();
            setDrawer({emp,fullData:d.success?d.data:emp,loading:false});
        } catch { setDrawer({emp,fullData:emp,loading:false}); }
    };

    const deptNames = useMemo(()=>departments.map(d=>d.name||d).filter(Boolean),[departments]);
    const totals = { total:pagination.total, active:employees.filter(e=>e.isActive!==false).length, inactive:employees.filter(e=>e.isActive===false).length };

    return (
        <CEO_DashboardLayout activeMenu="hr-employees">
            <div className="h-full flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3 flex items-center justify-between flex-shrink-0" style={{borderBottom:"1px solid var(--ck-line)"}}>
                    <div>
                        <h1 className="text-sm font-bold" style={{letterSpacing:".04em"}}>Employee Directory</h1>
                        <p className="ck-label mt-0.5">Click any row to view full profile · View only</p>
                    </div>
                    <button onClick={fetchEmployees} className="ck-icon-btn">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading?"animate-spin":""}`}/>
                    </button>
                </div>

                {error&&(
                    <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 flex-shrink-0" style={{background:"var(--ck-danger-wash)",border:"1px solid var(--ck-danger)",color:"var(--ck-danger)"}}>
                        <span className="flex-1">{error}</span>
                        <button onClick={()=>setError(null)}><X className="w-3.5 h-3.5"/></button>
                    </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-3 px-5 pt-3 pb-1 flex-shrink-0">
                    {[
                        {l:"Total",v:pagination.total,icon:Users,c:"ck-chip"},
                        {l:"Active",v:totals.active,icon:UserCheck,c:"ck-chip is-ok"},
                        {l:"Inactive",v:totals.inactive,icon:UserX,c:"ck-chip is-danger"},
                    ].map(s=>(
                        <div key={s.l} className={`${s.c} flex items-center gap-2 px-3 py-1.5`}>
                            <s.icon className="w-3.5 h-3.5"/>
                            <span className="text-xs font-bold ck-mono">{loading?"—":s.v}</span>
                            <span className="text-[11px] opacity-70">{s.l}</span>
                        </div>
                    ))}
                </div>

                {/* Table */}
                <div className="ck-panel flex-1 overflow-hidden flex flex-col mx-5 mb-5 mt-2">
                    {/* Toolbar */}
                    <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0 flex-wrap" style={{borderBottom:"1px solid var(--ck-line)"}}>
                        <div className="relative flex-1 min-w-[160px] max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10" style={{color:"var(--ck-ink-3)"}}/>
                            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, email, biometric ID…"
                                className="ck-input w-full pl-8 pr-3 py-1.5 text-xs"/>
                        </div>
                        <select value={deptFilter} onChange={e=>{setDeptFilter(e.target.value);setPage(1);}} className="ck-select px-2 py-1.5 text-xs">
                            <option value="all">All Departments</option>
                            {deptNames.map(d=><option key={d} value={d}>{d}</option>)}
                        </select>
                        <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}} className="ck-select px-2 py-1.5 text-xs">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="all">All Status</option>
                        </select>
                        <span className="text-[11px] ml-auto" style={{color:"var(--ck-ink-3)"}}><span className="ck-mono">{pagination.total}</span> total</span>
                    </div>

                    <div className="flex-1 overflow-auto" style={{scrollbarWidth:"none"}}>
                        <table className="ck-table w-full text-xs">
                            <thead className="sticky top-0 z-10" style={{background:"var(--ck-solid)"}}>
                                <tr>
                                    {["Employee","Biometric ID","Department","Designation","Type","Joined","Status"].map(h=>(
                                        <th key={h} className="px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    [...Array(12)].map((_,i)=>(
                                        <tr key={i}><td colSpan={7} className="px-3 py-2.5"><div className="h-6 rounded animate-pulse" style={{background:"var(--ck-panel-2)"}}/></td></tr>
                                    ))
                                ) : employees.length===0 ? (
                                    <tr><td colSpan={7} className="px-3 py-16 text-center">
                                        <Users className="w-8 h-8 mx-auto mb-2" style={{color:"var(--ck-ink-3)",opacity:.4}}/>
                                        <p className="text-xs" style={{color:"var(--ck-ink-3)"}}>No employees match your filters</p>
                                    </td></tr>
                                ) : employees.map(emp=>(
                                    <tr key={emp._id} onClick={()=>openDrawer(emp)} className="cursor-pointer transition-colors">
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <Avatar emp={emp} size="sm"/>
                                                <div>
                                                    <p className="font-semibold leading-tight">{fullName(emp)}</p>
                                                    <p className="text-[10px] mt-0.5" style={{color:"var(--ck-ink-3)"}}>{emp.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 ck-mono text-[10px]" style={{color:"var(--ck-ink-3)"}}>{emp.biometricId||emp.identityId||"—"}</td>
                                        <td className="px-3 py-2.5">{emp.department||"—"}</td>
                                        <td className="px-3 py-2.5">{emp.designation||emp.jobTitle||"—"}</td>
                                        <td className="px-3 py-2.5"><span className="ck-chip capitalize">{(emp.employmentType||"").replace("_"," ")||"—"}</span></td>
                                        <td className="px-3 py-2.5 ck-mono" style={{color:"var(--ck-ink-3)"}}>{fmtDate(emp.dateOfJoining)}</td>
                                        <td className="px-3 py-2.5">
                                            <span className={`ck-chip ${emp.isActive!==false?"is-ok":"is-danger"}`}>
                                                {emp.isActive!==false?"Active":"Inactive"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {pagination.pages>1&&(
                        <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{borderTop:"1px solid var(--ck-line)"}}>
                            <p className="text-[11px] ck-mono" style={{color:"var(--ck-ink-3)"}}>Showing {(page-1)*PER+1}–{Math.min(page*PER,pagination.total)} of {pagination.total}</p>
                            <div className="flex items-center gap-1">
                                <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1 rounded disabled:opacity-30" style={{border:"1px solid var(--ck-line)",color:"var(--ck-ink-2)"}}><ChevronLeft className="w-3 h-3"/></button>
                                {Array.from({length:Math.min(pagination.pages,7)},(_,i)=>i+Math.max(1,Math.min(page-3,pagination.pages-6))).filter(p=>p<=pagination.pages).map(p=>(
                                    <button key={p} onClick={()=>setPage(p)} className="w-6 h-6 rounded text-[11px] font-semibold ck-mono transition-all" style={p===page?{background:"var(--ck-accent)",color:"var(--ck-accent-ink)"}:{border:"1px solid var(--ck-line)",color:"var(--ck-ink-3)"}}>{p}</button>
                                ))}
                                <button onClick={()=>setPage(p=>Math.min(pagination.pages,p+1))} disabled={page===pagination.pages} className="p-1 rounded disabled:opacity-30" style={{border:"1px solid var(--ck-line)",color:"var(--ck-ink-2)"}}><ChevronRight className="w-3 h-3"/></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {drawer&&<ProfileDrawer emp={drawer.emp} fullData={drawer.fullData} loading={drawer.loading} onClose={()=>setDrawer(null)}/>}
        </CEO_DashboardLayout>
    );
}