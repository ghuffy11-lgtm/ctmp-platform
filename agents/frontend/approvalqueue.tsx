"use client";

import { AdminLayout } from "./AdminLayout";
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  Paperclip, 
  ArrowRight,
  Filter,
  Search,
  MoreVertical,
  ThumbsUp,
  ThumbsDown
} from "lucide-react";
import { useState } from "react";

const ApprovalItem = ({ id, type, subject, requester, priority, active, onClick }: any) => {
  const priorityColors: any = {
    "High": "bg-rose-100 text-rose-700",
    "Medium": "bg-amber-100 text-amber-700",
    "Low": "bg-slate-100 text-slate-600",
  };

  return (
    <div 
      onClick={onClick}
      className={`p-4 cursor-pointer transition-all border-l-4 ${
        active 
          ? "bg-blue-50 border-blue-600" 
          : "bg-white border-transparent hover:bg-slate-50 border-b border-slate-100"
      }`}
    >
      <div className="flex justify-between items-start mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{type}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${priorityColors[priority]}`}>
          {priority}
        </span>
      </div>
      <h4 className={`text-sm font-bold mb-1 ${active ? "text-blue-900" : "text-slate-900"}`}>{subject}</h4>
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-slate-500 font-medium">Req: {requester}</span>
        <span className="text-[10px] text-slate-400">2 hrs ago</span>
      </div>
    </div>
  );
};

export default function ApprovalQueue() {
  const [selectedTask, setSelectedTask] = useState<any>({
    id: "APV-9021",
    type: "Tender Approval",
    priority: "High",
    subject: "REF-2023-089: IT Infrastructure Upgrade - Phase 2",
    requester: "Jonathan Smith (IT Procurement)",
    submitted: "Oct 24, 2023 - 10:30 AM",
    desc: "Requesting approval to publish tender for the second phase of the corporate IT infrastructure upgrade. This covers core networking equipment replacement across 3 regional offices to support the new cloud strategy. Estimated value is $450,000.",
    justification: "Current switches are end-of-life in Q1 2024. Proceeding with this tender now ensures delivery and installation before vendor support terminates. Budget has been pre-approved under CapEx 2023/24."
  });

  return (
    <AdminLayout activeTab="approvals" title="Approval Queue">
      <div className="flex h-[calc(100vh-160px)] gap-6">
        {/* Left Pane - Task List */}
        <div className="w-1/3 bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Pending Tasks <span className="ml-2 bg-blue-600 text-white px-2 py-0.5 rounded-full text-[10px]">12</span></h3>
            <button className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
              <Filter className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search approvals..." 
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            <ApprovalItem 
              type="Tender Approval"
              priority="High"
              subject="REF-2023-089: IT Infrastructure Upgrade"
              requester="J. Smith"
              active={selectedTask?.id === "APV-9021"}
              onClick={() => {}}
            />
            <ApprovalItem 
              type="Award Approval"
              priority="Medium"
              subject="REF-2023-082: Office Furniture Supply"
              requester="A. Davis"
            />
            <ApprovalItem 
              type="Late Exception"
              priority="Low"
              subject="REF-2023-091: Security Services"
              requester="M. Chen"
            />
          </div>
        </div>

        {/* Right Pane - Task Detail */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden relative">
          {selectedTask ? (
            <>
              <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase">{selectedTask.type}</span>
                  <span className="px-2 py-1 bg-rose-100 text-rose-700 text-[10px] font-bold rounded uppercase">{selectedTask.priority} Priority</span>
                  <span className="text-xs text-slate-400 font-medium">Task ID: {selectedTask.id}</span>
                </div>
                <button className="p-2 hover:bg-slate-100 rounded-lg">
                  <MoreVertical className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">{selectedTask.subject}</h2>
                  
                  <div className="grid grid-cols-2 gap-8 mb-8">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Requester</p>
                      <p className="text-sm font-bold text-slate-900">{selectedTask.requester}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Submitted</p>
                      <p className="text-sm font-bold text-slate-900">{selectedTask.submitted}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 mb-2">Description</h4>
                      <p className="text-sm text-slate-600 leading-relaxed">{selectedTask.desc}</p>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 relative">
                      <div className="absolute left-6 top-6">
                        <span className="text-4xl font-serif text-blue-200">“</span>
                      </div>
                      <div className="pl-8">
                        <h4 className="text-sm font-bold text-slate-900 mb-2">Requester Justification</h4>
                        <p className="text-sm text-slate-600 italic leading-relaxed">{selectedTask.justification}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-4">Supporting Documents</h4>
                  <div className="space-y-2">
                    {[
                      { name: "Draft_Tender_Document_v2.pdf", size: "2.4 MB" },
                      { name: "Budget_Approval_Memo.xlsx", size: "156 KB" }
                    ].map((doc, i) => (
                      <div key={i} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-all cursor-pointer group">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-100 rounded-lg text-slate-400 group-hover:bg-white group-hover:text-blue-600 transition-colors">
                            <Paperclip className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{doc.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold">{doc.size}</p>
                          </div>
                        </div>
                        <button className="text-slate-400 hover:text-blue-600 transition-colors">
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Approver Comments <span className="text-slate-400 font-normal">(Optional)</span></h4>
                  <textarea 
                    rows={3}
                    placeholder="Add a note to the audit trail..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  ></textarea>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-white sticky bottom-0 z-10 flex items-center justify-end gap-4">
                <button className="px-8 py-3 bg-white border border-rose-200 text-rose-600 rounded-xl font-bold text-sm hover:bg-rose-50 transition-all">
                  Reject Request
                </button>
                <button className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">
                  Confirm Approval
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 opacity-20" />
              </div>
              <h3 className="text-lg font-bold text-slate-600">No Task Selected</h3>
              <p className="text-sm max-w-[240px] mt-2">Pick an approval task from the left to review its details and take action.</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
