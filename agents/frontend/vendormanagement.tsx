"use client";

import { AdminLayout } from "./AdminLayout";
import { 
  Search, 
  Filter, 
  Plus, 
  MoreHorizontal, 
  ExternalLink, 
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Mail,
  Phone,
  Building2,
  ShieldCheck,
  Ban,
  MoreVertical
} from "lucide-react";
import { useState } from "react";

const VendorRow = ({ id, name, email, status, regDate, active, onClick }: any) => {
  const statusStyles: any = {
    "Approved": "bg-emerald-100 text-emerald-700",
    "Pending": "bg-amber-100 text-amber-700",
    "Blacklisted": "bg-rose-100 text-rose-700",
  };

  return (
    <div 
      onClick={onClick}
      className={`p-4 cursor-pointer transition-all border-b border-slate-100 flex items-center justify-between ${
        active ? "bg-blue-50/50" : "hover:bg-slate-50"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className={`text-sm font-bold truncate ${active ? "text-blue-900" : "text-slate-900"}`}>{name}</p>
        </div>
        <p className="text-xs text-slate-500 truncate">{email}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusStyles[status]}`}>
          {status}
        </span>
        <span className="text-[10px] text-slate-400 font-medium w-16 text-right">{regDate}</span>
      </div>
    </div>
  );
};

