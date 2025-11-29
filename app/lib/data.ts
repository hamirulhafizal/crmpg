const TOKEN = process.env.TOKEN || '';
const DEALERS_URL = process.env.DEALERS_URL || '';
const REDIRECT_INDEX_URL = process.env.REDIRECT_INDEX_URL || '';
const REDIRECT_INDEX_PATCH_URL = process.env.REDIRECT_INDEX_PATCH_URL || '';

const headers = {
  'xc-token': TOKEN,
  'Content-Type': 'application/json'
};

// Create a fetch wrapper with timeout - no caching
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      // Disable caching - fetch fresh data every time
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Create a fetch wrapper for dynamic updates (no cache)
const fetchWithTimeoutNoCache = async (url: string, options: RequestInit = {}, timeout = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store' // No cache for dynamic updates
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Normalize HTML content to prevent hydration errors
const normalizeHtml = (html: string): string => {
  return html
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/>\s+</g, '><') // Remove whitespace between tags
    .trim(); // Remove leading/trailing whitespace
};

export async function getDealerData(): Promise<string> {
  try {


    console.log("REDIRECT_INDEX_URL", REDIRECT_INDEX_URL);
    console.log("DEALERS_URL", DEALERS_URL);
    console.log("TOKEN", TOKEN);
    
    
    // Step 1: Get current redirect index first
    const indexRes = await fetchWithTimeout(REDIRECT_INDEX_URL, { headers });
    const indexData = await indexRes.json();
    
    const redirectRow = indexData.list?.[0];
    if (!redirectRow || typeof redirectRow.current_index !== 'number') {
      throw new Error("Invalid redirect index.");
    }
    
    const currentIndex = redirectRow.current_index;
    
    // Step 2: Get dealer list
    const dealersRes = await fetchWithTimeout(DEALERS_URL, { headers });
    const dealersData = await dealersRes.json();
    const dealers = dealersData.list;

    if (!dealers || dealers.length === 0) {
      throw new Error("No dealers available.");
    }

    // Step 3: Use current index to select the dealer (ensures fair rotation)
    const selectedDealer = dealers[currentIndex];

    if (!selectedDealer['Username PGO']) {
      throw new Error("Selected dealer missing URL.");
    }

    console.log(`Using dealer at index ${currentIndex} for fair rotation`);
    return selectedDealer['Username PGO'];
  } catch (error) {
    console.error("Error in getDealerData:", error);
    throw error;
  }
}

export async function getDealerInfo(): Promise<{ username: string; name?: string; location?: string; customers?: number, no_tel?: string, image_url?: string, email?: string }> {
  try {
    // Step 1: Get current redirect index first
    const indexRes = await fetchWithTimeout(REDIRECT_INDEX_URL, { headers });
    const indexData = await indexRes.json();
    
    const redirectRow = indexData.list?.[0];
    if (!redirectRow || typeof redirectRow.current_index !== 'number') {
      throw new Error("Invalid redirect index.");
    }
    
    const currentIndex = redirectRow.current_index;
    
    // Step 2: Get dealer list
    const dealersRes = await fetchWithTimeout(DEALERS_URL, { headers });
    const dealersData = await dealersRes.json();
    const dealers = dealersData.list;

    if (!dealers || dealers.length === 0) {
      throw new Error("No dealers available.");
    }

    // Step 3: Use current index to select the dealer (ensures fair rotation)
    const selectedDealer = dealers[currentIndex];

    if (!selectedDealer['Username PGO']) {
      throw new Error("Selected dealer missing URL.");
    }

    console.log(`Using dealer at index ${currentIndex} for fair rotation`);

    return {
      username: selectedDealer['Username PGO'],
      name: selectedDealer['Name'] || selectedDealer['Nama'] || 'Dealer',
      location: selectedDealer['Location'] || selectedDealer['Lokasi'] || 'Malaysia',
      customers: selectedDealer['Customers'] || selectedDealer['Pelanggan'] || 300,
      no_tel: selectedDealer['no_tel'] || selectedDealer['no_tel'] || '0123456789',
      image_url: selectedDealer['image_url'] || selectedDealer['image_url'] || 'https://via.placeholder.com/150',
      email: selectedDealer['email'] || ''
    };
  } catch (error) {
    console.error("Error in getDealerInfo:", error);
    // Return fallback data
    return {
      username: 'default',
      name: 'Dealer',
      location: 'Malaysia',
      customers: 300,
      no_tel: '0123456789',
      image_url: 'https://via.placeholder.com/150'
    };
  }
}

export async function updateDealerIndex(): Promise<void> {
  try {
    // Fetch dealer list and redirect index in parallel (no cache for updates)
    const [dealersRes, indexRes] = await Promise.all([
      fetchWithTimeoutNoCache(DEALERS_URL, { headers }),
      fetchWithTimeoutNoCache(REDIRECT_INDEX_URL, { headers })
    ]);

    const [dealersData, indexData] = await Promise.all([
      dealersRes.json(),
      indexRes.json()
    ]);

    const dealers = dealersData.list;

    if (!dealers || dealers.length === 0) {
      throw new Error("No dealers available.");
    }

    const redirectRow = indexData.list?.[0];

    if (!redirectRow || typeof redirectRow.current_index !== 'number') {
      throw new Error("Invalid redirect index.");
    }

    const currentIndex = redirectRow.current_index;
    const nextIndex = (currentIndex + 1) % dealers.length;

    // Step 3: Update index in NocoDB
    const updateResponse = await fetchWithTimeoutNoCache(REDIRECT_INDEX_PATCH_URL, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        current_index: nextIndex,
        Id: 34,
      })
    });

    if (!updateResponse.ok) {
      throw new Error("Failed to update index.");
    }

    console.log(`Dealer index updated from ${currentIndex} to ${nextIndex} for fair rotation`);
  } catch (error) {
    console.error("Error in updateDealerIndex:", error);
    throw error;
  }
}

export async function getPageContent(url: string): Promise<string> {
  try {
    if (!url) {
      throw new Error("URL is required");
    }

    const response = await fetchWithTimeout(`https://publicgoldofficial.com/page/${url}`, {
      cache: 'no-store' // No caching - fetch fresh content every time
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch content: ${response.status}`);
    }

    const content = await response.text();
    
    // Normalize HTML content to prevent hydration errors
    return normalizeHtml(content);
  } catch (error) {
    console.error("Error in getPageContent:", error);
    throw error;
  }
} 