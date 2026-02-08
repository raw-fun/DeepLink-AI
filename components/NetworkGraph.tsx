import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { LinkNode } from '../types';

interface NetworkGraphProps {
  data: LinkNode[];
  onNodeSelect: (node: LinkNode) => void;
  width?: number;
  height?: number;
}

const NetworkGraph: React.FC<NetworkGraphProps> = ({ data, onNodeSelect, width = 600, height = 400 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || data.length === 0 || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Transform data
    const nodes = data.map(d => ({ id: d.url, ...d }));
    const links: { source: string; target: string }[] = [];
    
    // Create links
    data.forEach(node => {
      if (node.parentId && data.find(d => d.url === node.parentId)) {
        links.push({ source: node.parentId, target: node.url });
      }
    });

    // Force Simulation
    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance((d: any) => {
         // Resources stick closer to parents
         return d.target.type === 'resource' ? 30 : 80;
      }))
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(8));

    // Zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
            container.attr("transform", event.transform);
        });

    svg.call(zoom as any);
    const container = svg.append("g");

    // Links
    const link = container.append("g")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.4)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1);

    // Nodes
    const node = container.append("g")
      .attr("stroke", "#0f172a") // Dark border for nodes
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d: any) => {
          if (d.depth === 0) return 12; // Root
          if (d.type === 'resource') return 4; // Tiny assets
          return 6; // Standard pages
      })
      .attr("fill", (d: any) => {
        if (d.status.startsWith('4') || d.status.startsWith('5')) return '#ef4444'; // Error (Red)
        if (d.status.startsWith('3')) return '#f59e0b'; // Redirect (Amber)
        if (d.type === 'resource') {
            if (d.contentType?.includes('image')) return '#ec4899'; // Images (Pink)
            if (d.contentType?.includes('javascript')) return '#eab308'; // JS (Yellow)
            if (d.contentType?.includes('css')) return '#6366f1'; // CSS (Indigo)
            return '#64748b'; // Other resources
        }
        if (d.depth === 0) return '#3b82f6'; // Root (Blue)
        return '#10b981'; // Valid Page (Emerald)
      })
      .attr("cursor", "pointer")
      .on("click", (event, d: any) => {
          event.stopPropagation();
          onNodeSelect(d);
          
          // Highlight effect
          node.attr("stroke", "#0f172a").attr("stroke-width", 1.5);
          d3.select(event.currentTarget).attr("stroke", "#fff").attr("stroke-width", 3);
      })
      .call((d3.drag() as any)
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Tooltips
    node.append("title")
      .text((d: any) => `${d.url}\n[${d.contentType}]\nStatus: ${d.status}`);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

  }, [data, width, height]);

  return (
    <div className="bg-slate-900 rounded-lg shadow-2xl p-4 border border-slate-800 relative overflow-hidden group">
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
             <h3 className="text-slate-200 font-bold bg-slate-900/80 px-2 py-1 rounded backdrop-blur">Network Topology</h3>
             <p className="text-xs text-slate-500 px-2">Scroll to zoom • Drag to arrange • Click to inspect</p>
        </div>
      <svg ref={svgRef} width={width} height={height} className="w-full h-auto bg-[#0b1121] rounded-md cursor-move" />
    </div>
  );
};

export default NetworkGraph;
