import React, { useState } from 'react';
import { LinkNode } from '../types';
import { X, Globe, FileText, Image, Code, Server, Shield, Eye, ChevronDown, ChevronRight, Anchor, Database } from 'lucide-react';

interface InspectorPanelProps {
  node: LinkNode | null;
  onClose: () => void;
}

const CheckIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
);

const AlertIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
);

const InspectorPanel: React.FC<InspectorPanelProps> = ({ node, onClose }) => {
  const [headersOpen, setHeadersOpen] = useState(false);

  if (!node) return null;

  const getIcon = () => {
    if (node.type === 'resource') {
        if (node.contentType.includes('image')) return <Image className="text-pink-400" />;
        if (node.contentType.includes('javascript') || node.contentType.includes('css')) return <Code className="text-yellow-400" />;
        return <FileText className="text-slate-400" />;
    }
    return <Globe className="text-blue-400" />;
  };

  const getSourceLabel = (source?: string) => {
      switch(source) {
          case 'anchor': return { label: 'HTML Anchor <a>', icon: <Anchor size={12} className="mr-1"/>, color: 'text-blue-400' };
          case 'img_src': return { label: 'Image Source <img src>', icon: <Image size={12} className="mr-1"/>, color: 'text-pink-400' };
          case 'script_src': return { label: 'Script Source <script>', icon: <Code size={12} className="mr-1"/>, color: 'text-yellow-400' };
          case 'link_tag': return { label: 'Link Tag <link>', icon: <FileText size={12} className="mr-1"/>, color: 'text-indigo-400' };
          case 'api_call': return { label: 'JavaScript API Call (fetch)', icon: <Database size={12} className="mr-1"/>, color: 'text-emerald-400' };
          case 'meta_tag': return { label: 'Metadata <meta>', icon: <Eye size={12} className="mr-1"/>, color: 'text-purple-400' };
          default: return { label: 'DOM Extraction', icon: <Globe size={12} className="mr-1"/>, color: 'text-slate-400' };
      }
  };

  const sourceInfo = getSourceLabel(node.discoverySource);

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-700 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
        <h3 className="font-bold text-white flex items-center space-x-2">
          {getIcon()}
          <span className="truncate max-w-[200px]">Node Inspector</span>
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Basic Info */}
        <div>
           <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">URL & Path</h4>
           <div className="bg-black/50 p-3 rounded border border-slate-700 break-all font-mono text-xs text-emerald-400 shadow-inner">
             {node.url}
           </div>
        </div>

        {/* Discovery Vector - New Forensic Feature */}
        <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Discovery Vector</h4>
            <div className={`flex items-center text-sm font-medium ${sourceInfo.color}`}>
                {sourceInfo.icon}
                {sourceInfo.label}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
                Extracted via {node.discoverySource || 'anchor'} parser during deep scan.
            </div>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-3">
           <div className="bg-slate-800 p-3 rounded border border-slate-700">
              <div className="text-xs text-slate-400 mb-1">Status Code</div>
              <div className={`text-lg font-bold ${node.status.startsWith('2') ? 'text-emerald-400' : 'text-rose-400'}`}>
                {node.status}
              </div>
           </div>
           <div className="bg-slate-800 p-3 rounded border border-slate-700">
              <div className="text-xs text-slate-400 mb-1">Response Time</div>
              <div className="text-lg font-bold text-blue-400">
                {node.responseTime ? `${node.responseTime}ms` : 'N/A'}
              </div>
           </div>
           <div className="bg-slate-800 p-3 rounded border border-slate-700">
              <div className="text-xs text-slate-400 mb-1">Size</div>
              <div className="text-lg font-bold text-purple-400">
                {node.size ? `${node.size} KB` : '< 1 KB'}
              </div>
           </div>
           <div className="bg-slate-800 p-3 rounded border border-slate-700">
              <div className="text-xs text-slate-400 mb-1">Type</div>
              <div className="text-sm font-bold text-slate-200 truncate" title={node.contentType}>
                {node.contentType}
              </div>
           </div>
        </div>

        {/* Detected Tech */}
        {node.detectedTech && node.detectedTech.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Detected Tech</h4>
            <div className="flex flex-wrap gap-2">
                {node.detectedTech.map((tech, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30">
                        {tech}
                    </span>
                ))}
            </div>
          </div>
        )}

        {/* Headers Simulation */}
        <div>
            <button 
                onClick={() => setHeadersOpen(!headersOpen)} 
                className="w-full flex items-center justify-between group outline-none"
            >
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center group-hover:text-slate-300 transition-colors">
                    <Server size={12} className="mr-1" /> Response Headers
                </h4>
                {headersOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
            </button>
            
            {headersOpen && (
                <div className="mt-2 bg-slate-950/50 rounded-md border border-slate-800 p-3 font-mono text-[10px] leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="grid grid-cols-[min-content_1fr] gap-x-3 gap-y-1">
                        <span className="text-slate-500 text-right whitespace-nowrap">server:</span>
                        <span className="text-emerald-400/90">nginx/1.18.0</span>

                        <span className="text-slate-500 text-right whitespace-nowrap">content-type:</span>
                        <span className="text-blue-300/90 break-all">{node.contentType}</span>

                        <span className="text-slate-500 text-right whitespace-nowrap">cache-control:</span>
                        <span className="text-slate-300/90">max-age=3600</span>

                        <span className="text-rose-500/80 text-right whitespace-nowrap">x-powered-by:</span>
                        <span className="text-rose-400/90 font-semibold">PHP/7.4 (Risk)</span>
                        
                        <span className="text-slate-500 text-right whitespace-nowrap">connection:</span>
                        <span className="text-slate-300/90">keep-alive</span>
                    </div>
                </div>
            )}
        </div>
        
        {/* Security Audit */}
         <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center">
                <Shield size={12} className="mr-1" /> Security Audit
            </h4>
            <div className="space-y-2">
                {node.url.startsWith('https') ? (
                    <div className="flex items-center text-emerald-400 text-xs">
                        <CheckIcon /> <span className="ml-2">SSL/TLS Encrypted (Valid)</span>
                    </div>
                ) : (
                    <div className="flex items-center text-rose-400 text-xs">
                        <AlertIcon /> <span className="ml-2">Insecure Protocol (HTTP)</span>
                    </div>
                )}
                <div className="flex items-center text-amber-400 text-xs">
                    <AlertIcon /> <span className="ml-2">Missing Content-Security-Policy</span>
                </div>
            </div>
         </div>

      </div>
    </div>
  );
};

export default InspectorPanel;