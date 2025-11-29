import { NextResponse } from 'next/server';

const TOKEN = process.env.TOKEN || '';
const DEALERS_URL = process.env.DEALERS_URL || '';

const headers = {
  'xc-token': TOKEN,
  'Content-Type': 'application/json'
};

export async function POST() {
  try {
    if (!DEALERS_URL) {
      return NextResponse.json({ success: false, error: 'DEALERS_URL not configured' }, { status: 500 });
    }

    // First, get the current dealer list
    const response = await fetch(DEALERS_URL, { 
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dealers: ${response.status}`);
    }

    const data = await response.json();
    const dealers = data.list || [];

    if (dealers.length === 0) {
      return NextResponse.json({ success: false, error: 'No dealers found' }, { status: 404 });
    }

    console.log("dealers--->", dealers);

    // Check if ALL dealers have lead_email: true
    const allHaveLeadEmail = dealers.every((dealer: any) => dealer.lead_email === true);
    
    if (!allHaveLeadEmail) {
      return NextResponse.json({ 
        success: false, 
        error: 'Cannot reset: Not all dealers have lead_email: true',
        dealersWithLeadEmail: dealers.filter((d: any) => d.lead_email === true).length,
        totalDealers: dealers.length
      }, { status: 400 });
    }

    console.log("All dealers have lead_email: true, proceeding with reset");

    // Try bulk update first (if the API supports it)
    console.log("🔄 Attempting bulk update first...");
    try {
      const bulkPayload = dealers.map((dealer: any) => ({
        Id: dealer.Id,
        lead_email: false
      })).filter((dealer: any) => dealer.Id);

      const bulkResponse = await fetch(DEALERS_URL, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(bulkPayload)
      });

      if (bulkResponse.ok) {
        console.log("✅ Bulk update successful!");
        
        // Verify the reset by fetching the updated data
        try {
          console.log('🔄 Verifying bulk reset by fetching updated dealer data...');
          const verifyResponse = await fetch(DEALERS_URL, { 
            headers,
            cache: 'no-store'
          });
          
          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            const updatedDealers = verifyData.list || [];
            const stillHaveLeadEmail = updatedDealers.filter((d: any) => d.lead_email === true).length;
            console.log(`📊 Verification: ${stillHaveLeadEmail} dealers still have lead_email: true out of ${updatedDealers.length} total`);
            
            if (stillHaveLeadEmail === 0) {
              console.log('✅ Bulk reset verification successful: All dealers now have lead_email: false');
              return NextResponse.json({ 
                success: true, 
                message: `Bulk reset successful for ${dealers.length} dealers`,
                totalDealers: dealers.length,
                successfulUpdates: dealers.length,
                resetReason: 'Bulk update successful - all dealers had lead_email: true, rotation cycle completed'
              });
            }
          }
        } catch (verifyError) {
          console.error('❌ Error during bulk reset verification:', verifyError);
        }
      } else {
        console.log(`⚠️ Bulk update failed (${bulkResponse.status}), falling back to individual updates...`);
      }
    } catch (bulkError) {
      console.log("⚠️ Bulk update not supported, falling back to individual updates...");
    }

    // Fallback to individual updates with rate limiting
    console.log("🔄 Falling back to individual updates with rate limiting...");

    // Update all dealers' lead_email status to false
    const updatePromises = dealers.map(async (dealer: any, index: number) => {
      if (dealer.Id) {
        // Add delay between requests to avoid rate limiting
        if (index > 0) {
          const delay = Math.floor(index / 3) * 1000; // 1 second delay every 3 requests
          console.log(`⏳ Waiting ${delay}ms before updating dealer ${index + 1}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        console.log(`🔄 Updating dealer ${dealer.username || dealer.email} (ID: ${dealer.Id}) from lead_email: ${dealer.lead_email} to false`);
        
        const updatePayload = {
          Id: dealer.Id,
          lead_email: false
        };
        console.log(`📤 Sending PATCH request with payload:`, updatePayload);
        
        return fetch(DEALERS_URL, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updatePayload)
        });
      } else {
        console.log(`⚠️ Skipping dealer ${dealer.username || dealer.email} - no ID found`);
        return null;
      }
    });

    // Wait for all updates to complete
    const results = await Promise.allSettled(updatePromises.filter(Boolean));

    console.log("results--->", results);
    
    // Log detailed results for each update
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const response = result.value;
        if (response?.ok) {
          console.log(`✅ Update ${index + 1} successful: ${response.status} ${response.statusText}`);
        } else {
          console.log(`❌ Update ${index + 1} failed: ${response?.status} ${response?.statusText}`);
        }
      } else {
        console.log(`❌ Update ${index + 1} rejected:`, result.reason);
      }
    });
    
    // Count successful updates
    let successfulUpdates = results.filter(result => 
      result.status === 'fulfilled' && result.value?.ok
    ).length;

    console.log(`✅ Reset completed: ${successfulUpdates} out of ${dealers.length} dealers updated successfully`);

    // If some updates failed, try to retry them with longer delays
    const failedUpdates = results.filter(result => 
      result.status === 'fulfilled' && !result.value?.ok
    ).length;

    if (failedUpdates > 0) {
      console.log(`🔄 ${failedUpdates} updates failed, attempting retry with longer delays...`);
      
      // Find failed dealer IDs and retry them
      const failedDealers = dealers.filter((dealer: any, index: number) => {
        const result = results[index];
        return result && result.status === 'fulfilled' && !result.value?.ok;
      });

      if (failedDealers.length > 0) {
        console.log(`🔄 Retrying ${failedDealers.length} failed updates...`);
        
        for (let i = 0; i < failedDealers.length; i++) {
          const dealer = failedDealers[i];
          if (dealer.Id) {
            console.log(`🔄 Retrying dealer ${dealer.username || dealer.email} (ID: ${dealer.Id})...`);
            
            // Wait longer between retries
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
              const retryPayload = {
                Id: dealer.Id,
                lead_email: false
              };
              
              const retryResponse = await fetch(DEALERS_URL, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(retryPayload)
              });
              
              if (retryResponse.ok) {
                console.log(`✅ Retry successful for dealer ${dealer.username || dealer.email}`);
                successfulUpdates++;
              } else {
                console.log(`❌ Retry failed for dealer ${dealer.username || dealer.email}: ${retryResponse.status}`);
              }
            } catch (retryError) {
              console.error(`❌ Retry error for dealer ${dealer.username || dealer.email}:`, retryError);
            }
          }
        }
      }
    }

    // Verify the reset by fetching the updated data
    try {
      console.log('🔄 Verifying reset by fetching updated dealer data...');
      const verifyResponse = await fetch(DEALERS_URL, { 
        headers,
        cache: 'no-store'
      });
      
      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json();
        const updatedDealers = verifyData.list || [];
        const stillHaveLeadEmail = updatedDealers.filter((d: any) => d.lead_email === true).length;
        console.log(`📊 Verification: ${stillHaveLeadEmail} dealers still have lead_email: true out of ${updatedDealers.length} total`);
        
        if (stillHaveLeadEmail === 0) {
          console.log('✅ Verification successful: All dealers now have lead_email: false');
        } else {
          console.log('⚠️ Verification warning: Some dealers still have lead_email: true');
        }
      }
    } catch (verifyError) {
      console.error('❌ Error during verification:', verifyError);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Reset lead status for ${successfulUpdates} out of ${dealers.length} dealers`,
      totalDealers: dealers.length,
      successfulUpdates,
      resetReason: 'All dealers had lead_email: true, rotation cycle completed'
    });
  } catch (error) {
    console.error('Error resetting all dealers lead status:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
}

// Alternative method for bulk updates
export async function PUT() {
  try {
    if (!DEALERS_URL) {
      return NextResponse.json({ success: false, error: 'DEALERS_URL not configured' }, { status: 500 });
    }

    // Get the current dealer list
    const response = await fetch(DEALERS_URL, { 
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dealers: ${response.status}`);
    }

    const data = await response.json();
    const dealers = data.list || [];

    if (dealers.length === 0) {
      return NextResponse.json({ success: false, error: 'No dealers found' }, { status: 404 });
    }

    console.log("🔄 Bulk update: Processing", dealers.length, "dealers");

    // Create bulk payload for all dealers
    const bulkPayload = dealers.map((dealer: any) => ({
      Id: dealer.Id,
      lead_email: false
    })).filter((dealer: any) => dealer.Id);

    console.log("📤 Sending bulk update request for", bulkPayload.length, "dealers");

    // Try bulk update
    const bulkResponse = await fetch(DEALERS_URL, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(bulkPayload)
    });

    if (bulkResponse.ok) {
      console.log("✅ Bulk update successful!");
      
      // Verify the update
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const verifyResponse = await fetch(DEALERS_URL, { 
        headers,
        cache: 'no-store'
      });
      
      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json();
        const updatedDealers = verifyData.list || [];
        const stillHaveLeadEmail = updatedDealers.filter((d: any) => d.lead_email === true).length;
        
        if (stillHaveLeadEmail === 0) {
          console.log('✅ Bulk update verification successful');
          return NextResponse.json({ 
            success: true, 
            message: `Bulk update successful for ${dealers.length} dealers`,
            totalDealers: dealers.length,
            successfulUpdates: dealers.length
          });
        } else {
          console.log(`⚠️ Bulk update verification failed: ${stillHaveLeadEmail} dealers still have lead_email: true`);
          return NextResponse.json({ 
            success: false, 
            error: `Bulk update failed: ${stillHaveLeadEmail} dealers still have lead_email: true`,
            totalDealers: dealers.length,
            successfulUpdates: dealers.length - stillHaveLeadEmail
          });
        }
      }
    } else {
      console.log(`❌ Bulk update failed: ${bulkResponse.status} ${bulkResponse.statusText}`);
      return NextResponse.json({ 
        success: false, 
        error: `Bulk update failed: ${bulkResponse.status}`,
        status: bulkResponse.status
      }, { status: bulkResponse.status });
    }
  } catch (error) {
    console.error('Error during bulk update:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
} 