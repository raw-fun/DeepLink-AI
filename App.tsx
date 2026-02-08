import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Play, Pause, Download, Settings, RefreshCw, Terminal, Search, AlertCircle, CheckCircle, Info, Filter, FileText, Image as ImageIcon, Code, Anchor, Eye, Database, Globe, Layers, Key, LogOut, Unlock, X, ChevronRight, BarChart3, Activity, List, Cpu, BookOpen, KeyRound, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import StatsCards from './components/StatsCards';
import NetworkGraph from './components/NetworkGraph';
import BackendGuide from './components/BackendGuide';
import InspectorPanel from './components/InspectorPanel';
import { CrawlConfig, CrawlStats, CrawlStatus, LinkNode, LogEntry, ScanStage } from './types';
import { fetchPageLinks, analyzeOrphans } from './services/gemini';

// Tab Types for Right Panel
type RightPanelTab = 'logs' | 'charts' | 'analysis';

const App: React.FC = () => {
  // Configuration State
  const [config, setConfig] = useState<CrawlConfig>({
    url: 'https://bangladesh.gov.bd',
    maxDepth: 3,
    maxPages: 100,
    delay: 5000, // Updated to 5000ms (5s) to ensure ~12 RPM (below the 15 RPM limit)
    respectRobots: true,
    renderJS: true,
    includeAssets: true, 
  });

  // API Key State
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [isApiConnected, setIsApiConnected] = useState<boolean>(false);
  const [activeKeyDisplayIndex, setActiveKeyDisplayIndex] = useState<number>(0);
  const apiKeyInputRef = useRef<HTMLTextAreaElement>(null);

  // Runtime State
  const [status, setStatus] = useState<CrawlStatus>(CrawlStatus.IDLE);
  const [scanStage, setScanStage] = useState<ScanStage>('INIT');
  const [nodes, setNodes] = useState<LinkNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<LinkNode | null>(null);
  const [stats, setStats] = useState<CrawlStats>({
    totalLinks: 0,
    scannedPages: 0,
    queuedPages: 0,
    errors: 0,
    assetsFound: 0,
    totalSizeKB: 0,
    startTime: 0,
    currentUrl: '',
    depthReached: 0
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // UI State
  const [activeTab, setActiveTab] = useState<RightPanelTab>('logs');
  const [showBackendModal, setShowBackendModal] = useState(false);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphDimensions, setGraphDimensions] = useState({ width: 600, height: 400 });

  // Crawler Refs
  const queueRef = useRef<LinkNode[]>([]);
  const visitedRef = useRef<Set<string>>(new Set());
  const nodesRef = useRef<LinkNode[]>([]);
  const isRunningRef = useRef<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const apiKeysRef = useRef<string[]>([]); 
  const currentKeyIndexRef = useRef<number>(0);

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current && activeTab === 'logs') {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  // Resize Observer for Graph
  useEffect(() => {
      if (!graphContainerRef.current) return;
      const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
              setGraphDimensions({
                  width: entry.contentRect.width,
                  height: entry.contentRect.height
              });
          }
      });
      resizeObserver.observe(graphContainerRef.current);
      return () => resizeObserver.disconnect();
  }, []);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'warning' | 'system' = 'info', details?: string) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message: msg,
      type,
      details
    };
    setLogs(prev => [entry, ...prev].slice(0, 200));
  };

  // --- API Handlers ---
  const handleConnectApi = () => {
      const input = apiKeyInputRef.current?.value || '';
      // Parse keys from comma, newline, pipe, or space separated string
      const keys = input.split(/[\n,\|\s]+/).map(k => k.trim()).filter(k => k.length > 20); // Basic length check
      
      if (keys.length > 0) {
          setApiKeys(keys);
          apiKeysRef.current = keys;
          currentKeyIndexRef.current = 0;
          setActiveKeyDisplayIndex(0);
          setIsApiConnected(true);
          addLog(`Securely connected ${keys.length} API Keys. Pool ready.`, 'success');
      } else {
          addLog("No valid keys found. Please paste valid Gemini API keys.", 'error');
      }
  };

  const handleDisconnectApi = () => {
      setApiKeys([]);
      apiKeysRef.current = [];
      setIsApiConnected(false);
      if (apiKeyInputRef.current) apiKeyInputRef.current.value = '';
      addLog("API Pool disconnected.", 'warning');
      if (status === CrawlStatus.RUNNING) stopCrawl();
  };
  
  const handleClearInput = () => {
      if (apiKeyInputRef.current) {
          apiKeyInputRef.current.value = '';
          apiKeyInputRef.current.focus();
      }
  };

  // --- Crawler Logic ---
  const startRecursiveCrawl = async () => {
    if (!config.url) return;
    if (!isApiConnected) {
        addLog("Cannot start: API Pool not configured.", 'error');
        return;
    }
    if (status === CrawlStatus.RUNNING) return;

    setStatus(CrawlStatus.RUNNING);
    isRunningRef.current = true;
    setScanStage('INIT');
    setNodes([]);
    setLogs([]);
    setAiAnalysis('');
    setSelectedNode(null);
    nodesRef.current = [];
    visitedRef.current = new Set();
    queueRef.current = [];

    setStats({
      totalLinks: 1, scannedPages: 0, queuedPages: 1, errors: 0,
      assetsFound: 0, totalSizeKB: 0, startTime: Date.now(),
      currentUrl: config.url, depthReached: 0
    });

    addLog(`INITIALIZING RECURSIVE ENGINE: ${config.url}`, 'system');
    
    const rootNode: LinkNode = {
        id: config.url, url: config.url, depth: 0, type: 'internal',
        status: 'pending', contentType: 'text/html', discoverySource: 'anchor',
        title: 'Root', scanned: false
    };

    queueRef.current.push(rootNode);
    nodesRef.current.push(rootNode);
    visitedRef.current.add(config.url);
    setNodes([...nodesRef.current]);

    processQueue();
  };

  const processQueue = async () => {
    if (!isRunningRef.current || queueRef.current.length === 0 || nodesRef.current.length >= config.maxPages) {
        finishCrawl();
        return;
    }

    const currentNode = queueRef.current.shift();
    if (!currentNode) return;

    setStats(prev => ({ ...prev, currentUrl: currentNode.url, queuedPages: queueRef.current.length }));
    
    if (currentNode.depth >= config.maxDepth) {
        setTimeout(processQueue, 50);
        return;
    }

    setScanStage('DOM_PARSE');
    currentNode.status = 'scanning';
    updateNodeState(currentNode);
    addLog(`SCANNING: ${currentNode.url}`, 'info', `Keys: ${apiKeysRef.current.length} | Active: #${currentKeyIndexRef.current + 1}`);

    try {
        // Enforce the Rate Limit Delay (Default 5000ms)
        await new Promise(r => setTimeout(r, config.delay)); 
        
        // Pass the entire key pool and current index to the service
        // Use apiKeysRef.current to ensures we always use the freshest keys from UI
        const { links: children, usedKeyIndex } = await fetchPageLinks(
            apiKeysRef.current, 
            currentKeyIndexRef.current, 
            currentNode.url, 
            config.url, 
            currentNode.depth
        );
        
        // Check if key rotation happened
        if (usedKeyIndex !== currentKeyIndexRef.current) {
            addLog(`QUOTA FAILOVER: Switched from Key #${currentKeyIndexRef.current + 1} to Key #${usedKeyIndex + 1}`, 'warning');
            currentKeyIndexRef.current = usedKeyIndex;
            setActiveKeyDisplayIndex(usedKeyIndex);
        }

        let newNodesAdded = 0;
        for (const child of children) {
            if (!visitedRef.current.has(child.url)) {
                visitedRef.current.add(child.url);
                nodesRef.current.push(child);
                if (child.type === 'internal' && child.contentType === 'text/html') {
                    queueRef.current.push(child);
                }
                newNodesAdded++;
                if (child.status.startsWith('4')) addLog(`BROKEN LINK: ${child.url}`, 'error');
            }
        }

        currentNode.status = '200';
        currentNode.scanned = true;
        updateNodeState(currentNode);

        setNodes([...nodesRef.current]); 
        setStats(prev => ({
            ...prev,
            totalLinks: nodesRef.current.length,
            scannedPages: prev.scannedPages + 1,
            queuedPages: queueRef.current.length,
            errors: nodesRef.current.filter(n => n.status.startsWith('4')).length,
            assetsFound: nodesRef.current.filter(n => n.type === 'resource').length,
            depthReached: Math.max(prev.depthReached, currentNode.depth),
            totalSizeKB: prev.totalSizeKB + children.reduce((acc, c) => acc + (c.size || 0), 0)
        }));

        if (newNodesAdded > 0) addLog(`EXTRACTED: ${newNodesAdded} links`, 'success');

    } catch (err: any) {
        const errorMsg = err.message || JSON.stringify(err);
        const status = (err.status || err.code || "500").toString();
        const currentKey = currentKeyIndexRef.current + 1;

        addLog(`FAILED to scan ${currentNode.url}`, 'error', `Key #${currentKey} | Status: ${status} | ${errorMsg}`);
        
        if (status === '404' || errorMsg.includes('404')) {
            currentNode.status = '404';
        } else if (status === '403' || errorMsg.includes('403')) {
            currentNode.status = '403';
        } else {
            currentNode.status = '500';
        }
        updateNodeState(currentNode);
    }
    setTimeout(processQueue, 100);
  };

  const finishCrawl = () => {
      setStatus(CrawlStatus.COMPLETED);
      setScanStage('FINALIZE');
      isRunningRef.current = false;
      addLog("RECURSIVE CRAWL COMPLETED.", 'success');
      
      const activeKey = apiKeysRef.current[currentKeyIndexRef.current];
      if (activeKey) {
          analyzeOrphans(activeKey, nodesRef.current).then(analysis => {
            setAiAnalysis(analysis);
            setActiveTab('analysis'); // Auto switch to analysis tab
          });
      }
  };

  const stopCrawl = () => {
      isRunningRef.current = false;
      setStatus(CrawlStatus.IDLE);
      addLog("CRAWL ABORTED BY USER.", 'warning');
  }

  const updateNodeState = (updatedNode: LinkNode) => {
      const index = nodesRef.current.findIndex(n => n.id === updatedNode.id);
      if (index !== -1) nodesRef.current[index] = { ...updatedNode };
  };

  const handleExportCSV = () => {
      const headers = ["URL", "Type", "Status", "Size", "Depth", "Parent"];
      const rows = nodes.map(n => [n.url, n.type, n.status, n.size, n.depth, n.parentId]);
      const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `deep_crawl_${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
  };

  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
        const matchesSearch = node.url.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'all' 
            ? true 
            : filterType === 'broken' ? (node.status.startsWith('4') || node.status.startsWith('5'))
            : filterType === 'assets' ? node.type === 'resource'
            : filterType === 'pages' ? node.type !== 'resource'
            : filterType === 'scanned' ? node.scanned
            : true;
        return matchesSearch && matchesType;
    });
  }, [nodes, searchTerm, filterType]);

  const depthData = React.useMemo(() => {
    const counts: Record<number, number> = {};
    nodes.forEach(n => { counts[n.depth] = (counts[n.depth] || 0) + 1; });
    return Object.entries(counts).map(([depth, count]) => ({ depth: `Lvl ${depth}`, count }));
  }, [nodes]);

  // --- RENDER ---
  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-300 font-sans overflow-hidden">
      
      {/* 1. LEFT SIDEBAR (Fixed Width) */}
      <aside className="w-[300px] flex flex-col border-r border-slate-800 bg-[#0b1121] z-20 flex-shrink-0">
        
        {/* Header Branding */}
        <div className="p-6 pb-4 border-b border-slate-800/50">
           <div className="mb-2">
              <span className="text-[10px] font-black tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-fuchsia-500 to-indigo-500 select-none">
                 CREATED BY RAW & FUN
              </span>
           </div>
           <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Layers className="text-white w-5 h-5" />
              </div>
              <div>
                  <h1 className="text-lg font-bold text-white tracking-tight leading-tight">DeepLink AI</h1>
                  <span className="text-[10px] uppercase tracking-widest text-emerald-500 font-semibold">Recursive Engine</span>
              </div>
           </div>
        </div>

        {/* Scrollable Settings Area */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
            
            {/* API Key Box */}
            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-1 h-full ${isApiConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>API Access Control</span>
                    {isApiConnected ? <Unlock size={10} className="text-emerald-500"/> : <Key size={10} className="text-amber-500"/>}
                </label>
                {!isApiConnected ? (
                    <div className="space-y-2">
                        <div className="relative">
                            <Key className="absolute left-2 top-2.5 w-3.5 h-3.5 text-slate-600 z-10" />
                            <textarea 
                                ref={apiKeyInputRef} 
                                placeholder="Paste Multiple API Keys (Comma separated or one per line)..." 
                                className="w-full h-20 bg-[#020617] border border-slate-700 rounded-md py-1.5 pl-7 pr-8 text-xs focus:ring-1 focus:ring-amber-500 outline-none text-white placeholder-slate-600 transition-all resize-none font-mono leading-relaxed"
                            />
                            {/* Clear Button */}
                             <button 
                                onClick={handleClearInput}
                                className="absolute right-2 top-2 p-1.5 text-slate-600 hover:text-rose-500 hover:bg-slate-800 rounded-md transition-all"
                                title="Clear all keys"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                        <button onClick={handleConnectApi} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold py-1.5 rounded-md border border-slate-700 transition-all uppercase tracking-wide">Secure Connect Pool</button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="flex flex-col space-y-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2">
                             <div className="flex items-center justify-between">
                                 <div className="flex items-center text-emerald-400 text-[10px] font-mono"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2 animate-pulse"></div>Connected</div>
                                 <div className="text-slate-500 text-[9px] font-bold uppercase tracking-wide">Pool Size: {apiKeys.length}</div>
                             </div>
                             <div className="text-[10px] text-slate-400 font-mono flex items-center border-t border-emerald-500/10 pt-1 mt-1">
                                <KeyRound className="w-3 h-3 mr-1.5 text-slate-500" />
                                <span>Active: Key #{activeKeyDisplayIndex + 1}</span>
                             </div>
                        </div>
                        <button onClick={handleDisconnectApi} className="w-full bg-slate-800 hover:bg-rose-900/30 text-slate-400 hover:text-rose-400 text-[10px] font-bold py-1.5 rounded-md border border-slate-700 hover:border-rose-800 transition-all flex items-center justify-center uppercase tracking-wide"><LogOut className="w-3 h-3 mr-1" /> Terminate Pool</button>
                    </div>
                )}
            </div>

            {/* Config Forms */}
            <div className="space-y-4">
               <div className="space-y-1">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Endpoint</label>
                   <div className="relative">
                       <Globe className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-500" />
                       <input type="text" value={config.url} onChange={(e) => setConfig({...config, url: e.target.value})} disabled={status === CrawlStatus.RUNNING} className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 pl-7 pr-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none text-white placeholder-slate-600 disabled:opacity-50 font-mono"/>
                   </div>
               </div>

               <div className="space-y-3 pt-2">
                    <div>
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>Scan Depth</span><span className="text-blue-400">{config.maxDepth}</span></div>
                        <input type="range" min="1" max="5" value={config.maxDepth} onChange={(e) => setConfig({...config, maxDepth: parseInt(e.target.value)})} disabled={status === CrawlStatus.RUNNING} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>Max Pages</span><span className="text-blue-400">{config.maxPages}</span></div>
                        <input type="range" min="50" max="500" step="50" value={config.maxPages} onChange={(e) => setConfig({...config, maxPages: parseInt(e.target.value)})} disabled={status === CrawlStatus.RUNNING} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                    </div>
               </div>
            </div>

            <button onClick={() => setShowBackendModal(true)} className="w-full py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-500 hover:text-white rounded-md text-xs transition-colors flex items-center justify-center">
                <BookOpen className="w-3 h-3 mr-2" /> View Backend Logic
            </button>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-[#0b1121]">
            {status === CrawlStatus.RUNNING ? (
              <button className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center transition-all shadow-lg shadow-rose-900/20 text-xs uppercase tracking-wide" onClick={stopCrawl}>
                <Pause className="w-3.5 h-3.5 mr-2" /> Abort Sequence
              </button>
            ) : (
              <button className={`w-full font-bold py-2.5 px-4 rounded-lg flex items-center justify-center transition-all shadow-lg text-xs uppercase tracking-wide ${isApiConnected ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'}`} onClick={startRecursiveCrawl} disabled={!isApiConnected}>
                <Play className="w-3.5 h-3.5 mr-2 fill-current" /> Initialize Scan
              </button>
            )}
        </div>
      </aside>

      {/* 2. MAIN DASHBOARD CONTENT (Grid Layout) */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#030712] relative">
         
         {/* A. Top Header Bar */}
         <header className="h-14 border-b border-slate-800 bg-[#0b1121]/80 backdrop-blur flex items-center justify-between px-4 flex-shrink-0 z-10">
            <div className="flex items-center space-x-4">
                <h2 className="text-sm font-bold text-slate-100 tracking-wide uppercase flex items-center">
                    <Activity className="w-4 h-4 mr-2 text-blue-500"/> 
                    Live Dashboard
                </h2>
                <div className="h-4 w-[1px] bg-slate-700"></div>
                <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400">
                     <span>STATUS:</span>
                     <span className={`${status === CrawlStatus.RUNNING ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>{status}</span>
                </div>
            </div>
            
            <div className="flex items-center space-x-3">
                 <div className="relative">
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search node..." className="w-48 bg-slate-900 border border-slate-700 rounded-md py-1.5 pl-8 pr-2 text-xs focus:ring-1 focus:ring-blue-500 outline-none text-slate-300 placeholder-slate-600"/>
                 </div>
                 <button onClick={handleExportCSV} disabled={nodes.length === 0} className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors disabled:opacity-50" title="Export CSV">
                    <Download className="w-4 h-4" />
                 </button>
            </div>
         </header>

         {/* B. Dashboard Grid Content */}
         <div className="flex-1 p-4 grid grid-rows-[auto_1fr_200px] gap-4 overflow-hidden min-h-0">
             
             {/* ROW 1: Stats Cards */}
             <div className="flex-shrink-0">
                 <StatsCards stats={stats} status={status} />
             </div>

             {/* ROW 2: Split View (Graph + Tabs) */}
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
                 
                 {/* COL 1 & 2: Network Graph */}
                 <div className="lg:col-span-2 glass-panel rounded-lg flex flex-col relative overflow-hidden group" ref={graphContainerRef}>
                     <div className="absolute top-3 left-3 z-10 pointer-events-none">
                         <div className="px-2 py-1 bg-slate-900/80 backdrop-blur rounded border border-slate-800 text-[10px] font-bold text-slate-300 flex items-center">
                             <Globe className="w-3 h-3 mr-1.5 text-blue-500" /> Network Topology
                         </div>
                     </div>
                     <div className="flex-1 bg-[#050a16] relative">
                         {graphDimensions.width > 0 && (
                            <NetworkGraph 
                                data={filteredNodes} 
                                onNodeSelect={setSelectedNode} 
                                width={graphDimensions.width} 
                                height={graphDimensions.height} 
                            />
                         )}
                     </div>
                 </div>

                 {/* COL 3: Tabbed Panel (Logs / Charts / Analysis) */}
                 <div className="glass-panel rounded-lg flex flex-col overflow-hidden bg-[#050a16]">
                      {/* Tab Header */}
                      <div className="flex border-b border-slate-800">
                          <button onClick={() => setActiveTab('logs')} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center transition-colors ${activeTab === 'logs' ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>
                             <Terminal className="w-3 h-3 mr-1.5" /> Logs
                          </button>
                          <button onClick={() => setActiveTab('charts')} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center transition-colors ${activeTab === 'charts' ? 'bg-slate-800 text-purple-400 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>
                             <BarChart3 className="w-3 h-3 mr-1.5" /> Metrics
                          </button>
                          <button onClick={() => setActiveTab('analysis')} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center transition-colors ${activeTab === 'analysis' ? 'bg-slate-800 text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>
                             <Cpu className="w-3 h-3 mr-1.5" /> AI Report
                          </button>
                      </div>
                      
                      {/* Tab Content */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/40 relative">
                          
                          {/* LOGS TAB */}
                          {activeTab === 'logs' && (
                              <div className="p-3 space-y-1.5 font-mono text-[10px]" ref={scrollRef}>
                                 {logs.length === 0 && <span className="text-slate-600 italic px-2">System ready. Waiting for input...</span>}
                                 {logs.map((log) => (
                                     <div key={log.id} className="flex items-start space-x-2 animate-in fade-in duration-200">
                                         <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                                         <span className={`${log.type === 'error' ? 'text-rose-500' : log.type === 'success' ? 'text-emerald-400' : log.type === 'warning' ? 'text-amber-400' : log.type === 'system' ? 'text-blue-400' : 'text-slate-300'}`}>
                                            {log.type === 'error' && '✖ '} {log.message}
                                         </span>
                                     </div>
                                 ))}
                              </div>
                          )}

                          {/* CHARTS TAB */}
                          {activeTab === 'charts' && (
                              <div className="p-4 h-full flex flex-col">
                                  <div className="h-40 mb-4">
                                      <h4 className="text-[10px] text-slate-500 uppercase font-bold mb-2">Depth Distribution</h4>
                                      <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={depthData}>
                                            <XAxis dataKey="depth" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} itemStyle={{ fontSize: '10px', color: '#fff' }} cursor={{fill: '#334155', opacity: 0.3}} />
                                            <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]}>
                                                {depthData.map((e, i) => <Cell key={i} fill={['#3b82f6', '#8b5cf6', '#ec4899'][i % 3] || '#64748b'} />)}
                                            </Bar>
                                        </BarChart>
                                      </ResponsiveContainer>
                                  </div>
                              </div>
                          )}

                          {/* ANALYSIS TAB */}
                          {activeTab === 'analysis' && (
                              <div className="p-4">
                                  {aiAnalysis ? (
                                      <div className="prose prose-invert prose-xs font-mono text-indigo-100 whitespace-pre-wrap">
                                          {aiAnalysis}
                                      </div>
                                  ) : (
                                      <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2 opacity-50 mt-10">
                                          <Cpu size={32} />
                                          <p className="text-xs">Analysis generated after crawl completion.</p>
                                      </div>
                                  )}
                              </div>
                          )}
                      </div>
                 </div>
             </div>

             {/* ROW 3: Data Table (Fixed Height) */}
             <div className="glass-panel rounded-lg flex flex-col overflow-hidden min-h-0">
                  <div className="h-8 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between px-3">
                      <div className="flex items-center space-x-2">
                           <List className="w-3.5 h-3.5 text-slate-400" />
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Discovered Assets</span>
                      </div>
                      <div className="flex items-center space-x-2">
                          {['all', 'pages', 'scanned', 'assets', 'broken'].map(t => (
                              <button key={t} onClick={() => setFilterType(t)} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${filterType === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-800'}`}>
                                  {t}
                              </button>
                          ))}
                      </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto custom-scrollbar bg-[#020617]">
                      <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-900 text-slate-500 text-[10px] font-bold uppercase sticky top-0 z-10 shadow-sm">
                              <tr>
                                  <th className="px-4 py-2">Resource</th>
                                  <th className="px-4 py-2">Type</th>
                                  <th className="px-4 py-2">Status</th>
                                  <th className="px-4 py-2">Size</th>
                                  <th className="px-4 py-2">Source</th>
                                  <th className="px-4 py-2 text-right">Action</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50">
                              {filteredNodes.length === 0 ? (
                                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600 text-xs">No records found.</td></tr>
                              ) : (
                                  filteredNodes.slice().reverse().slice(0, 100).map((node, i) => (
                                      <tr key={i} className={`hover:bg-slate-800/50 transition-colors group ${selectedNode === node ? 'bg-blue-900/20' : ''}`}>
                                          <td className="px-4 py-1.5 max-w-xs truncate text-xs text-slate-300 font-mono" title={node.url}>{node.url}</td>
                                          <td className="px-4 py-1.5 text-[10px] text-slate-500 uppercase">{node.type}</td>
                                          <td className="px-4 py-1.5">
                                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${node.status.startsWith('2') ? 'bg-emerald-500/10 text-emerald-400' : node.status.startsWith('4') ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-700 text-slate-400'}`}>
                                                  {node.status}
                                              </span>
                                          </td>
                                          <td className="px-4 py-1.5 text-[10px] text-slate-500 font-mono">{node.size}KB</td>
                                          <td className="px-4 py-1.5 text-[10px] text-slate-500">{node.discoverySource}</td>
                                          <td className="px-4 py-1.5 text-right">
                                              <button onClick={() => setSelectedNode(node)} className="text-[10px] text-blue-500 hover:text-blue-400 hover:underline">Inspect</button>
                                          </td>
                                      </tr>
                                  ))
                              )}
                          </tbody>
                      </table>
                  </div>
             </div>
         </div>

         {/* C. Modals & Overlays */}
         {showBackendModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                 <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
                     <div className="flex justify-between items-center p-4 border-b border-slate-800">
                         <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center"><Code className="w-4 h-4 mr-2 text-emerald-500" /> Backend Implementation</h3>
                         <button onClick={() => setShowBackendModal(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
                     </div>
                     <div className="p-0 overflow-y-auto custom-scrollbar bg-[#050a10]">
                         <BackendGuide />
                     </div>
                 </div>
             </div>
         )}

         {/* Inspector Slide-over */}
         <InspectorPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      </main>
    </div>
  );
};

export default App;