"use client";

import { AdminLayout } from "./AdminLayout";
import { 
  History, 
  Search, 
  Filter, 
  Download, 
  FileText, 
  ShieldCheck, 
  Clock, 
  Database,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  ExternalLink,
  MoreVertical
} from "lucide-react";

const IntegrityCard = () => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 rounded-xl bg-emerald-100">
        <ShieldCheck className="w-6 h-6 text-emerald-600" />
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Last Check</p>
        <p className="text-xs font-bold text-slate-900">2 mins ago</p>
      </div>
    </div>
    <p className="text-sm font-medium text-slate-500">Audit Chain Integrity</p>
    <div className="flex items-baseline gap-2 mt-1">
      <h3 className="text-2xl font-bold text-slate-900">Verified</h3>
      <span className="text-xs font-bold text-emerald-600">Secure</span>
    </div>
    <p className="text-[10px] text-slate-400 mt-2 font-mono truncate">Hash Seq: 8f92...a342</p>
  </div>
);

const MetricCard = ({ title, value, subtext, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      {title === "Failure Rate" && (
        <div className="flex items-end gap-1 h-8">
           {[20, 45, 30, 60, 25, 40].map((h, i) => (
             <div key={i} className="w-1.5 bg-slate-100 rounded-t-sm" style={{ height: `${h}%` }}></div>
           ))}
        </div>
      )}
    </div>
    <p className="text-sm font-medium text-slate-500">{title}</p>
    <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
    <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">{subtext}</p>
  </div>
);

export default function AuditLog() {
  return (
    <AdminLayout activeTab="audit" title="System Audit Log">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-sm text-slate-500">Immutable record of all system events and administrative access.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all">
            <FileText className="w-4 h-4" /> Export PDF
          </button>
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <IntegrityCard />
        <MetricCard title="Failure Rate (24h)" value="0.8%" subtext="Across all modules" icon={AlertCircle} color="bg-rose-500" />
        <MetricCard title="Storage Usage" value="82.4 GB / 500 GB" subtext="Current Log Partition" icon={Database} color="bg-blue-600" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        {/* Advanced Filters */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Date Range</label>
              <select className="w-full bg-white border border-slate-200 text-sm py-2.5 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>Custom Range</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Actor</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="All Users" 
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Action Type</label>
              <select className="w-full bg-white border border-slate-200 text-sm py-2.5 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option>All Actions</option>
                <option>USER_LOGIN</option>
                <option>TENDER_PUBLISH</option>
                <option>VENDOR_APPROVAL</option>
              </select>
            </div>
            <button className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-500/20">
              Apply Filters
            </button>
          </div>
        </div>

        {/* Audit Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                <th className="py-4 px-6 font-bold">Timestamp (UTC)</th>
                <th className="py-4 px-6 font-bold">Actor</th>
                <th className="py-4 px-6 font-bold">Action Type</th>
                <th className="py-4 px-6 font-bold">Subject ID</th>
                <th className="py-4 px-6 font-bold">IP Address</th>
                <th className="py-4 px-6 font-bold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                { time: "2024-10-24 14:32:01", actor: "J. Doe (Admin)", type: "USER_LOGIN", subject: "-", ip: "192.168.1.104", res: "Success" },
                { time: "2024-10-24 14:30:45", actor: "System Process", type: "TENDER_STATUS_UPDATE", subject: "TND-2024-0089", ip: "10.0.0.5", res: "Success" },
                { time: "2024-10-24 14:28:12", actor: "Unknown (Vendor)", type: "DOCUMENT_UPLOAD", subject: "TND-2024-0042", ip: "203.0.113.45", res: "Failure" },
                { time: "2024-10-24 14:15:00", actor: "M. Smith (Legal)", type: "CONTRACT_APPROVAL", subject: "CTR-2024-0112", ip: "192.168.1.201", res: "Success" },
                { time: "2024-10-24 14:02:33", actor: "S. Jenkins (Finance)", type: "REPORT_EXPORT", subject: "Q3_Spend_Analysis", ip: "192.168.2.55", res: "Success" },
                { time: "2024-10-24 13:59:10", actor: "A. Vendor", type: "USER_LOGIN", subject: "-", ip: "198.51.100.22", res: "Failure" },
              ].map((log, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-6 text-xs text-slate-600 font-medium font-mono">{log.time}</td>
                  <td className="py-4 px-6 text-sm font-bold text-slate-900">{log.actor}</td>
                  <td className="py-4 px-6"><span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{log.type}</span></td>
                  <td className="py-4 px-6">
                    {log.subject !== "-" ? (
                      <button className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                        {log.subject} <ExternalLink className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-xs text-slate-500 font-mono">{log.ip}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${log.res === "Success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {log.res}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
          <p className="text-xs font-medium text-slate-500">Showing 1 to 6 of 14,205 entries</p>
          <div className="flex items-center gap-1">
             <button className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600">Previous</button>
             <button className="w-8 h-8 bg-blue-600 text-white rounded-lg text-xs font-bold">1</button>
             <button className="w-8 h-8 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all">2</button>
             <button className="w-8 h-8 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all">3</button>
             <span className="px-2 text-slate-300 text-xs">...</span>
             <button className="w-8 h-8 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all">236</button>
             <button className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900">Next</button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
