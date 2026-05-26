"use client";

import { AdminLayout } from "./AdminLayout";
import { 
  Search, 
  Filter, 
  Plus, 
  MoreHorizontal, 
  ExternalLink, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText
} from "lucide-react";

const TenderRow = ({ id, name, dept, category, status, deadline }: any) => {
  const statusStyles: any = {
    "Draft": "bg-slate-100 text-slate-600",
    "Internal Review": "bg-blue-100 text-blue-700",
    "Approved": "bg-blue-100 text-blue-700",
    "Published": "bg-emerald-100 text-emerald-700",
    "Clarification Period": "bg-blue-100 text-blue-700",
    "Submission Closed": "bg-blue-100 text-blue-700",
    "Technical Opening": "bg-blue-100 text-blue-700",
    "Technical Evaluation": "bg-amber-100 text-amber-700",
    "Commercial Sealed": "bg-blue-100 text-blue-700",
    "Committee Commercial Opening": "bg-amber-100 text-amber-700",
    "Commercial Evaluation / Comparison": "bg-amber-100 text-amber-700",
    "Award Recommendation": "bg-amber-100 text-amber-700",
    "Awarded": "bg-emerald-100 text-emerald-700",
    "Tender Closed": "bg-slate-100 text-slate-600",
    "Cancelled": "bg-rose-100 text-rose-700",
    "Suspended": "bg-rose-100 text-rose-700",
    "Archived": "bg-slate-100 text-slate-600",
  };

  return (
    <tr className="hover:bg-slate-50 transition-colors border-b border-slate-100 group">
      <td className="py-4 px-4">
        <span className="text-xs font-bold text-slate-400 group-hover:text-blue-600 transition-colors">{id}</span>
      </td>
      <td className="py-4 px-4">
        <div>
          <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{dept}</p>
        </div>
      </td>
      <td className="py-4 px-4">
        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">{category}</span>
      </td>
      <td className="py-4 px-4">
        <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${statusStyles[status] || "bg-slate-100"}`}>
          {status}
        </span>
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center gap-2 text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">{deadline || "TBD"}</span>
        </div>
      </td>
      <td className="py-4 px-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
            <ExternalLink className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};

export default function TendersList() {
  return (
    <AdminLayout activeTab="tenders" title="Tender Management">
      <div className="flex items-center justify-end mb-8">
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 transition-all">
          <Plus className="w-4 h-4" /> Create New Tender
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-4">
          <div className="flex-1 relative min-w-[300px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by ID, name, or category..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <select className="bg-white border border-slate-200 text-sm py-2.5 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option>All Statuses</option>
              <option>Draft</option>
              <option>Internal Review</option>
              <option>Approved</option>
              <option>Published</option>
              <option>Clarification Period</option>
              <option>Submission Closed</option>
              <option>Technical Opening</option>
              <option>Technical Evaluation</option>
              <option>Commercial Sealed</option>
              <option>Committee Commercial Opening</option>
              <option>Commercial Evaluation / Comparison</option>
              <option>Award Recommendation</option>
              <option>Awarded</option>
              <option>Tender Closed</option>
              <option>Cancelled</option>
              <option>Suspended</option>
              <option>Archived</option>
            </select>
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition-colors">
               <Calendar className="w-4 h-4" />
               <span>Date Range</span>
            </div>
            <button className="text-sm font-bold text-blue-600 px-4">Clear Filters</button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                <th className="py-4 px-4 font-bold">Tender ID</th>
                <th className="py-4 px-4 font-bold">Tender Name & Dept</th>
                <th className="py-4 px-4 font-bold">Category</th>
                <th className="py-4 px-4 font-bold">Current Stage</th>
                <th className="py-4 px-4 font-bold">Closing Date</th>
                <th className="py-4 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <TenderRow 
                id="TR-2024-089" 
                name="IT Infrastructure Upgrade Phase 2" 
                dept="Technology & Innovation" 
                category="Hardware & Software" 
                status="Published" 
                deadline="Oct 15, 2024" 
              />
              <TenderRow 
                id="TR-2024-088" 
                name="Corporate Fleet Vehicles Supply" 
                dept="Logistics" 
                category="Vehicles" 
                status="Draft" 
                deadline="TBD" 
              />
              <TenderRow 
                id="TR-2024-075" 
                name="Annual Facility Maintenance" 
                dept="Facilities Management" 
                category="Services" 
                status="Technical Evaluation" 
                deadline="Sep 01, 2024" 
              />
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 flex items-center justify-between bg-slate-50/50">
          <p className="text-xs font-medium text-slate-500">Showing 1 to 3 of 124 entries</p>
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all text-slate-400 hover:text-slate-600 disabled:opacity-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-500/20">1</button>
            <button className="w-8 h-8 hover:bg-white text-slate-600 rounded-lg text-xs font-bold transition-all">2</button>
            <button className="w-8 h-8 hover:bg-white text-slate-600 rounded-lg text-xs font-bold transition-all">3</button>
            <span className="px-1 text-slate-300">...</span>
            <button className="w-8 h-8 hover:bg-white text-slate-600 rounded-lg text-xs font-bold transition-all">12</button>
            <button className="p-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all text-slate-400 hover:text-slate-600">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