export default function VendorManagement() {
  const [selectedVendor, setSelectedVendor] = useState<any>({
    id: "VND-2023-8842",
    name: "NEXUS Heavy Industries",
    legalName: "NEXUS Heavy Industries LLC",
    regNumber: "CR-992011-AE",
    sector: "Construction Materials, Heavy Machinery",
    hq: "Dubai, United Arab Emirates",
    status: "Pending Approval",
    contact: {
      name: "Sarah Jenkins",
      role: "VP Sales",
      email: "s.jenkins@nexus-heavy.com",
      phone: "+971 4 332 9000"
    },
    compliance: {
      sanctions: "Clear",
      financialHealth: "Review Required",
      kycProgress: 50
    }
  });

  return (
    <AdminLayout activeTab="vendors" title="Vendor Management">
      <div className="flex h-[calc(100vh-160px)] gap-6">
        {/* Left Pane - Vendor List */}
        <div className="w-[400px] bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Vendors</h3>
            <button className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
              <Filter className="w-3.5 h-3.5" /> Filter
            </button>
          </div>
          
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search by name, email, or country..." 
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
             <div className="bg-slate-50 px-4 py-2 flex items-center justify-between border-b border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company</span>
                <div className="flex gap-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16 text-right">Reg. Date</span>
                </div>
             </div>
             <VendorRow 
               name="NEXUS Heavy Industries" 
               email="contact@nexus-heavy.com" 
               status="Pending" 
               regDate="2023-10-24" 
               active={selectedVendor?.id === "VND-2023-8842"}
             />
             <VendorRow 
               name="Global Logistics Corp" 
               email="tenders@globallogistics.net" 
               status="Approved" 
               regDate="2023-08-12" 
             />
             <VendorRow 
               name="Apex Consulting Group" 
               email="info@apexconsult.com" 
               status="Approved" 
               regDate="2023-09-05" 
             />
             <VendorRow 
               name="Delta Engineering Solutions" 
               email="bids@delta-eng.co.uk" 
               status="Blacklisted" 
               regDate="2022-11-18" 
             />
             <VendorRow 
               name="Prime Tech Supplies" 
               email="sales@primetech.io" 
               status="Pending" 
               regDate="2023-10-15" 
             />
          </div>
          
          <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-center">
            <p className="text-[10px] font-medium text-slate-500">Showing 5 of 142 vendors</p>
          </div>
        </div>

        {/* Right Pane - Vendor Detail */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm overflow-hidden overflow-y-auto">
          {selectedVendor ? (
            <div className="flex flex-col h-full">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold text-slate-900">{selectedVendor.name}</h2>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded uppercase">
                      {selectedVendor.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">ID: {selectedVendor.id} • Registered Oct 24, 2023</p>
                </div>
                <div className="flex items-center gap-3">
                  <button className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all">
                    Reject
                  </button>
                  <button className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">
                    Approve Vendor
                  </button>
                </div>
              </div>

              <div className="p-8 space-y-8">
                {/* Tabs */}
                <div className="flex gap-8 border-b border-slate-100">
                  {["Overview", "Documents", "History", "Bids"].map((tab) => (
                    <button 
                      key={tab}
                      className={`pb-4 text-sm font-bold transition-all relative ${
                        tab === "Overview" ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {tab}
                      {tab === "Overview" && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full"></div>}
                    </button>
                  ))}
                </div>

                {/* Profile Grid */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-8">
                   <h3 className="font-bold text-slate-900 mb-6">Company Profile</h3>
                   <div className="grid grid-cols-2 gap-y-8 gap-x-12">
                     <div>
                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Legal Name</p>
                       <p className="text-sm font-bold text-slate-700">{selectedVendor.legalName}</p>
                     </div>
                     <div>
                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Registration Number</p>
                       <p className="text-sm font-bold text-slate-700">{selectedVendor.regNumber}</p>
                     </div>
                     <div>
                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Industry Sector</p>
                       <p className="text-sm font-bold text-slate-700">{selectedVendor.sector}</p>
                     </div>
                     <div>
                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Headquarters</p>
                       <p className="text-sm font-bold text-slate-700">{selectedVendor.hq}</p>
                     </div>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  {/* Primary Contact */}
                  <div className="bg-white rounded-2xl border border-slate-100 p-6">
                    <h3 className="font-bold text-slate-900 mb-6">Primary Contact</h3>
                    <div className="space-y-4">
                       <div className="flex items-center gap-3">
                         <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                           <Building2 className="w-4 h-4" />
                         </div>
                         <p className="text-sm font-bold text-slate-700">{selectedVendor.contact.name}, {selectedVendor.contact.role}</p>
                       </div>
                       <div className="flex items-center gap-3">
                         <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                           <Mail className="w-4 h-4" />
                         </div>
                         <p className="text-sm font-medium text-blue-600 hover:underline cursor-pointer">{selectedVendor.contact.email}</p>
                       </div>
                       <div className="flex items-center gap-3">
                         <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                           <Phone className="w-4 h-4" />
                         </div>
                         <p className="text-sm font-medium text-slate-700">{selectedVendor.contact.phone}</p>
                       </div>
                    </div>
                  </div>

                  {/* Compliance Risk */}
                  <div className="bg-white rounded-2xl border border-slate-100 p-6">
                    <h3 className="font-bold text-slate-900 mb-6">Compliance Risk</h3>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600">Sanctions Check</span>
                        <div className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Clear
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600">Financial Health</span>
                        <div className="flex items-center gap-1 text-amber-600 text-xs font-bold">
                          <AlertCircle className="w-3.5 h-3.5" /> Review Required
                        </div>
                      </div>
                      <div className="pt-2">
                        <div className="flex justify-between items-center mb-2">
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">KYC Verification</span>
                           <span className="text-xs font-bold text-slate-900">{selectedVendor.compliance.kycProgress}% Complete</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                           <div className="h-full bg-blue-600 rounded-full" style={{ width: `${selectedVendor.compliance.kycProgress}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100 flex items-center justify-end gap-4">
                   <button className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition-all border border-slate-200">
                     <Ban className="w-3.5 h-3.5" /> Suspend
                   </button>
                   <button className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-rose-100">
                     <AlertCircle className="w-3.5 h-3.5" /> Blacklist
                   </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <Building2 className="w-12 h-12 opacity-10 mb-4" />
              <h3 className="text-lg font-bold text-slate-600">No Vendor Selected</h3>
              <p className="text-sm max-w-[240px] mt-2">Select a vendor from the left panel to view their profile and compliance status.</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
