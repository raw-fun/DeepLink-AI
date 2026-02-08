import React from 'react';

const codeSnippet = `
import { PlaywrightCrawler, Dataset } from 'crawlee';

// Expert-level crawler setup using Crawlee (built on top of Playwright)
// This handles dynamic JS, bypassing basic bot protections, and queue management.

const crawler = new PlaywrightCrawler({
    // Headless browser options
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Critical for containerized envs
        }
    },
    
    // Polite crawling
    maxConcurrency: 10,
    maxRequestsPerCrawl: 500,
    
    // Request Handler
    async requestHandler({ request, page, enqueueLinks, log }) {
        log.info(\`Processing \${request.url}\`);

        // Wait for dynamic content (e.g., SPA hydration)
        await page.waitForLoadState('networkidle');
        
        // Extract data
        const title = await page.title();
        
        // Save results
        await Dataset.pushData({
            url: request.url,
            title,
            depth: request.userData.depth || 0,
            linksCount: (await page.locator('a').count())
        });

        // Enqueue internal links recursively
        await enqueueLinks({
            strategy: 'same-domain',
            userData: { depth: (request.userData.depth || 0) + 1 }
        });
    },

    // Error Handling
    failedRequestHandler({ request, log }) {
        log.error(\`Request \${request.url} failed.\`);
    },
});

// Start the crawler
await crawler.run(['https://target-government-site.gov.bd']);
`;

const BackendGuide: React.FC = () => {
  return (
    <div className="mt-8 bg-slate-900 border border-slate-700 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">Backend Implementation Guide</h2>
      <p className="text-slate-400 mb-4">
        Since actual web crawling requires server-side capabilities (to bypass CORS and manage headless browsers), 
        here is the expert-level Node.js code you would use to build the production backend for this app.
      </p>
      <div className="relative">
        <pre className="bg-black p-4 rounded-md overflow-x-auto text-sm text-emerald-400 font-mono">
          {codeSnippet}
        </pre>
      </div>
    </div>
  );
};

export default BackendGuide;
