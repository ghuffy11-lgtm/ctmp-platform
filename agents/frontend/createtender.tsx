"use client";

import { AdminLayout } from "./AdminLayout";
import { useState } from "react";
import { 
  CheckCircle2, 
  Calendar, 
  ChevronRight, 
  Clock, 
  ChevronDown
} from "lucide-react";

const Step = ({ number, label, active, completed }: any) => (
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
        : completed 
          ? "bg-emerald-100 text-emerald-600" 
          : "bg-slate-100 text-slate-400"
    }`}>
      {completed ? <CheckCircle2 className="w-6 h-6" /> : number}
    </div>
    <span className={`text-sm font-bold ${active ? "text-blue-600" : completed ? "text-emerald-600" : "text-slate-400"}`}>
      {label}
    </span>
  </div>
);

export default function CreateTender() {
  const [formData, setFormData] = useState({
    title: "",
    ref: "TND-2023-0849",
    category: "",
    budget: "",
    deadlineDate: "",
    deadlineTime: "",
    type: "Open Tender",
    description: ""
  });

  return (
    <AdminLayout activeTab="tenders" title="Create Tender">
      {/* Progress Stepper */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Step number="1" label="Basic Information" active />
          <div className="flex-1 h-[1px] bg-slate-100 mx-4"></div>
          <Step number="2" label="Technical Requirements" />
          <div className="flex-1 h-[1px] bg-slate-100 mx-4"></div>
          <Step number="3" label="Evaluation Criteria" />
          <div className="flex-1 h-[1px] bg-slate-100 mx-4"></div>
          <Step number="4" label="Documents" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Basic Information</h3>
            <p className="text-sm text-slate-500 mt-1">Define the fundamental details of the tender.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Draft auto-saved
          </div>
        </div>

        <form className="p-8 space-y-8">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Tender Title <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text" 
                placeholder="Enter full tender title" 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Reference Number</label>
                <input 
                  type="text" 
                  value={formData.ref} 
                  readOnly
                  className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 mt-2">Auto-generated upon creation</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Category</label>
                <div className="relative">
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all">
                    <option>Select category...</option>
                    <option>Hardware & Software</option>
                    <option>Vehicles</option>
                    <option>Services</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Estimated Budget</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input 
                    type="number" 
                    placeholder="0.00" 
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Submission Deadline</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input type="date" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" />
                  </div>
                  <div className="w-32 relative">
                    <Clock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input type="time" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-4">Procurement Type</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "Open Tender", desc: "Publicly accessible to all registered vendors." },
                  { label: "Restricted", desc: "Only pre-qualified vendors can participate." },
                  { label: "Single Source", desc: "Direct award to a specific vendor." }
                ].map((type) => (
                  <label key={type.label} className={`p-4 border rounded-2xl cursor-pointer transition-all flex flex-col gap-1 ${
                    formData.type === type.label 
                      ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" 
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-bold ${formData.type === type.label ? "text-blue-700" : "text-slate-900"}`}>{type.label}</span>
                      <input 
                        type="radio" 
                        name="type" 
                        className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500" 
                        checked={formData.type === type.label}
                        onChange={() => setFormData({...formData, type: type.label})}
                      />
                    </div>
                    <p className={`text-[10px] leading-relaxed ${formData.type === type.label ? "text-blue-600" : "text-slate-500"}`}>{type.desc}</p>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Tender Description</label>
              <div className="border border-slate-200 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-4">
                  <button type="button" className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-500 font-bold">B</button>
                  <button type="button" className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-500 italic font-serif">I</button>
                  <button type="button" className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-500 underline">U</button>
                  <div className="w-[1px] h-4 bg-slate-200"></div>
                  <button type="button" className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-500">List</button>
                </div>
                <textarea 
                  rows={6} 
                  placeholder="Provide a detailed description of the goods or services required..."
                  className="w-full p-4 bg-white text-sm focus:outline-none"
                ></textarea>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 flex items-center justify-between">
            <button type="button" className="text-sm font-bold text-slate-500 hover:text-slate-700 px-6 py-2.5">
              Cancel
            </button>
            <div className="flex items-center gap-4">
              <button type="button" className="px-6 py-2.5 bg-white border border-slate-200 text-blue-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all">
                Save as Draft
              </button>
              <button type="button" className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">
                Next: Technical Requirements <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
