import { NextResponse } from 'next/server';

const TOKEN = process.env.TOKEN || '';
const DEALERS_URL = process.env.DEALERS_URL || '';

const headers = {
  'xc-token': TOKEN,
  'Content-Type': 'application/json'
};

export async function POST(req: Request) {
  try {
    const { dealerEmail } = await req.json();
    
    if (!dealerEmail) {
      return NextResponse.json({ success: false, error: 'Dealer email is required' }, { status: 400 });
    }

    if (!DEALERS_URL) {
      return NextResponse.json({ success: false, error: 'DEALERS_URL not configured' }, { status: 500 });
    }

    // First, get the current dealer list to find the dealer by email
    const response = await fetch(DEALERS_URL, { 
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dealers: ${response.status}`);
    }

    const data = await response.json();
    const dealers = data.list || [];

    // Find the dealer by email
    const dealerIndex = dealers.findIndex((dealer: any) => 
      dealer.email === dealerEmail || dealer.Email === dealerEmail
    );

    if (dealerIndex === -1) {
      return NextResponse.json({ success: false, error: 'Dealer not found' }, { status: 404 });
    }

    const dealer = dealers[dealerIndex];
    
    // Update the dealer's lead_email status to true
    const updateResponse = await fetch(DEALERS_URL, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        Id: dealer.Id,
        lead_email: true
      })
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to update dealer: ${updateResponse.status}`);
    }

    return NextResponse.json({ success: true, message: 'Dealer lead status updated successfully' });
  } catch (error) {
    console.error('Error updating dealer lead status:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
} 