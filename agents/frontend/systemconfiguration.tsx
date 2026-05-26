"use client";

import { AdminLayout } from "./AdminLayout";
import { useState } from "react";
import { 
  Users, 
  ShieldCheck, 
  Mail, 
  Settings, 
  Building2, 
  Lock, 
  Key, 
  Bell, 
  Globe, 
  Plus, 
  Search, 
  CheckSquare, 
  Square,
  Save,
  Trash2,
  ChevronDown,
  Monitor,
  Database
} from "lucide-react";

export default function SystemConfiguration() {
  const [activeTab, setActiveTab] = useState("platform");
  const [isSaving, setIsSaving] = useState(false);

  const tabs = [
    { id: "roles", label: "Roles & Permissions", icon: ShieldCheck },
    { id: "notifications", label: "Notification Templates", icon: Bell },
    { id: "platform", label: "Platform Settings", icon: Settings },
    { id: "departments", label: "Departments", icon: Building2 },
  ];

  return (
    <AdminLayout activeTab="settings" title="System Configuration Hub">
      <div className="mb-8">
        <p className="text-sm text-slate-500">Manage enterprise-wide settings, user roles, structural departments, and platform limits.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-8 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all relative ${
              activeTab === tab.id ? "text-blue-600" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-blue-600" : "text-slate-400"}`} />
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-[3px] bg-blue-600 rounded-t-full"></div>
            )}
          </button>
        ))}
      </div>

      {activeTab === "platform" && (
        <div className="space-y-8">
          {/* Health Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
               <div className="flex justify-between items-start mb-6">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Health</p>
                 <ShieldCheck className="w-5 h-5 text-blue-600" />
               </div>
               <h3 className="text-4xl font-bold text-slate-900 mb-2">Optimal</h3>
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                 <p className="text-xs text-slate-500 font-medium">99.98% Uptime (30d)</p>
               </div>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
               <div className="flex justify-between items-start mb-6">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Storage Quota</p>
                 <Database className="w-5 h-5 text-blue-600" />
               </div>
               <h3 className="text-4xl font-bold text-slate-900 mb-2">42%</h3>
               <div className="w-full h-1.5 bg-slate-100 rounded-full mt-4">
                 <div className="w-[42%] h-full bg-blue-600 rounded-full"></div>
               </div>
               <p className="text-xs text-slate-500 font-medium mt-2">210GB of 500GB Used</p>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
               <div className="flex justify-between items-start mb-6">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Sessions</p>
                 <Users className="w-5 h-5 text-blue-600" />
               </div>
               <h3 className="text-4xl font-bold text-slate-900 mb-2">1,204</h3>
               <p className="text-xs text-emerald-600 font-bold mt-2">+12% from yesterday peak</p>
            </div>
          </div>

          {/* Config Sections */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900">Global Parameters</h4>
                <p className="text-xs text-slate-500 mt-1">Core application settings affecting all tenants.</p>
              </div>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 transition-all">
                Save Changes
              </button>
            </div>
            
            <div className="divide-y divide-slate-100">
              <div className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Session Timeout</p>
                  <p className="text-xs text-slate-500 mt-1">Automatically log out users after a period of inactivity.</p>
                </div>
                <div className="flex items-center gap-3">
                  <input type="number" defaultValue={30} className="w-24 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  <span className="text-xs font-medium text-slate-500">mins</span>
                </div>
              </div>

              <div className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Maximum Upload Size</p>
                  <p className="text-xs text-slate-500 mt-1">Cap the file size for tender document attachments.</p>
                </div>
                <select className="w-48 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option>100 MB</option>
                  <option>250 MB</option>
                  <option>500 MB</option>
                </select>
              </div>

              <div className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Enforce 2FA for Vendors</p>
                  <p className="text-xs text-slate-500 mt-1">Require two-factor authentication for all external vendor accounts.</p>
                </div>
                <button className="w-12 h-6 bg-blue-600 rounded-full relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </button>
              </div>

              <div className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Base Currency</p>
                  <p className="text-xs text-slate-500 mt-1">Default currency for all commercial evaluations.</p>
                </div>
                <select className="w-48 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option>USD ($)</option>
                  <option>EUR (€)</option>
                  <option>GBP (£)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab !== "platform" && (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-dashed border-slate-200">
           <div className="p-4 bg-slate-50 rounded-full mb-4">
             <Settings className="w-8 h-8 text-slate-400 opacity-50" />
           </div>
           <h3 className="text-lg font-bold text-slate-900">{tabs.find(t => t.id === activeTab)?.label} workspace</h3>
           <p className="text-sm text-slate-500 mt-2 max-w-sm text-center">Implementation for this tab follows the pattern of the platform settings shown above.</p>
        </div>
      )}
    </AdminLayout>
  );
}
