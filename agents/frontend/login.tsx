"use client";

import React, { useState } from "react";
import { 
  ShieldAlert, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  HelpCircle,
  Monitor
} from "lucide-react";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left Branding Side */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden items-center justify-center p-12">
        {/* Abstract background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500 via-transparent to-transparent"></div>
          <div className="grid grid-cols-12 h-full w-full">
            {[...Array(144)].map((_, i) => (
              <div key={i} className="border-[0.5px] border-white/10 aspect-square"></div>
            ))}
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">CTMP</span>
          </div>
          
          <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
            Corporate Tender Management Platform
          </h1>
          
          <p className="text-slate-400 text-lg leading-relaxed">
            Secure internal portal for managing enterprise procurement, vendor evaluations, and compliance tracking.
          </p>
        </div>

        {/* Floating background elements */}
        <div className="absolute bottom-20 left-20 w-64 h-64 bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute top-20 right-20 w-64 h-64 bg-blue-600/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Right Login Form Side */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 lg:p-24 bg-white relative">
        <div className="w-full max-w-md">
          <div className="bg-white p-10 rounded-2xl border border-slate-100 shadow-2xl shadow-slate-200/50">
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Sign In</h2>
              <p className="text-sm text-slate-500">Enter your Active Directory credentials to access the internal dashboard.</p>
            </div>

            <form className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Active Directory Username
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <User className="w-4 h-4" />
                  </div>
                  <input 
                    type="text" 
                    value="jsmith@company.local"
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="username@company.local"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value="••••••••"
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="Enter password"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20" />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">Remember device</span>
                </label>
                <button type="button" className="text-sm font-bold text-blue-600 hover:text-blue-700">Forgot Password?</button>
              </div>

              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 group">
                Sign In <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 text-slate-500 text-xs font-medium">
            <Monitor className="w-4 h-4 opacity-50" />
            <span>Having trouble logging in? Contact the</span>
            <button className="text-blue-600 font-bold hover:underline">IT Service Desk</button>
          </div>
        </div>
      </div>
    </div>
  );
}
