import React from 'react';
import { CrawlStats, CrawlStatus } from '../types';
import { Activity, Layers, Link, AlertTriangle } from 'lucide-react';

interface StatsCardsProps {
  stats: CrawlStats;
  status: CrawlStatus;
}

const StatsCards: React.FC<StatsCardsProps> = ({ stats, status }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {/* Status Card */}
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center shadow-sm">
        <div className={`p-3 rounded-full mr-4 ${status === CrawlStatus.RUNNING ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-400'}`}>
          <Activity size={24} />
        </div>
        <div>
          <p className="text-sm text-slate-400">Status</p>
          <p className="text-xl font-bold text-white">{status}</p>
        </div>
      </div>

      {/* Links Found */}
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center shadow-sm">
        <div className="p-3 rounded-full mr-4 bg-emerald-500/20 text-emerald-400">
          <Link size={24} />
        </div>
        <div>
          <p className="text-sm text-slate-400">Total Links</p>
          <p className="text-xl font-bold text-white">{stats.totalLinks}</p>
        </div>
      </div>

      {/* Scanned Pages */}
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center shadow-sm">
        <div className="p-3 rounded-full mr-4 bg-purple-500/20 text-purple-400">
          <Layers size={24} />
        </div>
        <div>
          <p className="text-sm text-slate-400">Scanned / Queued</p>
          <p className="text-xl font-bold text-white">{stats.scannedPages} <span className="text-sm font-normal text-slate-500">/ {stats.queuedPages}</span></p>
        </div>
      </div>

      {/* Errors */}
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex items-center shadow-sm">
        <div className="p-3 rounded-full mr-4 bg-rose-500/20 text-rose-400">
          <AlertTriangle size={24} />
        </div>
        <div>
          <p className="text-sm text-slate-400">Broken Links</p>
          <p className="text-xl font-bold text-white">{stats.errors}</p>
        </div>
      </div>
    </div>
  );
};

export default StatsCards;
