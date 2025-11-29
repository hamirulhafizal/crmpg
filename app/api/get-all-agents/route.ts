import { NextResponse } from 'next/server';

const TOKEN = process.env.TOKEN || '';
const DEALERS_URL = process.env.DEALERS_URL || '';

const headers = {
  'xc-token': TOKEN,
  'Content-Type': 'application/json'
};

export async function GET() {
  try {
    // Debug environment variables
    console.log("DEALERS_URL:", DEALERS_URL);
    console.log("TOKEN:", TOKEN ? "***" : "NOT SET");
    
    if (!DEALERS_URL) {
      console.error("DEALERS_URL environment variable is not set");
      return NextResponse.json(
        { error: "DEALERS_URL environment variable is not configured" }, 
        { status: 500 }
      );
    }
    
    if (!TOKEN) {
      console.error("TOKEN environment variable is not set");
      return NextResponse.json(
        { error: "TOKEN environment variable is not configured" }, 
        { status: 500 }
      );
    }
    
    // Clean up the URL in case it has line breaks
    const cleanDealersUrl = DEALERS_URL.replace(/\s+/g, '');
    console.log("Clean DEALERS_URL:", cleanDealersUrl);
    
    console.log("Fetching agents from:", cleanDealersUrl);
    
    const response = await fetch(cleanDealersUrl, { 
      headers,
      cache: 'no-store'
    });
    
    console.log("Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API response error:", errorText);
      throw new Error(`Failed to fetch agents: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log("Raw API response:", JSON.stringify(data, null, 2));
    
    if (!data || !data.list) {
      console.error("Invalid API response structure:", data);
      throw new Error("Invalid API response structure - missing 'list' property");
    }
    
    const agents = data.list || [];
    console.log("Number of agents found:", agents.length);
    
    // Log raw field names for debugging
    if (agents.length > 0) {
      console.log("Raw field names from first agent:", Object.keys(agents[0]));
      console.log("Sample agent raw data:", agents[0]);
    }
    
    if (agents.length === 0) {
      console.warn("No agents found in the response");
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      });
    }
    
    // Transform the data to include only necessary fields
    const transformedAgents = agents
      .filter((agent: any) => agent && typeof agent === 'object') // Filter out null/undefined agents
      .map((agent: any) => {
        
        return {
          username: agent['Username PGO'] || agent['username'] || '',
          name: agent['Name'] || agent['Nama'] || agent['name'] || 'Agent',
          pgcode: agent['PG Code'] || agent['pgcode'] || agent['pg_code'] || '',
          location: agent['Location'] || agent['Lokasi'] || agent['location'] || 'Malaysia',
          image_url: agent['image_url'] || agent['Image'] || 'https://via.placeholder.com/150',
          email: agent['email'] || agent['Email'] || '',
          customers: agent['Customers'] || agent['Pelanggan'] || agent['customers'] || 0,
          no_tel: agent['no_tel'] || agent['No Tel'] || agent['phone'] || '',
          lead_email: agent['lead_email'] || agent['leadEmail'] || agent['Lead Email'] || agent['Lead_Email'] || false,
        };
      })
      .filter((agent: any) => agent.username && agent.pgcode); // Only include agents with username and pgcode
    
    console.log("Transformed agents:", JSON.stringify(transformedAgents, null, 2));
    console.log("Final number of valid agents:", transformedAgents.length);
    
    return NextResponse.json(
      transformedAgents,
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    );
  } catch (error) {
    console.error("Error fetching all agents:", error);
    
    // Return a more detailed error response
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const statusCode = errorMessage.includes('environment variable') ? 500 : 
                      errorMessage.includes('API response') ? 502 : 500;
    
    return NextResponse.json(
      { 
        error: errorMessage,
        timestamp: new Date().toISOString(),
        endpoint: '/api/get-all-agents'
      }, 
      { status: statusCode }
    );
  }
} 