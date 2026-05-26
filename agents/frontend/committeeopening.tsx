"use client";

import { AdminLayout } from "./AdminLayout";
import { useState } from "react";
import { 
  Search, 
  ChevronDown, 
  Calendar, 
  MapPin, 
  Users, 
  CheckCircle2, 
  Clock, 
  Lock, 
  MoreHorizontal,
  Plus,
  Video,
  AlertCircle,
  FileText,
  ShieldCheck,
  History,
  Menu,
  Bell,
  HelpCircle
} from "lucide-react";

const CommitteeMember = ({ name, role, present, onToggle }: any) => (
  <div className="flex items-center justify-between p-4 border-b border-slate-100 last:border-0">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
        {name.split(' ').map((n: any) => n[0]).join('')}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-900">{name}</p>
        <p className="text-[10px] text-slate-500 font-medium">{role}</p>
      </div>
    </div>
    <label className="flex items-center gap-2 cursor-pointer group">
      <span className="text-xs font-medium text-slate-500 group-hover:text-slate-900 transition-colors">Present</span>
      <div 
        onClick={onToggle}
        className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${
          present ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"
        }`}
      >
        {present && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>
    </label>
  </div>
);

export default function CommitteeOpening() {
  const [selectedTender, setSelectedTender] = useState("TND-2023-0045");
  const [attendance, setAttendance] = useState([
    { name: "John Smith", role: "Procurement Director (Chair)", present: true },
    { name: "Sarah Ahmed", role: "Technical Lead", present: true },
    { name: "Michael Ross", role: "Legal Representative", present: false },
    { name: "David Kim", role: "Finance Controller", present: false },
    { name: "Elena Patel", role: "Independent Observer", present: false },
  ]);

  const presentCount = attendance.filter(a => a.present).length;
  const quorumMet = presentCount >= 3;

  return (
    <AdminLayout activeTab="committee" title="Committee Session Management">
      <div className="flex h-[calc(100vh-160px)] gap-6">
        {/* Left Pane - Session Selection */}
        <div className="w-[380px] bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-900">Awaiting Commercial Opening</h3>
          </div>
          
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search tender ref or title..." 
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className={`p-4 border-b border-slate-100 transition-all cursor-pointer ${selectedTender === "TND-2023-0045" ? "bg-blue-50/50 border-l-4 border-l-blue-600" : "hover:bg-slate-50 border-l-4 border-l-transparent"}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">TND-2023-0045</span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">Sealed</span>
              </div>
              <h4 className="text-sm font-bold text-slate-900 leading-tight mb-4">Enterprise Firewall Appliance Upgrade & Support Contract</h4>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <Lock className="w-3.5 h-3.5" /> 4 Bids Ready for Opening
              </div>
            </div>

            {[
              { id: "TND-2023-0082", title: "Fleet Vehicle GPS Tracking System Implementation", bids: 2 },
              { id: "TND-2023-0105", title: "Headquarters HVAC Maintenance Services", bids: 7 }
            ].map((tender) => (
              <div key={tender.id} className="p-4 border-b border-slate-100 hover:bg-slate-50 transition-all cursor-pointer border-l-4 border-l-transparent">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tender.id}</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">Sealed</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 leading-tight mb-4">{tender.title}</h4>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <Lock className="w-3.5 h-3.5" /> {tender.bids} Bids Ready for Opening
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Pane - Session Workspace */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden overflow-y-auto">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TND-2023-0045</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase">Session Scheduled</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Commercial Envelope Opening Committee</h2>
              <p className="text-sm text-slate-500 mt-1">Enterprise Firewall Appliance Upgrade & Support Contract</p>
            </div>
            <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all">
              <Calendar className="w-4 h-4" /> Reschedule
            </button>
          </div>

          <div className="p-8 space-y-10">
            {/* Session Logistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                  <Clock className="w-3.5 h-3.5" /> Date & Time
                </div>
                <p className="text-lg font-bold text-slate-900">Oct 26, 2023</p>
                <p className="text-sm text-slate-500 font-medium mt-1">10:00 AM GST</p>
              </div>
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                  <MapPin className="w-3.5 h-3.5" /> Location
                </div>
                <p className="text-lg font-bold text-slate-900">Virtual Meeting</p>
                <a href="#" className="text-sm text-blue-600 font-bold mt-1 flex items-center gap-1 hover:underline">
                  Join Teams Link <Video className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <Users className="w-3.5 h-3.5" /> Quorum Status
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${quorumMet ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {quorumMet ? "Met" : "Not Met"}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-bold ${quorumMet ? "text-emerald-600" : "text-rose-600"}`}>{presentCount}</span>
                  <span className="text-slate-400 font-bold">/ 5 Present</span>
                </div>
              </div>
            </div>

            {/* Attendance Section */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">Committee Attendance</h3>
                <button className="text-sm font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-all border border-blue-100">
                  Save Attendance
                </button>
              </div>
              <div className="border border-slate-100 rounded-3xl overflow-hidden bg-white">
                {attendance.map((member, i) => (
                  <CommitteeMember 
                    key={i} 
                    {...member} 
                    onToggle={() => {
                      const next = [...attendance];
                      next[i].present = !next[i].present;
                      setAttendance(next);
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Timeline Section */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-6">Event Timeline</h3>
              <div className="space-y-0 relative before:absolute before:left-6 before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-100">
                <div className="relative pl-14 pb-8">
                  <div className="absolute left-4 top-0 w-4 h-4 rounded-full bg-blue-600 ring-4 ring-blue-100 z-10"></div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Session Scheduled</p>
                    <p className="text-xs text-slate-500 mt-1">System • Oct 24, 2023, 09:15 AM</p>
                  </div>
                </div>
                <div className="relative pl-14 opacity-50">
                  <div className="absolute left-4 top-0 w-4 h-4 rounded-full bg-slate-200 z-10 flex items-center justify-center">
                    <Lock className="w-2.5 h-2.5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Commercial Envelopes Opened</p>
                    <p className="text-xs text-slate-500 mt-1">Pending...</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="pt-8 border-t border-slate-100 flex flex-col items-center gap-4">
              <div className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full border ${quorumMet ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100"}`}>
                <AlertCircle className="w-4 h-4" />
                {quorumMet ? "Quorum met. You can now proceed to open envelopes." : "Quorum (min. 3) required to enable opening."}
              </div>
              <button 
                disabled={!quorumMet}
                className={`flex items-center gap-2 px-12 py-4 rounded-2xl font-bold text-sm transition-all shadow-xl ${
                  quorumMet 
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20" 
                    : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                }`}
              >
                <Lock className="w-4 h-4" /> Open Commercial Envelopes
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
