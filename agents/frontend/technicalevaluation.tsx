"use client";

import { AdminLayout } from "./AdminLayout";
import { useState } from "react";
import { 
  ChevronRight, 
  ChevronDown, 
  Search, 
  FileText, 
  CheckCircle2, 
  Download, 
  Info,
  Save,
  ShieldCheck,
  AlertCircle
} from "lucide-react";

const VendorRow = ({ id, name, status, score, active, onClick }: any) => {
  const statusStyles: any = {
    "PASS": "bg-emerald-100 text-emerald-700",
    "FAIL": "bg-rose-100 text-rose-700",
    "DRAFT": "bg-slate-100 text-slate-600",
  };

  return (
    <div 
      onClick={onClick}
      className={`p-4 cursor-pointer border-b border-slate-100 transition-all ${
        active ? "bg-blue-50/50" : "hover:bg-slate-50"
      }`}
    >
      <div className="flex justify-between items-start mb-1">
        <p className="text-sm font-bold text-slate-900">{name}</p>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusStyles[status] || "bg-slate-100"}`}>
          {status}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <p className="text-[10px] text-slate-500 font-medium">Bid Ref: {id}</p>
        <p className="text-xs font-bold text-slate-900">{score !== "--" ? `${score} / 100` : "-- / 100"}</p>
      </div>
    </div>
  );
};

export default function TechnicalEvaluation() {
  const [selectedVendor, setSelectedVendor] = useState({
    id: "B-089-01",
    name: "TechCorp Solutions",
    status: "DRAFT",
    score: "--"
  });

  const criteria = [
    {
      id: "2.1",
      title: "Technical Architecture",
      desc: "Proposed cloud architecture diagram, redundancy protocols, and alignment with enterprise zero-trust model.",
      weight: "30%",
      score: 75,
      notes: "Solid overall architecture, but needs more detail on failover."
    },
    {
      id: "2.3",
      title: "Implementation Timeline",
      desc: "Detailed Gantt chart, milestone definitions, and realistic phased rollout plan minimizing downtime.",
      weight: "25%",
      score: 88,
      notes: "Very thorough timeline."
    },
    {
      id: "3.1",
      title: "Team Expertise & Certifications",
      desc: "Resumes of key personnel, valid vendor certifications (AWS/Azure), and past similar project references.",
      weight: "25%",
      score: null,
      notes: ""
    },
    {
      id: "4.0",
      title: "Support & SLA",
      desc: "24/7 support availability, response time guarantees, and escalation matrices.",
      weight: "20%",
      score: null,
      notes: ""
    }
  ];

  return (
    <AdminLayout activeTab="technical" title="Technical Evaluation">
      <div className="flex h-[calc(100vh-160px)] gap-6">
        {/* Left Pane - Tender Selection */}
        <div className="w-[350px] bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Evaluations</h3>
          </div>
          
          <div className="flex border-b border-slate-100">
            <button className="flex-1 py-3 text-xs font-bold text-blue-600 border-b-2 border-blue-600">Open</button>
            <button className="flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-600">Completed</button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-4 border-b border-slate-100 bg-slate-50/30">
               <div className="flex items-center justify-between mb-2">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TND-2023-089</p>
                 <ChevronDown className="w-4 h-4 text-slate-400" />
               </div>
               <h4 className="text-sm font-bold text-slate-900 leading-tight mb-4">Enterprise Cloud Infrastructure Upgrade</h4>
               
               <div className="space-y-1 -mx-4">
                 <VendorRow 
                   name="TechCorp Solutions" 
                   id="B-089-01" 
                   status="DRAFT" 
                   score="--" 
                   active={selectedVendor.name === "TechCorp Solutions"}
                   onClick={() => setSelectedVendor({ id: "B-089-01", name: "TechCorp Solutions", status: "DRAFT", score: "--" })}
                 />
                 <VendorRow 
                   name="Global Networks Inc." 
                   id="B-089-02" 
                   status="PASS" 
                   score="85" 
                   onClick={() => setSelectedVendor({ id: "B-089-02", name: "Global Networks Inc.", status: "PASS", score: "85" })}
                 />
                 <VendorRow 
                   name="Apex Systems LLC" 
                   id="B-089-03" 
                   status="FAIL" 
                   score="42" 
                   onClick={() => setSelectedVendor({ id: "B-089-03", name: "Apex Systems LLC", status: "FAIL", score: "42" })}
                 />
               </div>
            </div>

            <div className="p-4 flex items-center justify-between">
               <div className="flex flex-col">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TND-2023-092</p>
                 <p className="text-sm font-bold text-slate-900 mt-1">Data Center Cooling Systems</p>
               </div>
               <div className="bg-slate-100 px-2 py-1 rounded text-[10px] font-bold text-slate-500">4 Bids</div>
            </div>
          </div>
        </div>

        {/* Right Pane - Evaluation Workspace */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden overflow-y-auto">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-slate-900">{selectedVendor.name}</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">
                  {selectedVendor.status} MODE
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Evaluating against: <span className="font-bold">TND-2023-089 (Enterprise Cloud Infrastructure Upgrade)</span></p>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-6 py-2.5 bg-white border border-slate-200 text-blue-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all">
                Save Draft
              </button>
              <button className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">
                Finalize Score
              </button>
            </div>
          </div>

          <div className="p-8 space-y-8">
            {/* Info Banner */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6 flex gap-4">
               <div className="p-2 bg-blue-100 rounded-lg h-fit">
                 <Info className="w-5 h-5 text-blue-600" />
               </div>
               <div>
                 <h4 className="text-sm font-bold text-blue-900 mb-1">Evaluation Instructions</h4>
                 <p className="text-xs text-blue-700 leading-relaxed max-w-2xl">
                   Score each criterion out of 100. The system will automatically calculate the weighted score. A minimum total weighted score of 70 is required to be considered for a PASS verdict.
                 </p>
               </div>
            </div>

            {/* Criteria Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">
                     <th className="py-4 px-6 font-bold w-48">Criterion</th>
                     <th className="py-4 px-6 font-bold">Description / Evidence Required</th>
                     <th className="py-4 px-6 font-bold text-center w-24">Max Weight</th>
                     <th className="py-4 px-6 font-bold text-center w-24">Score (0-100)</th>
                     <th className="py-4 px-6 font-bold">Evaluator Notes</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {criteria.map((item) => (
                     <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                       <td className="py-6 px-6 align-top">
                         <p className="text-sm font-bold text-slate-900">{item.title}</p>
                         <p className="text-[10px] text-slate-400 font-medium mt-1">Sec {item.id}</p>
                       </td>
                       <td className="py-6 px-6 align-top">
                         <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                       </td>
                       <td className="py-6 px-6 align-top text-center">
                         <span className="text-xs font-bold text-slate-900">{item.weight}</span>
                       </td>
                       <td className="py-6 px-6 align-top text-center">
                         <input 
                           type="text" 
                           defaultValue={item.score || ""} 
                           placeholder="--"
                           className="w-16 h-10 text-center bg-white border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                         />
                       </td>
                       <td className="py-6 px-6 align-top">
                         <textarea 
                           rows={2}
                           placeholder="Add notes..."
                           defaultValue={item.notes}
                           className="w-full bg-slate-50/50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                         ></textarea>
                       </td>
                     </tr>
                   ))}
                   <tr className="bg-slate-50/80 font-bold">
                      <td colSpan={2} className="py-4 px-6 text-right text-sm text-slate-900 uppercase tracking-wider">Total Weighted Score:</td>
                      <td className="py-4 px-6 text-center text-sm text-slate-900">100%</td>
                      <td className="py-4 px-6 text-center bg-blue-100 text-blue-700 text-lg">44.5</td>
                      <td className="py-4 px-6 text-[10px] text-slate-400 flex items-center gap-2 mt-1">
                        <FileText className="w-3.5 h-3.5" /> Auto-calculated
                      </td>
                   </tr>
                 </tbody>
               </table>
            </div>

            {/* Footer Actions */}
            <div className="pt-8 border-t border-slate-100 flex items-center justify-between">
               <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                 <Clock className="w-3.5 h-3.5" />
                 Last edited by <span className="font-bold">Admin User</span> on Oct 24, 2023 at 14:32
               </div>
               
               <div className="flex items-center gap-6">
                 <div className="flex items-center gap-2 text-rose-500 text-xs font-bold bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Locking these scores is irreversible.
                 </div>
                 <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">
                   <ShieldCheck className="w-4 h-4" /> Finalize & Submit
                 </button>
               </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
