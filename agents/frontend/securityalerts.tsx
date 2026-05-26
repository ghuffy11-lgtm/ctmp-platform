"use client";

import { AdminLayout } from "./AdminLayout";
import { 
  AlertTriangle, 
  ShieldAlert, 
  ShieldCheck, 
  Clock, 
  Filter, 
  ChevronRight, 
  MoreHorizontal,
  ExternalLink,
  Shield,
  Activity,
  UserX,
  Lock,
  Download
} from "lucide-react";

const SeverityCard = ({ label, count, icon: Icon, color, active }: any) => (
  <div className={`bg-white p-6 rounded-2xl border transition-all ${active ? "ring-2 ring-blue-600 shadow-lg shadow-blue-500/10" : "border-slate-200 hover:border-slate-300"}`}>
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
    <p className="text-sm font-medium text-slate-500">{label} Severity</p>
    <h3 className="text-4xl font-bold text-slate-900 mt-1">{count}</h3>
  </div>
);

const AlertItem = ({ type, severity, time, desc, meta, acknowledged, acknowledgedBy }: any) => {
  const severityColors: any = {
    "CRITICAL": "bg-rose-100 text-rose-700 border-rose-200",
    "HIGH": "bg-rose-50 text-rose-600 border-rose-100",
    "MEDIUM": "bg-amber-100 text-amber-700 border-amber-200",
    "LOW": "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <div className={`p-6 border-b border-slate-100 transition-all ${acknowledged ? "opacity-60 bg-slate-50/50" : "hover:bg-slate-50"}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${severity === "CRITICAL" ? "bg-rose-500 animate-pulse" : severity === "HIGH" ? "bg-rose-400" : severity === "MEDIUM" ? "bg-amber-500" : "bg-slate-400"}`}></div>
          <h4 className="text-lg font-bold text-slate-900">{type}</h4>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${severityColors[severity]}`}>
            {severity}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-slate-400">{time}</p>
        </div>
      </div>
      
      <p className="text-sm text-slate-600 leading-relaxed mb-4 max-w-4xl">{desc}</p>
      
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          {meta.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.label}:</span>
              <span className="text-xs font-bold text-slate-700">{item.value}</span>
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-3">
          {acknowledged ? (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Acknowledged by {acknowledgedBy}</span>
            </div>
          ) : (
            <>
              <button className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                Details
              </button>
              <button className="px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                Acknowledge
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default function SecurityAlerts() {
  return (
    <AdminLayout activeTab="audit" title="Security Alerts">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-slate-500">Monitor and manage system security events flagged by core services.</p>
        </div>
        <div className="flex items-center gap-2 bg-rose-50 text-rose-700 px-4 py-2 rounded-xl border border-rose-100 text-sm font-bold">
          <AlertTriangle className="w-4 h-4" /> 12 Unacknowledged Alerts
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <SeverityCard label="Critical" count="3" icon={ShieldAlert} color="bg-rose-500 shadow-rose-200" active />
        <SeverityCard label="High" count="8" icon={ShieldAlert} color="bg-rose-400 shadow-rose-200" />
        <SeverityCard label="Medium" count="15" icon={ShieldAlert} color="bg-amber-500 shadow-amber-200" />
        <SeverityCard label="Low" count="42" icon={ShieldAlert} color="bg-slate-500 shadow-slate-200" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Recent Security Events</h3>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              <Filter className="w-4 h-4" /> Filter
            </button>
            <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <AlertItem 
            type="Audit Chain Break Detected"
            severity="CRITICAL"
            time="Just now"
            desc="Cryptographic verification failed for block sequence #99420. Potential data tampering in Tender Evaluation module detected during automated integrity check."
            meta={[{ label: "Node", value: "Auth-02" }, { label: "IP", value: "10.0.4.55" }]}
          />
          <AlertItem 
            type="Failed Login Burst"
            severity="HIGH"
            time="10 mins ago"
            desc="15 consecutive failed authentication attempts for administrative account 'j.doe'. Source location indicates multiple rotating proxy nodes."
            meta={[{ label: "User", value: "j.doe" }, { label: "Origin", value: "192.168.1.104" }]}
          />
          <AlertItem 
            type="Unauthorized API Access Attempt"
            severity="MEDIUM"
            time="1 hour ago"
            desc="Request denied to endpoint /api/v1/tenders/export. Missing valid bearer token. Endpoint requires 'reports:export' permission."
            meta={[{ label: "Endpoint", value: "/export" }]}
          />
          <AlertItem 
            type="Configuration Changed"
            severity="LOW"
            time="2 hours ago"
            desc="Global session timeout updated from 30 to 15 minutes by administrative user 'sysadmin'."
            acknowledged
            acknowledgedBy="sysadmin"
            meta={[{ label: "Admin", value: "sysadmin" }]}
          />
        </div>
        
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-center">
          <button className="text-sm font-bold text-blue-600 hover:underline">View Historical Security Logs</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-slate-900 p-8 rounded-3xl text-white">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-400" /> Automated Shielding
          </h3>
          <div className="space-y-6">
            <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/10">
              <div>
                <p className="text-sm font-bold">Intrusion Prevention</p>
                <p className="text-xs text-white/50">Auto-blocking suspicious IP ranges</p>
              </div>
              <div className="w-12 h-6 bg-blue-600 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
            <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/10">
              <div>
                <p className="text-sm font-bold">Behavioral Analytics</p>
                <p className="text-xs text-white/50">Detecting anomalous user actions</p>
              </div>
              <div className="w-12 h-6 bg-blue-600 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200">
          <h3 className="text-lg font-bold mb-6 text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-500" /> Threat Vectors (24h)
          </h3>
          <div className="space-y-4">
             {[
               { label: "Credential Stuffing", value: "85%", color: "bg-rose-400" },
               { label: "XSS Injections", value: "12%", color: "bg-blue-500" },
               { label: "SQL Probing", value: "3%", color: "bg-slate-400" }
             ].map((vector, i) => (
               <div key={i}>
                 <div className="flex justify-between items-center mb-2">
                   <span className="text-sm font-medium text-slate-600">{vector.label}</span>
                   <span className="text-sm font-bold text-slate-900">{vector.value}</span>
                 </div>
                 <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                   <div className={`${vector.color} h-full rounded-full`} style={{ width: vector.value }}></div>
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
