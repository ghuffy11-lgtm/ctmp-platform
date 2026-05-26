"use client";

import { AdminLayout } from "./AdminLayout";
import { useState } from "react";
import { 
  ChevronDown, 
  Search, 
  FileText, 
  CheckCircle2, 
  Download, 
  ArrowUpRight,
  ChevronRight,
  TrendingUp,
  Star,
  ExternalLink,
  Save,
  BarChart3
} from "lucide-react";

const TenderCard = ({ id, title, active, bids, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`p-4 cursor-pointer border-b border-slate-100 transition-all ${
      active ? "bg-blue-50/50 border-l-4 border-l-blue-600" : "hover:bg-slate-50 border-l-4 border-l-transparent"
    }`}
  >
    <div className="flex justify-between items-center mb-2">
      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{id}</p>
      {active && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">Active</span>}
    </div>
    <h4 className="text-sm font-bold text-slate-900 leading-tight mb-3">{title}</h4>
    <div className="flex items-center gap-2 text-slate-400">
      <FileText className="w-3.5 h-3.5" />
      <span className="text-[10px] font-medium">{bids} Bids Submitted</span>
    </div>
  </div>
);

export default function CommercialEvaluation() {
  const [selectedTender, setSelectedTender] = useState("TND-2023-089");
  const [expandedVendor, setExpandedVendor] = useState<string | null>("Apex Solutions Inc.");

  const vendors = [
    {
      name: "Apex Solutions Inc.",
      techScore: "94.5 / 100",
      totalBid: "$1,250,000.00",
      discount: "10%",
      netPrice: "$1,125,000.00",
      rank: 1,
      items: [
        { label: "Software Licenses (Tier 1)", price: "$600,000.00" },
        { label: "Implementation Services", price: "$450,000.00" },
        { label: "Annual Support (Year 1)", price: "$200,000.00" }
      ]
    },
    {
      name: "Global Tech Partners",
      techScore: "89.0 / 100",
      totalBid: "$1,100,000.00",
      discount: "5%",
      netPrice: "$1,045,000.00",
      rank: 2
    },
    {
      name: "Nexus Systems Ltd.",
      techScore: "91.2 / 100",
      totalBid: "$1,320,000.00",
      discount: "12%",
      netPrice: "$1,161,600.00",
      rank: 3
    },
    {
      name: "Integrity IT",
      techScore: "72.5 / 100",
      totalBid: "$980,000.00",
      discount: "0%",
      netPrice: "$980,000.00",
      rank: 4
    }
  ];

  return (
    <AdminLayout activeTab="committee" title="Commercial Evaluation">
      <div className="mb-8">
        <p className="text-sm text-slate-500">Compare commercial bids, apply negotiated discounts, and finalize award recommendations.</p>
      </div>

      <div className="flex h-[calc(100vh-200px)] gap-6">
        {/* Left Sidebar - Tenders in Evaluation */}
        <div className="w-[380px] bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-900">Tenders in Evaluation</h3>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
             <TenderCard 
               id="TND-2023-089" 
               title="Enterprise Resource Planning (ERP) Implementation" 
               active={selectedTender === "TND-2023-089"} 
               bids={4}
               onClick={() => setSelectedTender("TND-2023-089")}
             />
             <TenderCard 
               id="TND-2023-092" 
               title="Datacenter Hardware Refresh Q3" 
               bids={2}
             />
             <TenderCard 
               id="TND-2023-104" 
               title="Legal Counsel Retainer Services" 
               bids={5}
             />
          </div>
        </div>

        {/* Main Content - Comparison Matrix */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden overflow-y-auto">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Bid Comparison Matrix</h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">TND-2023-089 — Enterprise Resource Planning (ERP) Implementation</p>
            </div>
            <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all">
              <Download className="w-4 h-4" /> Export Comparison
            </button>
          </div>

          <div className="p-8 space-y-10">
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">
                     <th className="py-4 px-6 font-bold w-16 text-center">Select</th>
                     <th className="py-4 px-6 font-bold">Vendor Name</th>
                     <th className="py-4 px-6 font-bold text-center">Technical Score</th>
                     <th className="py-4 px-6 font-bold text-right">Total Bid Price</th>
                     <th className="py-4 px-6 font-bold text-right">Discount</th>
                     <th className="py-4 px-6 font-bold text-right">Net Price</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {vendors.map((vendor, idx) => (
                     <React.Fragment key={idx}>
                       <tr className={`hover:bg-slate-50 transition-colors ${expandedVendor === vendor.name ? "bg-slate-50/50" : ""}`}>
                         <td className="py-5 px-6 text-center">
                            <input 
                              type="radio" 
                              name="award" 
                              checked={idx === 0} 
                              className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer" 
                            />
                         </td>
                         <td className="py-5 px-6">
                           <button 
                             onClick={() => setExpandedVendor(expandedVendor === vendor.name ? null : vendor.name)}
                             className="flex items-center gap-2 group"
                           >
                             <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600">{vendor.name}</span>
                             <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedVendor === vendor.name ? "rotate-180" : ""}`} />
                           </button>
                         </td>
                         <td className="py-5 px-6 text-center">
                           <span className={`px-3 py-1 rounded-lg text-xs font-bold ${idx === 3 ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-700"}`}>
                             {vendor.techScore}
                           </span>
                         </td>
                         <td className="py-5 px-6 text-right text-sm font-medium text-slate-600">{vendor.totalBid}</td>
                         <td className="py-5 px-6 text-right text-sm font-bold text-slate-900">{vendor.discount}</td>
                         <td className="py-5 px-6 text-right text-sm font-bold text-blue-600">{vendor.netPrice}</td>
                       </tr>
                       
                       {/* Expanded Breakdown */}
                       {expandedVendor === vendor.name && vendor.items && (
                         <tr className="bg-slate-50/30">
                           <td colSpan={6} className="p-0">
                              <div className="px-16 py-4 space-y-3">
                                {vendor.items.map((item, i) => (
                                  <div key={i} className="flex justify-between items-center text-xs text-slate-500">
                                    <span>{item.label}</span>
                                    <span className="font-bold text-slate-700">{item.price}</span>
                                  </div>
                                ))}
                              </div>
                           </td>
                         </tr>
                       )}
                     </React.Fragment>
                   ))}
                 </tbody>
               </table>
            </div>

            {/* Recommendation Box */}
            <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-8">
                 <div className="p-2 bg-blue-100 rounded-lg">
                   <Star className="w-5 h-5 text-blue-600" />
                 </div>
                 <h3 className="text-lg font-bold text-slate-900">Award Recommendation</h3>
              </div>

              <div className="flex flex-col lg:flex-row gap-8">
                 <div className="w-full lg:w-1/3 bg-white p-6 rounded-2xl border border-slate-200 flex flex-col items-center text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Recommended Vendor</p>
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-2xl mb-4">
                       A
                    </div>
                    <h4 className="text-lg font-bold text-slate-900">Apex Solutions Inc.</h4>
                    <p className="text-xs text-slate-500 font-medium mt-1">Rank #1 • Score: 94.5</p>
                 </div>

                 <div className="flex-1 space-y-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                      Justification for Recommendation <span className="text-rose-500">*</span>
                    </label>
                    <textarea 
                      rows={4}
                      className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="Provide detailed reasoning for selecting this vendor. This will be recorded in the audit log."
                    ></textarea>
                    <div className="flex justify-end">
                       <button className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">
                          <CheckCircle2 className="w-4 h-4" /> Submit Recommendation
                       </button>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
