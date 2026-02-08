import { GoogleGenAI } from "@google/genai";
import { LinkNode } from "../types";

// Helper to determine content type based on extension
const guessContentType = (url: string): LinkNode['contentType'] => {
  if (url.match(/\.(jpg|jpeg|gif|webp)$/i)) return 'image/jpeg';
  if (url.match(/\.png$/i)) return 'image/png';
  if (url.match(/\.js$/i)) return 'application/javascript';
  if (url.match(/\.css$/i)) return 'text/css';
  if (url.match(/\.pdf$/i)) return 'application/pdf';
  if (url.match(/\.json$/i)) return 'application/json';
  return 'text/html';
};

/**
 * Simulates visiting a SINGLE page and extracting its immediate children.
 * Supports Multi-Key Rotation: If a key hits quota limits, it automatically switches to the next one.
 */
export const fetchPageLinks = async (
  apiKeys: string[],
  activeKeyIndex: number,
  currentUrl: string,
  rootUrl: string,
  currentDepth: number
): Promise<{ links: LinkNode[], usedKeyIndex: number }> => {
  if (!apiKeys || apiKeys.length === 0) throw new Error("No API Keys provided.");

  // If it's a resource (image/css/js), it likely has no children to crawl.
  if (guessContentType(currentUrl) !== 'text/html') {
    return { links: [], usedKeyIndex: activeKeyIndex };
  }

  const prompt = `
    Role: Advanced Web Scraper.
    Task: You are currently visiting the page: "${currentUrl}".
    Root Website: "${rootUrl}".
    
    Action: Extract visible links, hidden assets, and API calls found specifically on THIS page.
    
    Constraints:
    1. Return 4-8 realistic links that would plausibly exist on this specific page.
    2. Context awareness: If the URL is "site.com/blog", return specific blog posts. If "site.com/contact", return mailto or maps.
    3. **A-Z Extraction**: Include:
       - Internal navigation links (href).
       - External social links (only if realistic).
       - **Resource links** (src): main.css, app.js, logo.png.
    4. Do NOT simply list the root URL. List CHILDREN or RELATIVE siblings.
    
    Output Format (JSON Array only):
    [
      {
        "url": "absolute_url",
        "title": "link_text_or_filename",
        "type": "internal" | "external" | "resource",
        "status": "200" | "404" | "500",
        "discoverySource": "anchor" | "img_src" | "script_src" | "api_call"
      }
    ]
  `;

  let lastError: any = null;

  // Key Rotation Loop
  for (let keyIdx = activeKeyIndex; keyIdx < apiKeys.length; keyIdx++) {
      const apiKey = apiKeys[keyIdx];
      const ai = new GoogleGenAI({ apiKey });
      
      // Retry logic for transient errors (500, Network) on the CURRENT key
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: { parts: [{ text: prompt }] },
            config: {
              responseMimeType: 'application/json',
            }
          });

          const text = response.text;
          if (!text) return { links: [], usedKeyIndex: keyIdx };

          const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

          let rawLinks: any[] = [];
          try {
              rawLinks = JSON.parse(cleanText);
          } catch (e) {
              console.warn("Failed to parse Gemini response", text);
              return { links: [], usedKeyIndex: keyIdx };
          }

          // Map to LinkNode structure
          const links = rawLinks.map((link: any) => ({
            id: link.url,
            url: link.url,
            title: link.title || "Untitled",
            depth: currentDepth + 1,
            parentId: currentUrl,
            status: (link.status as any) || '200',
            type: (link.type as any) || 'internal',
            contentType: guessContentType(link.url),
            size: Math.floor(Math.random() * 100) + 5,
            discoverySource: (link.discoverySource as any) || 'anchor',
            detectedTech: [],
            scanned: false,
            responseTime: Math.floor(Math.random() * 200) + 20
          }));

          return { links, usedKeyIndex: keyIdx };

        } catch (error: any) {
           lastError = error;
           
           // Check for Rate Limit (429) or Quota Exceeded errors
           const isQuotaError = 
             error.status === 429 || 
             error.code === 429 || 
             error.status === 'RESOURCE_EXHAUSTED' || 
             (error.message && (error.message.includes('429') || error.message.includes('quota')));

           if (isQuotaError) {
               console.warn(`Key #${keyIdx + 1} hit 429/Quota limits. Handling retry logic...`);
               
               // Requirement: If 429, wait 10 seconds and retry the SAME key before giving up or switching.
               if (attempt < 2) {
                   console.warn(`Waiting 10s to cool down Key #${keyIdx + 1} (Attempt ${attempt + 1}/3)...`);
                   await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds delay
                   continue; // Retry the loop with the same key
               } else {
                   // If it still fails after cooling down, switch to next key
                   console.warn(`Key #${keyIdx + 1} exhausted after retries. Switching key.`);
                   break; // Break inner loop, continue outer key loop
               }
           }

           console.warn(`Attempt ${attempt + 1} failed for ${currentUrl} on Key #${keyIdx + 1}:`, error.message);
           
           if (attempt === 2) {
               console.error("Recursive Crawl Step Failed after 3 attempts on current key:", error);
               // Throw error so the main app can log it properly
               throw error;
           }
           
           // Standard Backoff for non-429 errors (e.g. 500 or Network)
           await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
        }
      }
      // If we are here, 'break' was called due to Quota Error. Loop continues to next key.
  }

  // If we exit the key loop, all keys are exhausted or failed.
  if (lastError) {
      throw lastError;
  }

  return { links: [], usedKeyIndex: apiKeys.length - 1 };
};

export const analyzeOrphans = async (apiKey: string, nodes: LinkNode[]): Promise<string> => {
    if (!apiKey) return "API Key missing.";
    
    const ai = new GoogleGenAI({ apiKey });

    const scannedCount = nodes.filter(n => n.scanned).length;
    const resourceCount = nodes.filter(n => n.type === 'resource').length;
    
    const prompt = `
      Generate a forensic crawl report.
      
      Crawl Summary:
      - Total Nodes Discovered: ${nodes.length}
      - Pages Fully Scanned: ${scannedCount}
      - Assets extracted: ${resourceCount}
      - Deepest level reached: ${Math.max(...nodes.map(n => n.depth))}
      
      Provide a concise 3-bullet technical assessment of the site's depth and asset structure.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: prompt }] },
        });
        return response.text || "Analysis failed.";
    } catch (e) {
        return "Could not perform analysis.";
    }
}