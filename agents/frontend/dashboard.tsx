"use client";

import { AdminLayout } from "./AdminLayout";
import {
  Users,
  FileText,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Package,
  ShoppingCart,
  UserPlus,
  ShieldCheck
} from "lucide-react";

const StatCard = ({ title, value, change, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      {change && (
        <span className={`text-xs font-medium flex items-center gap-1 ${change.startsWith("+") ? "text-emerald-600" : "text-rose-600"}`}>
          {change} <TrendingUp className="w-3 h-3" />
        </span>
      )}
    </div>
    <p className="text-sm font-medium text-slate-500">{title}</p>
    <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
  </div>
);

export default function Dashboard() {
  return (
    <AdminLayout activeTab="dashboard" title="Dashboard Overview">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Active Tenders" value="24" change="+3 this week" icon={FileText} color="bg-blue-600" />
        <StatCard title="Pending Approvals" value="7" change="Action Required" icon={CheckCircle2} color="bg-amber-500" />
        <StatCard title="Registered Vendors" value="142" change="98% compliant" icon={Users} color="bg-blue-600" />
        <StatCard title="Open Clarifications" value="12" change="Awaiting responses" icon={Clock} color="bg-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Recent Activity</h3>
              <button className="text-sm font-medium text-blue-600 hover:underline">View All</button>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { tender: "TND-2023-089", stage: "Technical Evaluation", status: "In Progress", time: "2 hrs ago", statusColor: "bg-blue-100 text-blue-700" },
                { tender: "TND-2023-092", stage: "Review", status: "Pending Approval", time: "5 hrs ago", statusColor: "bg-amber-100 text-amber-700" },
                { tender: "TND-2023-075", stage: "Published", status: "Active", time: "1 day ago", statusColor: "bg-emerald-100 text-emerald-700" },
                { tender: "TND-2023-095", stage: "Draft", status: "Draft", time: "2 days ago", statusColor: "bg-slate-100 text-slate-600" },
              ].map((activity, i) => (
                <div key={i} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-xs">
                      {activity.tender.split("-")[2].substring(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{activity.tender}</p>
                      <p className="text-xs text-slate-500">{activity.stage}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${activity.statusColor}`}>
                      {activity.status}
                    </span>
                    <span className="text-xs text-slate-400">{activity.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Chart Placeholder */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">Tender Distribution by Stage</h3>
            <div className="h-64 flex items-end justify-between px-4">
              {[
                { label: "Draft", value: "h-[20%]", count: 5 },
                { label: "Review", value: "h-[35%]", count: 7 },
                { label: "Approved", value: "h-[15%]", count: 2 },
                { label: "Published", value: "h-[60%]", count: 12 },
                { label: "Evaluation", value: "h-[45%]", count: 8 },
                { label: "Award", value: "h-[25%]", count: 4 },
              ].map((bar, i) => (
                <div key={i} className="flex flex-col items-center gap-3 w-12">
                  <span className="text-xs font-bold text-slate-900">{bar.count}</span>
                  <div className={`${bar.value} w-full bg-blue-600 rounded-t-lg opacity-80 hover:opacity-100 transition-opacity`}></div>
                  <span className="text-[10px] text-slate-500 font-medium rotate-45 lg:rotate-0 mt-2">{bar.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Quick Actions */}
          <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl">
            <h3 className="font-bold mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                <UserPlus className="w-4 h-4" /> Create New Tender
              </button>
              <button className="w-full bg-white/10 hover:bg-white/20 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                Review Pending Approvals (7)
              </button>
              <button className="w-full bg-white/10 hover:bg-white/20 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                Manage Vendor Database
              </button>
            </div>
          </div>

          {/* System Health */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" /> System Health
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Core Services</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Operational</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Vendor Portal</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Operational</span>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Last Backup</p>
                <p className="text-xs text-slate-600">Today, 04:00 AM GST</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
