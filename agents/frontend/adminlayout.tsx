"use client";

import React, { useState } from "react";
import {
  LayoutDashboard,
  Gavel,
  CheckCircle2,
  MessageSquare,
  BarChart3,
  Users,
  Building2,
  Scale,
  History,
  Settings,
  LogOut,
  Search,
  Bell,
  HelpCircle,
  Menu,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  FileText
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  title: string;
}

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  href = "#" 
}: { 
  icon: any, 
  label: string, 
  active?: boolean, 
  href?: string 
}) => (
  <a
    href={href}
    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
      active 
        ? "bg-slate-100 text-slate-900 font-semibold shadow-sm" 
        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
    }`}
  >
    <Icon className={`w-5 h-5 ${active ? "text-blue-600" : ""}`} />
    <span className="text-sm">{label}</span>
  </a>
);

export const AdminLayout = ({ children, activeTab, title }: LayoutProps) => {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-30">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            C
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-none">CTMP Admin</h1>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Procurement Authority</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === "dashboard"} />
          <SidebarItem icon={Gavel} label="Tenders" active={activeTab === "tenders"} />
          <SidebarItem icon={CheckCircle2} label="Approvals" active={activeTab === "approvals"} />
          <SidebarItem icon={MessageSquare} label="Clarifications" active={activeTab === "clarifications"} />
          <SidebarItem icon={BarChart3} label="Technical Evaluation" active={activeTab === "technical"} />
          <SidebarItem icon={Scale} label="Committee & Commercial" active={activeTab === "committee"} />
          <SidebarItem icon={Building2} label="Vendor Management" active={activeTab === "vendors"} />
          <SidebarItem icon={FileText} label="Reports" active={activeTab === "reports"} />
          <SidebarItem icon={History} label="Audit Log" active={activeTab === "audit"} />
          <SidebarItem icon={Settings} label="System Configuration" active={activeTab === "settings"} />
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-1">
          <SidebarItem icon={LogOut} label="Logout" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 flex flex-col">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-20">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search everything..." 
                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-64 transition-all"
              />
            </div>
            
            <div className="flex items-center gap-4">
              <button className="relative p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
              </button>
              <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
                <HelpCircle className="w-5 h-5" />
              </button>
              <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>
              <button className="flex items-center gap-2 pl-2 group">
                <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-100">
                  <img src="https://ui-avatars.com/api/?name=Admin+User&background=0D8ABC&color=fff" alt="User" />
                </div>
                <div className="text-left hidden lg:block">
                  <p className="text-xs font-semibold text-slate-900 leading-none">Admin User</p>
                  <p className="text-[10px] text-slate-500 mt-1">Super Admin</p>
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* Page Body */}
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
