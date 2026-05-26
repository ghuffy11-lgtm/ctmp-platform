"use client";

import { AdminLayout } from "./AdminLayout";
import { useState } from "react";
import { 
  Search, 
  Filter, 
  Plus, 
  MoreHorizontal, 
  CheckCircle2, 
  Clock, 
  Send,
  Paperclip,
  ChevronRight,
  MessageSquare,
  Globe,
  Lock,
  History,
  AlertCircle,
  Download,
  Eye,
  Menu,
  Bell,
  HelpCircle,
  FileText
} from "lucide-react";

const ThreadItem = ({ id, subject, pending, active, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`p-4 cursor-pointer transition-all border-b border-slate-100 ${
      active ? "bg-blue-50/50" : "hover:bg-slate-50"
    }`}
  >
    <div className="flex justify-between items-start mb-2">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{id}</span>
      {pending > 0 && (
        <span className="bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">
          {pending}
        </span>
      )}
    </div>
    <h4 className={`text-sm font-bold leading-tight mb-3 ${active ? "text-blue-900" : "text-slate-900"}`}>{subject}</h4>
    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
      <Clock className="w-3 h-3" /> 10m ago
    </div>
  </div>
);

export default function Clarifications() {
  const [selectedThread, setSelectedThread] = useState<any>({
    id: "TEN-2023-0042",
    title: "Enterprise Cloud Migration Services & Support",
    subject: "Data Sovereignty Requirements - Clarification Needed",
    vendor: "TechNova Solutions",
    vendorStatus: "PENDING",
    isPublic: true,
    messages: [
      {
        sender: "TechNova Solutions",
        role: "Lead Vendor",
        time: "Oct 12, 09:45 AM",
        content: "Regarding Section 4.2 of the technical specifications, does the requirement for \"in-country data residency\" apply to all backup archives, or only to the active production databases? We utilize a multi-region redundancy architecture for disaster recovery.",
        type: "VENDOR"
      },
      {
        sender: "Sarah Jenkins",
        role: "Legal",
        time: "Oct 12, 11:20 AM",
        content: "I've checked with compliance. Backups must also reside in-country. Let's make this response public as other vendors might have the same architecture questions.",
        type: "INTERNAL_NOTE"
      }
    ]
  });

  return (
    <AdminLayout activeTab="clarifications" title="Tender Management">
      <div className="flex h-[calc(100vh-160px)] gap-6">
        {/* Left Pane - Thread List */}
        <div className="w-[380px] bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-900">Clarifications</h3>
          </div>
          
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search threads..." 
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex border-b border-slate-100 bg-white">
            <button className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest text-blue-600 border-b-2 border-blue-600">Open</button>
            <button className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">Recent</button>
            <button className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600">All</button>
          </div>

          <div className="flex-1 overflow-y-auto">
             <div className="p-4 border-b border-slate-100 hover:bg-slate-50 transition-all cursor-pointer bg-blue-50/30">
               <div className="flex justify-between items-center mb-2">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TEN-2023-0042</span>
                 <span className="bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">3</span>
               </div>
               <h4 className="text-sm font-bold text-slate-900 leading-tight">Enterprise Cloud Migration Services & Support</h4>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-3 flex items-center gap-1">
                 <Clock className="w-3 h-3" /> 10m ago
               </p>
             </div>

             <ThreadItem id="TEN-2023-0089" subject="Procurement of Network Infrastructure Devices" pending={1} />
             <ThreadItem id="TEN-2023-0102" subject="Cybersecurity Audit and Penetration Testing" pending={0} />
          </div>
        </div>

        {/* Right Pane - Conversation Workspace */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden overflow-y-auto">
          <div className="p-6 border-b border-slate-100 bg-white z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-widest">TEN-2023-0042</span>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">Closes in 5 Days</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Enterprise Cloud Migration Services & Support</h2>
            
            <div className="flex gap-8 mt-6">
              <button className="flex items-center gap-2 pb-4 text-xs font-bold text-blue-600 border-b-2 border-blue-600 relative">
                All Threads <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full text-[10px]">12</span>
              </button>
              <button className="flex items-center gap-2 pb-4 text-xs font-bold text-slate-400 hover:text-slate-600">
                Pending <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[10px]">3</span>
              </button>
              <button className="flex items-center gap-2 pb-4 text-xs font-bold text-slate-400 hover:text-slate-600">
                Answered
              </button>
            </div>
          </div>

          <div className="flex-1 bg-slate-50/30 p-8 space-y-8 overflow-y-auto">
            {/* Thread Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-6 flex items-center justify-between border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center font-bold text-lg">TN</div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold text-slate-900">TechNova Solutions</p>
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded uppercase">Pending</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5" /> Public
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">Data Sovereignty Requirements - Clarification Needed</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">2 messages</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 rotate-90" />
               </div>

               <div className="p-0">
                  {selectedThread.messages.map((msg: any, i: number) => (
                    <div key={i} className={`p-6 ${msg.type === "INTERNAL_NOTE" ? "bg-blue-50/50 border-y border-blue-100/50" : "border-b border-slate-50 last:border-0"}`}>
                       <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                             {msg.type === "INTERNAL_NOTE" ? (
                               <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                                  <Lock className="w-3.5 h-3.5" />
                               </div>
                             ) : (
                               <div className="w-8 h-8 bg-slate-200 rounded-lg text-slate-500 flex items-center justify-center font-bold text-xs">TN</div>
                             )}
                             <div>
                                <p className="text-xs font-bold text-slate-900">
                                  {msg.type === "INTERNAL_NOTE" ? `Internal Note (${msg.sender} - ${msg.role})` : msg.sender}
                                </p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{msg.time}</p>
                             </div>
                          </div>
                          <button className="text-slate-300 hover:text-slate-500"><MoreHorizontal className="w-4 h-4" /></button>
                       </div>
                       <p className={`text-sm leading-relaxed ${msg.type === "INTERNAL_NOTE" ? "text-blue-900 italic" : "text-slate-600"}`}>
                         {msg.content}
                       </p>
                    </div>
                  ))}
               </div>

               {/* Reply Section */}
               <div className="p-6 bg-slate-50/50 border-t border-slate-100">
                  <div className="flex items-center gap-6 mb-4">
                     <div className="flex items-center gap-2">
                        <button className="px-3 py-1.5 bg-white border border-slate-200 text-blue-600 rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1.5">
                           <Globe className="w-3.5 h-3.5" /> Public
                        </button>
                        <button className="px-3 py-1.5 bg-transparent text-slate-500 rounded-lg text-[10px] font-bold flex items-center gap-1.5 hover:bg-white transition-all">
                           <Lock className="w-3.5 h-3.5" /> Private
                        </button>
                     </div>
                     <div className="flex items-center gap-2 cursor-pointer group">
                        <div className="w-4 h-4 border border-slate-300 rounded group-hover:border-blue-500 transition-all"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-900 transition-colors">Mark as Critical</span>
                     </div>
                  </div>
                  
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-inner">
                     <textarea 
                       rows={4}
                       placeholder="Type your response here... (Visible to all vendors)"
                       className="w-full text-sm bg-transparent border-none focus:outline-none resize-none placeholder:text-slate-300"
                     ></textarea>
                     <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                        <button className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors">
                           <Paperclip className="w-4 h-4" /> Attach File
                        </button>
                        <div className="flex gap-2">
                           <button className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all">
                              Save Draft
                           </button>
                           <button className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2">
                              Submit Reply <Send className="w-3.5 h-3.5" />
                           </button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Other Threads (Collapsed) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-all">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center font-bold text-lg">GL</div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-slate-900">Global Logistics Inc.</p>
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded uppercase">Pending</span>
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Private
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Financial Guarantee Format Options</h3>
                  </div>
               </div>
               <div className="flex items-center gap-4">
                  <div className="text-right">
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">1 message</p>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Yesterday, 04:30 PM</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300" />
               </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
